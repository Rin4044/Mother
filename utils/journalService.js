const { sequelize, Profiles } = require('../database');

function startOfUtcDayMs(nowMs = Date.now()) {
    const d = new Date(nowMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfUtcWeekMs(nowMs = Date.now()) {
    const dayStart = startOfUtcDayMs(nowMs);
    const day = new Date(dayStart).getUTCDay();
    const deltaToMonday = (day + 6) % 7;
    return dayStart - (deltaToMonday * 24 * 60 * 60 * 1000);
}

function createBucket(startMs = 0) {
    return {
        startMs: Math.max(0, Number(startMs) || 0),
        kills: 0,
        xp: 0,
        crystals: 0,
        questsClaimed: 0,
        damageDealt: 0,
        damageTaken: 0,
        statusInflictedTicks: 0,
        statusTakenTicks: 0,
        entries: []
    };
}

function normalizeJournalState(root = {}, nowMs = Date.now()) {
    const src = root && typeof root === 'object' ? root : {};
    const dayStart = startOfUtcDayMs(nowMs);
    const weekStart = startOfUtcWeekMs(nowMs);

    const journal = src.journal && typeof src.journal === 'object'
        ? { ...src.journal }
        : {};

    const daily = journal.daily && Number(journal.daily.startMs) === dayStart
        ? { ...createBucket(dayStart), ...journal.daily }
        : createBucket(dayStart);

    const weekly = journal.weekly && Number(journal.weekly.startMs) === weekStart
        ? { ...createBucket(weekStart), ...journal.weekly }
        : createBucket(weekStart);

    daily.entries = Array.isArray(daily.entries) ? daily.entries.slice(-20) : [];
    weekly.entries = Array.isArray(weekly.entries) ? weekly.entries.slice(-60) : [];

    const achievementProgress = src.achievementProgress && typeof src.achievementProgress === 'object'
        ? { ...src.achievementProgress }
        : {};
    const achievementClaims = src.achievementClaims && typeof src.achievementClaims === 'object'
        ? { ...src.achievementClaims }
        : {};

    for (const key of ['damageDealt', 'damageTaken', 'statusInflictedTicks', 'statusTakenTicks', 'xp', 'kills', 'questsClaimed']) {
        achievementProgress[key] = Math.max(0, Number(achievementProgress[key]) || 0);
        achievementClaims[key] = Math.max(0, Number(achievementClaims[key]) || 0);
    }

    return {
        ...src,
        achievementProgress,
        achievementClaims,
        journal: {
            dayStart,
            weekStart,
            daily,
            weekly
        }
    };
}

function pushEntry(bucket, type, text, maxEntries) {
    if (!text) return;
    if (!Array.isArray(bucket.entries)) bucket.entries = [];
    bucket.entries.push({
        ts: Date.now(),
        type: String(type || 'log'),
        text: String(text)
    });
    if (bucket.entries.length > maxEntries) {
        bucket.entries = bucket.entries.slice(bucket.entries.length - maxEntries);
    }
}

function applyPayloadToBucket(bucket, payload = {}) {
    bucket.kills += Math.max(0, Number(payload.kills) || 0);
    bucket.xp += Math.max(0, Number(payload.xp) || 0);
    bucket.crystals += Math.max(0, Number(payload.crystals) || 0);
    bucket.questsClaimed += Math.max(0, Number(payload.questsClaimed) || 0);
    bucket.damageDealt += Math.max(0, Number(payload.damageDealt) || 0);
    bucket.damageTaken += Math.max(0, Number(payload.damageTaken) || 0);
    bucket.statusInflictedTicks += Math.max(0, Number(payload.statusInflictedTicks) || 0);
    bucket.statusTakenTicks += Math.max(0, Number(payload.statusTakenTicks) || 0);
}

function buildEntryText(payload = {}) {
    const parts = [];
    if ((Number(payload.kills) || 0) > 0) parts.push(`kills +${payload.kills}`);
    if ((Number(payload.xp) || 0) > 0) parts.push(`xp +${payload.xp}`);
    if ((Number(payload.crystals) || 0) > 0) parts.push(`crystals +${payload.crystals}`);
    if ((Number(payload.questsClaimed) || 0) > 0) parts.push(`quests +${payload.questsClaimed}`);
    if ((Number(payload.damageDealt) || 0) > 0) parts.push(`dmg dealt +${payload.damageDealt}`);
    if ((Number(payload.damageTaken) || 0) > 0) parts.push(`dmg taken +${payload.damageTaken}`);
    if ((Number(payload.statusInflictedTicks) || 0) > 0) parts.push(`status inflict +${payload.statusInflictedTicks}`);
    if ((Number(payload.statusTakenTicks) || 0) > 0) parts.push(`status taken +${payload.statusTakenTicks}`);
    if (payload.lootText) parts.push(`loot: ${payload.lootText}`);
    if (payload.note) parts.push(String(payload.note));
    return parts.join(' | ');
}

async function recordJournalProgress(profileId, payload = {}) {
    if (!profileId) return null;
    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile) return null;

        const nowMs = Date.now();
        const root = normalizeJournalState(profile.rulerProgress || {}, nowMs);
        const journal = root.journal;
        applyPayloadToBucket(journal.daily, payload);
        applyPayloadToBucket(journal.weekly, payload);
        root.achievementProgress.damageDealt += Math.max(0, Number(payload.damageDealt) || 0);
        root.achievementProgress.damageTaken += Math.max(0, Number(payload.damageTaken) || 0);
        root.achievementProgress.statusInflictedTicks += Math.max(0, Number(payload.statusInflictedTicks) || 0);
        root.achievementProgress.statusTakenTicks += Math.max(0, Number(payload.statusTakenTicks) || 0);
        root.achievementProgress.xp += Math.max(0, Number(payload.xp) || 0);
        root.achievementProgress.kills += Math.max(0, Number(payload.kills) || 0);
        root.achievementProgress.questsClaimed += Math.max(0, Number(payload.questsClaimed) || 0);
        const entryText = buildEntryText(payload);
        pushEntry(journal.daily, payload.type || 'log', entryText, 20);
        pushEntry(journal.weekly, payload.type || 'log', entryText, 60);

        profile.rulerProgress = root;
        await profile.save({ transaction });
        return root.journal;
    });
}

async function getJournalSummary(profileId) {
    const profile = await Profiles.findByPk(profileId);
    if (!profile) return null;
    const nowMs = Date.now();
    const root = normalizeJournalState(profile.rulerProgress || {}, nowMs);
    if (JSON.stringify(root) !== JSON.stringify(profile.rulerProgress || {})) {
        profile.rulerProgress = root;
        await profile.save();
    }
    return root.journal;
}

module.exports = {
    getJournalSummary,
    recordJournalProgress
};
