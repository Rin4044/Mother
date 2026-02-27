const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Skills } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('editskill')
        .setDescription('Edit an existing skill (Admin only)')
        .setDefaultMemberPermissions(0x8)
        .addIntegerOption(o => o.setName('id').setDescription('Skill ID').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('New name'))
        .addStringOption(o => o.setName('type').setDescription('New type'))
        .addStringOption(o => o.setName('effect_type_main')
            .setDescription('Main effect type')
            .addChoices(
                { name: 'Physical', value: 'Physical' },
                { name: 'Magic', value: 'Magic' },
                { name: 'Heal', value: 'Heal' },
                { name: 'Buff', value: 'Buff' },
                { name: 'Debuff', value: 'Debuff' }
            ))
        .addStringOption(o => o.setName('effect_type_specific')
            .setDescription('Specific effect type')
            .addChoices(
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
                { name: 'Other', value: 'Other' }
            ))
        .addIntegerOption(o => o.setName('tier').setDescription('Tier'))
        .addIntegerOption(o => o.setName('sp_cost').setDescription('SP cost'))
        .addIntegerOption(o => o.setName('mp_cost').setDescription('MP cost'))
        .addIntegerOption(o => o.setName('cooldown').setDescription('Cooldown'))
        .addIntegerOption(o => o.setName('power').setDescription('Power'))
        .addIntegerOption(o => o.setName('parent').setDescription('Parent skill ID'))
        .addIntegerOption(o => o.setName('skill_points_cost').setDescription('Skill points cost'))
        .addStringOption(o => o.setName('description').setDescription('Description')),

    async execute(interaction) {

        const id = interaction.options.getInteger('id');
        const skill = await Skills.findByPk(id);

        if (!skill) {
            return interaction.reply({
                content: `Skill with ID ${id} not found.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const updates = {};

        const stringFields = ['name', 'type', 'description', 'effect_type_main', 'effect_type_specific'];
        const intFields = ['tier', 'sp_cost', 'mp_cost', 'cooldown', 'power', 'skill_points_cost'];

        for (const field of stringFields) {
            const value = interaction.options.getString(field);
            if (value !== null) {
                updates[field] = value;
            }
        }

        for (const field of intFields) {
            const value = interaction.options.getInteger(field);
            if (value !== null) {
                if (value < 0) {
                    return interaction.reply({
                        content: `${field} cannot be negative.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                updates[field] = value;
            }
        }

        // Tier validation
        if (updates.tier !== undefined && ![1,2,3].includes(updates.tier)) {
            return interaction.reply({
                content: 'Tier must be between 1 and 3.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Parent validation
        const parent = interaction.options.getInteger('parent');
        if (parent !== null) {

            if (parent === id) {
                return interaction.reply({
                    content: 'A skill cannot be its own parent.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const parentSkill = await Skills.findByPk(parent);
            if (!parentSkill) {
                return interaction.reply({
                    content: 'Parent skill not found.',
                    flags: MessageFlags.Ephemeral
                });
            }

            updates.parent = parent;
        }

        if (Object.keys(updates).length === 0) {
            return interaction.reply({
                content: 'No changes provided.',
                flags: MessageFlags.Ephemeral
            });
        }

        await skill.update(updates);

        return interaction.reply(
            `✅ Skill "${skill.name}" updated successfully.`
        );
    }
};
