// utils/xpSkillUtils.js

const BASE_XP = 50;
const GROWTH_RATE = 1.35;   // plus contrôlable que 1.5
const MAX_LEVEL = 20;       // cap optionnel

/**
 * XP required to reach next level
 */
function calculateXpForSkillLevel(level) {
    if (level <= 1) return BASE_XP;

    return Math.round(BASE_XP * Math.pow(GROWTH_RATE, level - 1));
}

/**
 * Apply XP and calculate new level
 */
function updateSkillLevel(currentXp, skillLevel) {

    let xp = currentXp;
    let level = skillLevel;

    while (
        level < MAX_LEVEL &&
        xp >= calculateXpForSkillLevel(level)
    ) {
        xp -= calculateXpForSkillLevel(level);
        level++;
    }

    return {
        level,
        remainingXp: xp,
        reachedMax: level >= MAX_LEVEL
    };
}

module.exports = {
    calculateXpForSkillLevel,
    updateSkillLevel
};