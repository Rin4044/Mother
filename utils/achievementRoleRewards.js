const path = require('path');

const DEFAULT_KEYS = [
    'damageDealt',
    'damageTaken',
    'statusInflictedTicks',
    'statusTakenTicks',
    'xp',
    'kills',
    'questsClaimed'
];

function normalizeRoleId(raw) {
    const id = String(raw || '').trim();
    if (!/^\d{8,30}$/.test(id)) return null;
    return id;
}

function parseJsonMap(raw) {
    if (!raw) return null;
    try {
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
        return obj;
    } catch {
        return null;
    }
}

function parseCompactMap(raw) {
    // Format: key:roleId,key:roleId
    if (!raw || typeof raw !== 'string') return null;
    const out = {};
    const chunks = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!chunks.length) return null;

    for (const chunk of chunks) {
        const [k, v] = chunk.split(':').map((s) => String(s || '').trim());
        if (!k || !v) continue;
        out[k] = v;
    }
    return Object.keys(out).length ? out : null;
}

function readConfigFileMap() {
    try {
        const file = require(path.join(__dirname, '..', 'config.json'));
        if (!file || typeof file !== 'object') return null;
        const map = file.achievementRoleRewards || file.achievementRoles || null;
        if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
        return map;
    } catch {
        return null;
    }
}

function buildLegacyEnvMap() {
    return {
        damageDealt: process.env.ACHIEVEMENT_ROLE_DAMAGE_DEALT || null,
        damageTaken: process.env.ACHIEVEMENT_ROLE_DAMAGE_TAKEN || null,
        statusInflictedTicks: process.env.ACHIEVEMENT_ROLE_STATUS_DEALT || null,
        statusTakenTicks: process.env.ACHIEVEMENT_ROLE_STATUS_TAKEN || null,
        xp: process.env.ACHIEVEMENT_ROLE_XP_GAINED || null,
        kills: process.env.ACHIEVEMENT_ROLE_MONSTERS_KILLED || null,
        questsClaimed: process.env.ACHIEVEMENT_ROLE_QUESTS_CLAIMED || null
    };
}

function resolveRoleConfig() {
    // Priority: JSON env > compact env > config.json > legacy split env vars
    const envJson = parseJsonMap(process.env.ACHIEVEMENT_ROLE_MAP_JSON);
    if (envJson) return envJson;

    const envCompact = parseCompactMap(process.env.ACHIEVEMENT_ROLE_MAP);
    if (envCompact) return envCompact;

    const fileMap = readConfigFileMap();
    if (fileMap) return fileMap;

    return buildLegacyEnvMap();
}

const ACHIEVEMENT_ROLE_CONFIG = resolveRoleConfig();

function getAchievementRoleId(achievementKey) {
    return normalizeRoleId(ACHIEVEMENT_ROLE_CONFIG[achievementKey]);
}

function getConfiguredAchievementRoleCount() {
    return DEFAULT_KEYS
        .map((key) => getAchievementRoleId(key))
        .filter(Boolean).length;
}

module.exports = {
    getAchievementRoleId,
    getConfiguredAchievementRoleCount
};
