const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const {
    Profiles,
    UserSkills,
    UserTitles,
    FightProgress,
    sequelize
} = require('../../database.js');

const RACE_ROLES = {
    'small lesser taratect': '1279130327100428369',
    'small taratect': '1279130393488130131',
    'lesser taratect': '1279130394897154080',
    'taratect': '1279130391642636409',
    'small poison taratect': '1279130390002667602',
    'greater taratect': '1279127193225658449',
    'arch taratect': '1279127295986237461',
    'poison taratect': '1279127140515708938',
    orthocadinaht: '1280561373280993360',
    'zoa ele': '1280561370038796360',
    'queen taratect': '1280561084717207573',
    'ede saine': '1280561080191549513',
    'zana horowa': '1280561086919217193',
    arachne: '1280561085476376658'
};

module.exports = {

    data: new SlashCommandBuilder()
        .setName('resetdata')
        .setDescription('Reset all data of a selected user.')
        .setDefaultMemberPermissions(0x8)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to reset')
                .setRequired(true)
        ),

    async execute(interaction) {

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = interaction.options.getUser('target');
        const transaction = await sequelize.transaction();

        try {
            const profile = await Profiles.findOne({
                where: { userId: targetUser.id },
                transaction
            });

            if (!profile) {
                await transaction.rollback();
                return interaction.editReply({
                    content: `${targetUser.username} has no data to reset.`
                });
            }

            const raceKey = profile.race?.toLowerCase().trim();
            const roleId = RACE_ROLES[raceKey];

            await UserTitles.destroy({ where: { profileId: profile.id }, transaction });
            await UserSkills.destroy({ where: { profileId: profile.id }, transaction });
            await FightProgress.destroy({ where: { profileId: profile.id }, transaction });
            await profile.destroy({ transaction });

            await transaction.commit();

            try {
                const member = await interaction.guild.members.fetch(targetUser.id);
                if (member && roleId) {
                    await member.roles.remove(roleId);
                }
            } catch {
                // Ignore role cleanup failures.
            }

            return interaction.editReply({
                content: `All data for **${targetUser.username}** has been reset.`
            });
        } catch (error) {
            try {
                await transaction.rollback();
            } catch {
                // Ignore rollback failure if transaction is already finished.
            }

            console.error(error);

            return interaction.editReply({
                content: 'Error while resetting data.'
            });
        }
    }
};
