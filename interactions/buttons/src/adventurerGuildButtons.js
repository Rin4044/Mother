const {
    MessageFlags,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { Op } = require('sequelize');
const { AdventurerGuildConfig, Profiles, InventoryItems } = require('../../../database');
const { normalizeItemKey } = require('../../../utils/inventoryService');
const {
    upsertAdventurerGuildPanel,
    getGuildCoreBuybackPrices
} = require('../../../utils/adventurerGuildService');
const { formatCoreItemLabel, formatCrystalLabel } = require('../../../utils/coreEmoji');
const {
    MAX_ACTIVE_QUESTS,
    getQuestPanelData,
    acceptQuest,
    abandonQuest,
    completeQuest
} = require('../../../utils/adventurerGuildQuestService');

function buildQuestRowsText(rows, maxRows = 5) {
    if (!Array.isArray(rows) || rows.length === 0) return '- none';

    return rows.slice(0, maxRows).map((row, index) => {
        const target = Math.max(1, Number(row.targetKills) || 1);
        const current = Math.max(0, Number(row.current) || 0);
        const reward = Math.max(0, Number(row.rewardCrystals) || 0);
        const rewardXp = Math.max(0, Number(row.rewardXp) || 0);
        const title = String(row.title || `Slay ${target} monsters`);
        const status = row.status === 'completed'
            ? 'Completed'
            : row.status === 'active'
                ? 'Active'
                : 'Available';
        return `Q${index + 1}. ${title} | ${current}/${target} | ${reward} crystals + ${rewardXp} XP | ${status}`;
    }).join('\n');
}

function buildQuestPanelEmbed(profile, panelData) {
    const resetAtMs = Math.max(0, Number(panelData?.board?.resetAt) || 0);
    const resetUnix = Math.floor(resetAtMs / 1000);
    const rows = Array.isArray(panelData?.rows) ? panelData.rows : [];
    const activeCount = rows.filter((row) => row.status === 'active' && !row.canComplete).length;
    const readyCount = rows.filter((row) => row.canComplete).length;
    const completedCount = Array.isArray(panelData?.playerState?.completedQuestIds)
        ? panelData.playerState.completedQuestIds.length
        : 0;

    return new EmbedBuilder()
        .setColor('#1f2a44')
        .setTitle(`Quest Board - ${profile.name}`)
        .setDescription(
            `Active: **${activeCount}/${MAX_ACTIVE_QUESTS}**\n` +
            `Ready to complete: **${readyCount}**\n` +
            `Completed this cycle: **${completedCount}**\n` +
            `Reset in: <t:${resetUnix}:R> (<t:${resetUnix}:t>)\n\n` +
            `${buildQuestRowsText(panelData?.rows || [])}`
        );
}

function buildQuestPanelButtons(profileId) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`advguild_quest_accept_${profileId}`)
                .setLabel('Accept Quest')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`advguild_quest_abandon_${profileId}`)
                .setLabel('Abandon Quest')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`advguild_quest_complete_${profileId}`)
                .setLabel('Complete Quest')
                .setStyle(ButtonStyle.Primary)
        )
    ];
}

function buildQuestSelectRows({ profileId, action, rows }) {
    const titleByAction = {
        accept: 'Accept Quest',
        abandon: 'Abandon Quest',
        complete: 'Complete Quest'
    };

    const select = new StringSelectMenuBuilder()
        .setCustomId(`advguild_quest_${action}_select_${profileId}`)
        .setPlaceholder(titleByAction[action] || 'Select a quest')
        .addOptions(
            rows.slice(0, 25).map((row, index) => {
                const target = Math.max(1, Number(row.targetKills) || 1);
                const current = Math.max(0, Number(row.current) || 0);
                const reward = Math.max(0, Number(row.rewardCrystals) || 0);
                const rewardXp = Math.max(0, Number(row.rewardXp) || 0);
                const title = String(row.title || `Slay ${target} monsters`);
                return {
                    label: `Q${index + 1}: ${title}`.slice(0, 100),
                    value: String(row.id),
                    description: `${current}/${target} | ${reward} crystals + ${rewardXp} XP`
                };
            })
        );

    return [new ActionRowBuilder().addComponents(select)];
}

function mapQuestReason(reason, context = 'accept') {
    const action = String(context || 'accept');

    if (reason === 'NO_PROFILE') return 'You are not registered. Use /start first.';
    if (reason === 'NO_BOARD') return 'Quest board is not available in this server.';
    if (reason === 'UNKNOWN_QUEST') return 'This quest is no longer available.';
    if (reason === 'ALREADY_COMPLETED') return 'You already completed this quest for the current cycle.';
    if (reason === 'ALREADY_ACTIVE') return 'You already accepted this quest.';
    if (reason === 'ACTIVE_LIMIT') return `You can only have ${MAX_ACTIVE_QUESTS} active quests.`;
    if (reason === 'NOT_ACTIVE' && action === 'abandon') return 'This quest is not in your active list.';
    if (reason === 'NOT_ACTIVE' && action === 'complete') return 'You must accept this quest first.';
    if (reason === 'NOT_FINISHED') return 'Quest objective not completed yet.';
    return 'Unable to process this quest action right now.';
}

async function ensureQuestPanelProfile(interaction, profileIdRaw) {
    const profileId = parseInt(String(profileIdRaw || ''), 10);
    if (!Number.isInteger(profileId)) {
        return { ok: false, message: 'Invalid quest panel.' };
    }

    const profile = await Profiles.findByPk(profileId);
    if (!profile || profile.userId !== interaction.user.id) {
        return { ok: false, message: 'This quest panel is not for you.' };
    }

    return { ok: true, profile };
}

async function replyQuestPanel(interaction, profile, update = false) {
    const panelData = await getQuestPanelData(profile.id, interaction.guildId);
    if (!panelData) {
        const payload = {
            content: 'Quest board is not available right now.',
            flags: MessageFlags.Ephemeral
        };
        return update ? interaction.update(payload) : interaction.reply(payload);
    }

    const payload = {
        embeds: [buildQuestPanelEmbed(profile, panelData)],
        components: buildQuestPanelButtons(profile.id),
        flags: MessageFlags.Ephemeral
    };

    return update ? interaction.update(payload) : interaction.reply(payload);
}

async function handleQuestActionButton(interaction, action) {
    const customIdParts = interaction.customId.split('_');
    const profileIdRaw = customIdParts[customIdParts.length - 1];
    const profileCheck = await ensureQuestPanelProfile(interaction, profileIdRaw);

    if (!profileCheck.ok) {
        return interaction.update({
            content: profileCheck.message,
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
    }

    const profile = profileCheck.profile;
    const panelData = await getQuestPanelData(profile.id, interaction.guildId);
    if (!panelData) {
        return interaction.update({
            content: 'Quest board is not available right now.',
            embeds: [],
            components: []
        });
    }

    let targetRows = [];
    if (action === 'accept') {
        targetRows = panelData.rows.filter((row) => row.status === 'available');
    } else if (action === 'abandon') {
        targetRows = panelData.rows.filter((row) => row.status === 'active');
    } else if (action === 'complete') {
        targetRows = panelData.rows.filter((row) => row.canComplete);
    }

    if (!targetRows.length) {
        const message = action === 'accept'
            ? 'No available quests to accept right now.'
            : action === 'abandon'
                ? 'You have no active quest to abandon.'
                : 'No quest is ready to complete yet.';
        return interaction.update({
            content: message,
            embeds: [buildQuestPanelEmbed(profile, panelData)],
            components: buildQuestPanelButtons(profile.id)
        });
    }

    return interaction.update({
        content: `Choose a quest to ${action}.`,
        embeds: [buildQuestPanelEmbed(profile, panelData)],
        components: [
            ...buildQuestSelectRows({ profileId: profile.id, action, rows: targetRows }),
            ...buildQuestPanelButtons(profile.id)
        ],
    });
}

async function updateQuestPanelAfterSelect(interaction, profile, infoLine) {
    const panelData = await getQuestPanelData(profile.id, interaction.guildId);
    if (!panelData) {
        return interaction.update({
            content: infoLine || 'Quest board is not available right now.',
            embeds: [],
            components: []
        });
    }

    return interaction.update({
        content: infoLine || null,
        embeds: [buildQuestPanelEmbed(profile, panelData)],
        components: buildQuestPanelButtons(profile.id)
    });
}

async function handleAdventurerGuildButton(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({
            content: 'Guild panel buttons can only be used in a server.',
            flags: MessageFlags.Ephemeral
        });
    }

    const config = await AdventurerGuildConfig.findOne({
        where: { guildId: interaction.guildId }
    });

    if (!config?.panelChannelId || !config?.panelMessageId) {
        return interaction.reply({
            content: 'Adventurer Guild panel is not configured yet.',
            flags: MessageFlags.Ephemeral
        });
    }

    const isQuestSubAction = interaction.customId.startsWith('advguild_quest_')
        && interaction.customId !== 'advguild_quest';

    if (!isQuestSubAction) {
        if (interaction.channelId !== config.panelChannelId || interaction.message.id !== config.panelMessageId) {
            return interaction.reply({
                content: 'This panel is outdated. Use the configured guild counter panel.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    await upsertAdventurerGuildPanel(interaction.client, interaction.guildId).catch(() => {});

    if (interaction.customId === 'advguild_sell') {
        const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start first.',
                flags: MessageFlags.Ephemeral
            });
        }

        const market = getGuildCoreBuybackPrices(config);
        const itemKeys = market.entries.map((entry) => normalizeItemKey(entry.coreName));
        const items = await InventoryItems.findAll({
            where: {
                profileId: profile.id,
                itemKey: { [Op.in]: itemKeys }
            }
        });
        const qtyByKey = new Map(items.map((item) => [item.itemKey, Math.max(0, Number(item.quantity) || 0)]));

        const sellable = market.entries.filter((entry) => (qtyByKey.get(normalizeItemKey(entry.coreName)) || 0) > 0);
        if (!sellable.length) {
            return interaction.reply({
                content: 'You do not have any Monster Cores to sell right now.',
                flags: MessageFlags.Ephemeral
            });
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId(`advguild_sell_select_${profile.id}`)
            .setPlaceholder('Choose a core to sell')
            .addOptions(
                sellable.slice(0, 25).map((entry) => {
                    const qty = qtyByKey.get(normalizeItemKey(entry.coreName)) || 0;
                    return {
                        label: entry.coreName.replace('Monster ', ''),
                        value: entry.coreKey,
                        description: `Rate ${entry.buybackPrice} crystals | You own ${qty}`
                    };
                })
            );

        const row = new ActionRowBuilder().addComponents(select);
        const lines = sellable.map((entry) => {
            const qty = qtyByKey.get(normalizeItemKey(entry.coreName)) || 0;
            return `- ${formatCoreItemLabel(entry.coreName)}: ${entry.buybackPrice} crystals (owned: ${qty})`;
        });

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#1f2a44')
                    .setTitle('Guild Sell Counter')
                    .setDescription(
                        'Choose a core type, then enter how many you want to sell.\n' +
                        'Rates are dynamic and can change with market activity.\n\n' +
                        lines.join('\n')
                    )
            ],
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.customId === 'advguild_exchange') {
        return interaction.reply({
            content: 'Exchange is work in progress.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (interaction.customId === 'advguild_quest') {
        const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start first.',
                flags: MessageFlags.Ephemeral
            });
        }

        return replyQuestPanel(interaction, profile, false);
    }

    if (interaction.customId.startsWith('advguild_quest_accept_')) {
        return handleQuestActionButton(interaction, 'accept');
    }

    if (interaction.customId.startsWith('advguild_quest_abandon_')) {
        return handleQuestActionButton(interaction, 'abandon');
    }

    if (interaction.customId.startsWith('advguild_quest_complete_')) {
        return handleQuestActionButton(interaction, 'complete');
    }

    return interaction.reply({
        content: 'Unknown quest action.',
        flags: MessageFlags.Ephemeral
    });
}

async function handleAdventurerGuildQuestSelect(interaction) {
    if (!interaction.guildId) {
        return interaction.update({
            content: 'Quest actions can only be used in a server.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
    }

    const parts = interaction.customId.split('_');
    const action = parts[2];
    const profileId = parseInt(parts[parts.length - 1], 10);
    const questId = String(interaction.values?.[0] || '').trim();

    if (!Number.isInteger(profileId) || !questId) {
        return interaction.update({
            content: 'Invalid quest selection.',
            embeds: [],
            components: []
        });
    }

    const profile = await Profiles.findByPk(profileId);
    if (!profile || profile.userId !== interaction.user.id) {
        return interaction.update({
            content: 'This quest menu is not for you.',
            embeds: [],
            components: []
        });
    }

    let result;
    if (action === 'accept') {
        result = await acceptQuest(profile.id, interaction.guildId, questId);
    } else if (action === 'abandon') {
        result = await abandonQuest(profile.id, interaction.guildId, questId);
    } else if (action === 'complete') {
        result = await completeQuest(profile.id, interaction.guildId, questId);
    } else {
        return interaction.update({
            content: 'Invalid quest action.',
            embeds: [],
            components: []
        });
    }

    if (!result?.ok) {
        return updateQuestPanelAfterSelect(
            interaction,
            profile,
            mapQuestReason(result?.reason, action)
        );
    }

    let infoLine = '';
    if (action === 'accept') {
        infoLine = `Accepted: **${result.quest.title}**`;
    } else if (action === 'abandon') {
        infoLine = 'Quest abandoned.';
    } else if (action === 'complete') {
        infoLine =
            `Quest completed: **${result.quest.title}**\n` +
            `Reward: ${formatCrystalLabel(result.rewardCrystals)}\n` +
            `Reward XP: +${Math.max(0, Number(result.rewardXp) || 0)} XP` +
            (Math.max(0, Number(result.skillPointsGain) || 0) > 0
                ? ` (Level ${result.levelAfter}, +${result.skillPointsGain} SP)`
                : '') +
            `\n` +
            `Balance: ${formatCrystalLabel(result.balanceCrystals)}`;
    }

    return updateQuestPanelAfterSelect(interaction, profile, infoLine);
}

module.exports = {
    handleAdventurerGuildButton,
    handleAdventurerGuildQuestSelect
};
