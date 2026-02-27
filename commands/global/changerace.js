const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../database.js');
const { RACES } = require('../../utils/races'); // Ton config race central

const raceRoles = {
    'small lesser taratect': '1279130327100428369',
    'small taratect': '1279130393488130131',
    'lesser taratect': '1279130394897154080',
    'taratect': '1279130391642636409',
    'greater taratect': '1279127193225658449',
    'arch taratect': '1279127295986237461',
    'queen taratect': '1280561084717207573',
    'small poison taratect': '1279130390002667602',
    'poison taratect': '1279127140515708938',
    'orthocadinaht': '1280561373280993360',
    'zoa ele': '1280561370038796360',
    'ede saine': '1280561080191549513',
    'zana horowa': '1280561086919217193',
    'arachne': '1280561085476376658'
};

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
                .addChoices(
                    ...Object.keys(raceRoles).map(r => ({
                        name: r,
                        value: r
                    }))
                )),

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

        const oldRoleId = raceRoles[oldRace];
        const newRoleId = raceRoles[newRace];

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