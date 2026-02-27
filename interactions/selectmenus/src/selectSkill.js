const { EmbedBuilder, MessageFlags } = require('discord.js');
const { UserSkills, Skills, Profiles } = require('../../../database.js');
const {
    calculateEffectiveSkillPower,
    getSkillXpProgress
} = require('../../../utils/skillProgression');

async function selectSkill(interaction) {

    if (!interaction.isStringSelectMenu()) return;

    const { customId, values, user } = interaction;

    if (!customId.startsWith('skill_select|')) return;

    const [, ownerId] = customId.split('|');

    if (user.id !== ownerId) {
        return interaction.reply({
            content: 'You cannot use this menu.',
            flags: MessageFlags.Ephemeral
        });
    }

    const skillId = parseInt(values[0], 10);
    if (isNaN(skillId)) {
        return interaction.reply({
            content: 'Invalid skill selection.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const profile = await Profiles.findOne({
            where: { userId: ownerId }
        });

        if (!profile) {
            return interaction.reply({
                content: 'Profile not found.',
                flags: MessageFlags.Ephemeral
            });
        }

        const userSkill = await UserSkills.findOne({
            where: {
                profileId: profile.id,
                skillId
            },
            include: {
                model: Skills,
                as: 'Skill'
            }
        });

        if (!userSkill || !userSkill.Skill) {
            return interaction.reply({
                content: 'You do not own this skill.',
                flags: MessageFlags.Ephemeral
            });
        }

        const skill = userSkill.Skill;
        const effectivePower = calculateEffectiveSkillPower(skill.power, userSkill.level);
        const xpState = getSkillXpProgress(userSkill.level, userSkill.xp, skill.tier, skill.name);
        const xpText = xpState.isCapped
            ? 'MAX'
            : `${xpState.xp}/${xpState.xpNeeded}`;

        const embed = new EmbedBuilder()
            .setColor('#290003')
            .setTitle(`Skill: ${skill.name}`)
            .addFields(
                { name: 'Level', value: `${xpState.level}/${xpState.cap}`, inline: true },
                { name: 'XP', value: xpText, inline: true },
                { name: 'Type', value: skill.type || 'Unknown', inline: true },
                { name: 'Main Effect', value: skill.effect_type_main || 'None', inline: true },
                { name: 'Specific Effect', value: skill.effect_type_specific || 'None', inline: true },
                { name: 'Power', value: `${effectivePower}`, inline: true },
                { name: 'SP Cost', value: `${skill.sp_cost ?? 0}`, inline: true },
                { name: 'MP Cost', value: `${skill.mp_cost ?? 0}`, inline: true },
                { name: 'Cooldown', value: `${skill.cooldown ?? 0} turn(s)`, inline: true }
            );

        if (skill.description) {
            embed.addFields({
                name: 'Description',
                value: skill.description,
                inline: false
            });
        }

        return interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        console.error('selectSkill error:', error);

        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({
                content: 'An error occurred while retrieving this skill.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

module.exports = { selectSkill };
