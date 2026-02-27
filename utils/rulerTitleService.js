const { sequelize, Titles, UserTitles, TitleSkills, UserSkills, Skills, FightProgress } = require('../database');

const GLOBAL_REQUIREMENTS = {
    minLevel: 25,
    tabooLevel: 5
};

const RULER_REQUIREMENTS = {
    'Ruler Of Pride': {
        skills: [{ name: 'Heretic Magic', level: 10 }, { name: 'Evil Eye Attack', level: 10 }],
        objective: { type: 'tier_stage', tier: 5, stage: 10 }
    },
    'Ruler Of Wrath': {
        skills: [{ name: 'Herculean Strength', level: 8 }, { name: 'Destruction Enhancement', level: 8 }],
        objective: { type: 'win_streak', count: 25 }
    },
    'Ruler Of Greed': {
        skills: [{ name: 'Appraisal', level: 8 }, { name: 'Thread Control', level: 8 }],
        objective: { type: 'tier_stage', tier: 6, stage: 5 }
    },
    'Ruler Of Lust': {
        skills: [{ name: 'Jinx Evil Eye', level: 7 }, { name: 'Stealth', level: 8 }],
        objective: { type: 'status_inflicted_total', count: 200 }
    },
    'Ruler Of Envy': {
        skills: [{ name: 'Divine Scales', level: 7 }, { name: 'Protection', level: 8 }],
        objective: { type: 'damage_taken_survived_total', count: 10000 }
    },
    'Ruler Of Gluttony': {
        skills: [{ name: 'Poison Synthesis', level: 8 }, { name: 'Poison Enhancement', level: 8 }],
        objective: { type: 'poison_damage_total', count: 25000 }
    },
    'Ruler Of Sloth': {
        skills: [{ name: 'Sturdy', level: 8 }, { name: 'MP Recovery Speed', level: 8 }],
        objective: { type: 'wins_above_70hp', count: 30 }
    },
    'Ruler Of Temperance': {
        skills: [{ name: 'Record', level: 8 }, { name: 'Mental Warfare', level: 7 }],
        objective: { type: 'tier_stage', tier: 6, stage: 10 }
    },
    'Ruler Of Mercy': {
        skills: [{ name: 'Concealment', level: 8 }, { name: 'Silence', level: 8 }],
        objective: { type: 'elite_wins', count: 20 }
    },
    'Ruler Of Diligence': {
        skills: [{ name: 'Tactile Enhancement', level: 7 }, { name: 'Energy Conferment', level: 7 }],
        objective: { type: 'total_battles', count: 150 }
    },
    'Ruler Of Humility': {
        skills: [{ name: 'Night Vision', level: 8 }, { name: 'Heresy Resistance', level: 7 }],
        objective: { type: 'reach_level', level: 35 }
    },
    'Ruler Of Chastity': {
        skills: [{ name: 'Faint Resistance', level: 7 }, { name: 'Paralysis Resistance', level: 7 }],
        objective: { type: 'status_damage_ticks_taken', count: 300 }
    },
    'Ruler Of Wisdom': {
        skills: [{ name: 'Height Of Occultism', level: 10 }, { name: 'Magic Attack', level: 8 }],
        objective: { type: 'tier_stage', tier: 7, stage: 5 }
    }
};

function defaultProgress() {
    return {
        winStreak: 0,
        totalBattles: 0,
        eliteWins: 0,
        winsAbove70Hp: 0,
        statusInflictedTotal: 0,
        statusDamageTicksTaken: 0,
        poisonDamageTotal: 0,
        damageTakenSurvivedTotal: 0,
        highestTier: 1,
        highestStageInTier: 1
    };
}

function normalizeProgress(raw) {
    const base = defaultProgress();
    const src = raw && typeof raw === 'object' ? raw : {};
    for (const key of Object.keys(base)) {
        base[key] = Math.max(0, Number(src[key]) || 0);
    }
    return base;
}

function countStatusTicks(statusDamageByType) {
    const entries = Object.entries(statusDamageByType || {});
    let count = 0;
    for (const [, damage] of entries) {
        if ((Number(damage) || 0) > 0) count++;
    }
    return count;
}

function reachedTierStage(targetTier, targetStage, highestTier, highestStageInTier) {
    if (highestTier > targetTier) return true;
    if (highestTier < targetTier) return false;
    return highestStageInTier >= targetStage;
}

function getObjectiveProgress(req, progress, level) {
    const objective = req.objective || {};
    switch (objective.type) {
    case 'win_streak':
        return progress.winStreak;
    case 'status_inflicted_total':
        return progress.statusInflictedTotal;
    case 'damage_taken_survived_total':
        return progress.damageTakenSurvivedTotal;
    case 'poison_damage_total':
        return progress.poisonDamageTotal;
    case 'wins_above_70hp':
        return progress.winsAbove70Hp;
    case 'elite_wins':
        return progress.eliteWins;
    case 'total_battles':
        return progress.totalBattles;
    case 'reach_level':
        return level;
    case 'status_damage_ticks_taken':
        return progress.statusDamageTicksTaken;
    case 'tier_stage':
        return reachedTierStage(
            objective.tier,
            objective.stage,
            progress.highestTier,
            progress.highestStageInTier
        )
            ? 1
            : 0;
    default:
        return 0;
    }
}

function objectiveReached(req, progress, level) {
    const objective = req.objective || {};
    const current = getObjectiveProgress(req, progress, level);
    if (objective.type === 'tier_stage') return current >= 1;
    if (objective.type === 'reach_level') return current >= (objective.level || 1);
    return current >= (objective.count || 1);
}

function hasRequiredSkillLevels(reqSkills, skillLevelByName) {
    for (const requirement of reqSkills || []) {
        const key = String(requirement.name || '').toLowerCase().trim();
        const currentLevel = Math.max(0, Number(skillLevelByName.get(key)) || 0);
        if (currentLevel < (requirement.level || 1)) return false;
    }
    return true;
}

async function grantTitleSkills(profileId, titleId, transaction) {
    const links = await TitleSkills.findAll({ where: { titleId }, transaction });
    for (const link of links) {
        const skill = await Skills.findByPk(link.skillId, { transaction });
        if (!skill) continue;

        const existing = await UserSkills.findOne({
            where: { profileId, skillId: skill.id },
            transaction
        });

        if (existing) {
            existing.level = Math.max(1, Number(existing.level) || 1) + 1;
            await existing.save({ transaction });
            continue;
        }

        await UserSkills.create({
            profileId,
            skillId: skill.id,
            name: skill.name,
            type: skill.type,
            effect_type_main: skill.effect_type_main,
            effect_type_specific: skill.effect_type_specific,
            description: skill.description,
            sp_cost: skill.sp_cost,
            mp_cost: skill.mp_cost,
            cooldown: skill.cooldown,
            power: skill.power,
            level: 1,
            xp: 0
        }, { transaction });
    }
}

async function processRulerProgress(profile, context = {}) {
    if (!profile?.id) return [];

    return sequelize.transaction(async (transaction) => {
        const txProfile = await profile.constructor.findByPk(profile.id, { transaction });
        if (!txProfile) return [];

        const progress = normalizeProgress(txProfile.rulerProgress);
        const isBattleEnd = !!context.isBattleEnd;
        const isVictory = !!context.victory;
        const isDefeat = !!context.defeat;

        const statusInflictedTicks = Math.max(0, Number(context.statusInflictedTicks) || 0);
        const statusTicksTaken = Math.max(0, Number(context.statusTicksTaken) || 0);
        const poisonDamageDealt = Math.max(0, Number(context.poisonDamageDealt) || 0);
        const damageTakenThisTurn = Math.max(0, Number(context.damageTakenThisTurn) || 0);

        progress.statusInflictedTotal += statusInflictedTicks;
        progress.statusDamageTicksTaken += statusTicksTaken;
        progress.poisonDamageTotal += poisonDamageDealt;

        if (isBattleEnd) {
            progress.totalBattles += 1;
            if (isVictory) {
                progress.winStreak += 1;

                const playerHpRatio = Math.max(0, Number(context.playerHpRatioAfterBattle) || 0);
                if (playerHpRatio >= 0.7) {
                    progress.winsAbove70Hp += 1;
                }

                const rarity = String(context.monsterRarity || '').toLowerCase().trim();
                if (rarity === 'elite') {
                    progress.eliteWins += 1;
                }

                const tier = Math.max(1, Number(context.tierBeforeUpdate) || 1);
                const stage = Math.max(1, Number(context.stageBeforeUpdate) || 1);
                if (tier > progress.highestTier) {
                    progress.highestTier = tier;
                    progress.highestStageInTier = stage;
                } else if (tier === progress.highestTier && stage > progress.highestStageInTier) {
                    progress.highestStageInTier = stage;
                }
            }

            if (isDefeat) {
                progress.winStreak = 0;
            }
        }

        if (!isDefeat && damageTakenThisTurn > 0) {
            progress.damageTakenSurvivedTotal += damageTakenThisTurn;
        }

        txProfile.rulerProgress = progress;
        await txProfile.save({ transaction });

        const [allSkills, allRulerTitles, ownedTitles, fightProgress] = await Promise.all([
            UserSkills.findAll({
                where: { profileId: txProfile.id },
                include: [{ model: Skills, as: 'Skill', attributes: ['name'] }],
                transaction
            }),
            Titles.findAll({ where: { name: Object.keys(RULER_REQUIREMENTS) }, transaction }),
            UserTitles.findAll({ where: { profileId: txProfile.id }, transaction }),
            FightProgress.findOne({ where: { profileId: txProfile.id }, transaction })
        ]);

        const levelNow = Math.max(1, Number(context.levelAfterUpdate) || Number(txProfile.level) || 1);
        const tabooLevel = Math.max(
            0,
            ...allSkills
                .filter((s) => String(s.Skill?.name || s.name || '').toLowerCase().trim() === 'taboo')
                .map((s) => Number(s.level) || 0)
        );

        if (levelNow < GLOBAL_REQUIREMENTS.minLevel || tabooLevel < GLOBAL_REQUIREMENTS.tabooLevel) {
            return [];
        }

        if (fightProgress) {
            if (fightProgress.tier > progress.highestTier) {
                progress.highestTier = fightProgress.tier;
                progress.highestStageInTier = fightProgress.stage;
            } else if (fightProgress.tier === progress.highestTier && fightProgress.stage > progress.highestStageInTier) {
                progress.highestStageInTier = fightProgress.stage;
            }
            txProfile.rulerProgress = progress;
            await txProfile.save({ transaction });
        }

        const skillLevelByName = new Map(
            allSkills.map((s) => [
                String(s.Skill?.name || s.name || '').toLowerCase().trim(),
                Math.max(0, Number(s.level) || 0)
            ])
        );
        const ownedTitleIds = new Set(ownedTitles.map((t) => t.titleId));

        const titleByName = new Map(allRulerTitles.map((t) => [String(t.name || '').trim(), t]));
        const unlockedNames = [];

        for (const [titleName, requirement] of Object.entries(RULER_REQUIREMENTS)) {
            const title = titleByName.get(titleName);
            if (!title) continue;
            if (ownedTitleIds.has(title.id)) continue;

            if (!hasRequiredSkillLevels(requirement.skills, skillLevelByName)) continue;
            if (!objectiveReached(requirement, progress, levelNow)) continue;

            await UserTitles.create({
                profileId: txProfile.id,
                titleId: title.id
            }, { transaction });

            await grantTitleSkills(txProfile.id, title.id, transaction);
            ownedTitleIds.add(title.id);
            unlockedNames.push(title.name);
        }

        return unlockedNames;
    });
}

module.exports = {
    processRulerProgress,
    countStatusTicks,
    GLOBAL_REQUIREMENTS,
    RULER_REQUIREMENTS
};
