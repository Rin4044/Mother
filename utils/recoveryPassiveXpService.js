const { grantSkillXp } = require('./skillProgression');

function inferRecoveryTargetsFromName(skillName) {
    const lower = String(skillName || '').toLowerCase();
    const hasHpToken = lower.includes('hp');
    const hasMpToken = lower.includes('mp');
    const hasSpToken = lower.includes('sp') || lower.includes('stamina');
    if (hasHpToken) return ['hp'];
    if (hasMpToken) return ['mp'];
    if (hasSpToken) return ['sp'];
    return ['mp', 'sp'];
}

function isRecoverySkillName(skillName) {
    const lower = String(skillName || '').toLowerCase();
    return (
        lower.includes('recovery speed') ||
        lower.includes('rapid recovery') ||
        lower.includes('auto recovery') ||
        lower.includes('ultra fast recovery')
    );
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

async function grantRecoveryPassiveXpFromTurn({ profileId, userSkills, regenData = {}, xpPerProc = 2 } = {}) {
    const regen = {
        hp: Math.max(0, Number(regenData?.hpGain) || 0),
        mp: Math.max(0, Number(regenData?.mpGain) || 0),
        sp: Math.max(0, Number(regenData?.spGain) || 0)
    };
    if (regen.hp <= 0 && regen.mp <= 0 && regen.sp <= 0) {
        return { summary: {}, unlockedSkills: [] };
    }

    let summary = {};
    const unlockedSkills = [];

    for (const entry of userSkills || []) {
        const skill = entry?.Skill || null;
        const skillName = String(skill?.name || entry?.name || '').trim();
        if (!skill?.id || !skillName || !isRecoverySkillName(skillName)) continue;

        const targets = inferRecoveryTargetsFromName(skillName);
        const triggered = targets.some((target) => regen[target] > 0);
        if (!triggered) continue;

        const progress = await grantSkillXp(profileId, skill.id, Math.max(1, Number(xpPerProc) || 2));
        summary = appendSkillProgress(summary, skill, progress);
        if (progress?.unlockedSkill?.id) {
            unlockedSkills.push(progress.unlockedSkill);
        }
    }

    return { summary, unlockedSkills };
}

module.exports = {
    grantRecoveryPassiveXpFromTurn
};
