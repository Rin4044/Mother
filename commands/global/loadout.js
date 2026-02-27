const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');
const { Profiles, UserSkills, Skills } = require('../../database.js');
const { progressTutorial } = require('../../utils/tutorialService');

const MAX_EQUIPPED_SKILLS = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loadout')
        .setDescription('Manage equipped combat skills (max 5).')
        .addSubcommand(sub =>
            sub
                .setName('view')
                .setDescription('View your equipped skills')
        )
        .addSubcommand(sub =>
            sub
                .setName('equip')
                .setDescription('Equip one of your skills in a slot')
                .addIntegerOption(option =>
                    option
                        .setName('skill_id')
                        .setDescription('Skill ID you own')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('slot')
                        .setDescription('Slot number (1-5)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(MAX_EQUIPPED_SKILLS)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('unequip')
                .setDescription('Unequip by slot')
                .addIntegerOption(option =>
                    option
                        .setName('slot')
                        .setDescription('Slot number (1-5)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(MAX_EQUIPPED_SKILLS)
                )
        ),

    async execute(interaction) {
        const profile = await Profiles.findOne({
            where: { userId: interaction.user.id }
        });

        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start.',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            const embed = await buildLoadoutEmbed(profile, interaction.user.username);
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'equip') {
            const skillId = interaction.options.getInteger('skill_id');
            const slot = interaction.options.getInteger('slot');

            const userSkill = await UserSkills.findOne({
                where: { profileId: profile.id, skillId },
                include: [{ model: Skills, as: 'Skill' }]
            });

            if (!userSkill || !userSkill.Skill) {
                return interaction.reply({
                    content: 'You do not own this skill.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await UserSkills.update(
                { equippedSlot: null },
                { where: { profileId: profile.id, equippedSlot: slot } }
            );

            await userSkill.update({ equippedSlot: slot });

            await progressTutorial(profile.id, 'used_skill_equip');

            const embed = await buildLoadoutEmbed(profile, interaction.user.username);
            return interaction.reply({
                content: `Equipped **${userSkill.Skill.name}** in slot **${slot}**.`,
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }

        if (subcommand === 'unequip') {
            const slot = interaction.options.getInteger('slot');

            const equipped = await UserSkills.findOne({
                where: { profileId: profile.id, equippedSlot: slot },
                include: [{ model: Skills, as: 'Skill' }]
            });

            if (!equipped) {
                return interaction.reply({
                    content: `No skill is equipped in slot ${slot}.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            await equipped.update({ equippedSlot: null });

            const embed = await buildLoadoutEmbed(profile, interaction.user.username);
            return interaction.reply({
                content: `Unequipped **${equipped.Skill?.name || `Skill #${equipped.skillId}`}** from slot **${slot}**.`,
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

async function buildLoadoutEmbed(profile, username) {
    const equipped = await UserSkills.findAll({
        where: {
            profileId: profile.id,
            equippedSlot: { [Op.not]: null }
        },
        include: [{ model: Skills, as: 'Skill' }],
        order: [['equippedSlot', 'ASC']]
    });

    const bySlot = new Map(equipped.map(us => [us.equippedSlot, us]));
    const lines = [];

    for (let slot = 1; slot <= MAX_EQUIPPED_SKILLS; slot++) {
        const us = bySlot.get(slot);
        if (!us || !us.Skill) {
            lines.push(`Slot ${slot}: -`);
            continue;
        }
        lines.push(
            `Slot ${slot}: **${us.Skill.name}** (${us.Skill.effect_type_main || 'Unknown'})`
        );
    }

    return new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`${username}'s Combat Loadout`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Use /loadout equip skill_id:<id> slot:<1-5>' });
}
