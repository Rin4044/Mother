const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const {
    Profiles,
    UserSkills,
    UserTitles,
    FightProgress,
    sequelize
} = require('../../database.js');
const { RACE_CONFIG } = require('../../utils/evolutionConfig');

function resolveRaceRoleId(raceName) {
    const key = String(raceName || '').toLowerCase().trim().replace(/\s+/g, '_');
    return RACE_CONFIG[key]?.role || null;
}

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

            const roleId = resolveRaceRoleId(profile.race);

            await UserTitles.destroy({ where: { profileId: profile.id }, transaction });
            await UserSkills.destroy({ where: { profileId: profile.id }, transaction });
            await FightProgress.destroy({ where: { profileId: profile.id }, transaction });
            await profile.destroy({ transaction });

            await transaction.commit();

            try {
                const member = await interaction.guild.members.fetch(targetUser.id);
                if (member) {
                    const allRaceRoleIds = [
                        ...new Set(
                            Object.values(RACE_CONFIG)
                                .map((cfg) => cfg?.role)
                                .filter(Boolean)
                        )
                    ];

                    const rolesToRemove = member.roles.cache
                        .filter((r) => allRaceRoleIds.includes(r.id))
                        .map((r) => r.id);

                    if (rolesToRemove.length) {
                        await member.roles.remove(rolesToRemove);
                    } else if (roleId) {
                        await member.roles.remove(roleId).catch(() => {});
                    }
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
