const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');

const { Titles } = require('../../../database.js');

const TITLES_PER_PAGE = 10;

async function titlePanelHandle(interaction) {

    if (!interaction.isButton()) return;

    const [prefix, direction, userId, pageStr] = interaction.customId.split('_');

    if (prefix !== 'titlepanel') return;

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: "This panel is not for you.",
            flags: MessageFlags.Ephemeral
        });
    }

    const titles = await Titles.findAll({
        order: [['id', 'ASC']]
    });

    if (!titles.length) {
        return interaction.update({
            content: 'No titles available.',
            embeds: [],
            components: []
        });
    }

    const totalPages = Math.ceil(titles.length / TITLES_PER_PAGE);

    let page = parseInt(pageStr);

    if (direction === 'prev' && page > 1) page--;
    if (direction === 'next' && page < totalPages) page++;

    const start = (page - 1) * TITLES_PER_PAGE;
    const pageTitles = titles.slice(start, start + TITLES_PER_PAGE);

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle('🏷 Titles Panel')
        .setDescription(
            pageTitles
                .map(title => `**ID:** ${title.id} | ${title.name}`)
                .join('\n')
        )
        .setFooter({ text: `Page ${page} / ${totalPages}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`titlepanel_prev_${userId}_${page}`)
            .setLabel('⬅')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 1),

        new ButtonBuilder()
            .setCustomId(`titlepanel_next_${userId}_${page}`)
            .setLabel('➡')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages)
    );

    return interaction.update({
        embeds: [embed],
        components: [row]
    });
}

module.exports = { titlePanelHandle };