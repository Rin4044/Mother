const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Profiles, InventoryItems, sequelize } = require('../../database');
const { normalizeItemKey } = require('../../utils/inventoryService');
const {
    getActiveXpBoost,
    grantOrExtendXpBoost,
    formatRemainingTimestamp
} = require('../../utils/xpBoostService');

const XP_POTIONS = {
    xp_5_15m: {
        label: 'XP Potion +5% (15m)',
        itemName: 'XP Potion +5% (15m)',
        percent: 5,
        durationMs: 15 * 60 * 1000
    },
    xp_10_20m: {
        label: 'XP Potion +10% (20m)',
        itemName: 'XP Potion +10% (20m)',
        percent: 10,
        durationMs: 20 * 60 * 1000
    },
    xp_20_10m: {
        label: 'XP Potion +20% (10m)',
        itemName: 'XP Potion +20% (10m)',
        percent: 20,
        durationMs: 10 * 60 * 1000
    },
    xp_25_1h: {
        label: 'XP Potion +25% (1h)',
        itemName: 'XP Potion +25% (1h)',
        percent: 25,
        durationMs: 60 * 60 * 1000
    },
    xp_50_20m: {
        label: 'XP Potion +50% (20m)',
        itemName: 'XP Potion +50% (20m)',
        percent: 50,
        durationMs: 20 * 60 * 1000
    },
    xp_75_1h: {
        label: 'XP Potion +75% (1h)',
        itemName: 'XP Potion +75% (1h)',
        percent: 75,
        durationMs: 60 * 60 * 1000
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xppotion')
        .setDescription('Manage and use your XP potions.')
        .addSubcommand((sub) =>
            sub.setName('view')
                .setDescription('View active boost and potion quantities.')
        )
        .addSubcommand((sub) =>
            sub.setName('use')
                .setDescription('Use one XP potion (cannot stack with active boost).')
                .addStringOption((option) =>
                    option
                        .setName('potion')
                        .setDescription('Potion to use')
                        .setRequired(true)
                        .addChoices(
                            { name: '+5% (15m)', value: 'xp_5_15m' },
                            { name: '+10% (20m)', value: 'xp_10_20m' },
                            { name: '+20% (10m)', value: 'xp_20_10m' },
                            { name: '+25% (1h)', value: 'xp_25_1h' },
                            { name: '+50% (20m)', value: 'xp_50_20m' },
                            { name: '+75% (1h)', value: 'xp_75_1h' }
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

        return handleUse(interaction, profile);
    }
};

async function handleView(interaction, profile) {
    const active = getActiveXpBoost(profile);
    const boostText = active.percent > 0
        ? `Active XP Boost: +${active.percent}% (${formatRemainingTimestamp(active)})`
        : 'Active XP Boost: none';

    const lines = [];
    for (const potion of Object.values(XP_POTIONS)) {
        const item = await InventoryItems.findOne({
            where: { profileId: profile.id, itemKey: normalizeItemKey(potion.itemName) }
        });
        const qty = Math.max(0, Number(item?.quantity) || 0);
        lines.push(`- ${potion.label}: x${qty}`);
    }

    const embed = new EmbedBuilder()
        .setColor('#1f1f23')
        .setTitle('XP Potions')
        .setDescription(`${boostText}\n\n${lines.join('\n')}`);

    return interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

async function handleUse(interaction, profile) {
    const potionKey = interaction.options.getString('potion', true);
    const potion = XP_POTIONS[potionKey];
    if (!potion) {
        return interaction.reply({
            content: 'Invalid potion.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        await sequelize.transaction(async (transaction) => {
            const txProfile = await Profiles.findByPk(profile.id, { transaction });
            if (!txProfile) {
                throw new Error('MISSING_PROFILE');
            }

            const active = getActiveXpBoost(txProfile);
            if (active.percent > 0 && active.remainingMs > 0) {
                throw new Error('BOOST_ALREADY_ACTIVE');
            }

            const item = await InventoryItems.findOne({
                where: {
                    profileId: txProfile.id,
                    itemKey: normalizeItemKey(potion.itemName)
                },
                transaction
            });

            const qty = Math.max(0, Number(item?.quantity) || 0);
            if (qty < 1) {
                throw new Error('NO_POTION');
            }

            const applied = grantOrExtendXpBoost(txProfile, potion.percent, potion.durationMs);
            if (!applied) {
                throw new Error('BOOST_ALREADY_ACTIVE');
            }

            await txProfile.save({ transaction });

            const next = qty - 1;
            if (next <= 0) {
                await item.destroy({ transaction });
            } else {
                item.quantity = next;
                await item.save({ transaction });
            }
        });
    } catch (error) {
        if (error.message === 'BOOST_ALREADY_ACTIVE') {
            const active = getActiveXpBoost(profile);
            return interaction.reply({
                content: `You already have an active XP boost: +${active.percent}% (${formatRemainingTimestamp(active)}). No stacking allowed.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (error.message === 'NO_POTION') {
            return interaction.reply({
                content: `You do not have **${potion.label}** in your inventory.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (error.message === 'MISSING_PROFILE') {
            return interaction.reply({
                content: 'Profile not found.',
                flags: MessageFlags.Ephemeral
            });
        }

        throw error;
    }

    const updatedProfile = await Profiles.findByPk(profile.id);
    const active = getActiveXpBoost(updatedProfile || profile);

    return interaction.reply({
        content: `Used **${potion.label}**. Active boost: +${potion.percent}% (${formatRemainingTimestamp(active)}).`,
        flags: MessageFlags.Ephemeral
    });
}
