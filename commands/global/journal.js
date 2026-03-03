const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../database');
const { getJournalSummary } = require('../../utils/journalService');

function formatEntries(entries = [], limit = 6) {
    const list = Array.isArray(entries) ? entries.slice(-limit).reverse() : [];
    if (!list.length) return '- none';
    return list.map((entry) => {
        const ts = Math.max(0, Math.floor((Number(entry?.ts) || 0) / 1000));
        const text = String(entry?.text || 'activity');
        return `- <t:${ts}:R> ${text}`;
    }).join('\n');
}

function bucketToText(bucket = {}) {
    return [
        `Kills: **${Math.max(0, Number(bucket.kills) || 0)}**`,
        `XP gained: **${Math.max(0, Number(bucket.xp) || 0)}**`,
        `Crystals gained: **${Math.max(0, Number(bucket.crystals) || 0)}**`,
        `Quests claimed: **${Math.max(0, Number(bucket.questsClaimed) || 0)}**`,
        `Damage dealt: **${Math.max(0, Number(bucket.damageDealt) || 0)}**`,
        `Damage taken: **${Math.max(0, Number(bucket.damageTaken) || 0)}**`,
        `Status inflicted: **${Math.max(0, Number(bucket.statusInflictedTicks) || 0)}**`,
        `Status taken: **${Math.max(0, Number(bucket.statusTakenTicks) || 0)}**`
    ].join('\n');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('journal')
        .setDescription('Show your daily and weekly progression journal.'),

    async execute(interaction) {
        const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start first.',
                flags: MessageFlags.Ephemeral
            });
        }

        const journal = await getJournalSummary(profile.id);
        if (!journal) {
            return interaction.reply({
                content: 'Journal not available.',
                flags: MessageFlags.Ephemeral
            });
        }

        const dayResetAt = Math.floor(((Number(journal.dayStart) || 0) + (24 * 60 * 60 * 1000)) / 1000);
        const weekResetAt = Math.floor(((Number(journal.weekStart) || 0) + (7 * 24 * 60 * 60 * 1000)) / 1000);

        const embed = new EmbedBuilder()
            .setColor('#3b335b')
            .setTitle(`${profile.name} - Journal`)
            .setDescription(
                `Daily reset: <t:${dayResetAt}:R>\n` +
                `Weekly reset: <t:${weekResetAt}:R>`
            )
            .addFields(
                {
                    name: 'Daily Summary',
                    value: bucketToText(journal.daily)
                },
                {
                    name: 'Weekly Summary',
                    value: bucketToText(journal.weekly)
                },
                {
                    name: 'Recent Activity (Daily)',
                    value: formatEntries(journal.daily?.entries, 6)
                },
                {
                    name: 'Recent Activity (Weekly)',
                    value: formatEntries(journal.weekly?.entries, 8)
                }
            );

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};

