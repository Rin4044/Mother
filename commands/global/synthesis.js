const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const synthesisService = require('../../utils/synthesisService');
const { buildSynthesisEmbed, buildSynthesisButtons } = require('../../utils/synthesisUi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('synthesis')
        .setDescription('Open synthesis panel and craft potions.'),

    async execute(interaction) {
        const profile = await synthesisService.getProfileByUserId(interaction.user.id);
        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start.',
                flags: MessageFlags.Ephemeral
            });
        }

        const collected = await synthesisService.settleCompletedSynthesisJobs(profile.id);
        const panel = await synthesisService.buildSynthesisPanel(profile.id);
        if (!panel) {
            return interaction.reply({
                content: 'Unable to load synthesis panel right now.',
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = buildSynthesisEmbed(profile.name, panel, collected);
        return interaction.reply({
            embeds: [embed],
            components: buildSynthesisButtons(panel.entries),
            flags: MessageFlags.Ephemeral
        });
    }
};
