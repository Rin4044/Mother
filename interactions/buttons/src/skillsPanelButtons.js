const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');

const { Skills } = require('../../../database.js');

const SKILLS_PER_PAGE = 10;

async function skillPanelHandle(interaction) {

    if (!interaction.isButton()) return;

    const [prefix, direction, userId, pageStr] = interaction.customId.split('_');

    if (prefix !== 'panel') return;

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: "This panel is not for you.",
            flags: MessageFlags.Ephemeral
        });
    }

    const skills = await Skills.findAll({
        order: [['id', 'ASC']]
    });

    if (!skills.length) {
        return interaction.update({
            content: 'No skills available.',
            embeds: [],
            components: []
        });
    }

    const totalPages = Math.ceil(skills.length / SKILLS_PER_PAGE);

    let page = parseInt(pageStr);

    if (direction === 'prev' && page > 1) page--;
    if (direction === 'next' && page < totalPages) page++;

    const start = (page - 1) * SKILLS_PER_PAGE;
    const pageSkills = skills.slice(start, start + SKILLS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle('📚 Skills Panel')
        .setDescription(
            pageSkills.map(skill =>
                `**ID:** ${skill.id} | **${skill.name}**`
            ).join('\n')
        )
        .setFooter({ text: `Page ${page} / ${totalPages}` });

    const row = new ActionRowBuilder().addComponents(
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

    return interaction.update({
        embeds: [embed],
        components: [row]
    });
}

module.exports = { skillPanelHandle };
