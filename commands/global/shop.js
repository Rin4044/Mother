const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { sequelize, Profiles } = require('../../database');
const {
    addInventoryItem
} = require('../../utils/inventoryService');
const {
    getActiveXpBoost,
    formatRemainingTimestamp
} = require('../../utils/xpBoostService');
const { formatCrystalLabel, formatRaidKeyLabel, formatCoreItemLabel } = require('../../utils/coreEmoji');

const SHOP_OFFERS = {
    xp_5_15m: {
        label: 'XP Potion +5% (15m)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +5% (15m)',
        quantity: 1,
        costCrystals: 400
    },
    xp_10_20m: {
        label: 'XP Potion +10% (20m)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +10% (20m)',
        quantity: 1,
        costCrystals: 900
    },
    xp_20_10m: {
        label: 'XP Potion +20% (10m)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +20% (10m)',
        quantity: 1,
        costCrystals: 1800
    },
    xp_25_1h: {
        label: 'XP Potion +25% (1h)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +25% (1h)',
        quantity: 1,
        costCrystals: 4200
    },
    xp_50_20m: {
        label: 'XP Potion +50% (20m)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +50% (20m)',
        quantity: 1,
        costCrystals: 12000
    },
    xp_75_1h: {
        label: 'XP Potion +75% (1h)',
        description: 'Use with /xppotion',
        rewardType: 'item',
        itemName: 'XP Potion +75% (1h)',
        quantity: 1,
        costCrystals: 36000
    },
    name_change_ticket: {
        label: 'Name Change Ticket',
        description: 'Required by /rename',
        rewardType: 'item',
        itemName: 'Name Change Ticket',
        quantity: 1,
        costCrystals: 25000
    },
    raid_key: {
        label: 'Raid Key',
        description: 'Required by /raid create',
        rewardType: 'item',
        itemName: 'Raid Key',
        quantity: 1,
        costCrystals: 5000
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Spend crystals for consumables.')
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
                            { name: 'Name Change Ticket', value: 'name_change_ticket' },
                            { name: 'Raid Key', value: 'raid_key' }
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
        lines.push(`**${getOfferDisplayLabel(offer)}**`);
        lines.push(`${offer.description}`);
        lines.push(`Cost: ${formatCrystalLabel(offer.costCrystals)}`);
        lines.push('');
    }

    const boost = getActiveXpBoost(profile);
    const boostText = boost.percent > 0
        ? `Active XP Boost: +${boost.percent}% (${formatRemainingTimestamp(boost)})`
        : 'Active XP Boost: none';

    const embed = new EmbedBuilder()
        .setColor('#1f1f23')
        .setTitle('Crystal Shop')
        .setDescription(`${formatCrystalLabel(profile.crystals || 0)}\n${boostText}\n\n${lines.join('\n').trim()}`);

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

    const purchaseResult = await sequelize.transaction(async (transaction) => {
        const txProfile = await Profiles.findByPk(profile.id, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!txProfile) {
            throw new Error('PROFILE_NOT_FOUND');
        }

        const currentCrystals = Math.max(0, Number(txProfile.crystals) || 0);
        const cost = Math.max(0, Number(offer.costCrystals) || 0);
        if (currentCrystals < cost) {
            return { ok: false, currentCrystals, cost };
        }

        txProfile.crystals = currentCrystals - cost;
        await txProfile.save({ transaction });

        return { ok: true, currentCrystals: txProfile.crystals, cost };
    });

    if (!purchaseResult.ok) {
        return interaction.reply({
            content: `Not enough crystals for **${getOfferDisplayLabel(offer)}**. Need ${formatCrystalLabel(purchaseResult.cost)}, you have ${formatCrystalLabel(purchaseResult.currentCrystals)}.`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (offer.rewardType === 'item') {
        await addInventoryItem(profile.id, offer.itemName, offer.quantity || 1);
        return interaction.reply({
            content: `Purchased **${getOfferDisplayLabel(offer)}** for ${formatCrystalLabel(purchaseResult.cost)}. Remaining: ${formatCrystalLabel(purchaseResult.currentCrystals)}. Added to your inventory.`,
            flags: MessageFlags.Ephemeral
        });
    }

    return interaction.reply({
        content: 'Offer purchased.',
        flags: MessageFlags.Ephemeral
    });
}

function getOfferDisplayLabel(offer) {
    if (offer?.itemName === 'Raid Key') {
        return formatRaidKeyLabel(offer.quantity || 1);
    }
    if (offer?.itemName) {
        const qty = Math.max(1, Number(offer.quantity) || 1);
        const base = formatCoreItemLabel(offer.itemName);
        return qty > 1 ? `${base} x${qty}` : base;
    }
    return String(offer?.label || 'Unknown Offer');
}
