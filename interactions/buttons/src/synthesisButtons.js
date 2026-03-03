const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const synthesisService = require('../../../utils/synthesisService');

async function handleSynthesisButton(interaction) {
    const parts = String(interaction.customId || '').split('_');
    const kind = parts[2];
    const definition = synthesisService.getSynthesisDefinition(kind);
    if (!definition) {
        return interaction.reply({
            content: 'Unknown synthesis type.',
            flags: MessageFlags.Ephemeral
        });
    }

    const profile = await synthesisService.getProfileByUserId(interaction.user.id);
    if (!profile) {
        return interaction.reply({
            content: 'You are not registered. Use /start.',
            flags: MessageFlags.Ephemeral
        });
    }

    const panel = await synthesisService.buildSynthesisPanel(profile.id);
    const target = panel?.entries?.find((entry) => entry.definition.key === definition.key);
    if (!target?.unlocked) {
        return interaction.reply({
            content: `You cannot synthesize this yet. You need **${definition.requiredSkillName}**.`,
            flags: MessageFlags.Ephemeral
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`synthesis_modal_${definition.key}`)
        .setTitle(`${definition.label}`);

    const quantityInput = new TextInputBuilder()
        .setCustomId('quantity')
        .setLabel('Quantity to synthesize')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Enter a positive integer (e.g. 5)');

    modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
    return interaction.showModal(modal);
}

module.exports = { handleSynthesisButton };
