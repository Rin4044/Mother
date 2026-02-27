const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Skills, sequelize } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('addskill')
        .setDescription('Add a new skill')
        .setDefaultMemberPermissions(0x8)
        .addStringOption(o => o.setName('name').setDescription('Skill name').setRequired(true))
        .addStringOption(o => o.setName('type')
            .setDescription('Skill category')
            .setRequired(true)
            .addChoices(
                { name: 'Active Skill', value: 'Active Skill' },
                { name: 'Passive Skill', value: 'Passive Skill' },
                { name: 'Unique Skill', value: 'Unique Skill' },
                { name: 'Title Skill', value: 'Title Skill' }
            ))
        .addStringOption(o => o.setName('effect_type_main')
            .setDescription('Main effect type')
            .setRequired(true)
            .addChoices(
                { name: 'Physical', value: 'Physical' },
                { name: 'Magic', value: 'Magic' },
                { name: 'Heal', value: 'Heal' },
                { name: 'Buff', value: 'Buff' },
                { name: 'Debuff', value: 'Debuff' }
            ))
        .addIntegerOption(o => o.setName('tier').setDescription('Skill tier (>=1)').setRequired(true))
        .addIntegerOption(o => o.setName('cooldown').setDescription('Cooldown in turns').setRequired(true))
        .addIntegerOption(o => o.setName('skill_points_cost').setDescription('Skill points cost').setRequired(true))
        .addIntegerOption(o => o.setName('power').setDescription('Power value').setRequired(true))
        .addStringOption(o => o.setName('effect_type_specific')
            .setDescription('Specific effect')
            .setRequired(false)
            .addChoices(
                { name: 'None', value: 'None' },
                { name: 'Fire', value: 'Fire' },
                { name: 'Water', value: 'Water' },
                { name: 'Ice', value: 'Ice' },
                { name: 'Wind', value: 'Wind' },
                { name: 'Earth', value: 'Earth' },
                { name: 'Lightning', value: 'Lightning' },
                { name: 'Light', value: 'Light' },
                { name: 'Dark', value: 'Dark' },
                { name: 'Poison', value: 'Poison' },
                { name: 'Rot', value: 'Rot' },
                { name: 'Cutting', value: 'Cutting' },
                { name: 'Other', value: 'Other' }
            ))
        .addIntegerOption(o => o.setName('parent').setDescription('Parent skill ID').setRequired(false))
        .addIntegerOption(o => o.setName('sp_cost').setDescription('SP cost').setRequired(false))
        .addIntegerOption(o => o.setName('mp_cost').setDescription('MP cost').setRequired(false))
        .addStringOption(o => o.setName('description').setDescription('Skill description').setRequired(false)),

    async execute(interaction) {

        const transaction = await sequelize.transaction();

        try {

            const name = interaction.options.getString('name').trim();
            const type = interaction.options.getString('type');
            const tier = interaction.options.getInteger('tier');
            const cooldown = interaction.options.getInteger('cooldown');
            const skillPointsCost = interaction.options.getInteger('skill_points_cost');
            const power = interaction.options.getInteger('power');
            const parent = interaction.options.getInteger('parent');
            const effectMain = interaction.options.getString('effect_type_main');
            const effectSpecificRaw = interaction.options.getString('effect_type_specific');
            const effectSpecific = effectSpecificRaw === 'None' ? null : effectSpecificRaw;
            const spCost = interaction.options.getInteger('sp_cost');
            const mpCost = interaction.options.getInteger('mp_cost');
            const description = interaction.options.getString('description') || 'No description';

            // ===============================
            // VALIDATION
            // ===============================

            if (tier < 1)
                return interaction.reply({ content: 'Tier must be >= 1.', flags: MessageFlags.Ephemeral });

            if (cooldown < 0)
                return interaction.reply({ content: 'Cooldown cannot be negative.', flags: MessageFlags.Ephemeral });

            if (power < 0)
                return interaction.reply({ content: 'Power cannot be negative.', flags: MessageFlags.Ephemeral });

            const existing = await Skills.findOne({ where: { name } });
            if (existing)
                return interaction.reply({ content: 'A skill with this name already exists.', flags: MessageFlags.Ephemeral });

            if (parent !== null) {
                const parentSkill = await Skills.findByPk(parent);
                if (!parentSkill)
                    return interaction.reply({ content: 'Parent skill does not exist.', flags: MessageFlags.Ephemeral });
            }

            // ===============================
            // CREATE SKILL
            // ===============================

            const skill = await Skills.create({
                name,
                type,
                tier,
                parent: parent ?? null,
                effect_type_main: effectMain,
                effect_type_specific: effectSpecific ?? null,
                sp_cost: spCost ?? null,
                mp_cost: mpCost ?? null,
                cooldown,
                power,
                skill_points_cost: skillPointsCost,
                description
            }, { transaction });

            await transaction.commit();

            return interaction.reply(
                `✅ Skill **${skill.name}** created (ID: ${skill.id})`
            );

        } catch (error) {

            await transaction.rollback();
            console.error(error);

            return interaction.reply({
                content: 'Error while creating skill.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
