const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../database');
const { getInventory } = require('../../utils/inventoryService');
const { formatCoreItemLabel } = require('../../utils/coreEmoji');

const CORE_ORDER = {
    'Mediocre Monster Core': 1,
    'Cracked Monster Core': 2,
    'Solid Monster Core': 3,
    'Superior Monster Core': 4,
    'Primal Monster Core': 5
};

function isPotionItem(itemName = '') {
    return /^XP Potion\s+/i.test(String(itemName || '').trim());
}

function toItemLine(entry) {
    return `- ${formatCoreItemLabel(entry.itemName)} x${entry.quantity}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Display your inventory and crystals.'),

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

        const items = await getInventory(profile.id);
        const coreItems = items
            .filter((entry) => CORE_ORDER[entry.itemName] !== undefined)
            .sort((a, b) => (CORE_ORDER[a.itemName] ?? 999) - (CORE_ORDER[b.itemName] ?? 999));

        const potionItems = items
            .filter((entry) => isPotionItem(entry.itemName))
            .sort((a, b) => String(a.itemName || '').localeCompare(String(b.itemName || '')));

        const otherItems = items
            .filter((entry) => CORE_ORDER[entry.itemName] === undefined && !isPotionItem(entry.itemName))
            .sort((a, b) => String(a.itemName || '').localeCompare(String(b.itemName || '')));

        const coreSection = coreItems.length
            ? coreItems.map(toItemLine).join('\n')
            : '- none';
        const potionSection = potionItems.length
            ? potionItems.map(toItemLine).join('\n')
            : '- none';
        const otherSection = otherItems.length
            ? otherItems.map(toItemLine).join('\n')
            : '- none';

        const embed = new EmbedBuilder()
            .setColor('#1f1f23')
            .setTitle(`${profile.name}'s Inventory`)
            .setDescription(
                `Crystals: ${profile.crystals || 0}\n\n` +
                `Monster Cores\n${coreSection}\n` +
                `--------------------\n` +
                `Potions\n${potionSection}\n` +
                `--------------------\n` +
                `Other\n${otherSection}`
            );

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
