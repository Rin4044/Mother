const { MessageFlags } = require('discord.js');
const { Op } = require('sequelize');
const { Profiles, UserSkills, Skills, sequelize } = require('../database');
const { grantSkillXp } = require('./skillProgression');

const EXPOSURE_THRESHOLD = {
    resistance: 220,
    enhancement: 260
};

function calculatePassiveStatusXp({
    damageTaken = 0,
    monsterLevel = 1,
    towerTier = 1,
    victory = false
} = {}) {
    const safeDamage = Math.max(0, Number(damageTaken) || 0);
    if (safeDamage <= 0) return 0;

    const safeLevel = Math.max(1, Number(monsterLevel) || 1);
    const safeTier = Math.max(1, Number(towerTier) || 1);
    const victoryBonus = victory ? 1 : 0;
    const raw = (Math.sqrt(safeDamage) * 1.1) + (safeLevel * 0.4) + ((safeTier - 1) * 0.8) + victoryBonus;
    return Math.max(1, Math.min(25, Math.round(raw)));
}

function appendSkillProgress(summary, skill, skillProgress) {
    if (!skill || !skillProgress?.gainedXp) return summary || {};

    const nextSummary = { ...(summary || {}) };
    const skillId = String(skill.id);
    const current = nextSummary[skillId] || {
        skillId: Number(skill.id),
        skillName: skill.name || 'Unknown Skill',
        totalXp: 0,
        level: null,
        unlocked: []
    };

    current.totalXp += Math.max(0, Number(skillProgress.gainedXp) || 0);
    current.skillName = skill.name || current.skillName;
    current.level = typeof skillProgress.level === 'number' ? skillProgress.level : current.level;

    if (skillProgress.unlockedSkill?.id) {
        if (!current.unlocked.some((entry) => entry.id === skillProgress.unlockedSkill.id)) {
            current.unlocked.push(skillProgress.unlockedSkill);
        }
    }

    nextSummary[skillId] = current;
    return nextSummary;
}

function collectUnlockedSkillsFromSummary(summary = {}) {
    const seen = new Set();
    const list = [];
    for (const entry of Object.values(summary || {})) {
        for (const unlocked of entry?.unlocked || []) {
            const id = Number(unlocked?.id) || 0;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            list.push({
                id,
                name: unlocked.name || 'Unknown Skill',
                tier: unlocked.tier || null
            });
        }
    }
    return list;
}

async function sendObtainedSkillsEphemeral(interaction, unlockedSkills = []) {
    const seen = new Set();
    const unique = [];
    for (const skill of unlockedSkills || []) {
        const id = Number(skill?.id) || 0;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        unique.push(skill);
    }
    if (!unique.length) return;

    try {
        await interaction.followUp({
            content:
                'New skill obtained:\n' +
                unique.map((skill) =>
                    `- ${skill.name}${Number.isFinite(Number(skill.tier)) ? ` (Tier ${skill.tier})` : ''}`
                ).join('\n'),
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        if (error?.code === 10062 || error?.code === 40060) return;
        console.error('skill obtain followUp error:', error);
    }
}

function normalizeStatusEffectType(effectType) {
    const key = String(effectType || '').toLowerCase().trim();
    if (key === 'poison') return 'Poison';
    if (key === 'fire') return 'Fire';
    if (key === 'cutting') return 'Cutting';
    if (key === 'rot') return 'Rot';
    return null;
}

async function findPassiveSkillForEffect(kind, effectType) {
    const normalized = normalizeStatusEffectType(effectType);
    if (!normalized) return null;

    if (kind === 'resistance') {
        return Skills.findOne({
            where: {
                effect_type_main: 'Buff',
                effect_type_specific: normalized,
                name: {
                    [Op.and]: [
                        { [Op.iLike]: '%Resistance%' },
                        { [Op.notILike]: '%Super%' },
                        { [Op.notILike]: '%Nullification%' },
                        { [Op.notILike]: '%Nullify%' }
                    ]
                }
            },
            order: [['tier', 'ASC'], ['id', 'ASC']]
        });
    }

    return Skills.findOne({
        where: {
            effect_type_main: 'Buff',
            effect_type_specific: normalized,
            name: { [Op.iLike]: '%Enhancement%' }
        },
        order: [['tier', 'ASC'], ['id', 'ASC']]
    });
}

async function tryUnlockPassiveByExposure(profileId, kind, effectType, damageValue) {
    const normalized = normalizeStatusEffectType(effectType);
    const damage = Math.max(0, Number(damageValue) || 0);
    if (!profileId || !normalized || damage <= 0) return null;

    const skill = await findPassiveSkillForEffect(kind, normalized);
    if (!skill) return null;

    const existing = await UserSkills.findOne({
        where: { profileId, skillId: skill.id }
    });
    if (existing) return null;

    const profile = await Profiles.findByPk(profileId);
    if (!profile) return null;

    const progress = (profile.rulerProgress && typeof profile.rulerProgress === 'object')
        ? { ...profile.rulerProgress }
        : {};
    const bucketKey = kind === 'enhancement' ? 'enhancementExposure' : 'resistanceExposure';
    const bucket = (progress[bucketKey] && typeof progress[bucketKey] === 'object')
        ? { ...progress[bucketKey] }
        : {};

    const current = Math.max(0, Number(bucket[normalized]) || 0);
    const next = current + damage;
    const threshold = EXPOSURE_THRESHOLD[kind] || EXPOSURE_THRESHOLD.resistance;

    if (next < threshold) {
        bucket[normalized] = next;
        progress[bucketKey] = bucket;
        profile.rulerProgress = progress;
        await profile.save();
        return null;
    }

    await UserSkills.create({
        profileId,
        skillId: skill.id,
        level: 1,
        xp: 0
    });

    bucket[normalized] = 0;
    progress[bucketKey] = bucket;
    profile.rulerProgress = progress;
    await profile.save();

    return {
        id: skill.id,
        name: skill.name,
        tier: skill.tier,
        type: kind,
        effectType: normalized
    };
}

async function grantResistanceXpFromStatusDamage(profileId, statusDamageByType, context = {}) {
    const entries = Object.entries(statusDamageByType || {})
        .filter(([, totalDamage]) => (Number(totalDamage) || 0) > 0);

    if (!entries.length) return { summary: {}, unlockedSkills: [] };

    const unlockedSkills = [];
    for (const [statusType, totalDamage] of entries) {
        const unlocked = await tryUnlockPassiveByExposure(
            profileId,
            'resistance',
            statusType,
            Math.max(0, Number(totalDamage) || 0)
        );
        if (unlocked) unlockedSkills.push(unlocked);
    }

    const statusTypes = entries.map(([statusType]) => String(statusType));
    const resistanceUserSkills = await UserSkills.findAll({
        where: { profileId },
        include: [{
            model: Skills,
            where: {
                type: 'Resistance Skills',
                effect_type_main: 'Buff',
                effect_type_specific: { [Op.in]: statusTypes }
            }
        }]
    });

    let summary = {};
    for (const userSkill of resistanceUserSkills) {
        const passiveSkill = userSkill.Skill;
        if (!passiveSkill) continue;

        const damageTaken = Math.max(0, Number(statusDamageByType[passiveSkill.effect_type_specific]) || 0);
        if (damageTaken <= 0) continue;

        const gainedXp = calculatePassiveStatusXp({
            damageTaken,
            monsterLevel: context.monsterLevel || 1,
            towerTier: context.towerTier || 1,
            victory: !!context.victory
        });
        const progress = await grantSkillXp(profileId, passiveSkill.id, gainedXp);
        summary = appendSkillProgress(summary, passiveSkill, progress);
    }

    return { summary, unlockedSkills };
}

async function grantEnhancementXpFromStatusDamage(profileId, statusDamageByType, context = {}) {
    const entries = Object.entries(statusDamageByType || {})
        .filter(([, totalDamage]) => (Number(totalDamage) || 0) > 0);

    if (!entries.length) return { summary: {}, unlockedSkills: [] };

    const unlockedSkills = [];
    for (const [statusType, totalDamage] of entries) {
        const unlocked = await tryUnlockPassiveByExposure(
            profileId,
            'enhancement',
            statusType,
            Math.max(0, Number(totalDamage) || 0)
        );
        if (unlocked) unlockedSkills.push(unlocked);
    }

    const statusTypes = entries.map(([statusType]) => String(statusType));
    const enhancementUserSkills = await UserSkills.findAll({
        where: { profileId },
        include: [{
            model: Skills,
            where: {
                effect_type_main: 'Buff',
                effect_type_specific: { [Op.in]: statusTypes },
                name: { [Op.iLike]: '%Enhancement%' }
            }
        }]
    });

    let summary = {};
    for (const userSkill of enhancementUserSkills) {
        const passiveSkill = userSkill.Skill;
        if (!passiveSkill) continue;

        const damageDone = Math.max(0, Number(statusDamageByType[passiveSkill.effect_type_specific]) || 0);
        if (damageDone <= 0) continue;

        const gainedXp = calculatePassiveStatusXp({
            damageTaken: damageDone,
            monsterLevel: context.monsterLevel || 1,
            towerTier: context.towerTier || 1,
            victory: !!context.victory
        });
        const progress = await grantSkillXp(profileId, passiveSkill.id, gainedXp);
        summary = appendSkillProgress(summary, passiveSkill, progress);
    }

    return { summary, unlockedSkills };
}

function calculateCombatResistanceXp({
    damageTaken = 0,
    monsterLevel = 1,
    towerTier = 1,
    victory = false
} = {}) {
    const safeDamage = Math.max(0, Number(damageTaken) || 0);
    if (safeDamage <= 0) return 0;

    const safeLevel = Math.max(1, Number(monsterLevel) || 1);
    const safeTier = Math.max(1, Number(towerTier) || 1);
    const victoryBonus = victory ? 1 : 0;
    const raw = (Math.sqrt(safeDamage) * 0.9) + (safeLevel * 0.35) + ((safeTier - 1) * 0.7) + victoryBonus;
    return Math.max(2, Math.min(30, Math.round(raw)));
}

async function grantCombatResistanceXpFromDamageTypes(profileId, damageByMainType = {}, context = {}) {
    const physicalDamage = Math.max(0, Number(damageByMainType?.Physical) || 0);
    const magicDamage = Math.max(0, Number(damageByMainType?.Magic) || 0);
    if (physicalDamage <= 0 && magicDamage <= 0) {
        return { summary: {}, unlockedSkills: [] };
    }

    const wantedSkillNames = ['Magic Resistance', 'Physical Resistance'];
    const userSkills = await UserSkills.findAll({
        where: { profileId },
        include: [{
            model: Skills,
            where: {
                [Op.or]: wantedSkillNames.map((skillName) =>
                    sequelize.where(
                        sequelize.fn('lower', sequelize.col('name')),
                        String(skillName).toLowerCase()
                    )
                )
            }
        }]
    });

    let summary = {};
    for (const userSkill of userSkills) {
        const passiveSkill = userSkill.Skill;
        const lowerName = String(passiveSkill?.name || '').toLowerCase().trim();
        if (!passiveSkill?.id || !lowerName) continue;

        let triggeredDamage = 0;
        if (lowerName === 'magic resistance') {
            triggeredDamage = magicDamage;
        } else if (lowerName === 'physical resistance') {
            triggeredDamage = physicalDamage;
        }
        if (triggeredDamage <= 0) continue;

        const gainedXp = calculateCombatResistanceXp({
            damageTaken: triggeredDamage,
            monsterLevel: context.monsterLevel || 1,
            towerTier: context.towerTier || 1,
            victory: !!context.victory
        });
        const progress = await grantSkillXp(profileId, passiveSkill.id, gainedXp);
        summary = appendSkillProgress(summary, passiveSkill, progress);
    }

    return { summary, unlockedSkills: [] };
}

module.exports = {
    grantResistanceXpFromStatusDamage,
    grantEnhancementXpFromStatusDamage,
    grantCombatResistanceXpFromDamageTypes,
    collectUnlockedSkillsFromSummary,
    sendObtainedSkillsEphemeral
};
