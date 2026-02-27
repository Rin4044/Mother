const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Skills } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('skillinfo')
        .setDescription('Display detailed information about a skill.')
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('Skill ID')
                .setRequired(true)
        ),

    async execute(interaction) {

        const skillId = interaction.options.getInteger('id');

        try {

            const skill = await Skills.findByPk(skillId);

            if (!skill) {
                return interaction.reply({
                    content: `Skill ID ${skillId} not found.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#290003')
                .setTitle(`📘 ${skill.name}`)
                .setDescription(skill.description || "No description provided.")
                .addFields(
                    { name: 'Type', value: skill.type || 'N/A', inline: true },
                    { name: 'Tier', value: skill.tier ? `${skill.tier}` : 'N/A', inline: true },
                    { name: 'Cooldown', value: skill.cooldown ? `${skill.cooldown} turns` : '0', inline: true },
                    { name: 'Main Effect', value: skill.effect_type_main || 'None', inline: true },
                    { name: 'Specific Effect', value: skill.effect_type_specific || 'None', inline: true },
                    { name: 'Skill Points Cost', value: `${skill.skill_points_cost ?? 0}`, inline: true }
                );

            // Optional combat values
            if (skill.sp_cost !== null && skill.sp_cost !== undefined)
                embed.addFields({ name: 'SP Cost', value: `${skill.sp_cost}`, inline: true });

            if (skill.mp_cost !== null && skill.mp_cost !== undefined)
                embed.addFields({ name: 'MP Cost', value: `${skill.mp_cost}`, inline: true });

            if (skill.power !== null && skill.power !== undefined)
                embed.addFields({ name: 'Base Power', value: `${skill.power}`, inline: true });

            if (skill.parent)
                embed.addFields({ name: 'Parent Skill ID', value: `${skill.parent}`, inline: true });

            return interaction.reply({ embeds: [embed] });

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content: 'Error retrieving skill information.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};