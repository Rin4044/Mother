const { UserSkills, Skills } = require('../database');
const { calculateXpForSkillLevel, updateSkillLevel } = require('./xpSkillUtils');

const XP_PER_SKILL_USE = 2;
const POWER_BONUS_PER_LEVEL = 0.1;

function getSkillLevelCap(skillTier = 1, skillName = '') {
    if (String(skillName || '').trim().toLowerCase() === 'taboo') {
        return 10;
    }

    return [1, 2].includes(Number(skillTier) || 1) ? 10 : 20;
}

function getSkillXpProgress(level = 1, xp = 0, skillTier = 1, skillName = '') {
    const cap = getSkillLevelCap(skillTier, skillName);
    const safeLevel = Math.max(1, Number(level) || 1);
    const safeXp = Math.max(0, Number(xp) || 0);

    if (safeLevel >= cap) {
        return {
            level: cap,
            cap,
            xp: 0,
            xpNeeded: 0,
            isCapped: true
        };
    }

    return {
        level: safeLevel,
        cap,
        xp: safeXp,
        xpNeeded: calculateXpForSkillLevel(safeLevel),
        isCapped: false
    };
}

function calculateEffectiveSkillPower(basePower = 0, skillLevel = 1) {
    const safeBase = Number(basePower) || 0;
    const safeLevel = Math.max(1, Number(skillLevel) || 1);
    const effective = safeBase + ((safeLevel - 1) * POWER_BONUS_PER_LEVEL);
    return Math.round(effective * 10) / 10;
}

async function grantSkillUsageXp(profileId, skillId, uses = 1) {
    const safeUses = Math.max(0, Number(uses) || 0);
    if (safeUses <= 0) return null;

    const userSkill = await UserSkills.findOne({
        where: { profileId, skillId }
    });

    if (!userSkill) return null;

    const baseSkill = await Skills.findByPk(skillId);
    if (!baseSkill) return null;

    const gainedXp = safeUses * XP_PER_SKILL_USE;
    const totalXp = (userSkill.xp || 0) + gainedXp;

    const beforeLevel = userSkill.level || 1;
    const hardCap = getSkillLevelCap(baseSkill.tier, baseSkill.name);
    if (beforeLevel >= hardCap) {
        const unlockedSkill = await tryUnlockNextSkill(profileId, baseSkill);
        if (!unlockedSkill) return null;
        return {
            gainedXp: 0,
            previousLevel: beforeLevel,
            level: beforeLevel,
            leveledUp: false,
            unlockedSkill
        };
    }

    const updated = updateSkillLevel(totalXp, beforeLevel);

    // Tier 1/2 stop at level 10 because they evolve into the next tier.
    const cappedLevel = Math.min(updated.level, hardCap);
    const cappedXp = cappedLevel >= hardCap ? 0 : updated.remainingXp;

    await userSkill.update({
        level: cappedLevel,
        xp: cappedXp
    });

    const unlockedSkill = cappedLevel >= 10
        ? await tryUnlockNextSkill(profileId, baseSkill)
        : null;

    return {
        gainedXp,
        previousLevel: beforeLevel,
        level: cappedLevel,
        leveledUp: cappedLevel > beforeLevel,
        unlockedSkill
    };
}

async function grantSkillXp(profileId, skillId, gainedXp = 0) {
    const safeXp = Math.max(0, Number(gainedXp) || 0);
    if (safeXp <= 0) return null;

    const userSkill = await UserSkills.findOne({
        where: { profileId, skillId }
    });

    if (!userSkill) return null;

    const baseSkill = await Skills.findByPk(skillId);
    if (!baseSkill) return null;

    const totalXp = (userSkill.xp || 0) + safeXp;
    const beforeLevel = userSkill.level || 1;
    const hardCap = getSkillLevelCap(baseSkill.tier, baseSkill.name);
    if (beforeLevel >= hardCap) {
        const unlockedSkill = await tryUnlockNextSkill(profileId, baseSkill);
        if (!unlockedSkill) return null;
        return {
            gainedXp: 0,
            previousLevel: beforeLevel,
            level: beforeLevel,
            leveledUp: false,
            unlockedSkill
        };
    }

    const updated = updateSkillLevel(totalXp, beforeLevel);

    const cappedLevel = Math.min(updated.level, hardCap);
    const cappedXp = cappedLevel >= hardCap ? 0 : updated.remainingXp;

    await userSkill.update({
        level: cappedLevel,
        xp: cappedXp
    });

    const unlockedSkill = cappedLevel >= 10
        ? await tryUnlockNextSkill(profileId, baseSkill)
        : null;

    return {
        gainedXp: safeXp,
        previousLevel: beforeLevel,
        level: cappedLevel,
        leveledUp: cappedLevel > beforeLevel,
        unlockedSkill
    };
}

function calculatePveSkillXp({
    uses = 0,
    damageDone = 0,
    monsterLevel = 1,
    towerTier = 1,
    rarityXpMultiplier = 1,
    victory = false
} = {}) {
    const safeUses = Math.max(0, Number(uses) || 0);
    if (safeUses <= 0) return 0;

    const safeDamage = Math.max(0, Number(damageDone) || 0);
    const safeMonsterLevel = Math.max(1, Number(monsterLevel) || 1);
    const safeTier = Math.max(1, Number(towerTier) || 1);
    const safeRarity = Math.max(1, Number(rarityXpMultiplier) || 1);

    const useBase = safeUses * 3;
    const damagePart = Math.sqrt(safeDamage) * 0.5;
    const levelPart = safeMonsterLevel * 0.6;
    const tierPart = (safeTier - 1) * 1.2;
    const rarityPart = (safeRarity - 1) * 4;
    const victoryPart = victory ? 2 : 0;

    const raw = useBase + damagePart + levelPart + tierPart + rarityPart + victoryPart;
    return Math.max(2, Math.min(40, Math.round(raw)));
}

async function tryUnlockNextSkill(profileId, baseSkill) {
    if (![1, 2].includes(Number(baseSkill?.tier) || 1)) return null;

    const nextSkill = await Skills.findOne({
        where: {
            parent: baseSkill.id,
            tier: (Number(baseSkill.tier) || 1) + 1
        },
        order: [['id', 'ASC']]
    });
    if (!nextSkill) return null;

    const existingNext = await UserSkills.findOne({
        where: {
            profileId,
            skillId: nextSkill.id
        }
    });
    if (existingNext) return null;

    await UserSkills.create({
        profileId,
        skillId: nextSkill.id,
        level: 1,
        xp: 0
    });

    return {
        id: nextSkill.id,
        name: nextSkill.name,
        tier: nextSkill.tier
    };
}

module.exports = {
    XP_PER_SKILL_USE,
    POWER_BONUS_PER_LEVEL,
    getSkillLevelCap,
    getSkillXpProgress,
    calculateEffectiveSkillPower,
    grantSkillUsageXp,
    grantSkillXp,
    calculatePveSkillXp
};
