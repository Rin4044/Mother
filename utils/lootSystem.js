const CORE_TIERS = [
    'Mediocre Monster Core',
    'Cracked Monster Core',
    'Solid Monster Core',
    'Superior Monster Core',
    'Primal Monster Core'
];

// Percent chances per monster level (1-9) for the 5 core tiers.
const CORE_DROP_BY_LEVEL = {
    1: [100, 0, 0, 0, 0],
    2: [80, 18, 2, 0, 0],
    3: [65, 25, 9, 1, 0],
    4: [45, 35, 16, 4, 0],
    5: [25, 35, 25, 12, 3],
    6: [10, 25, 35, 22, 8],
    7: [3, 12, 35, 35, 15],
    8: [0, 5, 35, 40, 20],
    9: [0, 0, 35, 40, 25]
};

function pickWeightedIndex(weights) {
    const total = weights.reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    if (total <= 0) return 0;

    const roll = Math.random() * total;
    let cursor = 0;

    for (let i = 0; i < weights.length; i++) {
        cursor += Math.max(0, Number(weights[i]) || 0);
        if (roll < cursor) return i;
    }

    return weights.length - 1;
}

function getCoreWeightsForLevel(monsterLevel) {
    const safeLevel = Math.max(1, Math.min(9, Number(monsterLevel) || 1));
    return CORE_DROP_BY_LEVEL[safeLevel] || CORE_DROP_BY_LEVEL[1];
}

function randomInt(min, max) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function getRarityQuantityBonus(rarity) {
    const value = String(rarity || '').toLowerCase().trim();
    if (value === 'elite') return 1;
    if (value === 'boss') return 2;
    return 0;
}

function rollCoreQuantity(monsterLevel, tierIndex, rarity) {
    const safeLevel = Math.max(1, Math.min(9, Number(monsterLevel) || 1));
    const rarityBonus = getRarityQuantityBonus(rarity);
    const tier = Math.max(0, Math.min(4, Number(tierIndex) || 0));
    const QUANTITY_RANGE_BY_LEVEL_AND_TIER = {
        1: [[1, 2], [1, 1], [1, 1], [1, 1], [1, 1]],
        2: [[1, 3], [1, 2], [1, 1], [1, 1], [1, 1]],
        3: [[2, 4], [1, 2], [1, 2], [1, 1], [1, 1]],
        4: [[3, 6], [2, 4], [1, 2], [1, 2], [1, 1]],
        5: [[4, 8], [2, 5], [1, 3], [1, 2], [1, 1]],
        6: [[5, 10], [3, 6], [1, 3], [1, 2], [1, 1]],
        7: [[6, 10], [3, 6], [2, 4], [1, 3], [1, 2]],
        8: [[7, 10], [4, 7], [2, 4], [1, 3], [1, 2]],
        9: [[8, 10], [4, 7], [2, 5], [2, 3], [1, 3]]
    };

    const levelRanges = QUANTITY_RANGE_BY_LEVEL_AND_TIER[safeLevel] || QUANTITY_RANGE_BY_LEVEL_AND_TIER[1];
    const [baseMin, baseMax] = levelRanges[tier] || [1, 1];

    const maxWithBonus = Math.max(baseMin, baseMax + Math.min(2, rarityBonus));
    return randomInt(baseMin, maxWithBonus);
}

function rollLoot(input = {}) {
    const config = typeof input === 'object' && input !== null
        ? input
        : { rarity: input };

    const weights = getCoreWeightsForLevel(config.monsterLevel);
    const pickedIndex = pickWeightedIndex(weights);
    const quantity = rollCoreQuantity(config.monsterLevel, pickedIndex, config.rarity);

    return {
        item: CORE_TIERS[pickedIndex],
        quantity,
        tier: pickedIndex + 1
    };
}

module.exports = { rollLoot, getCoreWeightsForLevel };
