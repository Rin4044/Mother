const {
    SlashCommandBuilder,
    MessageFlags,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const {
    QUEST_BOARD_SIZE,
    getQuestBoardAdminPreview,
    adminRerollQuestBoard,
    adminForceResetQuestBoard,
    adminSetQuestRefresh,
    adminSetQuestMix
} = require('../../utils/adventurerGuildQuestService');
const { upsertAdventurerGuildPanel } = require('../../utils/adventurerGuildService');
const { recordAdminAction } = require('../../utils/adminActionLogService');
const { assertWhitelistedAdmin, isWhitelistedAdmin } = require('../../utils/adminAccessService');

const PENDING_TTL_MS = 2 * 60 * 1000;
const pendingQuestboardActions = new Map();

function setPendingAction(payload) {
    const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    pendingQuestboardActions.set(token, {
        ...payload,
        expiresAt: Date.now() + PENDING_TTL_MS
    });
    setTimeout(() => pendingQuestboardActions.delete(token), PENDING_TTL_MS + 1000).unref();
    return token;
}

function peekPendingAction(token) {
    const pending = pendingQuestboardActions.get(token);
    if (!pending) return null;
    if ((Number(pending.expiresAt) || 0) < Date.now()) {
        pendingQuestboardActions.delete(token);
        return null;
    }
    return pending;
}

function consumePendingAction(token) {
    const pending = peekPendingAction(token);
    if (!pending) return null;
    pendingQuestboardActions.delete(token);
    return pending;
}

function buildConfirmComponents(token) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`questboard_admin_confirm_${token}`)
                .setLabel('Confirm')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`questboard_admin_cancel_${token}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

function formatQuestLine(quest, index) {
    const title = String(quest?.title || `Quest ${index + 1}`);
    const crystals = Math.max(0, Number(quest?.rewardCrystals) || 0);
    const xp = Math.max(0, Number(quest?.rewardXp) || 0);
    return `Q${index + 1}. ${title} -> ${crystals} crystals + ${xp} XP`;
}

function formatBoard(board) {
    const quests = Array.isArray(board?.quests) ? board.quests : [];
    if (!quests.length) return '- none';
    return quests.slice(0, QUEST_BOARD_SIZE).map((quest, index) => formatQuestLine(quest, index)).join('\n');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('questboard')
        .setDescription('Admin controls for Adventurer Guild quest board.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommandGroup((group) =>
            group
                .setName('admin')
                .setDescription('Questboard admin actions')
                .addSubcommand((sub) =>
                    sub
                        .setName('preview')
                        .setDescription('Preview current and next quest board.')
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('reroll')
                        .setDescription('Reroll current cycle quest board.')
                        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(240))
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('force_reset')
                        .setDescription('Force reset quest board now.')
                        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(240))
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('set_refresh')
                        .setDescription('Set quest board refresh seconds.')
                        .addIntegerOption((o) => o.setName('seconds').setDescription('Refresh seconds').setRequired(true).setMinValue(300).setMaxValue(86400))
                        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(240))
                )
                .addSubcommand((sub) =>
                    sub
                        .setName('set_mix')
                        .setDescription('Set quest board mix (general + specific = 5).')
                        .addIntegerOption((o) => o.setName('general').setDescription('General quest count').setRequired(true).setMinValue(1).setMaxValue(5))
                        .addIntegerOption((o) => o.setName('specific').setDescription('Specific quest count').setRequired(true).setMinValue(0).setMaxValue(5))
                        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(240))
                )
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'Administrator permission required.', flags: MessageFlags.Ephemeral });
        }

        const allowed = await assertWhitelistedAdmin(interaction, {
            logDenied: true,
            commandName: 'questboard',
            actionGroup: 'admin',
            actionName: interaction.options.getSubcommand(true)
        });
        if (!allowed) return;

        const group = interaction.options.getSubcommandGroup(true);
        const sub = interaction.options.getSubcommand(true);
        if (group !== 'admin') {
            return interaction.reply({ content: 'Unknown questboard action.', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'preview') {
            const preview = await getQuestBoardAdminPreview(interaction.guildId);
            if (!preview) {
                return interaction.reply({ content: 'Adventurer Guild is not configured for this server.', flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setColor(0x1f2a44)
                .setTitle('Questboard Admin Preview')
                .setDescription(
                    `Refresh: ${preview.refreshSeconds}s\n` +
                    `Mix: General ${preview.mix.generalCount} / Specific ${preview.mix.specificCount}`
                )
                .addFields(
                    {
                        name: `Current Board (reset <t:${Math.floor((Number(preview.currentBoard?.resetAt) || 0) / 1000)}:R>)`,
                        value: formatBoard(preview.currentBoard)
                    },
                    {
                        name: `Next Board (starts <t:${Math.floor((Number(preview.nextBoard?.cycleStart) || 0) / 1000)}:R>)`,
                        value: formatBoard(preview.nextBoard)
                    }
                );

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const reason = String(interaction.options.getString('reason', true) || '').trim();
        const request = { sub, reason };

        if (sub === 'set_refresh') {
            request.seconds = interaction.options.getInteger('seconds', true);
        }
        if (sub === 'set_mix') {
            request.general = interaction.options.getInteger('general', true);
            request.specific = interaction.options.getInteger('specific', true);
            if ((request.general + request.specific) !== QUEST_BOARD_SIZE) {
                return interaction.reply({
                    content: `Invalid mix. general + specific must equal ${QUEST_BOARD_SIZE}.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        const token = setPendingAction({
            executorId: interaction.user.id,
            guildId: interaction.guildId,
            request
        });

        return interaction.reply({
            content:
                `Confirm questboard action: **${sub}**\n` +
                `Reason: ${reason}\n` +
                `This request expires in 2 minutes.`,
            components: buildConfirmComponents(token),
            flags: MessageFlags.Ephemeral
        });
    },

    async handleQuestboardAdminButton(interaction) {
        const id = String(interaction.customId || '');
        const isConfirm = id.startsWith('questboard_admin_confirm_');
        const isCancel = id.startsWith('questboard_admin_cancel_');
        if (!isConfirm && !isCancel) return false;

        const token = id.split('_').slice(3).join('_');
        const pending = isConfirm ? peekPendingAction(token) : consumePendingAction(token);

        if (!pending) {
            await interaction.update({ content: 'This request expired or no longer exists.', components: [] });
            return true;
        }

        if (pending.executorId !== interaction.user.id) {
            await interaction.reply({
                content: 'Only the admin who created this request can confirm/cancel it.',
                flags: MessageFlags.Ephemeral
            });
            return true;
        }

        if (isCancel) {
            await interaction.update({ content: 'Questboard admin action cancelled.', components: [] });
            return true;
        }

        const consumed = consumePendingAction(token);
        if (!consumed) {
            await interaction.update({ content: 'This request expired or no longer exists.', components: [] });
            return true;
        }

        const stillAllowed = await isWhitelistedAdmin(interaction.guildId, interaction.user.id);
        if (!stillAllowed) {
            await recordAdminAction(interaction, {
                commandName: 'questboard',
                actionGroup: 'admin',
                actionName: consumed.request?.sub || 'unknown',
                reason: 'Pending questboard admin action denied at confirm time.',
                changes: 'Denied: executor is no longer whitelisted.',
                metadata: { denied: true, stage: 'confirm' }
            });
            await interaction.update({ content: 'You are not allowed to use this command.', components: [] });
            return true;
        }

        const { sub, reason } = consumed.request;
        let result = { ok: false, message: 'Unknown action.' };
        let changes = null;

        if (sub === 'reroll') {
            const out = await adminRerollQuestBoard(interaction.guildId);
            if (out.ok) {
                await upsertAdventurerGuildPanel(interaction.client, interaction.guildId).catch(() => {});
                changes = `Questboard rerolled. Mix ${out.mix.generalCount}/${out.mix.specificCount}`;
                result = { ok: true, message: 'Questboard rerolled and panel refreshed.' };
            } else {
                result = { ok: false, message: 'Failed to reroll questboard.' };
            }
        } else if (sub === 'force_reset') {
            const out = await adminForceResetQuestBoard(interaction.guildId);
            if (out.ok) {
                await upsertAdventurerGuildPanel(interaction.client, interaction.guildId).catch(() => {});
                changes = `Questboard force reset. Mix ${out.mix.generalCount}/${out.mix.specificCount}`;
                result = { ok: true, message: 'Questboard force-reset and panel refreshed.' };
            } else {
                result = { ok: false, message: 'Failed to force reset questboard.' };
            }
        } else if (sub === 'set_refresh') {
            const out = await adminSetQuestRefresh(interaction.guildId, consumed.request.seconds);
            if (out.ok) {
                await upsertAdventurerGuildPanel(interaction.client, interaction.guildId).catch(() => {});
                changes = `Questboard refresh set to ${out.refreshSeconds}s`;
                result = { ok: true, message: `Questboard refresh set to ${out.refreshSeconds}s.` };
            } else {
                result = { ok: false, message: 'Failed to set refresh.' };
            }
        } else if (sub === 'set_mix') {
            const out = await adminSetQuestMix(interaction.guildId, consumed.request.general, consumed.request.specific);
            if (out.ok) {
                await adminRerollQuestBoard(interaction.guildId).catch(() => {});
                await upsertAdventurerGuildPanel(interaction.client, interaction.guildId).catch(() => {});
                changes = `Questboard mix set to General ${out.mix.generalCount} / Specific ${out.mix.specificCount}`;
                result = { ok: true, message: `Questboard mix set to General ${out.mix.generalCount} / Specific ${out.mix.specificCount}.` };
            } else {
                result = { ok: false, message: 'Failed to set mix.' };
            }
        }

        if (result.ok) {
            await recordAdminAction(interaction, {
                commandName: 'questboard',
                actionGroup: 'admin',
                actionName: sub,
                reason,
                changes: changes || 'Questboard admin action executed.'
            });
        }

        await interaction.update({
            content: result.message,
            components: []
        });

        return true;
    }
};
