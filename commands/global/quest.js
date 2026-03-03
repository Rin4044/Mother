const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { Profiles } = require('../../database');
const {
    getQuestPanelData,
    getDailyWeeklyQuestPanelData,
    MAX_ACTIVE_QUESTS,
    completeQuest,
    claimCycleQuests
} = require('../../utils/adventurerGuildQuestService');
const { recordJournalProgress } = require('../../utils/journalService');
const { recordGuildProgressByProfile } = require('../../utils/playerGuildService');
const QUEST_BUTTON_COOLDOWN_MS = 1500;
const questButtonCooldowns = new Map();

function formatDuration(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || !parts.length) parts.push(`${s}s`);
    return parts.join(' ');
}

function rowsToText(rows = []) {
    if (!rows.length) return '- none';

    return rows.map((row, index) => {
        const target = Math.max(1, Number(row.targetKills) || 1);
        const current = Math.max(0, Number(row.current) || 0);
        const reward = Math.max(0, Number(row.rewardCrystals) || 0);
        const rewardXp = Math.max(0, Number(row.rewardXp) || 0);
        const title = String(row.title || `Slay ${target} monsters`);
        return `Q${index + 1}. ${title} | ${current}/${target} | ${reward} crystals + ${rewardXp} XP`;
    }).join('\n');
}

function cycleRowsToText(rows = [], prefix = 'Q') {
    if (!rows.length) return '- none';
    return rows.map((row, index) => {
        const target = Math.max(1, Number(row.targetKills) || 1);
        const current = Math.max(0, Number(row.current) || 0);
        const reward = Math.max(0, Number(row.rewardCrystals) || 0);
        const rewardXp = Math.max(0, Number(row.rewardXp) || 0);
        const status = String(row.status || 'active');
        const marker = status === 'completed' ? 'Completed' : (status === 'ready' ? 'Ready' : 'In Progress');
        return `${prefix}${index + 1}. ${row.title} | ${current}/${target} | ${reward} crystals + ${rewardXp} XP | ${marker}`;
    }).join('\n');
}

function buildQuestComponents(userId, options = {}) {
    const disableClaimAll = !!options.disableClaimAll;
    const disableClaimDaily = !!options.disableClaimDaily;
    const disableClaimWeekly = !!options.disableClaimWeekly;

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`quest_claim_all_${userId}`)
                .setLabel('Claim All')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disableClaimAll),
            new ButtonBuilder()
                .setCustomId(`quest_claim_daily_${userId}`)
                .setLabel('Claim Daily')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableClaimDaily),
            new ButtonBuilder()
                .setCustomId(`quest_claim_weekly_${userId}`)
                .setLabel('Claim Weekly')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableClaimWeekly),
            new ButtonBuilder()
                .setCustomId(`quest_refresh_${userId}`)
                .setLabel('Refresh')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

async function buildQuestViewPayload(profileId, guildId, userId, notice = null) {
    const panelData = await getQuestPanelData(profileId, guildId);
    if (!panelData) {
        return {
            error: 'Quest board is not available in this server.'
        };
    }

    const activeRows = panelData.rows.filter((row) => row.status === 'active' && !row.canComplete);
    const completableRows = panelData.rows.filter((row) => row.canComplete);
    const availableRows = panelData.rows.filter((row) => row.status === 'available');

    const cycleData = await getDailyWeeklyQuestPanelData(profileId);
    const dailyRows = cycleData?.daily?.rows || [];
    const weeklyRows = cycleData?.weekly?.rows || [];

    const dailyReady = dailyRows.filter((r) => r.status === 'ready').length;
    const weeklyReady = weeklyRows.filter((r) => r.status === 'ready').length;
    const dailyDone = dailyRows.filter((r) => r.status === 'completed').length;
    const weeklyDone = weeklyRows.filter((r) => r.status === 'completed').length;

    const resetAtMs = Math.max(0, Number(panelData?.board?.resetAt) || 0);
    const dailyResetAtMs = Math.max(0, Number(cycleData?.daily?.board?.resetAt) || 0);
    const weeklyResetAtMs = Math.max(0, Number(cycleData?.weekly?.board?.resetAt) || 0);
    const nowMs = Date.now();

    const profile = await Profiles.findByPk(profileId);
    const name = profile?.name || 'Unknown';

    const embed = new EmbedBuilder()
        .setColor('#1f2a44')
        .setTitle(`${name} - Quests`)
        .setDescription(
            (notice ? `${notice}\n\n` : '') +
            `Guild: **${activeRows.length}/${MAX_ACTIVE_QUESTS} active** | Ready: **${completableRows.length}** | Available: **${availableRows.length}**\n` +
            `Daily: **${dailyDone}/${dailyRows.length} completed** | Ready: **${dailyReady}**\n` +
            `Weekly: **${weeklyDone}/${weeklyRows.length} completed** | Ready: **${weeklyReady}**`
        )
        .addFields(
            {
                name: `Guild Quests (reset ${formatDuration(Math.max(0, resetAtMs - nowMs))} | <t:${Math.floor(resetAtMs / 1000)}:R>)`,
                value: rowsToText([...activeRows, ...completableRows])
            },
            {
                name: `Daily Quests (reset ${formatDuration(Math.max(0, dailyResetAtMs - nowMs))} | <t:${Math.floor(dailyResetAtMs / 1000)}:R>)`,
                value: cycleRowsToText(dailyRows, 'D')
            },
            {
                name: `Weekly Quests (reset ${formatDuration(Math.max(0, weeklyResetAtMs - nowMs))} | <t:${Math.floor(weeklyResetAtMs / 1000)}:R>)`,
                value: cycleRowsToText(weeklyRows, 'W')
            }
        );

    const components = buildQuestComponents(userId, {
        disableClaimAll: (completableRows.length + dailyReady + weeklyReady) <= 0,
        disableClaimDaily: dailyReady <= 0,
        disableClaimWeekly: weeklyReady <= 0
    });

    return { embed, components, panelData, cycleData };
}

async function claimReadyGuildQuests(profileId, guildId) {
    const panelData = await getQuestPanelData(profileId, guildId);
    if (!panelData) {
        return { claimed: 0, crystals: 0, xp: 0, skillPoints: 0 };
    }

    const readyRows = panelData.rows.filter((row) => row.canComplete);
    let claimed = 0;
    let crystals = 0;
    let xp = 0;
    let skillPoints = 0;

    for (const row of readyRows) {
        const out = await completeQuest(profileId, guildId, row.id);
        if (!out?.ok) continue;
        claimed += 1;
        crystals += Math.max(0, Number(out.rewardCrystals) || 0);
        xp += Math.max(0, Number(out.rewardXp) || 0);
        skillPoints += Math.max(0, Number(out.skillPointsGain) || 0);
    }

    return { claimed, crystals, xp, skillPoints };
}

function formatClaimNotice(parts = []) {
    const chunks = parts.filter(Boolean);
    if (!chunks.length) return 'No quests were ready to claim.';
    return `Claimed rewards:\n${chunks.map((line) => `- ${line}`).join('\n')}`;
}

function formatGuildMissionReadyNotice(guildProgressOut) {
    const daily = !!guildProgressOut?.dailyNewReady;
    const weekly = !!guildProgressOut?.weeklyNewReady;
    if (!daily && !weekly) return null;
    const parts = [];
    if (daily) parts.push('daily');
    if (weekly) parts.push('weekly');
    return `Guild mission ready: ${parts.join(', ')} (leader/officers use /guild claim).`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quest')
        .setDescription('Show your Adventurer Guild quests.'),

    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({
                content: 'This command can only be used in a server.',
                flags: MessageFlags.Ephemeral
            });
        }

        const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start first.',
                flags: MessageFlags.Ephemeral
            });
        }

        const payload = await buildQuestViewPayload(profile.id, interaction.guildId, interaction.user.id);
        if (payload.error) {
            return interaction.reply({
                content: payload.error,
                flags: MessageFlags.Ephemeral
            });
        }

        return interaction.reply({
            embeds: [payload.embed],
            components: payload.components,
            flags: MessageFlags.Ephemeral
        });
    },

    async handleQuestButton(interaction) {
        const nowMs = Date.now();
        const lastAt = Number(questButtonCooldowns.get(interaction.user.id)) || 0;
        if (nowMs - lastAt < QUEST_BUTTON_COOLDOWN_MS) {
            const waitMs = QUEST_BUTTON_COOLDOWN_MS - (nowMs - lastAt);
            return interaction.reply({
                content: `Please wait ${Math.max(1, Math.ceil(waitMs / 1000))}s before using quest buttons again.`,
                flags: MessageFlags.Ephemeral
            });
        }
        questButtonCooldowns.set(interaction.user.id, nowMs);

        const parts = String(interaction.customId || '').split('_');
        if (parts.length < 3) return;
        const action = parts[1] === 'claim'
            ? `claim_${parts[2]}`
            : parts[1];
        const ownerId = parts[1] === 'claim' ? parts[3] : parts[2];
        if (!ownerId) return;

        if (interaction.user.id !== ownerId) {
            return interaction.reply({
                content: 'This quest panel is not yours.',
                flags: MessageFlags.Ephemeral
            });
        }

        const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start first.',
                flags: MessageFlags.Ephemeral
            });
        }

        let notice = null;
        if (action === 'claim_all') {
            const guildOut = await claimReadyGuildQuests(profile.id, interaction.guildId);
            const cycleOut = await claimCycleQuests(profile.id, 'all');
            const totalClaimed = Math.max(0, Number(guildOut.claimed) || 0) + Math.max(0, Number(cycleOut?.claimedTotal) || 0);
            const totalCrystals = Math.max(0, Number(guildOut.crystals) || 0) + Math.max(0, Number(cycleOut?.rewardCrystals) || 0);
            const totalXp = Math.max(0, Number(guildOut.xp) || 0) + Math.max(0, Number(cycleOut?.rewardXp) || 0);
            if (totalClaimed > 0 || totalCrystals > 0 || totalXp > 0) {
                await recordJournalProgress(profile.id, {
                    type: 'quest_claim',
                    questsClaimed: totalClaimed,
                    crystals: totalCrystals,
                    xp: totalXp,
                    note: 'Claimed quest rewards (all).'
                }).catch(() => {});
                const guildProgressOut = await recordGuildProgressByProfile(profile.id, {
                    questClaims: totalClaimed,
                    xpGained: totalXp
                }).catch(() => null);
                const guildMissionNotice = formatGuildMissionReadyNotice(guildProgressOut);
                if (guildMissionNotice) {
                    notice = formatClaimNotice([
                        guildOut.claimed > 0
                            ? `Guild: ${guildOut.claimed} quest(s), +${guildOut.crystals} crystals, +${guildOut.xp} XP`
                            : null,
                        cycleOut?.ok && cycleOut.claimedTotal > 0
                            ? `Daily/Weekly: ${cycleOut.claimedTotal} quest(s), +${cycleOut.rewardCrystals} crystals, +${cycleOut.rewardXp} XP`
                            : null,
                        guildMissionNotice
                    ]);
                }
            }
            if (!notice) {
                notice = formatClaimNotice([
                    guildOut.claimed > 0
                        ? `Guild: ${guildOut.claimed} quest(s), +${guildOut.crystals} crystals, +${guildOut.xp} XP`
                        : null,
                    cycleOut?.ok && cycleOut.claimedTotal > 0
                        ? `Daily/Weekly: ${cycleOut.claimedTotal} quest(s), +${cycleOut.rewardCrystals} crystals, +${cycleOut.rewardXp} XP`
                        : null
                ]);
            }
        } else if (action === 'claim_daily') {
            const cycleOut = await claimCycleQuests(profile.id, 'daily');
            if ((Number(cycleOut?.claimedDaily) || 0) > 0 || (Number(cycleOut?.rewardCrystals) || 0) > 0 || (Number(cycleOut?.rewardXp) || 0) > 0) {
                await recordJournalProgress(profile.id, {
                    type: 'quest_claim',
                    questsClaimed: Math.max(0, Number(cycleOut?.claimedDaily) || 0),
                    crystals: Math.max(0, Number(cycleOut?.rewardCrystals) || 0),
                    xp: Math.max(0, Number(cycleOut?.rewardXp) || 0),
                    note: 'Claimed daily quest rewards.'
                }).catch(() => {});
                const guildProgressOut = await recordGuildProgressByProfile(profile.id, {
                    questClaims: Math.max(0, Number(cycleOut?.claimedDaily) || 0),
                    xpGained: Math.max(0, Number(cycleOut?.rewardXp) || 0)
                }).catch(() => null);
                const guildMissionNotice = formatGuildMissionReadyNotice(guildProgressOut);
                if (guildMissionNotice) {
                    notice = formatClaimNotice([
                        cycleOut?.ok && cycleOut.claimedDaily > 0
                            ? `Daily: ${cycleOut.claimedDaily} quest(s), +${cycleOut.rewardCrystals} crystals, +${cycleOut.rewardXp} XP`
                            : null,
                        guildMissionNotice
                    ]);
                }
            }
            if (!notice) {
                notice = formatClaimNotice([
                    cycleOut?.ok && cycleOut.claimedDaily > 0
                        ? `Daily: ${cycleOut.claimedDaily} quest(s), +${cycleOut.rewardCrystals} crystals, +${cycleOut.rewardXp} XP`
                        : null
                ]);
            }
        } else if (action === 'claim_weekly') {
            const cycleOut = await claimCycleQuests(profile.id, 'weekly');
            if ((Number(cycleOut?.claimedWeekly) || 0) > 0 || (Number(cycleOut?.rewardCrystals) || 0) > 0 || (Number(cycleOut?.rewardXp) || 0) > 0) {
                await recordJournalProgress(profile.id, {
                    type: 'quest_claim',
                    questsClaimed: Math.max(0, Number(cycleOut?.claimedWeekly) || 0),
                    crystals: Math.max(0, Number(cycleOut?.rewardCrystals) || 0),
                    xp: Math.max(0, Number(cycleOut?.rewardXp) || 0),
                    note: 'Claimed weekly quest rewards.'
                }).catch(() => {});
                const guildProgressOut = await recordGuildProgressByProfile(profile.id, {
                    questClaims: Math.max(0, Number(cycleOut?.claimedWeekly) || 0),
                    xpGained: Math.max(0, Number(cycleOut?.rewardXp) || 0)
                }).catch(() => null);
                const guildMissionNotice = formatGuildMissionReadyNotice(guildProgressOut);
                if (guildMissionNotice) {
                    notice = formatClaimNotice([
                        cycleOut?.ok && cycleOut.claimedWeekly > 0
                            ? `Weekly: ${cycleOut.claimedWeekly} quest(s), +${cycleOut.rewardCrystals} crystals, +${cycleOut.rewardXp} XP`
                            : null,
                        guildMissionNotice
                    ]);
                }
            }
            if (!notice) {
                notice = formatClaimNotice([
                    cycleOut?.ok && cycleOut.claimedWeekly > 0
                        ? `Weekly: ${cycleOut.claimedWeekly} quest(s), +${cycleOut.rewardCrystals} crystals, +${cycleOut.rewardXp} XP`
                        : null
                ]);
            }
        }

        const payload = await buildQuestViewPayload(profile.id, interaction.guildId, interaction.user.id, notice);
        if (payload.error) {
            return interaction.reply({
                content: payload.error,
                flags: MessageFlags.Ephemeral
            });
        }

        return interaction.update({
            embeds: [payload.embed],
            components: payload.components
        });
    }
};
