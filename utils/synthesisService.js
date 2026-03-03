const { Op } = require('sequelize');
const { Profiles, UserSkills, Skills } = require('../database');
const { addInventoryItem } = require('./inventoryService');
const { grantSkillXp } = require('./skillProgression');

const MAX_SYNTHESIS_JOBS = 3;
const MAX_SYNTHESIS_QTY_PER_JOB = 10;

const SYNTHESIS_DEFINITIONS = {
    heal: {
        key: 'heal',
        label: 'Medicine Synthesis',
        requiredSkillName: 'Medicine Synthesis',
        itemName: 'Healing Potion',
        baseMinutesPerItem: 10
    },
    poison: {
        key: 'poison',
        label: 'Poison Synthesis',
        requiredSkillName: 'Poison Synthesis',
        itemName: 'Poison Potion',
        baseMinutesPerItem: 10
    }
};

function getSynthesisDefinition(kind) {
    return SYNTHESIS_DEFINITIONS[String(kind || '').toLowerCase()] || null;
}

function getAllSynthesisDefinitions() {
    return Object.values(SYNTHESIS_DEFINITIONS);
}

function normalizeSynthesisState(rawState) {
    const src = rawState && typeof rawState === 'object' ? rawState : {};
    const jobs = Array.isArray(src.jobs) ? src.jobs : [];
    return {
        nextJobId: Math.max(1, Number(src.nextJobId) || 1),
        jobs: jobs
            .map((job) => ({
                id: Math.max(1, Number(job.id) || 0),
                kind: String(job.kind || '').toLowerCase(),
                quantity: Math.max(1, Number(job.quantity) || 1),
                startsAt: Math.max(0, Number(job.startsAt) || 0),
                endsAt: Math.max(0, Number(job.endsAt) || 0)
            }))
            .filter((job) => job.id > 0 && job.kind && job.endsAt > 0)
    };
}

function upsertSynthesisState(progressRoot, state) {
    const root = progressRoot && typeof progressRoot === 'object' ? { ...progressRoot } : {};
    root.synthesisState = {
        nextJobId: Math.max(1, Number(state?.nextJobId) || 1),
        jobs: Array.isArray(state?.jobs) ? state.jobs : []
    };
    return root;
}

function computeDurationMsPerItem(definition, skillLevel = 1) {
    const baseMs = Math.max(1, Number(definition?.baseMinutesPerItem) || 10) * 60 * 1000;
    const level = Math.max(1, Number(skillLevel) || 1);
    const reductionPct = Math.min(60, (level - 1) * 3);
    return Math.max(60 * 1000, Math.floor(baseMs * (1 - (reductionPct / 100))));
}

function formatDuration(ms) {
    const totalSec = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    if (hours > 0) {
        if (seconds > 0) return `${hours}h ${minutes}m ${seconds}s`;
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

async function getProfileByUserId(userId) {
    if (!userId) return null;
    return Profiles.findOne({ where: { userId } });
}

async function getSynthesisSkill(profileId, requiredSkillName) {
    if (!profileId || !requiredSkillName) return null;
    return UserSkills.findOne({
        where: { profileId },
        include: [{
            model: Skills,
            as: 'Skill',
            required: true,
            where: { name: requiredSkillName }
        }]
    });
}

async function settleCompletedSynthesisJobs(profileId) {
    const profile = await Profiles.findByPk(profileId);
    if (!profile) return [];

    const progressRoot = profile.rulerProgress && typeof profile.rulerProgress === 'object'
        ? { ...profile.rulerProgress }
        : {};
    const state = normalizeSynthesisState(progressRoot.synthesisState);
    const now = Date.now();
    const completed = state.jobs.filter((job) => job.endsAt <= now);
    if (!completed.length) return [];

    state.jobs = state.jobs.filter((job) => job.endsAt > now);
    profile.rulerProgress = upsertSynthesisState(progressRoot, state);
    await profile.save();

    for (const job of completed) {
        const definition = getSynthesisDefinition(job.kind);
        if (!definition) continue;
        await addInventoryItem(profileId, definition.itemName, job.quantity);
    }

    return completed.map((job) => {
        const definition = getSynthesisDefinition(job.kind);
        return {
            kind: job.kind,
            quantity: job.quantity,
            itemName: definition?.itemName || 'Unknown Item'
        };
    });
}

async function buildSynthesisPanel(profileId) {
    const profile = await Profiles.findByPk(profileId);
    if (!profile) return null;

    const progressRoot = profile.rulerProgress && typeof profile.rulerProgress === 'object'
        ? { ...profile.rulerProgress }
        : {};
    const state = normalizeSynthesisState(progressRoot.synthesisState);
    const queue = [...state.jobs].sort((a, b) => a.endsAt - b.endsAt);
    const now = Date.now();

    const entries = [];
    for (const definition of getAllSynthesisDefinitions()) {
        const skill = await getSynthesisSkill(profileId, definition.requiredSkillName);
        const unlocked = !!skill;
        const skillLevel = Math.max(1, Number(skill?.level) || 1);
        const perItemMs = computeDurationMsPerItem(definition, skillLevel);
        entries.push({
            definition,
            unlocked,
            skillLevel,
            perItemMs
        });
    }

    const queueLines = queue.length
        ? queue.map((job) => {
            const def = getSynthesisDefinition(job.kind);
            const remain = Math.max(0, job.endsAt - now);
            return `- ${def?.itemName || job.kind} x${job.quantity} (ready in ${formatDuration(remain)})`;
        })
        : ['- none'];

    return {
        entries,
        queueLines,
        queueJobs: queue.map((job) => ({
            ...job,
            itemName: getSynthesisDefinition(job.kind)?.itemName || job.kind
        })),
        queueCount: queue.length,
        queueMax: MAX_SYNTHESIS_JOBS
    };
}

async function startSynthesisJob({ profileId, kind, quantity }) {
    const definition = getSynthesisDefinition(kind);
    if (!definition) return { ok: false, reason: 'INVALID_TYPE' };

    const qty = Math.max(1, Math.min(MAX_SYNTHESIS_QTY_PER_JOB, Number(quantity) || 0));
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'INVALID_QTY' };

    const profile = await Profiles.findByPk(profileId);
    if (!profile) return { ok: false, reason: 'NO_PROFILE' };

    const skill = await getSynthesisSkill(profileId, definition.requiredSkillName);
    if (!skill || !skill.Skill) return { ok: false, reason: 'MISSING_SKILL', definition };

    const progressRoot = profile.rulerProgress && typeof profile.rulerProgress === 'object'
        ? { ...profile.rulerProgress }
        : {};
    const state = normalizeSynthesisState(progressRoot.synthesisState);
    if (state.jobs.length >= MAX_SYNTHESIS_JOBS) {
        return {
            ok: false,
            reason: 'QUEUE_FULL',
            maxJobs: MAX_SYNTHESIS_JOBS
        };
    }

    const perItemMs = computeDurationMsPerItem(definition, skill.level);
    const now = Date.now();
    const queueEnd = state.jobs.reduce((max, job) => Math.max(max, Number(job.endsAt) || 0), now);
    const startsAt = Math.max(now, queueEnd);
    const craftMs = perItemMs * qty;
    const waitMs = Math.max(0, startsAt - now);
    const totalMs = waitMs + craftMs;
    const endsAt = startsAt + craftMs;

    const job = {
        id: state.nextJobId,
        kind: definition.key,
        quantity: qty,
        startsAt,
        endsAt
    };

    state.nextJobId += 1;
    state.jobs.push(job);
    profile.rulerProgress = upsertSynthesisState(progressRoot, state);
    await profile.save();

    const gainedXp = Math.max(2, Math.min(120, qty * 3));
    const xpProgress = await grantSkillXp(profileId, skill.Skill.id, gainedXp);

    return {
        ok: true,
        definition,
        job,
        perItemMs,
        waitMs,
        craftMs,
        totalMs,
        queueAhead: state.jobs.length - 1,
        xpProgress,
        gainedXp
    };
}

module.exports = {
    getProfileByUserId,
    getSynthesisDefinition,
    buildSynthesisPanel,
    settleCompletedSynthesisJobs,
    startSynthesisJob,
    formatDuration,
    MAX_SYNTHESIS_JOBS,
    MAX_SYNTHESIS_QTY_PER_JOB
};
