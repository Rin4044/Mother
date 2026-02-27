const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const { Profiles, Skills, UserSkills } = require('../../../database.js');
const { Op } = require('sequelize');

const SKILLS_PER_PAGE = 3;

async function handleshop(interaction) {

    const [prefix, action, userId, value] = interaction.customId.split('_');

    if (prefix !== 'shop') return;

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: "This shop is not for you.",
            flags: MessageFlags.Ephemeral
        });
    }

    const profile = await Profiles.findOne({ where: { userId } });
    if (!profile) {
        return interaction.reply({ content: "Profile not found.", flags: MessageFlags.Ephemeral });
    }

    const ownedSkills = await UserSkills.findAll({
        where: { profileId: profile.id }
    });

    const ownedIds = ownedSkills.map(s => s.skillId);

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
        return interaction.update({
            content: "You already own all available skills.",
            embeds: [],
            components: []
        });
    }

    const totalPages = Math.ceil(availableSkills.length / SKILLS_PER_PAGE);

    let page = parseInt(value) || 1;

    if (action === 'prev' && page > 1) page--;
    if (action === 'next' && page < totalPages) page++;

    // ================= BUY =================

    if (action === 'buy') {

        const skillId = parseInt(value);
        const skill = availableSkills.find(s => s.id === skillId);

        if (!skill) {
            return interaction.reply({
                content: "Skill not found.",
                flags: MessageFlags.Ephemeral
            });
        }

        if (profile.skillPoints < skill.skill_points_cost) {
            return interaction.reply({
                content: "You don't have enough skill points.",
                flags: MessageFlags.Ephemeral
            });
        }

        profile.skillPoints -= skill.skill_points_cost;
        await profile.save();

        await UserSkills.create({
            profileId: profile.id,
            skillId: skill.id,
            level: 1,
            xp: 0
        });

        return interaction.reply({
            content: `You bought **${skill.name}**. Remaining SP: ${profile.skillPoints}`,
            flags: MessageFlags.Ephemeral
        });
    }

    // ================= DISPLAY =================

    const start = (page - 1) * SKILLS_PER_PAGE;
    const pageSkills = availableSkills.slice(start, start + SKILLS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle('📘 Skill Shop')
        .setDescription(`Page ${page}/${totalPages}`)
        .setFooter({ text: `Skill Points: ${profile.skillPoints}` });

    pageSkills.forEach(skill => {
        embed.addFields({
            name: `${skill.name} (ID ${skill.id})`,
            value:
                `Type: ${skill.type}\n` +
                `Effect: ${skill.effect_type_main || 'None'}\n` +
                `Cost: ${skill.skill_points_cost} SP`,
            inline: false
        });
    });

    const paginationRow = new ActionRowBuilder().addComponents(
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

    const skillRow = new ActionRowBuilder();

    pageSkills.forEach(skill => {
        skillRow.addComponents(
            new ButtonBuilder()
                .setCustomId(`shop_buy_${userId}_${skill.id}`)
                .setLabel(`${skill.id}`)
                .setStyle(ButtonStyle.Success)
        );
    });

    return interaction.update({
        embeds: [embed],
        components: [paginationRow, skillRow]
    });
}

module.exports = { handleshop };
