const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');

const { Skills } = require('../../../database.js');

const SKILLS_PER_PAGE = 10;

function decodeSearch(encodedSearch) {
    if (!encodedSearch || encodedSearch === '0') return '';
    try {
        return Buffer.from(encodedSearch, 'hex').toString('utf8');
    } catch {
        return '';
    }
}

function filterSkills(skills, searchInput) {
    const normalizedSearch = String(searchInput || '').trim().toLowerCase();
    if (!normalizedSearch) return skills;

    return skills.filter(skill => {
        const name = String(skill.name || '').toLowerCase();
        const id = String(skill.id || '');
        return name.includes(normalizedSearch) || id.includes(normalizedSearch);
    });
}

function encodeSearch(searchInput = '') {
    if (!searchInput) return '0';
    return Buffer.from(searchInput, 'utf8').toString('hex');
}

async function skillPanelHandle(interaction) {

    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    const [prefix, direction, userId, pageStr, encodedSearch = '0'] = parts;

    if (prefix !== 'panel') return;

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: 'This panel is not for you.',
            flags: MessageFlags.Ephemeral
        });
    }

    const searchInput = decodeSearch(encodedSearch);

    const skills = await Skills.findAll({
        order: [['id', 'ASC']]
    });

    const filteredSkills = filterSkills(skills, searchInput);

    if (!filteredSkills.length) {
        return interaction.update({
            content: searchInput ? `No skills found for "${searchInput}".` : 'No skills available.',
            embeds: [],
            components: []
        });
    }

    const totalPages = Math.ceil(filteredSkills.length / SKILLS_PER_PAGE);

    let page = Number.parseInt(pageStr, 10);
    if (!Number.isInteger(page) || page < 1) page = 1;

    if (direction === 'prev' && page > 1) page--;
    if (direction === 'next' && page < totalPages) page++;

    const start = (page - 1) * SKILLS_PER_PAGE;
    const pageSkills = filteredSkills.slice(start, start + SKILLS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle('Skills Panel')
        .setDescription(
            pageSkills.map(skill =>
                `**ID:** ${skill.id} | **${skill.name}**`
            ).join('\n')
        )
        .setFooter({ text: `Page ${page} / ${totalPages}` });

    if (searchInput) {
        embed.addFields({ name: 'Search', value: `\`${searchInput}\`` });
    }

    const encodedSearchForButtons = encodeSearch(searchInput);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`panel_prev_${userId}_${page}_${encodedSearchForButtons}`)
            .setLabel('Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 1),

        new ButtonBuilder()
            .setCustomId(`panel_next_${userId}_${page}_${encodedSearchForButtons}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages)
    );

    return interaction.update({
        embeds: [embed],
        components: [row]
    });
}

module.exports = { skillPanelHandle };
