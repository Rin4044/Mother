const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../database.js');
const { calculateXpForLevel } = require('../../utils/xpUtils');
const { getMaxLevelForRace } = require('../../utils/evolutionConfig');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Shows level, XP and skill points.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View another user')
                .setRequired(false)
        ),

    async execute(interaction) {

        const targetUser = interaction.options.getUser('user') || interaction.user;

        const profile = await Profiles.findOne({
            where: { userId: targetUser.id }
        });

        if (!profile) {
            return interaction.reply({
                content: "This player hasn't started the game yet.",
                flags: MessageFlags.Ephemeral
            });
        }

        const level = profile.level;
        const xp = profile.xp;
        const skillPoints = profile.skillPoints;
        const maxLevel = getMaxLevelForRace(profile.race);
        const xpNeeded = calculateXpForLevel(level + 1, profile.race);
        const isMaxLevel = level >= maxLevel || !Number.isFinite(xpNeeded);

        const progressPercent = isMaxLevel ? 1 : Math.min(xp / xpNeeded, 1);
        const progressBar = createProgressBar(progressPercent);
        const xpText = isMaxLevel ? 'MAX' : `${xp} / ${xpNeeded}`;

        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(`\uD83D\uDCDC ${profile.name}'s Level`)
            .setDescription(
                `**Race:** ${profile.race}\n\n` +
                `\uD83E\uDDEC **Level:** ${level}\n` +
                `\u2728 **XP:** ${xpText}\n` +
                `${progressBar}\n\n` +
                `\uD83C\uDFAF **Skill Points:** ${skillPoints}`
            )
            .setFooter({ text: 'Keep progressing.' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};

// ========================================
// PROGRESS BAR
// ========================================

function createProgressBar(percent) {

    const totalBlocks = 20;
    const filledBlocks = Math.round(totalBlocks * percent);
    const emptyBlocks = totalBlocks - filledBlocks;

    return `\`${'\u2588'.repeat(filledBlocks)}${'\u2591'.repeat(emptyBlocks)}\``;
}
