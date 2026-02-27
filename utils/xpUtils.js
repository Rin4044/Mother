// utils/xpUtils.js

const { RACES } = require('../utils/races');

const XP_BASE = {
    "small lesser taratect": 300,
    "small taratect": 300,
    "lesser taratect": 300,

    "taratect": 450,
    "small poison taratect": 450,

    "greater taratect": 650,
    "poison taratect": 650,
    "zoa ele": 650,

    "arch taratect": 900,
    "orthocadinaht": 900,
    "ede saine": 900,

    "queen taratect": 1200,
    "zana horowa": 1200,

    "arachne": 1600,
    "god": 3000
};

const XP_GROWTH_RATE = 1.15;
const MAX_LEVEL = 100;

/**
 * Calculate XP required for next level
 */
function calculateXpForLevel(level, race) {

    if (!race)
        throw new Error("Race is required for XP calculation.");

    const cleanRace = race.toLowerCase().trim();

    if (!RACES[cleanRace])
        throw new Error(`Race "${cleanRace}" not configured in RACES.`);

    const baseXp = XP_BASE[cleanRace];

    if (!baseXp)
        throw new Error(`XP base not configured for race "${cleanRace}".`);

    if (level <= 1)
        return baseXp;

    if (level > MAX_LEVEL)
        return Infinity;

    return Math.round(
        baseXp * Math.pow(XP_GROWTH_RATE, level - 2)
    );
}

module.exports = { calculateXpForLevel };
