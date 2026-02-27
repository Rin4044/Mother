const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const { Profiles, Skills, UserSkills } = require('../../database.js');
const { Op } = require('sequelize');
const { progressTutorial } = require('../../utils/tutorialService');

const SKILLS_PER_PAGE = 3;

module.exports = {

    data: new SlashCommandBuilder()
        .setName('skillshop')
        .setDescription('Open the skill shop'),

    async execute(interaction) {

        const userId = interaction.user.id;

        const profile = await Profiles.findOne({ where: { userId } });

        if (!profile) {
            return interaction.reply({
                content: 'Profile not found.',
                flags: MessageFlags.Ephemeral
            });
        }

        const userSkills = await UserSkills.findAll({
            where: { profileId: profile.id }
        });

        const ownedIds = userSkills.map(s => s.skillId);

        const availableSkills = await Skills.findAll({
            where: {
                id: { [Op.notIn]: ownedIds },
                tier: 1,
                skill_points_cost: { [Op.gt]: 0 },
                [Op.and]: [
                    { name: { [Op.notLike]: '%Resistance%' } },
                    { name: { [Op.ne]: 'Rot Attack' } }
                ]
            },
            order: [['id', 'ASC']]
        });

        if (!availableSkills.length) {
            return interaction.reply({
                content: 'You already own all available skills.',
                flags: MessageFlags.Ephemeral
            });
        }

        const totalPages = Math.ceil(availableSkills.length / SKILLS_PER_PAGE);
        const currentPage = 1;

        const embed = buildEmbed(availableSkills, profile, currentPage, totalPages);
        const paginationRow = buildPagination(currentPage, totalPages, userId);
        const skillRow = buildSkillButtons(availableSkills, currentPage, userId);

        await progressTutorial(profile.id, 'used_skillshop');

        return interaction.reply({
            embeds: [embed],
            components: [paginationRow, skillRow]
        });
    }
};

// =====================================
// EMBED BUILDER
// =====================================

function buildEmbed(skills, profile, page, totalPages) {

    const start = (page - 1) * SKILLS_PER_PAGE;
    const pageSkills = skills.slice(start, start + SKILLS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle('📘 Skill Shop')
        .setDescription(`Page ${page}/${totalPages}`)
        .setFooter({
            text: `Skill Points: ${profile.skillPoints}`
        });

    for (const skill of pageSkills) {
        embed.addFields({
            name: `${skill.name} (ID: ${skill.id})`,
            value:
                `Type: ${skill.type}\n` +
                `Effect: ${skill.effect_type_main || 'None'}\n` +
                `Cost: ${skill.skill_points_cost} SP`,
            inline: false
        });
    }

    return embed;
}

// =====================================
// PAGINATION BUTTONS
// =====================================

function buildPagination(page, totalPages, userId) {

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`shop_prev_${userId}_${page}`)
            .setLabel('⬅')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 1),

        new ButtonBuilder()
            .setCustomId(`shop_next_${userId}_${page}`)
            .setLabel('➡')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages)
    );
}

// =====================================
// SKILL SELECT BUTTONS
// =====================================

function buildSkillButtons(skills, page, userId) {

    const start = (page - 1) * SKILLS_PER_PAGE;
    const pageSkills = skills.slice(start, start + SKILLS_PER_PAGE);

    const row = new ActionRowBuilder();

    for (const skill of pageSkills) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`shop_buy_${userId}_${skill.id}`)
                .setLabel(`${skill.id}`)
                .setStyle(ButtonStyle.Success)
        );
    }

    return row;
}
