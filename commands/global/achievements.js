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
    getAchievementsPanelData,
    claimAllAchievements
} = require('../../utils/achievementService');
const { recordJournalProgress } = require('../../utils/journalService');
const { getConfiguredAchievementRoleCount } = require('../../utils/achievementRoleRewards');

const ACHIEVEMENT_BUTTON_COOLDOWN_MS = 1500;
const achievementButtonCooldowns = new Map();

function formatAchievementRows(rows = []) {
    if (!rows.length) return '- none';
    return rows.map((row, index) => {
        const maxTier = Math.max(1, Number(row.maxTier) || 1);
        const unlocked = Math.max(0, Number(row.unlockedTier) || 0);
        const claimed = Math.max(0, Number(row.claimedTier) || 0);
        const claimable = Math.max(0, Number(row.claimable) || 0);
        const progress = Math.max(0, Number(row.progress) || 0);
        const nextTarget = row.nextTarget === null ? 'MAX' : String(row.nextTarget);
        return `A${index + 1}. ${row.label} | ${progress}/${nextTarget} | Tiers ${claimed}/${maxTier} claimed | Ready: ${claimable} (Unlocked ${unlocked})`;
    }).join('\n');
}

function buildComponents(userId, disableClaimAll = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`achievements_claim_all_${userId}`)
                .setLabel('Claim All')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disableClaimAll),
            new ButtonBuilder()
                .setCustomId(`achievements_refresh_${userId}`)
                .setLabel('Refresh')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

async function buildPayload(profile, userId, notice = null) {
    const panel = await getAchievementsPanelData(profile.id);
    if (!panel) return { error: 'Achievements are not available right now.' };

    const rows = panel.rows || [];
    const ready = rows.reduce((sum, row) => sum + Math.max(0, Number(row.claimable) || 0), 0);
    const unlocked = rows.reduce((sum, row) => sum + Math.max(0, Number(row.unlockedTier) || 0), 0);
    const claimed = rows.reduce((sum, row) => sum + Math.max(0, Number(row.claimedTier) || 0), 0);

    const configuredRoleCount = getConfiguredAchievementRoleCount();

    const embed = new EmbedBuilder()
        .setColor('#4b2b7f')
        .setTitle(`${profile.name} - Achievements`)
        .setDescription(
            (notice ? `${notice}\n\n` : '') +
            `Unlocked tiers: **${unlocked}**\n` +
            `Claimed tiers: **${claimed}**\n` +
            `Ready to claim: **${ready}**\n` +
            `Role rewards configured: **${configuredRoleCount}/7** (final tier, cumulative)`
        )
        .addFields({
            name: 'Progress',
            value: formatAchievementRows(rows)
        });

    return {
        embed,
        components: buildComponents(userId, ready <= 0),
        ready
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('achievements')
        .setDescription('Show your milestone achievements and claim rewards.'),

    async execute(interaction) {
        const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start first.',
                flags: MessageFlags.Ephemeral
            });
        }

        const payload = await buildPayload(profile, interaction.user.id);
        if (payload.error) {
            return interaction.reply({ content: payload.error, flags: MessageFlags.Ephemeral });
        }

        return interaction.reply({
            embeds: [payload.embed],
            components: payload.components,
            flags: MessageFlags.Ephemeral
        });
    },

    async handleAchievementButton(interaction) {
        const nowMs = Date.now();
        const lastAt = Number(achievementButtonCooldowns.get(interaction.user.id)) || 0;
        if (nowMs - lastAt < ACHIEVEMENT_BUTTON_COOLDOWN_MS) {
            const waitMs = ACHIEVEMENT_BUTTON_COOLDOWN_MS - (nowMs - lastAt);
            return interaction.reply({
                content: `Please wait ${Math.max(1, Math.ceil(waitMs / 1000))}s before using achievement buttons again.`,
                flags: MessageFlags.Ephemeral
            });
        }
        achievementButtonCooldowns.set(interaction.user.id, nowMs);

        const parts = String(interaction.customId || '').split('_');
        if (parts.length < 3) return;
        const action = parts[1] === 'claim' ? `claim_${parts[2]}` : parts[1];
        const ownerId = parts[1] === 'claim' ? parts[3] : parts[2];
        if (!ownerId) return;

        if (interaction.user.id !== ownerId) {
            return interaction.reply({
                content: 'This achievements panel is not yours.',
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
            const out = await claimAllAchievements(profile.id);
            if (!out?.ok) {
                notice = 'No achievements could be claimed.';
            } else if ((Number(out.totalClaims) || 0) <= 0) {
                notice = 'No achievement tiers are ready to claim.';
            } else {
                const member = interaction.guild && interaction.user?.id
                    ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
                    : null;
                const roleGrantLines = [];
                if (member && Array.isArray(out.roleRewards) && out.roleRewards.length) {
                    const uniqueRoles = [];
                    const seen = new Set();
                    for (const reward of out.roleRewards) {
                        const roleId = String(reward?.roleId || '');
                        if (!roleId || seen.has(roleId)) continue;
                        seen.add(roleId);
                        uniqueRoles.push(reward);
                    }

                    for (const reward of uniqueRoles) {
                        const roleId = String(reward.roleId || '');
                        const already = member.roles?.cache?.has(roleId);
                        if (already) {
                            roleGrantLines.push(`${reward.label}: already owned`);
                            continue;
                        }
                        const granted = await member.roles.add(roleId).then(() => true).catch(() => false);
                        roleGrantLines.push(
                            granted
                                ? `${reward.label}: granted`
                                : `${reward.label}: failed (check role id/permissions)`
                        );
                    }
                }

                const rewardList = Array.isArray(out.rewards) && out.rewards.length
                    ? out.rewards.map((line) => `- ${line}`).join('\n')
                    : '- none';
                const titleList = Array.isArray(out.titlesGranted) && out.titlesGranted.length
                    ? out.titlesGranted.map((name) => `- ${name}`).join('\n')
                    : '- none';
                const roleList = roleGrantLines.length
                    ? roleGrantLines.map((line) => `- ${line}`).join('\n')
                    : '- none';

                notice =
                    `Claimed **${out.totalClaims}** achievement tier(s).\n` +
                    `Items:\n${rewardList}\n` +
                    `Titles:\n${titleList}\n` +
                    `Roles:\n${roleList}`;

                await recordJournalProgress(profile.id, {
                    type: 'achievement_claim',
                    note: `Claimed ${out.totalClaims} achievement tier(s).`
                }).catch(() => {});
            }
        }

        const payload = await buildPayload(profile, interaction.user.id, notice);
        if (payload.error) {
            return interaction.reply({ content: payload.error, flags: MessageFlags.Ephemeral });
        }

        return interaction.update({
            embeds: [payload.embed],
            components: payload.components
        });
    }
};
