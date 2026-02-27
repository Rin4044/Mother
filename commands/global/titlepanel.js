const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const { Titles } = require('../../database.js');

const TITLES_PER_PAGE = 10;

module.exports = {

    data: new SlashCommandBuilder()
        .setName('titlepanel')
        .setDescription('Display all available titles.'),

    async execute(interaction) {

        const userId = interaction.user.id;

        const titles = await Titles.findAll({
            order: [['id', 'ASC']]
        });

        if (!titles.length) {
            return interaction.reply({
                content: 'No titles available.',
                flags: MessageFlags.Ephemeral
            });
        }

        const totalPages = Math.ceil(titles.length / TITLES_PER_PAGE);
        const currentPage = 1;

        const embed = buildEmbed(titles, currentPage, totalPages);
        const row = buildButtons(currentPage, totalPages, userId);

        return interaction.reply({
            embeds: [embed],
            components: [row]
        });
    }
};

// =======================================
// EMBED BUILDER
// =======================================

function buildEmbed(titles, page, totalPages) {

    const start = (page - 1) * TITLES_PER_PAGE;
    const pageTitles = titles.slice(start, start + TITLES_PER_PAGE);

    const description = pageTitles
        .map(title => `**ID:** ${title.id} | ${title.name}`)
        .join('\n');

    return new EmbedBuilder()
        .setColor('#290003')
        .setTitle('🏷 Titles Panel')
        .setDescription(description)
        .setFooter({
            text: `Page ${page} / ${totalPages}`
        });
}

// =======================================
// PAGINATION BUTTONS
// =======================================

function buildButtons(page, totalPages, userId) {

    return new ActionRowBuilder().addComponents(

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
}