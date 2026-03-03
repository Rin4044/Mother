const COMBAT_BALANCE = {
    healPotion: {
        percent: 30
    },
    terrainDamage: {
        percentMaxHp: 4,
        minDamage: 1,
        allowedTypes: ['Poison', 'Fire', 'Cutting', 'Rot']
    }
};

function getHealPotionRatio() {
    return Math.max(0, Math.min(100, Number(COMBAT_BALANCE.healPotion.percent) || 0)) / 100;
}

function getHealPotionLabel() {
    return `Heal ${Math.max(0, Number(COMBAT_BALANCE.healPotion.percent) || 0)}% HP`;
}

module.exports = {
    COMBAT_BALANCE,
    getHealPotionRatio,
    getHealPotionLabel
};

