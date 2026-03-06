const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../database.js');
const { RACES } = require('../../utils/races'); // Ton config race central
const { RACE_CONFIG } = require('../../utils/evolutionConfig');

function resolveRaceRoleId(raceName) {
    const key = String(raceName || '').toLowerCase().trim().replace(/\s+/g, '_');
    return RACE_CONFIG[key]?.role || null;
}

module.exports = {

    data: new SlashCommandBuilder()
        .setName('changerace')
        .setDescription('Change the race of a user')
        .setDefaultMemberPermissions(0x8)
        .addUserOption(o =>
            o.setName('target')
                .setDescription('Target user')
                .setRequired(true))
        .addStringOption(o =>
            o.setName('newrace')
                .setDescription('New race')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        const focused = String(interaction.options.getFocused() || '').toLowerCase().trim();
        const races = Object.keys(RACES);

        const matches = races
            .filter((race) => race.toLowerCase().includes(focused))
            .slice(0, 25)
            .map((race) => ({ name: race, value: race }));

        return interaction.respond(matches);
    },

    async execute(interaction) {

        const target = interaction.options.getUser('target');
        const newRace = interaction.options.getString('newrace').toLowerCase().trim();

        const profile = await Profiles.findOne({ where: { userId: target.id } });

        if (!profile) {
            return interaction.reply({
                content: `${target.username} does not have a profile.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (!RACES[newRace]) {
            return interaction.reply({
                content: 'This race is not defined in the system.',
                flags: MessageFlags.Ephemeral
            });
        }

        const oldRace = profile.race;

        const member = await interaction.guild.members.fetch(target.id);

        if (!member) {
            return interaction.reply({
                content: 'Member not found in guild.',
                flags: MessageFlags.Ephemeral
            });
        }

        const oldRoleId = resolveRaceRoleId(oldRace);
        const newRoleId = resolveRaceRoleId(newRace);

        try {

            if (oldRoleId) {
                await member.roles.remove(oldRoleId).catch(() => {});
            }

            if (newRoleId) {
                await member.roles.add(newRoleId);
            }

            // Reset progression (recommandé)
            profile.race = newRace;
            profile.level = 1;
            profile.xp = 0;

            await profile.save();

            return interaction.reply(
                `✅ ${target.username} is now **${newRace}** (level reset to 1).`
            );

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content: 'Error while changing race.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
