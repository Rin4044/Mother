const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../database');
const {
    getInventoryQuantity,
    consumeInventoryCosts,
    addInventoryItem
} = require('../../utils/inventoryService');
const { formatCoreItemLabel } = require('../../utils/coreEmoji');
const {
    getActiveXpBoost,
    formatRemainingTimestamp
} = require('../../utils/xpBoostService');

const SHOP_OFFERS = {
    xp_5_15m: {
        label: 'XP Potion +5% (15m)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +5% (15m)',
        quantity: 1,
        costs: [
            { itemName: 'Mediocre Monster Core', quantity: 10 }
        ]
    },
    xp_10_20m: {
        label: 'XP Potion +10% (20m)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +10% (20m)',
        quantity: 1,
        costs: [
            { itemName: 'Cracked Monster Core', quantity: 10 }
        ]
    },
    xp_20_10m: {
        label: 'XP Potion +20% (10m)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +20% (10m)',
        quantity: 1,
        costs: [
            { itemName: 'Solid Monster Core', quantity: 10 }
        ]
    },
    xp_25_1h: {
        label: 'XP Potion +25% (1h)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +25% (1h)',
        quantity: 1,
        costs: [
            { itemName: 'Superior Monster Core', quantity: 10 }
        ]
    },
    xp_50_20m: {
        label: 'XP Potion +50% (20m)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +50% (20m)',
        quantity: 1,
        costs: [
            { itemName: 'Primal Monster Core', quantity: 1 }
        ]
    },
    xp_75_1h: {
        label: 'XP Potion +75% (1h)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +75% (1h)',
        quantity: 1,
        costs: [
            { itemName: 'Primal Monster Core', quantity: 10 }
        ]
    },
    name_change_ticket: {
        label: 'Name Change Ticket',
        description: 'Required by /rename',
        rewardType: 'item',
        itemName: 'Name Change Ticket',
        quantity: 1,
        costs: [
            { itemName: 'Primal Monster Core', quantity: 1 }
        ]
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Spend monster cores for consumables.')
        .addSubcommand((sub) =>
            sub.setName('view')
                .setDescription('Show shop offers and your balances.')
        )
        .addSubcommand((sub) =>
            sub.setName('buy')
                .setDescription('Buy an item from the shop.')
                .addStringOption((option) =>
                    option
                        .setName('offer')
                        .setDescription('Offer to buy')
                        .setRequired(true)
                        .addChoices(
                            { name: '+5% for 15m', value: 'xp_5_15m' },
                            { name: '+10% for 20m', value: 'xp_10_20m' },
                            { name: '+20% for 10m', value: 'xp_20_10m' },
                            { name: '+25% for 1h', value: 'xp_25_1h' },
                            { name: '+50% for 20m', value: 'xp_50_20m' },
                            { name: '+75% for 1h', value: 'xp_75_1h' },
                            { name: 'Name Change Ticket (1 Primal)', value: 'name_change_ticket' }
                        )
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

        const sub = interaction.options.getSubcommand();
        if (sub === 'view') {
            return handleView(interaction, profile);
        }
        return handleBuy(interaction, profile);
    }
};

async function handleView(interaction, profile) {
    const lines = [];
    for (const offer of Object.values(SHOP_OFFERS)) {
        const costsText = await formatCostsWithBalance(profile.id, offer.costs);
        lines.push(`**${offer.label}**`);
        lines.push(`${offer.description}`);
        lines.push(`Cost: ${costsText}`);
        lines.push('');
    }

    const boost = getActiveXpBoost(profile);
    const boostText = boost.percent > 0
        ? `Active XP Boost: +${boost.percent}% (${formatRemainingTimestamp(boost)})`
        : 'Active XP Boost: none';

    const embed = new EmbedBuilder()
        .setColor('#1f1f23')
        .setTitle('Core Shop')
        .setDescription(`${boostText}\n\n${lines.join('\n').trim()}`);

    return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

async function handleBuy(interaction, profile) {
    const offerKey = interaction.options.getString('offer', true);
    const offer = SHOP_OFFERS[offerKey];
    if (!offer) {
        return interaction.reply({
            content: 'Invalid offer.',
            flags: MessageFlags.Ephemeral
        });
    }

    const paid = await consumeInventoryCosts(profile.id, offer.costs);
    if (!paid) {
        return interaction.reply({
            content: `Not enough cores for **${offer.label}**.`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (offer.rewardType === 'item') {
        await addInventoryItem(profile.id, offer.itemName, offer.quantity || 1);
        return interaction.reply({
            content: `Purchased **${offer.label}** and added to your inventory.`,
            flags: MessageFlags.Ephemeral
        });
    }

    return interaction.reply({
        content: 'Offer purchased.',
        flags: MessageFlags.Ephemeral
    });
}

async function formatCostsWithBalance(profileId, costs) {
    const parts = [];
    for (const cost of costs) {
        const qty = await getInventoryQuantity(profileId, cost.itemName);
        parts.push(`${formatCoreItemLabel(cost.itemName)} x${cost.quantity} (you: ${qty})`);
    }
    return parts.join(' | ');
}
