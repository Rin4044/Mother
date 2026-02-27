const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../database.js');
const { getMaxLevelForRace } = require('../../utils/evolutionConfig');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('givelvl')
        .setDescription('Give levels to a user.')
        .setDefaultMemberPermissions(0x8)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to level up')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('levels')
                .setDescription('Number of levels to give')
                .setRequired(true)),

    async execute(interaction) {

        const targetUser = interaction.options.getUser('target');
        const levelsToGive = interaction.options.getInteger('levels');

        if (levelsToGive <= 0) {
            return interaction.reply({
                content: 'Levels must be a positive number.',
                flags: MessageFlags.Ephemeral
            });
        }

        const profile = await Profiles.findOne({
            where: { userId: targetUser.id }
        });

        if (!profile) {
            return interaction.reply({
                content: `Profile for ${targetUser.username} does not exist.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const race = profile.race.toLowerCase().trim();
        const maxLevel = getMaxLevelForRace(race);

        if (profile.level >= maxLevel) {
            return interaction.reply({
                content: `${targetUser.username} is already at max level (${maxLevel}).`,
                flags: MessageFlags.Ephemeral
            });
        }

        const newLevel = Math.min(profile.level + levelsToGive, maxLevel);
        const levelsAdded = newLevel - profile.level;

        profile.level = newLevel;
        profile.skillPoints += levelsAdded * 5;

        await profile.save();

        return interaction.reply({
            content: `✅ ${targetUser.username} gained ${levelsAdded} level(s).\nNow level ${newLevel}/${maxLevel}.`
        });
    }
};
