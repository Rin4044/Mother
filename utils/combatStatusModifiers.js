function hasNullificationToken(value) {
    const text = String(value || '').toLowerCase();
    return (
        text.includes('nullification') ||
        text.includes('nulification') ||
        text.includes('nulhification') ||
        text.includes('nullify') ||
        text.includes('nulhify')
    );
}

function buildStatusModifiersFromSkills(skills = []) {
    const effects = ['Poison', 'Fire', 'Cutting', 'Rot'];
    const statusResistance = Object.fromEntries(effects.map((effect) => [effect, 0]));
    const statusEnhancement = Object.fromEntries(effects.map((effect) => [effect, 0]));
    const skillLevels = new Map();
    const recovery = { hp: 0, mp: 0, sp: 0 };
    const consumptionReduction = { mp: 0, sp: 0 };
    let hasImmortality = false;

    for (const entry of skills || []) {
        const name = String(entry?.name || entry?.Skill?.name || '').trim();
        if (!name) continue;
        const lowerName = name.toLowerCase();
        const level = Math.max(1, Number(entry?.level) || 1);
        skillLevels.set(lowerName, Math.max(level, Number(skillLevels.get(lowerName)) || 0));
        if (lowerName.includes('immortality')) {
            hasImmortality = true;
        }

        const tier = Math.max(1, Number(entry?.tier || entry?.Skill?.tier) || 1);
        const lower = lowerName;
        const specificLower = String(entry?.effect_type_specific || entry?.Skill?.effect_type_specific || '').toLowerCase().trim();

        let mappedEffect = null;
        if (specificLower === 'poison') mappedEffect = 'Poison';
        else if (specificLower === 'fire') mappedEffect = 'Fire';
        else if (specificLower === 'cutting') mappedEffect = 'Cutting';
        else if (specificLower === 'rot') mappedEffect = 'Rot';

        const hasHpToken = lower.includes('hp');
        const hasMpToken = lower.includes('mp');
        const hasSpToken = lower.includes('sp') || lower.includes('stamina');
        const inferTargets = () => {
            if (hasHpToken) return ['hp'];
            if (hasMpToken) return ['mp'];
            if (hasSpToken) return ['sp'];
            return ['mp', 'sp'];
        };

        if (lower.includes('recovery speed') || lower.includes('rapid recovery') || lower.includes('auto recovery') || lower.includes('ultra fast recovery')) {
            const isUltraFast = lower.includes('ultra fast recovery');
            const isRapid = lower.includes('rapid recovery');
            const regenPct = isUltraFast
                ? Math.min(24, 4 + (1.4 * level))
                : (isRapid
                    ? Math.min(20, 2 + (1.2 * level))
                    : Math.min(12, 1 + (0.7 * level)));
            for (const target of inferTargets()) {
                recovery[target] = Math.max(recovery[target], regenPct);
            }
        }

        if (lower.includes('lessened consumption') || lower.includes('minimized consumption')) {
            const isMinimized = lower.includes('minimized consumption');
            const reductionPct = isMinimized
                ? Math.min(45, 8 + (1.8 * level))
                : Math.min(28, 4 + (1.3 * level));
            for (const target of inferTargets()) {
                if (target === 'mp' || target === 'sp') {
                    consumptionReduction[target] = Math.max(consumptionReduction[target], reductionPct);
                }
            }
        }

        for (const effect of effects) {
            const token = effect.toLowerCase();
            const matchesEffect = mappedEffect === effect || lower.includes(token);
            if (!matchesEffect) continue;

            if (lower.includes('enhancement')) {
                const enhancementPercent = 10 + (3 * level);
                statusEnhancement[effect] = Math.max(statusEnhancement[effect], enhancementPercent);
            }

            const isNullification = hasNullificationToken(lower);
            const isSuperResistance =
                (lower.includes('super') && lower.includes('resistance')) ||
                (tier >= 2 && lower.includes('resistance') && !isNullification);
            const isBaseResistance = lower.includes('resistance');

            if (isNullification) {
                statusResistance[effect] = 100;
                continue;
            }

            if (isSuperResistance) {
                const superResistancePercent = 25 + (3 * level);
                statusResistance[effect] = Math.max(statusResistance[effect], superResistancePercent);
                continue;
            }

            if (isBaseResistance) {
                const baseResistancePercent = 5 + (2 * level);
                statusResistance[effect] = Math.max(statusResistance[effect], baseResistancePercent);
            }
        }
    }

    const getLvl = (skillName) => Math.max(0, Number(skillLevels.get(String(skillName).toLowerCase())) || 0);
    const pride = getLvl('Pride');
    const wrath = getLvl('Wrath');
    const greed = getLvl('Greed');
    const lust = getLvl('Lust');
    const envy = getLvl('Envy');
    const gluttony = getLvl('Gluttony');
    const sloth = getLvl('Sloth');
    const temperance = getLvl('Temperance');
    const mercy = getLvl('Mercy');
    const diligence = getLvl('Diligence');
    const humility = getLvl('Humility');
    const chastity = getLvl('Chastity');
    const wisdom = getLvl('Wisdom');
    const nightVision = getLvl('Night Vision');
    const magicResistanceSkill = getLvl('Magic Resistance');
    const physicalResistanceSkill = getLvl('Physical Resistance');
    const scaled = (lvl, base, perLevel, cap) => (
        lvl > 0 ? Math.min(cap, Math.max(0, base + (lvl * perLevel))) : 0
    );

    const baseCritChancePct = 3;
    const nightVisionCritChancePct = nightVision > 0
        ? Math.min(22, 4 + (nightVision * 2))
        : 0;
    const critChancePct = Math.min(60, baseCritChancePct + nightVisionCritChancePct);
    const critDamagePct = 50 + (nightVision > 0 ? Math.min(25, Math.floor(nightVision * 1.5)) : 0);
    const magicDamageReductionPct = magicResistanceSkill > 0
        ? Math.min(40, 8 + (magicResistanceSkill * 2))
        : 0;
    const physicalDamageReductionPct = physicalResistanceSkill > 0
        ? Math.min(40, 8 + (physicalResistanceSkill * 2))
        : 0;

    const rulerPassives = {
        damageBonusHighHpPct: scaled(pride, 6, 1.5, 28),
        damageBonusLowHpPct: scaled(wrath, 8, 2, 35),
        lowHpVulnerabilityPct: scaled(wrath, 4, 0.8, 20),
        resourceLeechPct: scaled(greed, 3, 0.7, 14),
        lifestealPct: scaled(lust, 4, 0.9, 20),
        onHitShieldPct: scaled(envy, 6, 1.2, 25),
        shieldOnHitPct: scaled(gluttony, 8, 1.4, 30),
        baseDamageReductionPct: scaled(sloth, 6, 1.5, 30),
        costReductionPct: scaled(temperance, 5, 1.2, 30),
        mpCostReductionPct: Math.max(
            scaled(temperance, 5, 1.2, 30),
            Math.max(0, Number(consumptionReduction.mp) || 0)
        ),
        spCostReductionPct: Math.max(
            scaled(temperance, 5, 1.2, 30),
            Math.max(0, Number(consumptionReduction.sp) || 0)
        ),
        lowHpDamageReductionPct: scaled(mercy, 10, 1.8, 35),
        endTurnRegenPct: scaled(diligence, 2, 0.5, 12),
        hpRegenPct: Math.max(0, Number(recovery.hp) || 0),
        mpRegenPct: Math.max(
            scaled(diligence, 2, 0.5, 12),
            Math.max(0, Number(recovery.mp) || 0)
        ),
        spRegenPct: Math.max(
            scaled(diligence, 2, 0.5, 12),
            Math.max(0, Number(recovery.sp) || 0)
        ),
        immortalityEnabled: hasImmortality,
        magicDamageBonusPct: scaled(wisdom, 6, 1.7, 30),
        critChancePct,
        critDamagePct,
        magicDamageReductionPct,
        physicalDamageReductionPct
    };

    const allStatusBonus = Math.min(60, scaled(humility, 5, 1.2, 25) + scaled(chastity, 7, 1.3, 30));
    if (allStatusBonus > 0) {
        for (const effect of effects) {
            statusResistance[effect] = Math.min(100, Math.max(0, Number(statusResistance[effect]) || 0) + allStatusBonus);
        }
    }

    return { statusResistance, statusEnhancement, rulerPassives };
}

module.exports = {
    buildStatusModifiersFromSkills
};
