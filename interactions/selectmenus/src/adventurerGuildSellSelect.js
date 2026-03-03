const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../../database');
const { CORE_BY_STATE_KEY } = require('../../../utils/adventurerGuildService');

async function handleAdventurerGuildSellSelect(interaction) {
    const customIdParts = interaction.customId.split('_');
    const profileId = parseInt(customIdParts[customIdParts.length - 1], 10);
    const selectedCoreKey = String(interaction.values?.[0] || '').trim().toLowerCase();

    if (!Number.isInteger(profileId) || !selectedCoreKey) {
        return interaction.reply({
            content: 'Invalid sell selection.',
            flags: MessageFlags.Ephemeral
        });
    }

    const profile = await Profiles.findByPk(profileId);
    if (!profile || profile.userId !== interaction.user.id) {
        return interaction.reply({
            content: 'This sell menu is not for you.',
            flags: MessageFlags.Ephemeral
        });
    }

    const coreName = CORE_BY_STATE_KEY[selectedCoreKey];
    if (!coreName) {
        return interaction.reply({
            content: 'Unknown core type.',
            flags: MessageFlags.Ephemeral
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`advguild_sell_modal_${profile.id}_${selectedCoreKey}`)
        .setTitle(`Sell ${coreName}`);

    const quantityInput = new TextInputBuilder()
        .setCustomId('quantity')
        .setLabel('Quantity to sell')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter a positive number')
        .setRequired(true)
        .setMaxLength(9);

    modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
    return interaction.showModal(modal);
}

module.exports = { handleAdventurerGuildSellSelect };
