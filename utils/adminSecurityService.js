const { BotLogConfig } = require('../database');

function normalizeSecurityState(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
        panicMode: Boolean(src.panicMode),
        panicUpdatedAt: Number(src.panicUpdatedAt) || 0,
        panicUpdatedBy: src.panicUpdatedBy ? String(src.panicUpdatedBy) : null,
        panicReason: src.panicReason ? String(src.panicReason) : null
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
            }
        }
    });
    return config;
}

async function getAdminSecurityState(guildId) {
    if (!guildId) return normalizeSecurityState(null);
    const config = await getConfig(guildId);
    return normalizeSecurityState(config.adminSecurityState);
}

async function setPanicMode(guildId, enabled, actorUserId, reason = null) {
    const config = await getConfig(guildId);
    const next = {
        panicMode: Boolean(enabled),
        panicUpdatedAt: Date.now(),
        panicUpdatedBy: actorUserId ? String(actorUserId) : null,
        panicReason: reason ? String(reason) : null
    };
    config.adminSecurityState = next;
    config.changed('adminSecurityState', true);
    await config.save();
    return next;
}

module.exports = {
    getAdminSecurityState,
    setPanicMode
};
