const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Op } = require('sequelize');
const { AdventurerGuildConfig } = require('../database');
const { formatCoreItemLabel } = require('./coreEmoji');
const { ensureGuildQuestBoard } = require('./adventurerGuildQuestService');

const CORE_BUYBACK_BASE = {
    'Mediocre Monster Core': 40,
    'Cracked Monster Core': 110,
    'Solid Monster Core': 280,
    'Superior Monster Core': 750,
    'Primal Monster Core': 2200
};

const STATE_KEY_BY_CORE = {
    'Mediocre Monster Core': 'mediocre',
    'Cracked Monster Core': 'cracked',
    'Solid Monster Core': 'solid',
    'Superior Monster Core': 'superior',
    'Primal Monster Core': 'primal'
};
const CORE_BY_STATE_KEY = Object.fromEntries(
    Object.entries(STATE_KEY_BY_CORE).map(([coreName, stateKey]) => [stateKey, coreName])
);

const SELL_IMPACT_PER_CORE = {
    mediocre: 0.0009,
    cracked: 0.0011,
    solid: 0.0014,
    superior: 0.0018,
    primal: 0.0022
};

const PRICE_FLOOR_MULTIPLIER = 0.35;
const PRICE_CEIL_MULTIPLIER = 1.6;
const RECOVERY_PER_HOUR = 80;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeBuybackState(rawState = {}, nowMs = Date.now()) {
    const state = rawState && typeof rawState === 'object' ? { ...rawState } : {};
    const recovered = {};

    for (const key of Object.values(STATE_KEY_BY_CORE)) {
        const entry = state[key] && typeof state[key] === 'object' ? state[key] : {};
        const soldRaw = Math.max(0, toNumber(entry.soldUnits, 0));
        const lastUpdatedAt = Math.max(0, toNumber(entry.lastUpdatedAt, nowMs));
        const elapsedHours = Math.max(0, (nowMs - lastUpdatedAt) / 3600000);
        const recoveredSold = Math.max(0, soldRaw - (elapsedHours * RECOVERY_PER_HOUR));

        recovered[key] = {
            soldUnits: recoveredSold,
            lastUpdatedAt: nowMs
        };
    }

    return recovered;
}

function getCoreBuybackPrice(basePrice, soldUnits, impactPerUnit) {
    const pressure = Math.max(0, soldUnits) * Math.max(0, impactPerUnit);
    const multiplier = clamp(1 - pressure, PRICE_FLOOR_MULTIPLIER, PRICE_CEIL_MULTIPLIER);
    return Math.max(1, Math.floor(basePrice * multiplier));
}

function getGuildCoreBuybackPrices(config, nowMs = Date.now()) {
    const normalizedState = normalizeBuybackState(config?.buybackState || {}, nowMs);
    const entries = [];

    for (const [coreName, basePrice] of Object.entries(CORE_BUYBACK_BASE)) {
        const stateKey = STATE_KEY_BY_CORE[coreName];
        const soldUnits = Math.max(0, toNumber(normalizedState[stateKey]?.soldUnits, 0));
        const impact = SELL_IMPACT_PER_CORE[stateKey] || 0.001;
        const buybackPrice = getCoreBuybackPrice(basePrice, soldUnits, impact);

        entries.push({
            coreKey: stateKey,
            coreName,
            basePrice,
            buybackPrice,
            soldUnits
        });
    }

    return {
        normalizedState,
        entries
    };
}

function applySellPressure(rawState = {}, coreKey, quantity, nowMs = Date.now()) {
    const state = normalizeBuybackState(rawState, nowMs);
    const key = String(coreKey || '').trim().toLowerCase();
    const qty = Math.max(0, Number(quantity) || 0);

    if (!state[key] || qty <= 0) {
        return state;
    }

    state[key] = {
        soldUnits: Math.max(0, Number(state[key].soldUnits) || 0) + qty,
        lastUpdatedAt: nowMs
    };

    return state;
}

function buildQuestBoardSection(board) {
    if (!board || !Array.isArray(board.quests) || board.quests.length === 0) {
        return 'No quests available.';
    }

    return board.quests
        .slice(0, 8)
        .map((quest, index) => {
            const reward = Math.max(0, Number(quest.rewardCrystals) || 0);
            const rewardXp = Math.max(0, Number(quest.rewardXp) || 0);
            const title = String(quest.title || `Slay ${Math.max(1, Number(quest.targetKills) || 1)} monsters`);
            return `Q${index + 1}. ${title} -> ${reward} crystals + ${rewardXp} XP`;
        })
        .join('\n');
}

function buildAdventurerGuildEmbed(config, questBoard = null) {
    const { entries } = getGuildCoreBuybackPrices(config);
    const priceLines = entries
        .map((entry) => (
            `${formatCoreItemLabel(entry.coreName)}: **${entry.buybackPrice}** crystals`
        ))
        .join('\n');
    const questLines = buildQuestBoardSection(questBoard);
    const resetAt = Number(questBoard?.resetAt) || 0;

    return new EmbedBuilder()
        .setColor(0x1f2a44)
        .setTitle('Adventurer Guild Counter')
        .setDescription(
            'The guild clerks evaluate your Monster Cores based on current demand.\n' +
            'Buyback prices shift as sales flow through the city.\n\n' +
            'Exchange: WIP\n' +
            `Quest board reset: ${resetAt > 0 ? `<t:${Math.floor(resetAt / 1000)}:R>` : 'unknown'}`
        )
        .addFields(
            { name: 'Core Buyback Prices', value: priceLines || 'No prices available.' },
            { name: 'Quest Board', value: questLines }
        )
        .setFooter({ text: 'Counter prices adjust with market activity.' })
        .setTimestamp(new Date());
}

function buildAdventurerGuildButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('advguild_sell')
            .setLabel('Sell')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false),
        new ButtonBuilder()
            .setCustomId('advguild_exchange')
            .setLabel('Exchange')
            .setStyle(ButtonStyle.Success)
            .setDisabled(false),
        new ButtonBuilder()
            .setCustomId('advguild_quest')
            .setLabel('Quest')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(false)
    );
}

async function upsertAdventurerGuildPanel(client, guildId) {
    const config = await AdventurerGuildConfig.findOne({ where: { guildId } });
    if (!config?.panelChannelId) return false;

    const market = getGuildCoreBuybackPrices(config);
    config.buybackState = market.normalizedState;
    await config.save();

    const channel = await client.channels.fetch(config.panelChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    const boardWrap = await ensureGuildQuestBoard(guildId).catch((error) => {
        console.error(`Failed to build quest board for guild ${guildId}:`, error?.message || error);
        return null;
    });
    const embed = buildAdventurerGuildEmbed(config, boardWrap?.board || null);
    const row = buildAdventurerGuildButtons();

    let message = null;
    if (config.panelMessageId) {
        message = await channel.messages.fetch(config.panelMessageId).catch(() => null);
    }

    if (message) {
        await message.edit({ embeds: [embed], components: [row] });
        return true;
    }

    const created = await channel.send({ embeds: [embed], components: [row] });
    config.panelMessageId = created.id;
    await config.save();
    return true;
}

async function refreshAllAdventurerGuildPanels(client) {
    let configs = [];
    try {
        configs = await AdventurerGuildConfig.findAll({
            where: { panelChannelId: { [Op.ne]: null } }
        });
    } catch (error) {
        // Table might not exist yet on first boot before sync fully finishes.
        if (error?.original?.code === '42P01' || error?.parent?.code === '42P01') {
            console.warn('AdventurerGuildConfig table not ready yet. Skipping guild panel refresh for this startup.');
            return;
        }
        throw error;
    }

    for (const config of configs) {
        try {
            await upsertAdventurerGuildPanel(client, config.guildId);
        } catch (error) {
            console.error(`Failed to refresh adventurer guild panel for guild ${config.guildId}:`, error?.message || error);
        }
    }
}

module.exports = {
    CORE_BUYBACK_BASE,
    STATE_KEY_BY_CORE,
    CORE_BY_STATE_KEY,
    normalizeBuybackState,
    getGuildCoreBuybackPrices,
    applySellPressure,
    buildAdventurerGuildEmbed,
    buildAdventurerGuildButtons,
    upsertAdventurerGuildPanel,
    refreshAllAdventurerGuildPanels
};
