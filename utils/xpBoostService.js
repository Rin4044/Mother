function getActiveXpBoost(profile) {
    const percent = Math.max(0, Number(profile?.xpBoostPercent) || 0);
    const rawExpiresAt = profile?.xpBoostExpiresAt;
    const expiresAt = rawExpiresAt ? new Date(rawExpiresAt) : null;
    const now = Date.now();
    const remainingMs = expiresAt ? Math.max(0, expiresAt.getTime() - now) : 0;

    if (percent <= 0 || remainingMs <= 0) {
        return {
            percent: 0,
            remainingMs: 0,
            expiresAtUnix: null,
            multiplier: 1,
            isExpired: percent > 0 && remainingMs <= 0
        };
    }

    return {
        percent,
        remainingMs,
        expiresAtUnix: Math.floor(expiresAt.getTime() / 1000),
        multiplier: 1 + (percent / 100),
        isExpired: false
    };
}

async function applyXpBoost(profile, baseXp = 0) {
    const safeBase = Math.max(0, Number(baseXp) || 0);
    const active = getActiveXpBoost(profile);

    if (active.isExpired) {
        profile.xpBoostPercent = 0;
        profile.xpBoostExpiresAt = null;
        profile.xpBoostFightsRemaining = 0;
        await profile.save();
    }

    if (safeBase <= 0 || active.multiplier <= 1) {
        return {
            finalXp: safeBase,
            bonusXp: 0,
            consumed: false,
            remainingLabel: formatRemainingTimestamp(active)
        };
    }

    const boosted = Math.floor(safeBase * active.multiplier);
    const bonus = Math.max(0, boosted - safeBase);

    return {
        finalXp: boosted,
        bonusXp: bonus,
        consumed: false,
        remainingLabel: formatRemainingTimestamp(active)
    };
}

function grantOrExtendXpBoost(profile, percent, durationMs) {
    const safePercent = Math.max(0, Number(percent) || 0);
    const safeDurationMs = Math.max(0, Number(durationMs) || 0);
    if (safePercent <= 0 || safeDurationMs <= 0) return false;

    const active = getActiveXpBoost(profile);
    if (active.percent > 0 && active.remainingMs > 0) {
        return false;
    }

    const now = Date.now();
    profile.xpBoostPercent = safePercent;
    profile.xpBoostExpiresAt = new Date(now + safeDurationMs);
    profile.xpBoostFightsRemaining = 0;
    return true;
}

function formatRemainingMs(ms = 0) {
    const safe = Math.max(0, Number(ms) || 0);
    if (safe <= 0) return '0m';
    const totalMinutes = Math.ceil(safe / 60000);
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

function formatRemainingTimestamp(activeBoost) {
    const unix = Number(activeBoost?.expiresAtUnix) || 0;
    if (unix <= 0) return 'expired';
    return `<t:${unix}:R>`;
}

module.exports = {
    getActiveXpBoost,
    applyXpBoost,
    grantOrExtendXpBoost,
    formatRemainingMs,
    formatRemainingTimestamp
};
