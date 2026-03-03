const { MessageFlags } = require('discord.js');
const { BotLogConfig } = require('../database');
const { recordAdminAction } = require('./adminActionLogService');
const { getLockState } = require('./adminSanctionService');
const { getAdminSecurityState } = require('./adminSecurityService');

const OWNER_USER_ID = process.env.BOT_OWNER_USER_ID || '1017124302048481330';

function normalizeIds(raw) {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((id) => String(id || '').trim()).filter(Boolean))];
}

function isOwner(userId) {
    return String(userId || '') === OWNER_USER_ID;
}

async function getWhitelist(guildId) {
    if (!guildId) return { config: null, ids: [] };
    const [config] = await BotLogConfig.findOrCreate({
        where: { guildId },
        defaults: {
            guildId,
            statusChannelId: null,
            crashChannelId: null,
            statusMessageId: null,
            adminLogChannelId: null,
            adminWhitelistUserIds: [],
            adminSanctionState: { users: {} },
            adminSecurityState: {
                panicMode: false,
                panicUpdatedAt: 0,
                panicUpdatedBy: null,
                panicReason: null
            }
        }
    });

    const ids = normalizeIds(config.adminWhitelistUserIds);
    if (JSON.stringify(ids) !== JSON.stringify(config.adminWhitelistUserIds || [])) {
        config.adminWhitelistUserIds = ids;
        await config.save();
    }
    return { config, ids };
}

async function isWhitelistedAdmin(guildId, userId) {
    if (isOwner(userId)) return true;
    const { ids } = await getWhitelist(guildId);
    return ids.includes(String(userId));
}

async function assertOwnerOnly(interaction, opts = {}) {
    if (isOwner(interaction.user?.id)) return true;

    if (opts.logDenied) {
        await recordAdminAction(interaction, {
            commandName: opts.commandName || 'admin',
            actionGroup: opts.actionGroup || 'security',
            actionName: opts.actionName || 'owner_only_denied',
            reason: 'Unauthorized owner-only command usage attempt.',
            changes: 'Denied: user is not bot owner.',
            metadata: { denied: true, ownerOnly: true }
        });
    }

    await interaction.reply({
        content: 'You are not allowed to use this command.',
        flags: MessageFlags.Ephemeral
    });
    return false;
}

async function assertWhitelistedAdmin(interaction, opts = {}) {
    const owner = isOwner(interaction.user?.id);
    if (!owner) {
        const security = await getAdminSecurityState(interaction.guildId);
        if (security.panicMode) {
            if (opts.logDenied) {
                await recordAdminAction(interaction, {
                    commandName: opts.commandName || 'admin',
                    actionGroup: opts.actionGroup || 'security',
                    actionName: opts.actionName || 'panic_denied',
                    reason: 'Denied by panic mode.',
                    changes: `Denied: panic mode enabled by ${security.panicUpdatedBy || 'unknown'}.`,
                    metadata: { denied: true, deniedReason: 'panic_mode' }
                });
            }
            await interaction.reply({
                content: 'Security panic mode is enabled. Access is restricted to the owner.',
                flags: MessageFlags.Ephemeral
            });
            return false;
        }
    }

    const allowed = await isWhitelistedAdmin(interaction.guildId, interaction.user?.id);
    if (allowed) {
        const lock = await getLockState(interaction.guildId, interaction.user?.id);
        if (!lock.locked) return true;

        if (opts.logDenied) {
            await recordAdminAction(interaction, {
                commandName: opts.commandName || 'admin',
                actionGroup: opts.actionGroup || 'security',
                actionName: opts.actionName || 'locked_denied',
                reason: 'Access denied due to active admin sanction lock.',
                changes: `Denied: user is locked until ${new Date(lock.lockedUntil).toISOString()}.`,
                metadata: { denied: true, deniedReason: 'locked', lockedUntil: lock.lockedUntil }
            });
        }

        await interaction.reply({
            content: 'Access temporarily suspended. Contact the owner.',
            flags: MessageFlags.Ephemeral
        });
        return false;
    }

    if (opts.logDenied) {
        await recordAdminAction(interaction, {
            commandName: opts.commandName || 'admin',
            actionGroup: opts.actionGroup || 'security',
            actionName: opts.actionName || 'whitelist_denied',
            reason: 'Unauthorized admin command usage attempt.',
            changes: 'Denied: user not owner and not in admin whitelist.',
            metadata: { denied: true, deniedReason: 'whitelist', ownerOnly: false }
        });
    }

    await interaction.reply({
        content: 'You are not allowed to use this command.',
        flags: MessageFlags.Ephemeral
    });
    return false;
}

module.exports = {
    OWNER_USER_ID,
    isOwner,
    getWhitelist,
    isWhitelistedAdmin,
    assertOwnerOnly,
    assertWhitelistedAdmin
};
