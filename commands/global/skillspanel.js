const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const { Skills } = require('../../database.js');

const SKILLS_PER_PAGE = 10;

module.exports = {

    data: new SlashCommandBuilder()
        .setName('skillspanel')
        .setDescription('Display all available skills with IDs and costs.'),

    async execute(interaction) {

        const userId = interaction.user.id;

        const skills = await Skills.findAll({
            order: [['id', 'ASC']]
        });

        if (!skills.length) {
            return interaction.reply({
                content: 'No skills available.',
                flags: MessageFlags.Ephemeral
            });
        }

        const totalPages = Math.ceil(skills.length / SKILLS_PER_PAGE);
        const page = 1;

        return interaction.reply({
            embeds: [buildEmbed(skills, page, totalPages)],
            components: [buildButtons(page, totalPages, userId)]
        });
    }
};

function buildEmbed(skills, page, totalPages) {

    const start = (page - 1) * SKILLS_PER_PAGE;
    const pageSkills = skills.slice(start, start + SKILLS_PER_PAGE);

    const description = pageSkills.map(skill =>
        `**ID:** ${skill.id} | **${skill.name}**`
    ).join('\n');

    return new EmbedBuilder()
        .setColor('#290003')
        .setTitle('📚 Skills Panel')
        .setDescription(description)
        .setFooter({ text: `Page ${page} / ${totalPages}` });
}

function buildButtons(page, totalPages, userId) {

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`panel_prev_${userId}_${page}`)
            .setLabel('⬅')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 1),

        new ButtonBuilder()
            .setCustomId(`panel_next_${userId}_${page}`)
            .setLabel('➡')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages)
    );
}
