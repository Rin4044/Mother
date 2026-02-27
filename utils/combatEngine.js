// ===============================
// Universal Combat Engine
// ===============================

function calculateScaling(monster, tier, stage) {

    const tierMultiplier = 1 + (tier - 1) * 0.22;
    const stageMultiplier = 1 + (stage - 1) * 0.02;

    const hpMultiplier = tierMultiplier * stageMultiplier;
    const statMultiplier = (1 + (tier - 1) * 0.14) * (1 + (stage - 1) * 0.01);

    return {
        hpMultiplier,
        stats: {
            hp: Math.floor(monster.hp * hpMultiplier),
            mp: Math.floor(monster.mp * hpMultiplier),
            stamina: Math.floor(monster.stamina * hpMultiplier),
            vitalStamina: Math.floor(monster.vitalStamina * hpMultiplier),

            offense: Math.floor(monster.offense * statMultiplier),
            defense: Math.floor(monster.defense * statMultiplier),
            magic: Math.floor(monster.magic * statMultiplier),
            resistance: Math.floor(monster.resistance * statMultiplier),

            speed: monster.speed
        }
    };
}

// ===============================
// TURN ORDER
// ===============================

function getTurnOrder(speedA, speedB) {

    if (speedA >= speedB * 2)
        return { aTurns: 2, bTurns: 1 };

    if (speedB >= speedA * 2)
        return { aTurns: 1, bTurns: 2 };

    return { aTurns: 1, bTurns: 1 };
}

function consumeStaminaWithVital(entity, staminaCost = 0) {

    if (!staminaCost || staminaCost <= 0)
        return;

    const reductionPct = Math.max(
        0,
        Math.min(90, Number(entity?.rulerPassives?.costReductionPct) || 0)
    );
    const effectiveCost = Math.max(0, Math.ceil(staminaCost * (1 - (reductionPct / 100))));
    if (effectiveCost <= 0) return;

    if (entity.stamina >= effectiveCost) {
        entity.stamina -= effectiveCost;
        return;
    }

    const deficit = effectiveCost - Math.max(0, entity.stamina);
    entity.stamina = 0;
    entity.vitalStamina = Math.max(0, (entity.vitalStamina || 0) - deficit);
}

function consumeMp(entity, mpCost = 0) {
    if (!mpCost || mpCost <= 0)
        return true;

    const reductionPct = Math.max(
        0,
        Math.min(90, Number(entity?.rulerPassives?.costReductionPct) || 0)
    );
    const effectiveCost = Math.max(0, Math.ceil(mpCost * (1 - (reductionPct / 100))));
    if (effectiveCost <= 0) return true;

    const currentMp = Math.max(0, entity.mp || 0);
    if (currentMp >= effectiveCost) {
        entity.mp = currentMp - effectiveCost;
        return true;
    }

    const deficit = effectiveCost - currentMp;
    entity.mp = 0;
    entity.vitalStamina = Math.max(0, (entity.vitalStamina || 0) - deficit);

    return true;
}

function applyVitalDeath(entity) {
    if ((entity.vitalStamina || 0) > 0)
        return false;

    entity.vitalStamina = 0;
    entity.hp = 0;
    return true;
}

// ===============================
// DAMAGE CALCULATION
// ===============================

function calculateDamage(attacker, defender, skill) {

    let attackStat = 0;
    let defenseStat = 0;

    if (skill.effect_type_main === 'Physical') {
        attackStat = getEffectiveStat(attacker, 'offense');
        defenseStat = getEffectiveStat(defender, 'defense');
    }

    if (skill.effect_type_main === 'Magic') {
        attackStat = getEffectiveStat(attacker, 'magic');
        defenseStat = getEffectiveStat(defender, 'resistance');
    }

    if (attackStat <= 0)
        return 0;

    const multiplier = 1 + ((skill.power || 0) * 0.1);

    let rawDamage = attackStat * multiplier;

    const attackerPassives = attacker?.rulerPassives || {};
    const hpRatio = getHpRatio(attacker);

    let outgoingBonusPct = 0;
    if (hpRatio >= 0.7) {
        outgoingBonusPct += Math.max(0, Number(attackerPassives.damageBonusHighHpPct) || 0);
    }
    if (hpRatio <= 0.5) {
        outgoingBonusPct += Math.max(0, Number(attackerPassives.damageBonusLowHpPct) || 0);
    }
    if (skill.effect_type_main === 'Magic') {
        outgoingBonusPct += Math.max(0, Number(attackerPassives.magicDamageBonusPct) || 0);
    }
    if (outgoingBonusPct > 0) {
        rawDamage *= 1 + (outgoingBonusPct / 100);
    }

    const reducedDamage = rawDamage * (100 / (100 + defenseStat));

    return Math.max(0, Math.floor(reducedDamage));
}

function getHpRatio(entity) {
    const hp = Math.max(0, Number(entity?.hp) || 0);
    const maxHp = Math.max(1, Number(entity?.maxHp) || hp || 1);
    return Math.max(0, Math.min(1, hp / maxHp));
}

function getEffectiveStat(entity, statName) {
    const base = Math.max(0, Number(entity?.[statName]) || 0);
    const debuffPct = Math.max(0, Math.min(60, Number(entity?.tempDebuffs?.[statName]) || 0));
    const buffPct = Math.max(0, Math.min(60, Number(entity?.tempBuffs?.[statName]) || 0));
    const withDebuff = base * (1 - (debuffPct / 100));
    const withBuff = withDebuff * (1 + (buffPct / 100));
    return Math.max(0, Math.floor(withBuff));
}

function ensureCombatRuntimeState(entity) {
    if (!entity) return;
    if (!entity.tempDebuffs) entity.tempDebuffs = {};
    if (!entity.tempBuffs) entity.tempBuffs = {};
    if (typeof entity.shield !== 'number') entity.shield = 0;
}

function addTempDebuff(entity, statName, percent) {
    ensureCombatRuntimeState(entity);
    const current = Math.max(0, Number(entity.tempDebuffs[statName]) || 0);
    entity.tempDebuffs[statName] = Math.min(60, current + Math.max(0, Number(percent) || 0));
}

function addTempBuff(entity, statName, percent) {
    ensureCombatRuntimeState(entity);
    const current = Math.max(0, Number(entity.tempBuffs[statName]) || 0);
    entity.tempBuffs[statName] = Math.min(60, current + Math.max(0, Number(percent) || 0));
}

function gainShield(entity, amount) {
    ensureCombatRuntimeState(entity);
    const current = Math.max(0, Number(entity.shield) || 0);
    entity.shield = Math.max(0, current + Math.max(0, Number(amount) || 0));
}

function applyIncomingDamage(target, rawDamage) {
    ensureCombatRuntimeState(target);
    let damage = Math.max(0, Number(rawDamage) || 0);
    if (damage <= 0) return 0;

    const passives = target?.rulerPassives || {};
    const hpRatio = getHpRatio(target);
    let reductionPct = Math.max(0, Number(passives.baseDamageReductionPct) || 0);

    if (hpRatio <= 0.35) {
        reductionPct += Math.max(0, Number(passives.lowHpDamageReductionPct) || 0);
    }

    if (reductionPct > 0) {
        damage *= Math.max(0, 1 - (Math.min(90, reductionPct) / 100));
    }

    if (hpRatio <= 0.5) {
        const vulnPct = Math.max(0, Number(passives.lowHpVulnerabilityPct) || 0);
        if (vulnPct > 0) {
            damage *= 1 + (Math.min(90, vulnPct) / 100);
        }
    }

    damage = Math.max(0, Math.floor(damage));

    const shield = Math.max(0, Number(target.shield) || 0);
    if (shield > 0) {
        const absorbed = Math.min(shield, damage);
        target.shield = shield - absorbed;
        damage -= absorbed;
    }

    target.hp = Math.max(0, Math.floor((target.hp || 0) - damage));
    return Math.max(0, Math.floor(damage));
}

// ===============================
// START COMBAT (PVP VERSION)
// ===============================

function startCombat({ attackerStats, defenderStats, attackerCombat, defenderCombat, skill }) {

    const updatedAttacker = {
        ...attackerCombat,
        stamina: attackerCombat.stamina,
        vitalStamina: attackerCombat.vitalStamina,
        mp: attackerCombat.mp
    };

    consumeMp(updatedAttacker, skill.mp_cost || 0);
    if (applyVitalDeath(updatedAttacker)) {
        return {
            totalDamage: 0,
            skillUsed: false,
            updatedAttacker,
            updatedDefender: { ...defenderCombat }
        };
    }

    consumeStaminaWithVital(updatedAttacker, skill.sp_cost || 0);
    if (applyVitalDeath(updatedAttacker)) {
        return {
            totalDamage: 0,
            skillUsed: false,
            updatedAttacker,
            updatedDefender: { ...defenderCombat }
        };
    }

    const damage = calculateDamage(attackerStats, defenderStats, skill);
    ensureCombatRuntimeState(updatedAttacker);

    const updatedDefender = {
        ...defenderCombat,
        hp: defenderCombat.hp
    };
    ensureCombatRuntimeState(updatedDefender);

    const finalDamage = applyIncomingDamage(updatedDefender, damage);
    applyEvilEyeSpecialEffect(skill, updatedAttacker, updatedDefender, null);

    return {
        totalDamage: finalDamage,
        skillUsed: true,
        updatedAttacker,
        updatedDefender
    };
}

// ===============================
// STATUS SYSTEM (MULTI EFFECT)
// ===============================

function applyStatusEffect(skill, attacker, target) {

    if (!skill.effect_type_specific) return;

    const effectMap = {
        Poison: { duration: 3, scale: 0.15 },
        Fire: { duration: 2, scale: 0.10 },
        Cutting: { duration: 2, scale: 0.08 },
        Rot: { duration: 4, scale: 0.20 }
    };

    const config = effectMap[skill.effect_type_specific];
    if (!config) return;

    const chance = 0.2;
    if (Math.random() > chance) return;

    if (!target.effects)
        target.effects = [];

    const enhancementMultiplier = getStatusEnhancementMultiplier(attacker, skill.effect_type_specific);
    const enhancedDamage = Math.floor(Math.max(0, Math.floor(attacker.magic * config.scale)) * enhancementMultiplier);

    const effectType = String(skill.effect_type_specific);
    const existing = (target.effects || []).find((e) => String(e?.type) === effectType);

    if (existing) {
        // Refresh instead of stacking duplicate same-type DoT instances.
        existing.duration = Math.max(Number(existing.duration) || 0, config.duration);
        existing.damage = Math.max(Number(existing.damage) || 0, Math.max(0, enhancedDamage));
        // Keep current tick cadence when refreshing an existing effect.
        return;
    }

    target.effects.push({
        type: effectType,
        duration: config.duration,
        damage: Math.max(0, enhancedDamage),
        justApplied: true
    });
}

function processStatusDamage(entity, label, log, statusDamageByType = null) {

    if (!entity.effects || entity.effects.length === 0)
        return;

    const remainingEffects = [];

    for (const effect of entity.effects) {
        if (effect.justApplied) {
            effect.justApplied = false;
            remainingEffects.push(effect);
            continue;
        }

        const baseDamage = Math.max(0, Number(effect.damage) || 0);
        const reductionPercent = getStatusResistancePercent(entity, effect.type);
        const finalDamage = Math.max(
            0,
            Math.floor(baseDamage * (1 - (Math.min(100, reductionPercent) / 100)))
        );

        const hpDamage = applyIncomingDamage(entity, finalDamage);
        if (hpDamage <= 0 && reductionPercent >= 100) {
            log.push(`${label} nullified ${effect.type} tick`);
        } else {
            log.push(`${label} suffers ${effect.type} tick: -${hpDamage} HP`);
        }
        if (statusDamageByType) {
            const effectType = String(effect.type || 'Other');
            statusDamageByType[effectType] = (statusDamageByType[effectType] || 0) + hpDamage;
        }

        const newDuration = effect.duration - 1;

        if (newDuration > 0) {
            remainingEffects.push({
                ...effect,
                duration: newDuration
            });
        }
    }

    entity.effects = remainingEffects;
}

function getStatusEnhancementMultiplier(entity, effectType) {
    const key = String(effectType || '').trim();
    if (!key) return 1;

    const enhancementMap = entity?.statusEnhancement || {};
    const bonusPercent = Math.max(0, Number(enhancementMap[key]) || 0);
    return 1 + (bonusPercent / 100);
}

function getStatusResistancePercent(entity, effectType) {
    const key = String(effectType || '').trim();
    if (!key) return 0;

    const resistanceMap = entity?.statusResistance || {};
    const resistPercent = Math.max(0, Number(resistanceMap[key]) || 0);
    return Math.min(100, resistPercent);
}

// ===============================
// EXECUTE TURN
// ===============================

const BASIC_MONSTER_ATTACK = {
    name: 'Hit',
    effect_type_main: 'Physical',
    effect_type_specific: 'Other',
    mp_cost: 0,
    sp_cost: 0,
    power: 1
};

function executeTurn(state, skillA, skillPoolB) {

    const log = [];
    let playerSkillUses = 0;
    let playerDamageDone = 0;
    const statusDamageTaken = { player: {}, enemy: {} };
    ensureCombatRuntimeState(state.entityA);
    ensureCombatRuntimeState(state.entityB);
    const { aTurns, bTurns } =
        getTurnOrder(state.entityA.speed, state.entityB.speed);

    // ===== ENTITY A =====

    for (let i = 0; i < aTurns; i++) {

        consumeMp(state.entityA, skillA.mp_cost || 0);
        if (applyVitalDeath(state.entityA))
            return { victory: false, defeat: true, log, state, playerSkillUses };

        consumeStaminaWithVital(state.entityA, skillA.sp_cost || 0);
        if (applyVitalDeath(state.entityA))
            return { victory: false, defeat: true, log, state, playerSkillUses };

        const damage = calculateDamage(state.entityA, state.entityB, skillA);
        const finalDamage = applyIncomingDamage(state.entityB, damage);
        playerSkillUses++;
        playerDamageDone += finalDamage;

        log.push(`Used ${skillA.name} -> ${finalDamage} damage`);

        applyOnHitRulerPassives(state.entityA, state.entityB, finalDamage, log, false);
        applyOnDamagedRulerPassives(state.entityB, finalDamage, log, true);

        applyStatusEffect(skillA, state.entityA, state.entityB);
        applyEvilEyeSpecialEffect(skillA, state.entityA, state.entityB, log);

        if (state.entityB.hp <= 0)
            return { victory: true, defeat: false, log, state, playerSkillUses, playerDamageDone };
    }

    // ===== ENTITY B =====

    for (let i = 0; i < bTurns; i++) {

        const skillB = chooseSkill(skillPoolB) || BASIC_MONSTER_ATTACK;

        consumeMp(state.entityB, skillB.mp_cost || 0);
        if (applyVitalDeath(state.entityB))
            return { victory: true, defeat: false, log, state, playerSkillUses, playerDamageDone };

        consumeStaminaWithVital(state.entityB, skillB.sp_cost || 0);
        if (applyVitalDeath(state.entityB))
            return { victory: true, defeat: false, log, state, playerSkillUses, playerDamageDone };

        const damage = calculateDamage(state.entityB, state.entityA, skillB);
        const finalDamage = applyIncomingDamage(state.entityA, damage);

        log.push(`Enemy used ${skillB.name} -> ${finalDamage} damage`);

        applyOnHitRulerPassives(state.entityB, state.entityA, finalDamage, log, true);
        applyOnDamagedRulerPassives(state.entityA, finalDamage, log, false);

        applyStatusEffect(skillB, state.entityB, state.entityA);
        applyEvilEyeSpecialEffect(skillB, state.entityB, state.entityA, log, true);

        if (state.entityA.hp <= 0)
            return { victory: false, defeat: true, log, state, playerSkillUses, playerDamageDone };
    }

    processStatusDamage(state.entityA, 'Player', log, statusDamageTaken.player);
    if (state.entityA.hp <= 0)
        return { victory: false, defeat: true, log, state, playerSkillUses, playerDamageDone, statusDamageTaken };

    processStatusDamage(state.entityB, 'Enemy', log, statusDamageTaken.enemy);
    if (state.entityB.hp <= 0)
        return { victory: true, defeat: false, log, state, playerSkillUses, playerDamageDone, statusDamageTaken };

    applyEndTurnRulerRegen(state.entityA, log, false);
    applyEndTurnRulerRegen(state.entityB, log, true);

    return {
        victory: false,
        defeat: false,
        log,
        state,
        playerSkillUses,
        playerDamageDone,
        statusDamageTaken
    };
}

function applyOnHitRulerPassives(attacker, target, finalDamage, log = null, isEnemy = false) {
    const dmg = Math.max(0, Number(finalDamage) || 0);
    if (dmg <= 0) return;

    const passives = attacker?.rulerPassives || {};
    const actor = isEnemy ? 'Enemy' : 'You';

    const lifestealPct = Math.max(0, Number(passives.lifestealPct) || 0);
    if (lifestealPct > 0) {
        const heal = Math.max(0, Math.floor(dmg * (Math.min(50, lifestealPct) / 100)));
        if (heal > 0) {
            const maxHp = Math.max(1, Number(attacker?.maxHp) || Number(attacker?.hp) || 1);
            attacker.hp = Math.min(maxHp, Math.max(0, Number(attacker.hp) || 0) + heal);
            if (log) log.push(`${actor} drained life: +${heal} HP`);
        }
    }

    const shieldOnHitPct = Math.max(0, Number(passives.shieldOnHitPct) || 0);
    if (shieldOnHitPct > 0) {
        const shield = Math.max(0, Math.floor(dmg * (Math.min(60, shieldOnHitPct) / 100)));
        if (shield > 0) {
            gainShield(attacker, shield);
            if (log) log.push(`${actor} converted damage to shield: +${shield}`);
        }
    }

    const resourceLeechPct = Math.max(0, Number(passives.resourceLeechPct) || 0);
    if (resourceLeechPct > 0) {
        const pool = Math.max(0, Math.floor(dmg * (Math.min(40, resourceLeechPct) / 100)));
        if (pool > 0) {
            const wantedMp = Math.floor(pool * 0.6);
            const wantedSp = pool - wantedMp;
            const stolenMp = Math.min(Math.max(0, Number(target?.mp) || 0), wantedMp);
            const stolenSp = Math.min(Math.max(0, Number(target?.stamina) || 0), wantedSp);
            target.mp = Math.max(0, Number(target?.mp) || 0) - stolenMp;
            target.stamina = Math.max(0, Number(target?.stamina) || 0) - stolenSp;

            const maxMp = Math.max(1, Number(attacker?.maxMp) || Number(attacker?.mp) || 1);
            const maxSp = Math.max(1, Number(attacker?.maxStamina) || Number(attacker?.stamina) || 1);
            attacker.mp = Math.min(maxMp, Math.max(0, Number(attacker?.mp) || 0) + stolenMp);
            attacker.stamina = Math.min(maxSp, Math.max(0, Number(attacker?.stamina) || 0) + stolenSp);

            if (log && (stolenMp > 0 || stolenSp > 0)) {
                log.push(`${actor} leeched resources: MP +${stolenMp}, SP +${stolenSp}`);
            }
        }
    }
}

function applyOnDamagedRulerPassives(target, finalDamage, log = null, isEnemy = false) {
    const dmg = Math.max(0, Number(finalDamage) || 0);
    if (dmg <= 0) return;
    const passives = target?.rulerPassives || {};
    const onHitShieldPct = Math.max(0, Number(passives.onHitShieldPct) || 0);
    if (onHitShieldPct <= 0) return;

    const gained = Math.max(0, Math.floor(dmg * (Math.min(50, onHitShieldPct) / 100)));
    if (gained <= 0) return;
    gainShield(target, gained);
    if (log) log.push(`${isEnemy ? 'Enemy' : 'You'} formed reactive shield: +${gained}`);
}

function applyEndTurnRulerRegen(entity, log = null, isEnemy = false) {
    const passives = entity?.rulerPassives || {};
    const regenPct = Math.max(0, Number(passives.endTurnRegenPct) || 0);
    if (regenPct <= 0) return;

    const maxMp = Math.max(1, Number(entity?.maxMp) || Number(entity?.mp) || 1);
    const maxStamina = Math.max(1, Number(entity?.maxStamina) || Number(entity?.stamina) || 1);
    const mpGain = Math.max(0, Math.floor(maxMp * (Math.min(30, regenPct) / 100)));
    const spGain = Math.max(0, Math.floor(maxStamina * (Math.min(30, regenPct) / 100)));
    if (mpGain <= 0 && spGain <= 0) return;

    entity.mp = Math.min(maxMp, Math.max(0, Number(entity?.mp) || 0) + mpGain);
    entity.stamina = Math.min(maxStamina, Math.max(0, Number(entity?.stamina) || 0) + spGain);
    if (log) log.push(`${isEnemy ? 'Enemy' : 'You'} regenerated: MP +${mpGain}, SP +${spGain}`);
}

function applyEvilEyeSpecialEffect(skill, attacker, target, log = null, isEnemy = false) {
    const name = String(skill?.name || '').toLowerCase().trim();
    if (!name.includes('evil eye')) return;

    const actor = isEnemy ? 'Enemy' : 'You';

    const drainResources = (hpPct, mpPct, spPct) => {
        const hpDrain = Math.max(0, Math.floor((target.hp || 0) * hpPct));
        const mpDrain = Math.max(0, Math.floor((target.mp || 0) * mpPct));
        const spDrain = Math.max(0, Math.floor((target.stamina || 0) * spPct));

        target.hp = Math.max(0, (target.hp || 0) - hpDrain);
        target.mp = Math.max(0, (target.mp || 0) - mpDrain);
        target.stamina = Math.max(0, (target.stamina || 0) - spDrain);

        attacker.hp = Math.max(0, (attacker.hp || 0) + Math.floor(hpDrain * 0.35));
        attacker.mp = Math.max(0, (attacker.mp || 0) + Math.floor(mpDrain * 0.35));
        attacker.stamina = Math.max(0, (attacker.stamina || 0) + Math.floor(spDrain * 0.35));

        if (log) {
            log.push(
                `${actor} drained with ${skill.name}: ` +
                `HP ${hpDrain}, MP ${mpDrain}, SP ${spDrain}`
            );
        }
    };

    // Big named Evil Eyes
    if (name.includes('evil eye of grudge')) return drainResources(0.06, 0.10, 0.10);
    if (name.includes('evil eye of panic')) {
        addTempDebuff(target, 'offense', 18);
        addTempDebuff(target, 'magic', 18);
        if (log) log.push(`${actor} inflicted panic: enemy power reduced`);
        return;
    }
    if (name.includes('evil eye of static')) {
        addTempDebuff(target, 'defense', 15);
        addTempDebuff(target, 'resistance', 15);
        if (log) log.push(`${actor} disrupted defenses with static`);
        return;
    }
    if (name.includes('evil eye of attraction and repulsion')) {
        const shield = Math.max(25, Math.floor(getEffectiveStat(attacker, 'magic') * 0.18));
        gainShield(attacker, shield);
        addTempDebuff(target, 'offense', 8);
        if (log) log.push(`${actor} gained repel shield +${shield} and reduced enemy offense`);
        return;
    }
    if (name.includes('evil eye of extinction') || name.includes('extinction evil eye')) {
        const burst = Math.max(10, Math.floor(getEffectiveStat(attacker, 'magic') * 0.06));
        const burstDone = applyIncomingDamage(target, burst);
        if (!target.effects) target.effects = [];
        const rotTick = Math.max(5, Math.floor(getEffectiveStat(attacker, 'magic') * 0.06));
        const existingRot = target.effects.find((e) => String(e?.type) === 'Rot');
        if (existingRot) {
            existingRot.duration = Math.max(Number(existingRot.duration) || 0, 2);
            existingRot.damage = Math.max(Number(existingRot.damage) || 0, rotTick);
            // Refresh only; do not reset tick cadence.
        } else {
            target.effects.push({ type: 'Rot', duration: 2, damage: rotTick, justApplied: true });
        }
        if (log) log.push(`${actor} applied extinction: burst ${burstDone}, rot ${rotTick} for 2 turns`);
        return;
    }

    // Generic Evil Eye variants (balanced utility, no hard CC/skip turn)
    if (name.includes('paralyzing')) {
        addTempDebuff(target, 'speed', 20);
        addTempDebuff(target, 'offense', 8);
        if (log) log.push(`${actor} slowed the target`);
        return;
    }
    if (name.includes('petrifying')) {
        addTempDebuff(target, 'speed', 18);
        addTempDebuff(target, 'defense', 10);
        if (log) log.push(`${actor} stiffened the target`);
        return;
    }
    if (name.includes('heavy')) {
        addTempDebuff(target, 'speed', 25);
        if (log) log.push(`${actor} made the target heavy`);
        return;
    }
    if (name.includes('repellent')) {
        const shield = Math.max(15, Math.floor(getEffectiveStat(attacker, 'magic') * 0.12));
        gainShield(attacker, shield);
        addTempBuff(attacker, 'resistance', 10);
        if (log) log.push(`${actor} repelled force: shield +${shield}, resistance up`);
        return;
    }
    if (name.includes('warped')) {
        addTempDebuff(target, 'offense', 10);
        addTempDebuff(target, 'defense', 10);
        if (log) log.push(`${actor} warped target form`);
        return;
    }
    if (name.includes('discomforting')) {
        const mpLoss = Math.max(5, Math.floor((target.mp || 0) * 0.08));
        const spLoss = Math.max(5, Math.floor((target.stamina || 0) * 0.08));
        target.mp = Math.max(0, (target.mp || 0) - mpLoss);
        target.stamina = Math.max(0, (target.stamina || 0) - spLoss);
        if (log) log.push(`${actor} disrupted resources: MP -${mpLoss}, SP -${spLoss}`);
        return;
    }
    if (name.includes('phantom pain')) {
        const extra = Math.max(8, Math.floor(getEffectiveStat(attacker, 'magic') * 0.04));
        const extraDone = applyIncomingDamage(target, extra);
        if (log) log.push(`${actor} inflicted phantom pain: +${extraDone} bonus damage`);
        return;
    }
    if (name.includes('maddening')) {
        addTempDebuff(target, 'magic', 14);
        addTempDebuff(target, 'resistance', 8);
        if (log) log.push(`${actor} disturbed target focus`);
        return;
    }
    if (name.includes('charming')) {
        addTempDebuff(target, 'offense', 12);
        addTempDebuff(target, 'magic', 12);
        if (log) log.push(`${actor} charmed the target`);
        return;
    }
    if (name.includes('hypnotizing')) {
        addTempDebuff(target, 'defense', 12);
        addTempDebuff(target, 'resistance', 12);
        if (log) log.push(`${actor} opened target defenses`);
        return;
    }
    if (name.includes('fearful')) {
        addTempDebuff(target, 'offense', 16);
        if (log) log.push(`${actor} weakened target resolve`);
        return;
    }
    if (name.includes('cursed')) {
        addTempDebuff(target, 'offense', 8);
        addTempDebuff(target, 'defense', 8);
        addTempDebuff(target, 'magic', 8);
        addTempDebuff(target, 'resistance', 8);
        if (log) log.push(`${actor} applied a curse`);
        return;
    }
    if (name.includes('annihilating')) {
        const burst = Math.max(12, Math.floor(getEffectiveStat(attacker, 'magic') * 0.05));
        const burstDone = applyIncomingDamage(target, burst);
        if (log) log.push(`${actor} triggered annihilation burst: +${burstDone} damage`);
        return;
    }
    if (name.includes('inert')) {
        const mpLoss = Math.max(8, Math.floor((target.mp || 0) * 0.12));
        const spLoss = Math.max(8, Math.floor((target.stamina || 0) * 0.12));
        target.mp = Math.max(0, (target.mp || 0) - mpLoss);
        target.stamina = Math.max(0, (target.stamina || 0) - spLoss);
        if (log) log.push(`${actor} induced inert effect: MP -${mpLoss}, SP -${spLoss}`);
        return;
    }
    if (name.includes('jinx')) {
        addTempDebuff(target, 'offense', 10);
        addTempDebuff(target, 'magic', 10);
        addTempDebuff(target, 'defense', 10);
        if (log) log.push(`${actor} applied jinx`);
        return;
    }

    // Base Evil Eye Attack fallback
    if (name === 'evil eye attack') {
        addTempDebuff(target, 'resistance', 10);
        if (log) log.push(`${actor} pierced magical defenses`);
    }
}

function chooseSkill(skillPool) {
    if (!skillPool || skillPool.length === 0)
        return null;

    const combatSkills = skillPool.filter((skill) =>
        skill &&
        (
            skill.effect_type_main === 'Physical' ||
            skill.effect_type_main === 'Magic'
        )
    );

    if (combatSkills.length === 0)
        return null;

    return combatSkills[Math.floor(Math.random() * combatSkills.length)];
}

module.exports = {
    calculateScaling,
    executeTurn,
    startCombat
};
