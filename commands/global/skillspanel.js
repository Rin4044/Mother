const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const { Skills } = require('../../database.js');

const SKILLS_PER_PAGE = 10;

module.exports = {

    data: new SlashCommandBuilder()
        .setName('skillspanel')
        .setDescription('Display all available skills with IDs and costs.')
        .addStringOption(o =>
            o.setName('search')
                .setDescription('Search by skill name (partial match)')
                .setRequired(false)
                .setMaxLength(30)
        ),

    async execute(interaction) {

        const userId = interaction.user.id;
        const searchInput = (interaction.options.getString('search') || '').trim();
        const normalizedSearch = searchInput.toLowerCase();

        const skills = await Skills.findAll({
            order: [['id', 'ASC']]
        });

        const filteredSkills = normalizedSearch
            ? skills.filter(skill => {
                const name = String(skill.name || '').toLowerCase();
                const id = String(skill.id || '');
                return name.includes(normalizedSearch) || id.includes(normalizedSearch);
            })
            : skills;

        if (!filteredSkills.length) {
            return interaction.reply({
                content: normalizedSearch ? `No skills found for "${searchInput}".` : 'No skills available.',
                flags: MessageFlags.Ephemeral
            });
        }

        const totalPages = Math.ceil(filteredSkills.length / SKILLS_PER_PAGE);
        const page = 1;

        return interaction.reply({
            embeds: [buildEmbed(filteredSkills, page, totalPages, searchInput)],
            components: [buildButtons(page, totalPages, userId, searchInput)]
        });
    }
};

function buildEmbed(skills, page, totalPages, searchInput = '') {

    const start = (page - 1) * SKILLS_PER_PAGE;
    const pageSkills = skills.slice(start, start + SKILLS_PER_PAGE);

    const description = pageSkills.map(skill =>
        `**ID:** ${skill.id} | **${skill.name}**`
    ).join('\n');

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle('Skills Panel')
        .setDescription(description)
        .setFooter({ text: `Page ${page} / ${totalPages}` });

    if (searchInput) {
        embed.addFields({ name: 'Search', value: `\`${searchInput}\`` });
    }

    return embed;
}

function encodeSearch(searchInput = '') {
    if (!searchInput) return '0';
    return Buffer.from(searchInput, 'utf8').toString('hex');
}

function buildButtons(page, totalPages, userId, searchInput = '') {
    const encodedSearch = encodeSearch(searchInput);

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`panel_prev_${userId}_${page}_${encodedSearch}`)
            .setLabel('Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 1),

        new ButtonBuilder()
            .setCustomId(`panel_next_${userId}_${page}_${encodedSearch}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages)
    );
}
