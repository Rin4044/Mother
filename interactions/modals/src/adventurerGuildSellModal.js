const { MessageFlags } = require('discord.js');
const { sequelize, Profiles, InventoryItems, AdventurerGuildConfig } = require('../../../database');
const { normalizeItemKey } = require('../../../utils/inventoryService');
const {
    CORE_BY_STATE_KEY,
    getGuildCoreBuybackPrices,
    applySellPressure,
    upsertAdventurerGuildPanel
} = require('../../../utils/adventurerGuildService');
const { formatCoreItemLabel, formatCrystalLabel } = require('../../../utils/coreEmoji');

async function handleAdventurerGuildSellModal(interaction) {
    if (!interaction.guildId) {
        return interaction.reply({
            content: 'Guild sell actions can only be used in a server.',
            flags: MessageFlags.Ephemeral
        });
    }

    const idParts = interaction.customId.split('_');
    const profileId = parseInt(idParts[3], 10);
    const coreKey = String(idParts[4] || '').trim().toLowerCase();

    if (!Number.isInteger(profileId) || !coreKey) {
        return interaction.reply({
            content: 'Invalid sell request.',
            flags: MessageFlags.Ephemeral
        });
    }

    const coreName = CORE_BY_STATE_KEY[coreKey];
    if (!coreName) {
        return interaction.reply({
            content: 'Unknown core type.',
            flags: MessageFlags.Ephemeral
        });
    }

    const quantityRaw = interaction.fields.getTextInputValue('quantity');
    const quantity = parseInt(String(quantityRaw || '').trim(), 10);
    if (!Number.isInteger(quantity) || quantity <= 0) {
        return interaction.reply({
            content: 'Quantity must be a positive integer.',
            flags: MessageFlags.Ephemeral
        });
    }

    const sellResult = await sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!profile || profile.userId !== interaction.user.id) {
            return { ok: false, reason: 'NOT_OWNER' };
        }

        const config = await AdventurerGuildConfig.findOne({
            where: { guildId: interaction.guildId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!config) {
            return { ok: false, reason: 'NO_CONFIG' };
        }

        const market = getGuildCoreBuybackPrices(config);
        const marketEntry = market.entries.find((entry) => entry.coreKey === coreKey);
        if (!marketEntry) {
            return { ok: false, reason: 'NO_RATE' };
        }

        const itemKey = normalizeItemKey(coreName);
        const item = await InventoryItems.findOne({
            where: { profileId: profile.id, itemKey },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        const availableQty = Math.max(0, Number(item?.quantity) || 0);
        if (availableQty < quantity) {
            return { ok: false, reason: 'NOT_ENOUGH', availableQty };
        }

        const payoutPerUnit = Math.max(1, Number(marketEntry.buybackPrice) || 1);
        const payout = payoutPerUnit * quantity;

        const nextQty = availableQty - quantity;
        if (nextQty <= 0) {
            await item.destroy({ transaction });
        } else {
            item.quantity = nextQty;
            await item.save({ transaction });
        }

        profile.crystals = Math.max(0, Number(profile.crystals) || 0) + payout;
        await profile.save({ transaction });

        config.buybackState = applySellPressure(config.buybackState, coreKey, quantity, Date.now());
        await config.save({ transaction });

        return {
            ok: true,
            coreName,
            quantity,
            payoutPerUnit,
            payout,
            remainingCrystals: Math.max(0, Number(profile.crystals) || 0)
        };
    });

    if (!sellResult.ok) {
        if (sellResult.reason === 'NOT_OWNER') {
            return interaction.reply({
                content: 'This sell request is not for you.',
                flags: MessageFlags.Ephemeral
            });
        }
        if (sellResult.reason === 'NO_CONFIG') {
            return interaction.reply({
                content: 'Adventurer Guild panel is not configured in this server.',
                flags: MessageFlags.Ephemeral
            });
        }
        if (sellResult.reason === 'NOT_ENOUGH') {
            return interaction.reply({
                content: `Not enough cores. You own ${sellResult.availableQty}.`,
                flags: MessageFlags.Ephemeral
            });
        }
        return interaction.reply({
            content: 'Unable to process this sale right now.',
            flags: MessageFlags.Ephemeral
        });
    }

    await upsertAdventurerGuildPanel(interaction.client, interaction.guildId).catch(() => {});

    return interaction.reply({
        content:
            `Sold ${formatCoreItemLabel(sellResult.coreName)} x${sellResult.quantity}.\n` +
            `Rate: ${formatCrystalLabel(sellResult.payoutPerUnit)} each\n` +
            `Received: ${formatCrystalLabel(sellResult.payout)}\n` +
            `Balance: ${formatCrystalLabel(sellResult.remainingCrystals)}`,
        flags: MessageFlags.Ephemeral
    });
}

module.exports = { handleAdventurerGuildSellModal };
