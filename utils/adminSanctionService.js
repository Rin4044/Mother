const { BotLogConfig } = require('../database');
const OWNER_USER_ID = process.env.BOT_OWNER_USER_ID || '1017124302048481330';

const WARN_POINTS = Number(process.env.ADMIN_SANCTION_WARN_POINTS || 5);
const LOCK_POINTS = Number(process.env.ADMIN_SANCTION_LOCK_POINTS || 12);
const LOCK_DURATION_MS = Number(process.env.ADMIN_SANCTION_LOCK_MS || 24 * 60 * 60 * 1000);
const DECAY_WINDOW_MS = Number(process.env.ADMIN_SANCTION_DECAY_WINDOW_MS || 12 * 60 * 60 * 1000);
const DECAY_POINTS_PER_WINDOW = Number(process.env.ADMIN_SANCTION_DECAY_POINTS || 3);
const HISTORY_LIMIT = 20;

function normalizeState(raw) {
    const base = raw && typeof raw === 'object' ? raw : {};
    const usersSrc = base.users && typeof base.users === 'object' ? base.users : {};
    const users = {};
    for (const [id, val] of Object.entries(usersSrc)) {
        users[String(id)] = val && typeof val === 'object'
            ? JSON.parse(JSON.stringify(val))
            : {};
    }
    return { users };
}

async function getConfig(guildId) {
    const [config] = await BotLogConfig.findOrCreate({
        where: { guildId },
        defaults: {
            guildId,
            statusChannelId: null,
            crashChannelId: null,
            statusMessageId: null,
            adminLogChannelId: null,
            adminWhitelistUserIds: [],
            adminSanctionState: { users: {} }
        }
    });
    return config;
}

function getUserState(state, userId) {
    const id = String(userId || '');
    const current = state.users[id] && typeof state.users[id] === 'object' ? state.users[id] : {};
    return {
        points: Math.max(0, Number(current.points) || 0),
        totalStrikes: Math.max(0, Number(current.totalStrikes) || 0),
        lastEventAt: Number(current.lastEventAt) || 0,
        lockedUntil: Number(current.lockedUntil) || 0,
        lockReason: String(current.lockReason || ''),
        history: Array.isArray(current.history) ? current.history.slice(0, HISTORY_LIMIT) : []
    };
}

function computePointsForLog(log) {
    const denied = Boolean(log?.metadata?.denied);
    const deniedReason = String(log?.metadata?.deniedReason || '');
    const burst = Boolean(log?.metadata?.burstTriggered);
    const riskScore = Math.max(0, Number(log?.metadata?.riskScore) || 0);
    const actionKey = String(log?.metadata?.actionKey || '');
    const sanctionExempt = Boolean(log?.metadata?.sanctionExempt);

    // Do not escalate when already locked; this avoids infinite escalation loops.
    if (denied && deniedReason === 'locked') return 0;
    if (actionKey.includes('admin:whitelist:list')) return 0;
    if (sanctionExempt) return 0;

    let points = riskScore;
    if (burst) points += 3;
    // Repeated denied behavior should escalate faster.
    if (denied) points += 1;
    return Math.max(0, points);
}

function applyPassiveDecay(userState, nowMs = Date.now()) {
    if (!userState?.lastEventAt || userState.points <= 0) {
        return { userState, changed: false, decayed: 0 };
    }
    if (DECAY_WINDOW_MS <= 0 || DECAY_POINTS_PER_WINDOW <= 0) {
        return { userState, changed: false, decayed: 0 };
    }

    const elapsed = Math.max(0, nowMs - Number(userState.lastEventAt || 0));
    const windows = Math.floor(elapsed / DECAY_WINDOW_MS);
    if (windows <= 0) return { userState, changed: false, decayed: 0 };

    const decay = windows * DECAY_POINTS_PER_WINDOW;
    const nextPoints = Math.max(0, userState.points - decay);
    if (nextPoints === userState.points) return { userState, changed: false, decayed: 0 };

    return {
        userState: {
            ...userState,
            points: nextPoints,
            // reset inactivity origin once decay is applied
            lastEventAt: nowMs
        },
        changed: true,
        decayed: userState.points - nextPoints
    };
}

function sanitizeHistory(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
        .filter((e) => e && typeof e === 'object')
        .slice(0, HISTORY_LIMIT)
        .map((e) => ({
            at: Number(e.at) || Date.now(),
            points: Number(e.points) || 0,
            action: String(e.action || 'unknown'),
            reason: String(e.reason || '')
        }));
}

async function applySanctionFromLog(log) {
    const guildId = String(log?.guildId || '');
    const userId = String(log?.executorUserId || '');
    if (!guildId || !userId) return { applied: false };
    if (userId === String(OWNER_USER_ID)) return { applied: false };

    const addPoints = computePointsForLog(log);
    if (addPoints <= 0) return { applied: false };

    const config = await getConfig(guildId);
    const state = normalizeState(config.adminSanctionState);
    const now = Date.now();
    const rawUserState = getUserState(state, userId);
    const decay = applyPassiveDecay(rawUserState, now);
    const userState = decay.userState;
    const prevPoints = Math.max(0, Number(userState.points) || 0);
    const wasLocked = (Number(userState.lockedUntil) || 0) > now;

    userState.points += addPoints;
    userState.totalStrikes += 1;
    userState.lastEventAt = now;
    userState.history = sanitizeHistory([
        {
            at: now,
            points: addPoints,
            action: `${log.commandName}:${log.actionGroup}:${log.actionName}`,
            reason: String(log.reason || '')
        },
        ...userState.history
    ]);

    let outcome = 'strike';
    if (userState.points >= LOCK_POINTS) {
        userState.lockedUntil = now + LOCK_DURATION_MS;
        userState.lockReason = `Auto-lock at ${userState.points} points`;
        outcome = 'locked';
    } else if (userState.points >= WARN_POINTS) {
        outcome = 'warn';
    }

    state.users[userId] = userState;
    config.adminSanctionState = state;
    config.changed('adminSanctionState', true);
    await config.save();

    return {
        applied: true,
        outcome,
        prevPoints,
        wasLocked,
        crossedWarn: prevPoints < WARN_POINTS && userState.points >= WARN_POINTS,
        crossedLock: !wasLocked && prevPoints < LOCK_POINTS && userState.points >= LOCK_POINTS,
        points: userState.points,
        totalStrikes: userState.totalStrikes,
        lockedUntil: userState.lockedUntil
    };
}

async function getSanctionSummary(guildId, userId = null) {
    const config = await getConfig(guildId);
    const state = normalizeState(config.adminSanctionState);
    const now = Date.now();
    let changed = false;

    if (userId) {
        const raw = getUserState(state, userId);
        const decay = applyPassiveDecay(raw, now);
        const s = decay.userState;
        if (decay.changed) {
            state.users[String(userId)] = s;
            changed = true;
        }
        if (changed) {
            config.adminSanctionState = state;
            config.changed('adminSanctionState', true);
            await config.save();
        }
        return {
            users: [{
                userId: String(userId),
                points: s.points,
                totalStrikes: s.totalStrikes,
                lockedUntil: s.lockedUntil,
                isLocked: s.lockedUntil > now,
                lockReason: s.lockReason,
                lastEventAt: s.lastEventAt
            }]
        };
    }

    const users = Object.keys(state.users).map((id) => {
        const raw = getUserState(state, id);
        const decay = applyPassiveDecay(raw, now);
        const s = decay.userState;
        if (decay.changed) {
            state.users[id] = s;
            changed = true;
        }
        return {
            userId: id,
            points: s.points,
            totalStrikes: s.totalStrikes,
            lockedUntil: s.lockedUntil,
            isLocked: s.lockedUntil > now,
            lockReason: s.lockReason,
            lastEventAt: s.lastEventAt
        };
    });

    if (changed) {
        config.adminSanctionState = state;
        config.changed('adminSanctionState', true);
        await config.save();
    }

    users.sort((a, b) => (b.lastEventAt || 0) - (a.lastEventAt || 0));
    return { users };
}

async function unlockSanctionUser(guildId, userId, reason = 'Manual unlock by owner') {
    const config = await getConfig(guildId);
    const state = normalizeState(config.adminSanctionState);
    const s = getUserState(state, userId);
    s.lockedUntil = 0;
    s.lockReason = '';
    s.history = sanitizeHistory([
        { at: Date.now(), points: 0, action: 'manual:unlock', reason },
        ...s.history
    ]);
    state.users[String(userId)] = s;
    config.adminSanctionState = state;
    config.changed('adminSanctionState', true);
    await config.save();
    return true;
}

async function clearSanctionUser(guildId, userId, reason = 'Manual clear by owner') {
    const config = await getConfig(guildId);
    const state = normalizeState(config.adminSanctionState);
    delete state.users[String(userId)];
    config.adminSanctionState = state;
    config.changed('adminSanctionState', true);
    await config.save();
    return true;
}

async function getLockState(guildId, userId) {
    if (!guildId || !userId) return { locked: false, lockedUntil: 0, reason: '' };
    const config = await getConfig(guildId);
    const state = normalizeState(config.adminSanctionState);
    const raw = getUserState(state, userId);
    const decay = applyPassiveDecay(raw, Date.now());
    const s = decay.userState;
    if (decay.changed) {
        state.users[String(userId)] = s;
        config.adminSanctionState = state;
        config.changed('adminSanctionState', true);
        await config.save();
    }
    const now = Date.now();
    const locked = s.lockedUntil > now;
    return {
        locked,
        lockedUntil: s.lockedUntil,
        reason: s.lockReason || ''
    };
}

module.exports = {
    WARN_POINTS,
    LOCK_POINTS,
    LOCK_DURATION_MS,
    DECAY_WINDOW_MS,
    DECAY_POINTS_PER_WINDOW,
    applySanctionFromLog,
    getLockState,
    getSanctionSummary,
    unlockSanctionUser,
    clearSanctionUser
};
