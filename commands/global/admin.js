const {
    SlashCommandBuilder,
    MessageFlags,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { Op } = require('sequelize');
const { sequelize, Profiles, InventoryItems, Skills, UserSkills, AdminActionLog, BotLogConfig } = require('../../database');
const { normalizeItemKey } = require('../../utils/inventoryService');
const { recordAdminAction } = require('../../utils/adminActionLogService');
const { assertOwnerOnly, assertWhitelistedAdmin, getWhitelist, isWhitelistedAdmin } = require('../../utils/adminAccessService');
const {
    WARN_POINTS,
    LOCK_POINTS,
    DECAY_WINDOW_MS,
    DECAY_POINTS_PER_WINDOW,
    getSanctionSummary,
    unlockSanctionUser,
    clearSanctionUser
} = require('../../utils/adminSanctionService');
const { resolveAllowedInventoryItemName, getAllowedInventoryItems } = require('../../utils/allowedInventoryItems');
const { getAdminSecurityState, setPanicMode } = require('../../utils/adminSecurityService');
const { getSkillLevelCap } = require('../../utils/skillProgression');

const LIMITS = {
    currencyDeltaMax: 500000,
    currencySetMax: 50000000,
    inventoryDeltaMax: 10000,
    inventorySetMax: 100000,
    skillLevelMax: 100
};

const PENDING_TTL_MS = 2 * 60 * 1000;
const pendingAdminActions = new Map();
const DISCORD_UNKNOWN_INTERACTION = 10062;
const DISCORD_ALREADY_ACK = 40060;

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const n = Math.floor(Number(value) || 0);
    return Math.min(max, Math.max(min, n));
}

function withReason(sub) {
    return sub.addStringOption((o) =>
        o
            .setName('reason')
            .setDescription('Why this admin action is needed')
            .setRequired(true)
            .setMaxLength(240)
    );
}

function makeToken() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function setPendingAction(payload) {
    const token = makeToken();
    pendingAdminActions.set(token, {
        ...payload,
        expiresAt: Date.now() + PENDING_TTL_MS
    });
    setTimeout(() => pendingAdminActions.delete(token), PENDING_TTL_MS + 1000).unref();
    return token;
}

function consumePendingAction(token) {
    const pending = pendingAdminActions.get(token);
    if (!pending) return null;
    pendingAdminActions.delete(token);
    if ((Number(pending.expiresAt) || 0) < Date.now()) return null;
    return pending;
}

function peekPendingAction(token) {
    const pending = pendingAdminActions.get(token);
    if (!pending) return null;
    if ((Number(pending.expiresAt) || 0) < Date.now()) {
        pendingAdminActions.delete(token);
        return null;
    }
    return pending;
}

async function safeComponentUpdate(interaction, payload) {
    try {
        if (interaction.deferred) {
            await interaction.editReply(payload);
        } else {
            await interaction.update(payload);
        }
    } catch (error) {
        if (error?.code !== DISCORD_UNKNOWN_INTERACTION && error?.code !== DISCORD_ALREADY_ACK) {
            console.error('admin button update error:', error?.message || error);
        }
    }
}

async function safeComponentReply(interaction, payload) {
    try {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply(payload);
        }
    } catch (error) {
        if (error?.code !== DISCORD_UNKNOWN_INTERACTION && error?.code !== DISCORD_ALREADY_ACK) {
            console.error('admin button reply error:', error?.message || error);
        }
    }
}

async function loadProfileByUserId(userId, transaction = null, lock = false) {
    return Profiles.findOne({
        where: { userId },
        transaction,
        lock: lock && transaction ? transaction.LOCK.UPDATE : undefined
    });
}

function buildConfirmComponents(token) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`admin_confirm_${token}`)
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`admin_cancel_${token}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

function requiresConfirmation(group, action) {
    if (group === 'skill' && action === 'setlevel') return true;
    return action === 'set' || action === 'remove';
}

function formatDurationCompact(ms) {
    const safe = Math.max(0, Number(ms) || 0);
    const sec = Math.floor(safe / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

async function buildAdminStatusEmbed(guildId) {
    const now = Date.now();
    const since = new Date(now - (24 * 60 * 60 * 1000));
    const { ids: whitelistIds } = await getWhitelist(guildId);
    const sanctions = await getSanctionSummary(guildId);
    const users = Array.isArray(sanctions.users) ? sanctions.users : [];

    const lockedUsers = users.filter((u) => u.isLocked);
    const activeRiskUsers = users.filter((u) => (Number(u.points) || 0) >= WARN_POINTS);

    const recentLogs = await AdminActionLog.findAll({
        where: {
            guildId,
            createdAt: { [Op.gte]: since }
        },
        order: [['id', 'DESC']],
        limit: 100
    });

    const riskCounts = { high: 0, medium: 0, low: 0 };
    const executorMap = new Map();
    const actionMap = new Map();

    for (const log of recentLogs) {
        const risk = String(log.metadata?.riskLevel || 'low').toLowerCase();
        if (riskCounts[risk] !== undefined) riskCounts[risk] += 1;
        const ex = String(log.executorUserId || 'unknown');
        executorMap.set(ex, (executorMap.get(ex) || 0) + 1);
        const ak = `/${log.commandName} ${log.actionGroup} ${log.actionName}`;
        actionMap.set(ak, (actionMap.get(ak) || 0) + 1);
    }

    const topExecutors = [...executorMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([uid, count]) => `- <@${uid}>: ${count}`)
        .join('\n') || '- none';

    const topActions = [...actionMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([action, count]) => `- ${action}: ${count}`)
        .join('\n') || '- none';

    const lockedLines = lockedUsers.length
        ? lockedUsers.slice(0, 8).map((u) => `- <@${u.userId}> until <t:${Math.floor((Number(u.lockedUntil) || 0) / 1000)}:R>`).join('\n')
        : '- none';

    const riskUsersLines = activeRiskUsers.length
        ? activeRiskUsers.slice(0, 8).map((u) => `- <@${u.userId}>: ${u.points} pts`).join('\n')
        : '- none';

    const whitelistLines = whitelistIds.length
        ? whitelistIds.slice(0, 12).map((id) => `- <@${id}>`).join('\n')
        : '- none';

    return new EmbedBuilder()
        .setColor(0x1f2a44)
        .setTitle('Admin Security Dashboard')
        .setDescription(
            `Window: last 24h\n` +
            `Sanction thresholds: warn ${WARN_POINTS} / lock ${LOCK_POINTS}\n` +
            `Decay: -${DECAY_POINTS_PER_WINDOW} every ${formatDurationCompact(DECAY_WINDOW_MS)} without incidents`
        )
        .addFields(
            {
                name: 'Risk Summary (24h)',
                value:
                    `- High: ${riskCounts.high}\n` +
                    `- Medium: ${riskCounts.medium}\n` +
                    `- Low: ${riskCounts.low}`,
                inline: true
            },
            {
                name: 'Whitelist',
                value: whitelistLines.slice(0, 1024),
                inline: true
            },
            {
                name: 'Locked Users',
                value: lockedLines.slice(0, 1024),
                inline: false
            },
            {
                name: 'Users At/Above Warn',
                value: riskUsersLines.slice(0, 1024),
                inline: false
            },
            {
                name: 'Top Executors (24h)',
                value: topExecutors.slice(0, 1024),
                inline: false
            },
            {
                name: 'Top Sensitive Actions (24h)',
                value: topActions.slice(0, 1024),
                inline: false
            }
        )
        .setTimestamp(new Date());
}

async function sendPanicAlert(interaction, state, mode) {
    try {
        if (!interaction.guildId) return;
        const cfg = await BotLogConfig.findOne({ where: { guildId: interaction.guildId } });
        const channelId = cfg?.adminLogChannelId;
        if (!channelId) return;
        const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const enabled = mode === 'on';
        const embed = new EmbedBuilder()
            .setColor(enabled ? 0xc0392b : 0x2ecc71)
            .setTitle(enabled ? 'SECURITY PANIC MODE ENABLED' : 'Security Panic Mode Disabled')
            .setDescription(
                enabled
                    ? 'Sensitive commands are now restricted to owner only.'
                    : 'Sensitive commands are restored for whitelisted admins.'
            )
            .addFields(
                { name: 'By', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                { name: 'Mode', value: enabled ? 'ON' : 'OFF', inline: true },
                { name: 'Reason', value: String(state.panicReason || 'No reason provided.').slice(0, 1024), inline: false }
            )
            .setTimestamp(new Date());

        await channel.send({
            content: `<@1017124302048481330>`,
            embeds: [embed]
        });
    } catch (error) {
        console.error('panic alert error:', error?.message || error);
    }
}

function buildRequestFromInteraction(interaction, group, action) {
    const reason = String(interaction.options.getString('reason', true) || '').trim();
    const user = interaction.options.getUser('user', true);

    if (group === 'currency') {
        const amount = clampInt(interaction.options.getInteger('amount', true), 0);
        if (amount <= 0 && action !== 'set') {
            return { ok: false, message: 'Amount must be greater than 0.' };
        }
        if ((action === 'add' || action === 'remove') && amount > LIMITS.currencyDeltaMax) {
            return { ok: false, message: `Amount too high. Max per action: ${LIMITS.currencyDeltaMax}.` };
        }
        if (action === 'set' && amount > LIMITS.currencySetMax) {
            return { ok: false, message: `Set value too high. Max allowed: ${LIMITS.currencySetMax}.` };
        }
        return { ok: true, reason, targetUserId: user.id, targetTag: user.tag, amount };
    }

    if (group === 'inventory') {
        const itemInput = String(interaction.options.getString('item', true) || '').trim();
        const itemName = resolveAllowedInventoryItemName(itemInput);
        const quantity = clampInt(interaction.options.getInteger('quantity', true), 0);
        if (!itemName) {
            return {
                ok: false,
                message:
                    'This item cannot be managed via admin inventory.\n' +
                    `Allowed items: ${getAllowedInventoryItems().join(', ')}`
            };
        }
        if (quantity <= 0 && action !== 'set') return { ok: false, message: 'Quantity must be greater than 0.' };
        if ((action === 'add' || action === 'remove') && quantity > LIMITS.inventoryDeltaMax) {
            return { ok: false, message: `Quantity too high. Max per action: ${LIMITS.inventoryDeltaMax}.` };
        }
        if (action === 'set' && quantity > LIMITS.inventorySetMax) {
            return { ok: false, message: `Set quantity too high. Max allowed: ${LIMITS.inventorySetMax}.` };
        }
        return { ok: true, reason, targetUserId: user.id, targetTag: user.tag, itemName, quantity };
    }

    if (group === 'skill') {
        const skillId = clampInt(interaction.options.getInteger('skill_id', true), 1);
        const level = action === 'remove'
            ? null
            : clampInt(interaction.options.getInteger('level', true), 1);

        if (level !== null && level > LIMITS.skillLevelMax) {
            return { ok: false, message: `Level too high. Max allowed: ${LIMITS.skillLevelMax}.` };
        }
        return { ok: true, reason, targetUserId: user.id, targetTag: user.tag, skillId, level };
    }

    return { ok: false, message: 'Unknown admin action.' };
}

async function runAdminAction(interaction, group, action, request) {
    if (group === 'currency') return runCurrencyAction(interaction, action, request);
    if (group === 'inventory') return runInventoryAction(interaction, action, request);
    if (group === 'skill') return runSkillAction(interaction, action, request);
    return { ok: false, message: 'Unknown admin action.' };
}

async function runCurrencyAction(interaction, action, request) {
    const result = await sequelize.transaction(async (transaction) => {
        const profile = await loadProfileByUserId(request.targetUserId, transaction, true);
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };

        const current = Math.max(0, Number(profile.crystals) || 0);
        let next = current;

        if (action === 'add') next = current + request.amount;
        else if (action === 'set') next = request.amount;
        else if (action === 'remove') next = Math.max(0, current - request.amount);
        else return { ok: false, reason: 'UNKNOWN_ACTION' };

        profile.crystals = next;
        await profile.save({ transaction });

        return { ok: true, profileName: profile.name, before: current, after: next };
    });

    if (!result.ok) {
        const msg = result.reason === 'NO_PROFILE' ? 'Target user has no profile.' : 'Unable to update currency.';
        return { ok: false, message: msg };
    }

    await recordAdminAction(interaction, {
        commandName: 'admin',
        actionGroup: 'currency',
        actionName: action,
        reason: request.reason,
        targetUserId: request.targetUserId,
        targetLabel: request.targetTag,
        changes: `Crystals: ${result.before} -> ${result.after}`,
        metadata: {
            before: { crystals: result.before },
            after: { crystals: result.after },
            delta: result.after - result.before
        }
    });

    return {
        ok: true,
        message:
            `Currency updated for **${result.profileName}**.\n` +
            `Before: ${result.before} crystals\n` +
            `After: ${result.after} crystals`
    };
}

async function runInventoryAction(interaction, action, request) {
    const itemKey = normalizeItemKey(request.itemName);

    const result = await sequelize.transaction(async (transaction) => {
        const profile = await loadProfileByUserId(request.targetUserId, transaction, true);
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };

        const entry = await InventoryItems.findOne({
            where: { profileId: profile.id, itemKey },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        const current = Math.max(0, Number(entry?.quantity) || 0);
        let next = current;

        if (action === 'add') next = current + request.quantity;
        else if (action === 'set') next = request.quantity;
        else if (action === 'remove') next = Math.max(0, current - request.quantity);
        else return { ok: false, reason: 'UNKNOWN_ACTION' };

        if (next <= 0) {
            if (entry) await entry.destroy({ transaction });
        } else if (entry) {
            entry.quantity = next;
            if (!entry.itemName) entry.itemName = request.itemName;
            await entry.save({ transaction });
        } else {
            await InventoryItems.create({
                profileId: profile.id,
                itemKey,
                itemName: request.itemName,
                quantity: next
            }, { transaction });
        }

        return { ok: true, profileName: profile.name, before: current, after: next };
    });

    if (!result.ok) {
        const msg = result.reason === 'NO_PROFILE' ? 'Target user has no profile.' : 'Unable to update inventory.';
        return { ok: false, message: msg };
    }

    await recordAdminAction(interaction, {
        commandName: 'admin',
        actionGroup: 'inventory',
        actionName: action,
        reason: request.reason,
        targetUserId: request.targetUserId,
        targetLabel: request.targetTag,
        changes: `${request.itemName}: ${result.before} -> ${result.after}`,
        metadata: {
            item: request.itemName,
            before: { quantity: result.before },
            after: { quantity: result.after },
            delta: result.after - result.before
        }
    });

    return {
        ok: true,
        message:
            `Inventory updated for **${result.profileName}**.\n` +
            `Item: **${request.itemName}**\n` +
            `Before: ${result.before}\n` +
            `After: ${result.after}`
    };
}

async function runSkillAction(interaction, action, request) {
    const result = await sequelize.transaction(async (transaction) => {
        const profile = await loadProfileByUserId(request.targetUserId, transaction, true);
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };

        const skill = await Skills.findByPk(request.skillId, { transaction });
        if (!skill) return { ok: false, reason: 'NO_SKILL' };
        const skillCap = getSkillLevelCap(skill.tier, skill.name);
        const requestedLevel = Math.min(skillCap, Math.max(1, Number(request.level) || 1));

        const existing = await UserSkills.findOne({
            where: { profileId: profile.id, skillId: skill.id },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (action === 'remove') {
            if (!existing) return { ok: false, reason: 'NOT_OWNED' };
            const before = Math.max(1, Number(existing.level) || 1);
            await existing.destroy({ transaction });
            return { ok: true, profileName: profile.name, skillName: skill.name, before, after: 0 };
        }

        if (action === 'grant') {
            if (!existing) {
                await UserSkills.create({
                    profileId: profile.id,
                    skillId: skill.id,
                    level: requestedLevel,
                    xp: 0,
                    currentCooldown: 0,
                    equippedSlot: null
                }, { transaction });
                return { ok: true, profileName: profile.name, skillName: skill.name, before: 0, after: requestedLevel };
            }

            const before = Math.max(1, Number(existing.level) || 1);
            const after = Math.max(before, requestedLevel);
            existing.level = after;
            await existing.save({ transaction });
            return { ok: true, profileName: profile.name, skillName: skill.name, before, after };
        }

        if (action === 'setlevel') {
            if (!existing) {
                await UserSkills.create({
                    profileId: profile.id,
                    skillId: skill.id,
                    level: requestedLevel,
                    xp: 0,
                    currentCooldown: 0,
                    equippedSlot: null
                }, { transaction });
                return { ok: true, profileName: profile.name, skillName: skill.name, before: 0, after: requestedLevel };
            }

            const before = Math.max(1, Number(existing.level) || 1);
            existing.level = requestedLevel;
            await existing.save({ transaction });
            return { ok: true, profileName: profile.name, skillName: skill.name, before, after: requestedLevel };
        }

        return { ok: false, reason: 'UNKNOWN_ACTION' };
    });

    if (!result.ok) {
        const map = {
            NO_PROFILE: 'Target user has no profile.',
            NO_SKILL: 'Skill not found.',
            NOT_OWNED: 'Target user does not own this skill.',
            UNKNOWN_ACTION: 'Unknown skill action.'
        };
        return { ok: false, message: map[result.reason] || 'Unable to update skill.' };
    }

    await recordAdminAction(interaction, {
        commandName: 'admin',
        actionGroup: 'skill',
        actionName: action,
        reason: request.reason,
        targetUserId: request.targetUserId,
        targetLabel: request.targetTag,
        changes: `${result.skillName}: ${result.before} -> ${result.after}`,
        metadata: {
            skillName: result.skillName,
            skillId: request.skillId,
            before: { level: result.before },
            after: { level: result.after },
            delta: result.after - result.before
        }
    });

    if (action === 'remove') {
        return {
            ok: true,
            message:
                `Skill removed from **${result.profileName}**.\n` +
                `Skill: **${result.skillName}**\n` +
                `Previous level: ${result.before}`
        };
    }

    return {
        ok: true,
        message:
            `Skill updated for **${result.profileName}**.\n` +
            `Skill: **${result.skillName}**\n` +
            `Before: ${result.before}\n` +
            `After: ${result.after}`
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Admin tools for economy and progression.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        .addSubcommandGroup((group) =>
            group
                .setName('currency')
                .setDescription('Manage player crystals.')
                .addSubcommand((sub) => withReason(
                    sub
                        .setName('add')
                        .setDescription('Add crystals to a player.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addIntegerOption((o) => o.setName('amount').setDescription('Crystals to add').setRequired(true).setMinValue(1))
                ))
                .addSubcommand((sub) => withReason(
                    sub
                        .setName('set')
                        .setDescription('Set a player crystal balance.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addIntegerOption((o) => o.setName('amount').setDescription('New crystal balance').setRequired(true).setMinValue(0))
                ))
                .addSubcommand((sub) => withReason(
                    sub
                        .setName('remove')
                        .setDescription('Remove crystals from a player.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addIntegerOption((o) => o.setName('amount').setDescription('Crystals to remove').setRequired(true).setMinValue(1))
                ))
        )

        .addSubcommandGroup((group) =>
            group
                .setName('inventory')
                .setDescription('Manage player inventory items.')
                .addSubcommand((sub) => withReason(
                    sub
                        .setName('add')
                        .setDescription('Add an item to inventory.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true))
                        .addIntegerOption((o) => o.setName('quantity').setDescription('Quantity to add').setRequired(true).setMinValue(1))
                ))
                .addSubcommand((sub) => withReason(
                    sub
                        .setName('set')
                        .setDescription('Set exact item quantity.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true))
                        .addIntegerOption((o) => o.setName('quantity').setDescription('New quantity').setRequired(true).setMinValue(0))
                ))
                .addSubcommand((sub) => withReason(
                    sub
                        .setName('remove')
                        .setDescription('Remove item quantity.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addStringOption((o) => o.setName('item').setDescription('Item name').setRequired(true))
                        .addIntegerOption((o) => o.setName('quantity').setDescription('Quantity to remove').setRequired(true).setMinValue(1))
                ))
        )

        .addSubcommandGroup((group) =>
            group
                .setName('skill')
                .setDescription('Manage player skills.')
                .addSubcommand((sub) => withReason(
                    sub
                        .setName('grant')
                        .setDescription('Grant a skill at a minimum level.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addIntegerOption((o) => o.setName('skill_id').setDescription('Skill ID').setRequired(true).setMinValue(1))
                        .addIntegerOption((o) => o.setName('level').setDescription('Minimum level').setRequired(true).setMinValue(1))
                ))
                .addSubcommand((sub) => withReason(
                    sub
                        .setName('setlevel')
                        .setDescription('Set exact skill level.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addIntegerOption((o) => o.setName('skill_id').setDescription('Skill ID').setRequired(true).setMinValue(1))
                        .addIntegerOption((o) => o.setName('level').setDescription('Exact level').setRequired(true).setMinValue(1))
                ))
                .addSubcommand((sub) => withReason(
                    sub
                        .setName('remove')
                        .setDescription('Remove a skill from the player.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addIntegerOption((o) => o.setName('skill_id').setDescription('Skill ID').setRequired(true).setMinValue(1))
                ))
        )
        .addSubcommandGroup((group) =>
            group
                .setName('whitelist')
                .setDescription('Owner-only admin whitelist management.')
                .addSubcommand((sub) =>
                    sub
                        .setName('list')
                        .setDescription('List whitelisted admin users.')
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('add')
                        .setDescription('Add a user to admin whitelist.')
                        .addUserOption((o) => o.setName('user').setDescription('User to whitelist').setRequired(true))
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('remove')
                        .setDescription('Remove a user from admin whitelist.')
                        .addUserOption((o) => o.setName('user').setDescription('User to remove').setRequired(true))
                )
        )
        .addSubcommandGroup((group) =>
            group
                .setName('sanctions')
                .setDescription('Owner-only sanction controls.')
                .addSubcommand((sub) =>
                    sub
                        .setName('view')
                        .setDescription('View sanction state for one user or all tracked users.')
                        .addUserOption((o) => o.setName('user').setDescription('Optional target user').setRequired(false))
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('unlock')
                        .setDescription('Remove active lock for a user.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addStringOption((o) => o.setName('reason').setDescription('Owner reason').setRequired(false).setMaxLength(240))
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('clear')
                        .setDescription('Clear all sanction state for a user.')
                        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
                        .addStringOption((o) => o.setName('reason').setDescription('Owner reason').setRequired(false).setMaxLength(240))
                )
        )
        .addSubcommandGroup((group) =>
            group
                .setName('status')
                .setDescription('Admin security dashboard.')
                .addSubcommand((sub) =>
                    sub
                        .setName('view')
                        .setDescription('View security status, risk summary, and locks.')
                )
        )
        .addSubcommandGroup((group) =>
            group
                .setName('security')
                .setDescription('Owner-only emergency security controls.')
                .addSubcommand((sub) =>
                    sub
                        .setName('panic')
                        .setDescription('Enable or disable panic mode.')
                        .addStringOption((o) =>
                            o
                                .setName('mode')
                                .setDescription('Panic mode state')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'ON', value: 'on' },
                                    { name: 'OFF', value: 'off' }
                                )
                        )
                        .addStringOption((o) =>
                            o
                                .setName('reason')
                                .setDescription('Owner reason')
                                .setRequired(false)
                                .setMaxLength(240)
                        )
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('status')
                        .setDescription('Show panic mode state.')
                )
        ),

    async execute(interaction) {
        const group = interaction.options.getSubcommandGroup(true);
        const action = interaction.options.getSubcommand(true);

        if (group === 'whitelist') {
            const canOwnerUse = await assertOwnerOnly(interaction, {
                logDenied: true,
                commandName: 'admin',
                actionGroup: 'whitelist',
                actionName: action
            });
            if (!canOwnerUse) return;

            const { config, ids } = await getWhitelist(interaction.guildId);
            if (action === 'list') {
                const lines = ids.length ? ids.map((id) => `- <@${id}> (\`${id}\`)`) : ['- none'];
                await recordAdminAction(interaction, {
                    commandName: 'admin',
                    actionGroup: 'whitelist',
                    actionName: 'list',
                    reason: 'Owner viewed admin whitelist.',
                    changes: `Whitelist size: ${ids.length}`
                });
                return interaction.reply({
                    content: `Admin whitelist (${ids.length}):\n${lines.join('\n')}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const user = interaction.options.getUser('user', true);
            const userId = String(user.id);
            const next = new Set(ids);
            if (action === 'add') next.add(userId);
            else if (action === 'remove') next.delete(userId);
            else {
                return interaction.reply({ content: 'Unknown whitelist action.', flags: MessageFlags.Ephemeral });
            }

            const nextIds = [...next];
            config.adminWhitelistUserIds = nextIds;
            await config.save();

            await recordAdminAction(interaction, {
                commandName: 'admin',
                actionGroup: 'whitelist',
                actionName: action,
                targetUserId: userId,
                targetLabel: user.tag,
                reason: `Owner ${action} whitelist entry.`,
                changes: `Whitelist size: ${ids.length} -> ${nextIds.length}`
            });

            return interaction.reply({
                content: action === 'add'
                    ? `Added <@${userId}> to admin whitelist.`
                    : `Removed <@${userId}> from admin whitelist.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (group === 'sanctions') {
            const canOwnerUse = await assertOwnerOnly(interaction, {
                logDenied: true,
                commandName: 'admin',
                actionGroup: 'sanctions',
                actionName: action
            });
            if (!canOwnerUse) return;

            if (action === 'view') {
                const target = interaction.options.getUser('user', false);
                const summary = await getSanctionSummary(interaction.guildId, target?.id || null);
                const rows = Array.isArray(summary.users) ? summary.users : [];
                const lines = rows.length
                    ? rows.slice(0, 20).map((u) =>
                        `- <@${u.userId}> | points: ${u.points} | strikes: ${u.totalStrikes} | ` +
                        `locked: ${u.isLocked ? `yes until <t:${Math.floor((Number(u.lockedUntil) || 0) / 1000)}:R>` : 'no'}`
                    )
                    : ['- none'];

                await recordAdminAction(interaction, {
                    commandName: 'admin',
                    actionGroup: 'sanctions',
                    actionName: 'view',
                    targetUserId: target?.id || null,
                    targetLabel: target?.tag || null,
                    reason: 'Owner viewed sanction state.',
                    changes: `Rows returned: ${rows.length}`
                });

                return interaction.reply({
                    content: `Admin sanctions${target ? ` for <@${target.id}>` : ''}:\n${lines.join('\n')}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const target = interaction.options.getUser('user', true);
            const reason = String(interaction.options.getString('reason', false) || 'Owner manual action').trim();

            if (action === 'unlock') {
                await unlockSanctionUser(interaction.guildId, target.id, reason);
                await recordAdminAction(interaction, {
                    commandName: 'admin',
                    actionGroup: 'sanctions',
                    actionName: 'unlock',
                    targetUserId: target.id,
                    targetLabel: target.tag,
                    reason,
                    changes: 'Owner removed active sanction lock.'
                });
                return interaction.reply({
                    content: `Sanction lock removed for <@${target.id}>.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (action === 'clear') {
                await clearSanctionUser(interaction.guildId, target.id, reason);
                await recordAdminAction(interaction, {
                    commandName: 'admin',
                    actionGroup: 'sanctions',
                    actionName: 'clear',
                    targetUserId: target.id,
                    targetLabel: target.tag,
                    reason,
                    changes: 'Owner cleared sanction state for user.'
                });
                return interaction.reply({
                    content: `Sanction state cleared for <@${target.id}>.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        if (group === 'status') {
            const embed = await buildAdminStatusEmbed(interaction.guildId);
            await recordAdminAction(interaction, {
                commandName: 'admin',
                actionGroup: 'status',
                actionName: 'view',
                reason: 'Viewed admin security dashboard.',
                changes: 'Dashboard viewed.',
                metadata: { sanctionExempt: true }
            });
            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }

        if (group === 'security') {
            const canOwnerUse = await assertOwnerOnly(interaction, {
                logDenied: true,
                commandName: 'admin',
                actionGroup: 'security',
                actionName: action
            });
            if (!canOwnerUse) return;

            if (action === 'status') {
                const s = await getAdminSecurityState(interaction.guildId);
                return interaction.reply({
                    content:
                        `Panic mode: **${s.panicMode ? 'ON' : 'OFF'}**\n` +
                        `Updated by: ${s.panicUpdatedBy ? `<@${s.panicUpdatedBy}>` : 'n/a'}\n` +
                        `Updated at: ${s.panicUpdatedAt ? `<t:${Math.floor(Number(s.panicUpdatedAt) / 1000)}:F>` : 'n/a'}\n` +
                        `Reason: ${s.panicReason || 'none'}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (action === 'panic') {
                const mode = String(interaction.options.getString('mode', true) || '').toLowerCase();
                const reason = String(interaction.options.getString('reason', false) || 'Owner emergency action').trim();
                const enabled = mode === 'on';
                const state = await setPanicMode(interaction.guildId, enabled, interaction.user.id, reason);

                await recordAdminAction(interaction, {
                    commandName: 'admin',
                    actionGroup: 'security',
                    actionName: enabled ? 'panic_on' : 'panic_off',
                    reason,
                    changes: `Panic mode set to ${enabled ? 'ON' : 'OFF'}.`,
                    metadata: { sanctionExempt: true }
                });
                await sendPanicAlert(interaction, state, mode);

                return interaction.reply({
                    content: `Panic mode is now **${enabled ? 'ON' : 'OFF'}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Administrator permission required.',
                flags: MessageFlags.Ephemeral
            });
        }

        const allowed = await assertWhitelistedAdmin(interaction, {
            logDenied: true,
            commandName: 'admin',
            actionGroup: group,
            actionName: action
        });
        if (!allowed) return;

        const request = buildRequestFromInteraction(interaction, group, action);

        if (!request.ok) {
            return interaction.reply({ content: request.message, flags: MessageFlags.Ephemeral });
        }

        if (requiresConfirmation(group, action)) {
            const token = setPendingAction({
                executorId: interaction.user.id,
                guildId: interaction.guildId,
                group,
                action,
                request
            });

            return interaction.reply({
                content:
                    `Confirm admin action: **/${group} ${action}**\n` +
                    `Target: <@${request.targetUserId}>\n` +
                    `Reason: ${request.reason}\n` +
                    `This request will expire in 2 minutes.`,
                components: buildConfirmComponents(token),
                flags: MessageFlags.Ephemeral
            });
        }

        const result = await runAdminAction(interaction, group, action, request);
        return interaction.reply({
            content: result.message,
            flags: MessageFlags.Ephemeral
        });
    },

    async handleAdminActionButton(interaction) {
        const id = String(interaction.customId || '');

        const isConfirm = id.startsWith('admin_confirm_');
        const isCancel = id.startsWith('admin_cancel_');
        if (!isConfirm && !isCancel) return false;

        const token = id.split('_').slice(2).join('_');
        const pending = isConfirm ? peekPendingAction(token) : consumePendingAction(token);

        if (!pending) {
            await safeComponentUpdate(interaction, {
                content: 'This admin request expired or no longer exists.',
                components: []
            });
            return true;
        }

        if (pending.executorId !== interaction.user.id) {
            await safeComponentReply(interaction, {
                content: 'Only the admin who created this request can confirm/cancel it.',
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (isCancel) {
            await safeComponentUpdate(interaction, {
                content: 'Admin action cancelled.',
                components: []
            });
            return true;
        }

        const consumed = consumePendingAction(token);
        if (!consumed) {
            await safeComponentUpdate(interaction, {
                content: 'This admin request expired or no longer exists.',
                components: []
            });
            return true;
        }

        // Ack immediately to avoid 10062 on slower admin actions (DB + logs).
        if (!interaction.deferred && !interaction.replied) {
            try {
                await interaction.deferUpdate();
            } catch (error) {
                if (error?.code !== DISCORD_UNKNOWN_INTERACTION && error?.code !== DISCORD_ALREADY_ACK) {
                    console.error('admin button deferUpdate error:', error?.message || error);
                }
            }
        }

        const stillAllowed = await isWhitelistedAdmin(interaction.guildId, interaction.user.id);
        if (!stillAllowed) {
            await recordAdminAction(interaction, {
                commandName: 'admin',
                actionGroup: consumed.group,
                actionName: consumed.action,
                reason: 'Pending admin action denied at confirm time.',
                changes: 'Denied: executor is no longer whitelisted.',
                metadata: { denied: true, stage: 'confirm' }
            });
            await safeComponentUpdate(interaction, {
                content: 'You are not allowed to use this command.',
                components: []
            });
            return true;
        }

        const result = await runAdminAction(interaction, consumed.group, consumed.action, consumed.request);
        await safeComponentUpdate(interaction, {
            content: result.message,
            components: []
        });
        return true;
    }
};
