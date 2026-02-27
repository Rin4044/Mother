const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Titles, TitleSkills, UserTitles } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('deletetitle')
        .setDescription('Delete a title from the database (Admin only)')
        .setDefaultMemberPermissions(0x8)
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('Title ID')
                .setRequired(true)
        ),

    async execute(interaction) {

        const id = interaction.options.getInteger('id');

        const title = await Titles.findByPk(id);

        if (!title) {
            return interaction.reply({
                content: `Title with ID ${id} not found.`,
                flags: MessageFlags.Ephemeral
            });
        }

        try {

            // Supprimer relations
            await TitleSkills.destroy({ where: { titleId: id } });
            await UserTitles.destroy({ where: { titleId: id } });

            // Supprimer le titre
            await title.destroy();

            return interaction.reply(
                `✅ Title "${title.name}" (ID ${id}) deleted successfully.`
            );

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content: 'Error while deleting the title.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};