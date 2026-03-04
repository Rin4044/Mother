const { BotLogConfig } = require('../database');

const DEFAULT_STATE = Object.freeze({
    seasonNumber: 0,
    seasonName: 'Alpha and Beta',
    status: 'preseason',
    infinite: true,
    startsAt: 0,
    endsAt: 0,
    updatedAt: 0,
    updatedBy: null,
    note: 'Season 0 (preseason).'
});

function normalizeRankedSeasonState(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const status = String(src.status || DEFAULT_STATE.status).toLowerCase();
    const safeStatus = ['preseason', 'active', 'ended'].includes(status) ? status : DEFAULT_STATE.status;
    const seasonNumber = Math.max(0, Math.floor(Number(src.seasonNumber) || DEFAULT_STATE.seasonNumber));
    const seasonNameRaw = src.seasonName ? String(src.seasonName).trim() : '';
    const seasonName = (seasonNameRaw || (seasonNumber === 0 ? 'Alpha and Beta' : `Season ${seasonNumber}`)).slice(0, 80);
    const infinite = Boolean(src.infinite);
    const startsAt = Math.max(0, Number(src.startsAt) || 0);
    const endsAt = infinite ? 0 : Math.max(0, Number(src.endsAt) || 0);
    const updatedAt = Math.max(0, Number(src.updatedAt) || 0);
    const updatedBy = src.updatedBy ? String(src.updatedBy) : null;
    const note = src.note ? String(src.note).slice(0, 240) : null;

    return {
        seasonNumber,
        seasonName,
        status: safeStatus,
        infinite,
        startsAt,
        endsAt,
        updatedAt,
        updatedBy,
        note
    };
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
            adminSanctionState: { users: {} },
            adminSecurityState: {
                panicMode: false,
                panicUpdatedAt: 0,
                panicUpdatedBy: null,
                panicReason: null
            },
            rankedSeasonState: DEFAULT_STATE
        }
    });
    return config;
}

async function getRankedSeasonState(guildId) {
    if (!guildId) return normalizeRankedSeasonState(DEFAULT_STATE);
    const config = await getConfig(guildId);
    return normalizeRankedSeasonState(config.rankedSeasonState || DEFAULT_STATE);
}

async function updateRankedSeasonState(guildId, updater) {
    const config = await getConfig(guildId);
    const current = normalizeRankedSeasonState(config.rankedSeasonState || DEFAULT_STATE);
    const nextRaw = await updater(current);
    const next = normalizeRankedSeasonState(nextRaw);
    config.rankedSeasonState = next;
    config.changed('rankedSeasonState', true);
    await config.save();
    return next;
}

function statusLabel(status) {
    if (status === 'active') return 'Active';
    if (status === 'ended') return 'Ended';
    return 'Preseason';
}

module.exports = {
    DEFAULT_STATE,
    normalizeRankedSeasonState,
    getRankedSeasonState,
    updateRankedSeasonState,
    statusLabel
};
