const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Skills, UserSkills, MonsterSkills, TitleSkills } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('deleteskill')
        .setDescription('Delete a skill from the database (Admin only)')
        .setDefaultMemberPermissions(0x8)
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('Skill ID')
                .setRequired(true)
        ),

    async execute(interaction) {

        const id = interaction.options.getInteger('id');

        const skill = await Skills.findByPk(id);

        if (!skill) {
            return interaction.reply({
                content: `Skill with ID ${id} not found.`,
                flags: MessageFlags.Ephemeral
            });
        }

        try {

            // Supprimer relations
            await UserSkills.destroy({ where: { skillId: id } });
            await MonsterSkills.destroy({ where: { skillId: id } });
            await TitleSkills.destroy({ where: { skillId: id } });

            // Supprimer la skill
            await skill.destroy();

            return interaction.reply(
                `✅ Skill **${skill.name}** (ID ${id}) deleted successfully.`
            );

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content: 'Error while deleting the skill.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};