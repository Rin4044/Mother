const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { UserTitles, Titles, Profiles, sequelize } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('removetitle')
        .setDescription('Remove a title from a user.')
        .setDefaultMemberPermissions(0x8)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to remove the title from')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('titleid')
                .setDescription('Title ID')
                .setRequired(true)),

    async execute(interaction) {

        const targetUser = interaction.options.getUser('target');
        const titleId = interaction.options.getInteger('titleid');

        const transaction = await sequelize.transaction();

        try {

            const profile = await Profiles.findOne({
                where: { userId: targetUser.id },
                transaction
            });

            if (!profile) {
                await transaction.rollback();
                return interaction.reply({
                    content: `Profile for ${targetUser.username} does not exist.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const title = await Titles.findByPk(titleId, { transaction });

            if (!title) {
                await transaction.rollback();
                return interaction.reply({
                    content: `Title ID ${titleId} does not exist.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const existing = await UserTitles.findOne({
                where: {
                    profileId: profile.id,
                    titleId
                },
                transaction
            });

            if (!existing) {
                await transaction.rollback();
                return interaction.reply({
                    content: `${targetUser.username} does not have the title "${title.name}".`,
                    flags: MessageFlags.Ephemeral
                });
            }

            await existing.destroy({ transaction });

            await transaction.commit();

            return interaction.reply({
                content: `✅ Title **${title.name}** has been removed from ${targetUser.username}.`
            });

        } catch (error) {

            await transaction.rollback();
            console.error(error);

            return interaction.reply({
                content: 'An error occurred while removing the title.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};