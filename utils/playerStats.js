const { UserTitles, Titles } = require('../database');
const { RACES } = require('../utils/races');

/**
 * Calcule les stats finales d’un joueur
 */
async function calculatePlayerStats(profile) {

    const raceKey = profile.race?.toLowerCase().trim();
    const raceData = RACES[raceKey];

    if (!raceData) {
        console.error("Race not found in RACES:", raceKey);
        return null;
    }

    const baseStats = raceData.base;
    const growthStats = raceData.growth;

    const stats = {};

    // ===== BASE + LEVEL SCALING =====

    for (const stat in baseStats) {
        stats[stat] =
            baseStats[stat] +
            (growthStats[stat] * (profile.level - 1));
    }

    // ===== TITLE BONUSES =====

    const userTitles = await UserTitles.findAll({
        where: { profileId: profile.id },
        include: { model: Titles }
    });

    for (const ut of userTitles) {

        const title = ut.Title;

        stats.hp += title.hp || 0;
        stats.mp += title.mp || 0;
        stats.stamina += title.stamina || 0;
        stats.vitalStamina += title.vital_stamina || 0;
        stats.offense += title.offense || 0;
        stats.defense += title.defense || 0;
        stats.magic += title.magic || 0;
        stats.resistance += title.resistance || 0;
        stats.speed += title.speed || 0;
    }

    return stats;
}

/**
 * Construit une entité prête pour le combatEngine
 */
async function buildCombatEntity(profile) {

    const stats = await calculatePlayerStats(profile);
    if (!stats) return null;

    return {
        id: profile.id,

        hp: profile.remainingHp ?? stats.hp,
        maxHp: stats.hp,

        mp: profile.remainingMp ?? stats.mp,
        maxMp: stats.mp,

        stamina: profile.remainingStamina ?? stats.stamina,
        maxStamina: stats.stamina,

        vitalStamina: profile.remainingVitalStamina ?? stats.vitalStamina,
        maxVitalStamina: stats.vitalStamina,

        offense: stats.offense,
        defense: stats.defense,
        magic: stats.magic,
        resistance: stats.resistance,
        speed: stats.speed,

        effects: [] // système nouveau multi-effect
    };
}

module.exports = {
    calculatePlayerStats,
    buildCombatEntity
};