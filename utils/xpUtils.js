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
    "human": 300,
    "trained human": 300,
    "advanced human": 450,
    "high human": 650,
    "transcendent human": 1200,
    "blade human": 450,
    "warborn human": 650,
    "mythic blademaster": 1200,
    "arcane human": 450,
    "runic human": 650,
    "astral human": 1200,
    "holy human": 550,
    "sacred human": 800,
    "divine human": 1500,

    "young elf": 300,
    "adult elf": 300,
    "high elf": 450,
    "moon elf": 450,
    "silver moon elf": 650,
    "lunar arch elf": 1200,
    "sun elf": 450,
    "radiant sun elf": 650,
    "solar arch elf": 1200,
    "spirit elf": 700,
    "spiritbound elf": 1000,
    "astral arch elf": 1800,
    "shadow elf": 450,
    "nightshade elf": 650,
    "void elf": 1200,

    "lesser demon": 300,
    "true demon": 450,
    "greater demon": 650,
    "arch demon": 750,
    "demon semi divinity": 1100,
    "demon divinity": 1800,
    "oni": 650,
    "calamity oni": 900,
    "oni tyrant": 1600,
    "succubus": 650,
    "night succubus": 900,
    "queen succubus": 1600,
    "vampire": 650,
    "elder vampire": 900,
    "progenitor vampire": 1600,
    "fallen demon": 650,
    "dread fallen demon": 900,
    "abyssal fallen demon": 1600,

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
