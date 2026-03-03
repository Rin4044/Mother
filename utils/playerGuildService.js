const { sequelize, Profiles, PlayerGuild } = require('../database');
const { calculateXpForLevel } = require('./xpUtils');
const { getMaxLevelForRace } = require('./evolutionConfig');

const GUILD_NAME_MIN = 3;
const GUILD_NAME_MAX = 24;
const GUILD_MEMBER_CAP = Math.max(2, Number(process.env.GUILD_MEMBER_CAP || 30));
const GUILD_MAX_LEVEL = Math.max(10, Number(process.env.GUILD_MAX_LEVEL || 100));
const GUILD_CREATE_COST_CRYSTALS = Math.max(0, Number(process.env.GUILD_CREATE_COST_CRYSTALS || 150000));

const DAILY_MISSION_TYPES = [
    {
        key: 'kills',
        label: 'Hunt Monsters',
        targets: [8, 14, 20],
        rewardCrystals: [25, 40, 60],
        rewardXp: [90, 130, 180]
    },
    {
        key: 'questClaims',
        label: 'Claim Quests',
        targets: [3, 5, 7],
        rewardCrystals: [30, 50, 70],
        rewardXp: [100, 150, 220]
    },
    {
        key: 'raidWins',
        label: 'Clear Raids',
        targets: [1, 2, 3],
        rewardCrystals: [40, 60, 90],
        rewardXp: [120, 180, 260]
    }
];

const WEEKLY_MISSION_TYPES = [
    {
        key: 'kills',
        label: 'Hunt Monsters',
        targets: [30, 60, 90],
        rewardCrystals: [80, 140, 220],
        rewardXp: [220, 360, 520]
    },
    {
        key: 'questClaims',
        label: 'Claim Quests',
        targets: [8, 14, 20],
        rewardCrystals: [90, 160, 240],
        rewardXp: [260, 420, 620]
    },
    {
        key: 'raidWins',
        label: 'Clear Raids',
        targets: [2, 4, 6],
        rewardCrystals: [120, 220, 340],
        rewardXp: [300, 520, 760]
    }
];

function normalizeOfficerIds(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    for (const value of raw) {
        const id = Math.max(0, Number(value) || 0);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

function getOfficerIds(guild) {
    return normalizeOfficerIds(guild?.officerProfileIds);
}

function normalizeGuildName(raw) {
    const name = String(raw || '').trim().replace(/\s+/g, ' ');
    if (name.length < GUILD_NAME_MIN || name.length > GUILD_NAME_MAX) return null;
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) return null;
    return name;
}

function guildNameKey(name) {
    return String(name || '').trim().toLowerCase();
}

function xpToNext(level) {
    const safe = Math.max(1, Number(level) || 1);
    return Math.floor(450 + (safe * 190));
}

function applyGuildXp(guild, gain) {
    const safeGain = Math.max(0, Number(gain) || 0);
    let level = Math.max(1, Number(guild.level) || 1);
    let xp = Math.max(0, Number(guild.xp) || 0);
    let leveled = 0;

    xp += safeGain;
    while (level < GUILD_MAX_LEVEL) {
        const need = xpToNext(level);
        if (xp < need) break;
        xp -= need;
        level += 1;
        leveled += 1;
    }
    if (level >= GUILD_MAX_LEVEL) {
        level = GUILD_MAX_LEVEL;
        xp = 0;
    }

    guild.level = level;
    guild.xp = xp;
    guild.xpToNextLevel = level >= GUILD_MAX_LEVEL ? 0 : xpToNext(level);
    guild.lifetimeXp = Math.max(0, Number(guild.lifetimeXp) || 0) + safeGain;
    return { level, xp, leveled, gain: safeGain };
}

function computeGuildXpGain(payload = {}) {
    const kills = Math.max(0, Number(payload.kills) || 0);
    const questClaims = Math.max(0, Number(payload.questClaims) || 0);
    const raidWins = Math.max(0, Number(payload.raidWins) || 0);
    const xpGained = Math.max(0, Number(payload.xpGained) || 0);

    const byKills = kills * 12;
    const byQuest = questClaims * 24;
    const byRaid = raidWins * 150;
    const byXp = Math.floor(xpGained * 0.08);
    return Math.max(0, byKills + byQuest + byRaid + byXp);
}

function startOfCurrentWeekMs(nowMs = Date.now()) {
    const d = new Date(nowMs);
    const utcDay = d.getUTCDay(); // 0 Sunday ... 6 Saturday
    const dayFromMonday = (utcDay + 6) % 7;
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - dayFromMonday);
    return d.getTime();
}

function startOfCurrentDayMs(nowMs = Date.now()) {
    const d = new Date(nowMs);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
}

function pickMissionForCycle(cycleStartMs, missionTypes) {
    const seed = Math.max(0, Math.floor((Number(cycleStartMs) || 0) / (24 * 60 * 60 * 1000)));
    const pool = Array.isArray(missionTypes) && missionTypes.length ? missionTypes : WEEKLY_MISSION_TYPES;
    const type = pool[seed % pool.length];
    const tier = seed % 3;
    return {
        objectiveType: type.key,
        objectiveLabel: type.label,
        target: type.targets[tier],
        rewardCrystals: type.rewardCrystals[tier],
        rewardXp: type.rewardXp[tier]
    };
}

function buildSingleMissionState(period = 'weekly', nowMs = Date.now()) {
    const isDaily = period === 'daily';
    const cycleStart = isDaily ? startOfCurrentDayMs(nowMs) : startOfCurrentWeekMs(nowMs);
    const resetAt = cycleStart + (isDaily ? (24 * 60 * 60 * 1000) : (7 * 24 * 60 * 60 * 1000));
    const picked = pickMissionForCycle(cycleStart, isDaily ? DAILY_MISSION_TYPES : WEEKLY_MISSION_TYPES);
    return {
        period: isDaily ? 'daily' : 'weekly',
        cycleStart,
        resetAt,
        objectiveType: picked.objectiveType,
        objectiveLabel: picked.objectiveLabel,
        target: Math.max(1, Number(picked.target) || 1),
        progress: 0,
        rewardCrystals: Math.max(1, Number(picked.rewardCrystals) || 1),
        rewardXp: Math.max(1, Number(picked.rewardXp) || 1),
        claimed: false,
        claimedAt: 0,
        claimedByProfileId: null
    };
}

function normalizeSingleMissionState(raw, period = 'weekly', nowMs = Date.now()) {
    const src = raw && typeof raw === 'object' ? { ...raw } : {};
    const resetAt = Math.max(0, Number(src.resetAt) || 0);
    const intervalMs = period === 'daily' ? (24 * 60 * 60 * 1000) : (7 * 24 * 60 * 60 * 1000);
    if (!resetAt || nowMs >= resetAt) return buildSingleMissionState(period, nowMs);

    const state = buildSingleMissionState(period, Math.max(0, Number(src.cycleStart) || (resetAt - intervalMs)));
    state.resetAt = resetAt;
    state.progress = Math.max(0, Number(src.progress) || 0);
    state.claimed = !!src.claimed;
    state.claimedAt = Math.max(0, Number(src.claimedAt) || 0);
    state.claimedByProfileId = src.claimedByProfileId ? Math.max(0, Number(src.claimedByProfileId) || 0) : null;
    if (src.objectiveType && typeof src.objectiveType === 'string') state.objectiveType = src.objectiveType;
    if (src.objectiveLabel && typeof src.objectiveLabel === 'string') state.objectiveLabel = src.objectiveLabel;
    if ((Number(src.target) || 0) > 0) state.target = Math.max(1, Number(src.target) || 1);
    if ((Number(src.rewardCrystals) || 0) > 0) state.rewardCrystals = Math.max(1, Number(src.rewardCrystals) || 1);
    if ((Number(src.rewardXp) || 0) > 0) state.rewardXp = Math.max(1, Number(src.rewardXp) || 1);
    return state;
}

function buildMissionState(nowMs = Date.now()) {
    return {
        daily: buildSingleMissionState('daily', nowMs),
        weekly: buildSingleMissionState('weekly', nowMs)
    };
}

function normalizeMissionState(raw, nowMs = Date.now()) {
    const src = raw && typeof raw === 'object' ? { ...raw } : {};
    // Backward compatibility: old single-mission format becomes weekly.
    if (src.objectiveType && !src.daily && !src.weekly) {
        return {
            daily: buildSingleMissionState('daily', nowMs),
            weekly: normalizeSingleMissionState(src, 'weekly', nowMs)
        };
    }

    return {
        daily: normalizeSingleMissionState(src.daily, 'daily', nowMs),
        weekly: normalizeSingleMissionState(src.weekly, 'weekly', nowMs)
    };
}

function incrementSingleMissionProgress(state, payload = {}) {
    const objectiveType = String(state?.objectiveType || '');
    if (!objectiveType) return state;
    let delta = 0;
    if (objectiveType === 'kills') delta = Math.max(0, Number(payload.kills) || 0);
    if (objectiveType === 'questClaims') delta = Math.max(0, Number(payload.questClaims) || 0);
    if (objectiveType === 'raidWins') delta = Math.max(0, Number(payload.raidWins) || 0);
    if (delta <= 0) return state;

    const next = { ...state };
    next.progress = Math.min(Math.max(1, Number(next.target) || 1), Math.max(0, Number(next.progress) || 0) + delta);
    return next;
}

function incrementMissionProgress(state, payload = {}) {
    const normalized = normalizeMissionState(state);
    return {
        daily: incrementSingleMissionProgress(normalized.daily, payload),
        weekly: incrementSingleMissionProgress(normalized.weekly, payload)
    };
}

function isSingleMissionReady(state) {
    if (!state || state.claimed) return false;
    return Math.max(0, Number(state.progress) || 0) >= Math.max(1, Number(state.target) || 1);
}

function isMissionReady(state, scope = 'any') {
    const normalized = normalizeMissionState(state);
    if (scope === 'daily') return isSingleMissionReady(normalized.daily);
    if (scope === 'weekly') return isSingleMissionReady(normalized.weekly);
    return isSingleMissionReady(normalized.daily) || isSingleMissionReady(normalized.weekly);
}

function applyProfileXpWithRaceCap(profile, xpGain) {
    const maxLevel = Math.max(1, Number(getMaxLevelForRace(profile?.race)) || 1);
    let level = Math.max(1, Number(profile?.level) || 1);
    let xp = Math.max(0, Number(profile?.xp) || 0);
    let skillPointsGain = 0;
    const gain = Math.max(0, Number(xpGain) || 0);

    if (level >= maxLevel) {
        return { level: maxLevel, xp: 0, skillPointsGain: 0 };
    }

    xp += gain;
    while (level < maxLevel) {
        const xpNeeded = calculateXpForLevel(level + 1, profile.race);
        if (xp < xpNeeded) break;
        xp -= xpNeeded;
        level += 1;
        skillPointsGain += 5;
    }

    if (level >= maxLevel) {
        level = maxLevel;
        xp = 0;
    }

    return { level, xp, skillPointsGain };
}

function getGuildBonuses(level) {
    const safe = Math.max(1, Number(level) || 1);
    return {
        xpBonusPct: Math.min(25, Math.floor((safe - 1) / 5) * 2),
        crystalBonusPct: Math.min(20, Math.floor((safe - 1) / 6) * 2)
    };
}

function getGuildRole(guild, profileId) {
    const pid = Math.max(0, Number(profileId) || 0);
    if (!guild || !pid) return 'none';
    if (Math.max(0, Number(guild.ownerProfileId) || 0) === pid) return 'leader';
    if (getOfficerIds(guild).includes(pid)) return 'officer';
    return 'member';
}

function canManageGuild(guild, profileId) {
    return getGuildRole(guild, profileId) === 'leader';
}

function canClaimGuildRewards(guild, profileId) {
    const role = getGuildRole(guild, profileId);
    return role === 'leader' || role === 'officer';
}

async function refreshGuildMemberCount(guildId, transaction = null) {
    const count = await Profiles.count({ where: { playerGuildId: guildId }, transaction });
    const guild = await PlayerGuild.findByPk(guildId, { transaction });
    if (!guild) return 0;
    guild.membersCount = Math.max(0, Number(count) || 0);
    await guild.save({ transaction });
    return guild.membersCount;
}

async function createGuildForProfile(profileId, discordGuildId, rawName) {
    const name = normalizeGuildName(rawName);
    if (!name) return { ok: false, reason: 'INVALID_NAME' };
    const nameKey = guildNameKey(name);

    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };
        if (profile.playerGuildId) return { ok: false, reason: 'ALREADY_IN_GUILD' };
        const currentCrystals = Math.max(0, Number(profile.crystals) || 0);
        if (currentCrystals < GUILD_CREATE_COST_CRYSTALS) {
            return {
                ok: false,
                reason: 'NOT_ENOUGH_CRYSTALS',
                requiredCrystals: GUILD_CREATE_COST_CRYSTALS,
                currentCrystals
            };
        }

        const exists = await PlayerGuild.findOne({
            where: { discordGuildId: String(discordGuildId), nameKey },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (exists) return { ok: false, reason: 'NAME_TAKEN' };

        const guild = await PlayerGuild.create({
            discordGuildId: String(discordGuildId),
            name,
            nameKey,
            ownerProfileId: profile.id,
            level: 1,
            xp: 0,
            xpToNextLevel: xpToNext(1),
            lifetimeXp: 0,
            membersCount: 1,
            totalKills: 0,
            totalQuestClaims: 0,
            totalRaidWins: 0,
            officerProfileIds: [],
            missionState: buildMissionState()
        }, { transaction });

        profile.playerGuildId = guild.id;
        profile.playerGuildJoinedAt = new Date();
        profile.crystals = currentCrystals - GUILD_CREATE_COST_CRYSTALS;
        await profile.save({ transaction });

        return { ok: true, guild };
    });
}

async function joinGuildForProfile(profileId, discordGuildId, rawName) {
    const name = normalizeGuildName(rawName);
    if (!name) return { ok: false, reason: 'INVALID_NAME' };
    const nameKey = guildNameKey(name);

    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };
        if (profile.playerGuildId) return { ok: false, reason: 'ALREADY_IN_GUILD' };

        const guild = await PlayerGuild.findOne({
            where: { discordGuildId: String(discordGuildId), nameKey },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!guild) return { ok: false, reason: 'NOT_FOUND' };

        const membersCount = await Profiles.count({ where: { playerGuildId: guild.id }, transaction });
        if (membersCount >= GUILD_MEMBER_CAP) return { ok: false, reason: 'FULL' };

        profile.playerGuildId = guild.id;
        profile.playerGuildJoinedAt = new Date();
        await profile.save({ transaction });
        await refreshGuildMemberCount(guild.id, transaction);
        await guild.reload({ transaction });

        return { ok: true, guild };
    });
}

async function leaveGuildForProfile(profileId) {
    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };
        const guildId = Number(profile.playerGuildId) || 0;
        if (!guildId) return { ok: false, reason: 'NOT_IN_GUILD' };

        const guild = await PlayerGuild.findByPk(guildId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!guild) {
            profile.playerGuildId = null;
            profile.playerGuildJoinedAt = null;
            await profile.save({ transaction });
            return { ok: true, leftGuildName: 'Unknown', disbanded: false };
        }

        profile.playerGuildId = null;
        profile.playerGuildJoinedAt = null;
        await profile.save({ transaction });

        const members = await Profiles.findAll({
            where: { playerGuildId: guild.id },
            order: [['playerGuildJoinedAt', 'ASC'], ['id', 'ASC']],
            transaction
        });

        if (!members.length) {
            const leftGuildName = guild.name;
            await guild.destroy({ transaction });
            return { ok: true, leftGuildName, disbanded: true };
        }

        if (Number(guild.ownerProfileId) === profile.id) {
            guild.ownerProfileId = members[0].id;
            const officers = getOfficerIds(guild).filter((id) => id !== members[0].id);
            guild.officerProfileIds = officers;
        }
        if (getOfficerIds(guild).includes(profile.id)) {
            guild.officerProfileIds = getOfficerIds(guild).filter((id) => id !== profile.id);
        }
        guild.membersCount = members.length;
        await guild.save({ transaction });

        return { ok: true, leftGuildName: guild.name, disbanded: false };
    });
}

async function getGuildByProfile(profileId) {
    const profile = await Profiles.findByPk(profileId);
    if (!profile || !profile.playerGuildId) return null;
    const guild = await PlayerGuild.findByPk(profile.playerGuildId);
    if (!guild) return null;
    const normalizedMission = normalizeMissionState(guild.missionState);
    if (JSON.stringify(normalizedMission) !== JSON.stringify(guild.missionState || {})) {
        guild.missionState = normalizedMission;
        await guild.save();
    }
    return guild;
}

async function canProfileClaimGuildRewards(profileId) {
    const profile = await Profiles.findByPk(profileId);
    if (!profile || !profile.playerGuildId) return { ok: false, allowed: false, role: 'none', guild: null };
    const guild = await PlayerGuild.findByPk(profile.playerGuildId);
    if (!guild) return { ok: false, allowed: false, role: 'none', guild: null };
    const role = getGuildRole(guild, profileId);
    return { ok: true, allowed: canClaimGuildRewards(guild, profileId), role, guild };
}

async function setOfficerByUserId({
    discordGuildId,
    executorProfileId,
    targetUserId,
    makeOfficer
}) {
    return sequelize.transaction(async (transaction) => {
        const executor = await Profiles.findByPk(executorProfileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!executor || !executor.playerGuildId) return { ok: false, reason: 'NOT_IN_GUILD' };

        const guild = await PlayerGuild.findByPk(executor.playerGuildId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!guild || String(guild.discordGuildId) !== String(discordGuildId)) {
            return { ok: false, reason: 'GUILD_NOT_FOUND' };
        }
        if (!canManageGuild(guild, executorProfileId)) return { ok: false, reason: 'NOT_LEADER' };

        const target = await Profiles.findOne({
            where: { userId: String(targetUserId) },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!target) return { ok: false, reason: 'TARGET_NO_PROFILE' };
        if (Math.max(0, Number(target.playerGuildId) || 0) !== guild.id) return { ok: false, reason: 'TARGET_NOT_MEMBER' };
        if (Math.max(0, Number(target.id) || 0) === Math.max(0, Number(guild.ownerProfileId) || 0)) {
            return { ok: false, reason: 'TARGET_IS_LEADER' };
        }

        const officers = getOfficerIds(guild);
        const isOfficer = officers.includes(target.id);
        if (makeOfficer && isOfficer) return { ok: false, reason: 'ALREADY_OFFICER' };
        if (!makeOfficer && !isOfficer) return { ok: false, reason: 'NOT_OFFICER' };

        guild.officerProfileIds = makeOfficer
            ? [...officers, target.id]
            : officers.filter((id) => id !== target.id);
        await guild.save({ transaction });

        return {
            ok: true,
            guild,
            targetProfileId: target.id,
            targetName: target.name,
            newRole: makeOfficer ? 'officer' : 'member'
        };
    });
}

async function getGuildInfo(discordGuildId, nameOrNull = null, profileIdOrNull = null) {
    if (nameOrNull) {
        const name = normalizeGuildName(nameOrNull);
        if (!name) return null;
        const guild = await PlayerGuild.findOne({
            where: {
                discordGuildId: String(discordGuildId),
                nameKey: guildNameKey(name)
            }
        });
        if (!guild) return null;
        const normalizedMission = normalizeMissionState(guild.missionState);
        if (JSON.stringify(normalizedMission) !== JSON.stringify(guild.missionState || {})) {
            guild.missionState = normalizedMission;
            await guild.save();
        }
        return guild;
    }
    if (!profileIdOrNull) return null;
    const profile = await Profiles.findByPk(profileIdOrNull);
    if (!profile || !profile.playerGuildId) return null;
    const guild = await PlayerGuild.findByPk(profile.playerGuildId);
    if (!guild) return null;
    const normalizedMission = normalizeMissionState(guild.missionState);
    if (JSON.stringify(normalizedMission) !== JSON.stringify(guild.missionState || {})) {
        guild.missionState = normalizedMission;
        await guild.save();
    }
    return guild;
}

async function getGuildTop(discordGuildId, limit = 10) {
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 10));
    return PlayerGuild.findAll({
        where: { discordGuildId: String(discordGuildId) },
        order: [['level', 'DESC'], ['lifetimeXp', 'DESC'], ['membersCount', 'DESC'], ['createdAt', 'ASC']],
        limit: safeLimit
    });
}

async function recordGuildProgressByProfile(profileId, payload = {}) {
    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile || !profile.playerGuildId) return { ok: false, skipped: true, reason: 'NO_GUILD' };

        const guild = await PlayerGuild.findByPk(profile.playerGuildId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!guild) {
            profile.playerGuildId = null;
            profile.playerGuildJoinedAt = null;
            await profile.save({ transaction });
            return { ok: false, skipped: true, reason: 'GUILD_MISSING' };
        }

        const kills = Math.max(0, Number(payload.kills) || 0);
        const questClaims = Math.max(0, Number(payload.questClaims) || 0);
        const raidWins = Math.max(0, Number(payload.raidWins) || 0);
        const xpGain = computeGuildXpGain(payload);
        const missionBefore = normalizeMissionState(guild.missionState);
        const dailyWasReady = isSingleMissionReady(missionBefore.daily);
        const weeklyWasReady = isSingleMissionReady(missionBefore.weekly);
        const missionAfter = incrementMissionProgress(missionBefore, { kills, questClaims, raidWins });
        const dailyIsReady = isSingleMissionReady(missionAfter.daily);
        const weeklyIsReady = isSingleMissionReady(missionAfter.weekly);

        guild.totalKills = Math.max(0, Number(guild.totalKills) || 0) + kills;
        guild.totalQuestClaims = Math.max(0, Number(guild.totalQuestClaims) || 0) + questClaims;
        guild.totalRaidWins = Math.max(0, Number(guild.totalRaidWins) || 0) + raidWins;
        guild.missionState = missionAfter;
        const progress = applyGuildXp(guild, xpGain);
        await guild.save({ transaction });

        return {
            ok: true,
            guildId: guild.id,
            guildName: guild.name,
            xpGain,
            leveled: progress.leveled,
            level: guild.level,
            missionReady: isMissionReady(missionAfter),
            dailyReady: isMissionReady(missionAfter, 'daily'),
            weeklyReady: isMissionReady(missionAfter, 'weekly'),
            dailyNewReady: !dailyWasReady && dailyIsReady,
            weeklyNewReady: !weeklyWasReady && weeklyIsReady
        };
    });
}

async function claimGuildMissionRewards(profileId, discordGuildId, scope = 'all') {
    const wanted = ['daily', 'weekly', 'all'].includes(String(scope)) ? String(scope) : 'all';
    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile || !profile.playerGuildId) return { ok: false, reason: 'NOT_IN_GUILD' };

        const guild = await PlayerGuild.findByPk(profile.playerGuildId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!guild || String(guild.discordGuildId) !== String(discordGuildId)) {
            return { ok: false, reason: 'GUILD_NOT_FOUND' };
        }

        if (!canClaimGuildRewards(guild, profileId)) return { ok: false, reason: 'NOT_ALLOWED' };

        const mission = normalizeMissionState(guild.missionState);
        guild.missionState = mission;

        const canDaily = isSingleMissionReady(mission.daily);
        const canWeekly = isSingleMissionReady(mission.weekly);
        const selectedCycles = wanted === 'all'
            ? ['daily', 'weekly']
            : [wanted];
        const claimableCycles = selectedCycles.filter((cycle) =>
            cycle === 'daily' ? canDaily : canWeekly
        );

        if (!claimableCycles.length) {
            await guild.save({ transaction });
            const selectedStates = selectedCycles.map((cycle) => (cycle === 'daily' ? mission.daily : mission.weekly));
            const allSelectedClaimed = selectedStates.length > 0 && selectedStates.every((s) => !!s.claimed);
            return { ok: false, reason: allSelectedClaimed ? 'ALREADY_CLAIMED' : 'NOT_READY', guild };
        }

        const members = await Profiles.findAll({
            where: { playerGuildId: guild.id },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!members.length) return { ok: false, reason: 'NO_MEMBERS' };

        const rewardCrystals = claimableCycles.reduce((sum, cycle) => {
            const s = cycle === 'daily' ? mission.daily : mission.weekly;
            return sum + Math.max(0, Number(s.rewardCrystals) || 0);
        }, 0);
        const rewardXp = claimableCycles.reduce((sum, cycle) => {
            const s = cycle === 'daily' ? mission.daily : mission.weekly;
            return sum + Math.max(0, Number(s.rewardXp) || 0);
        }, 0);
        const memberSummaries = [];

        for (const member of members) {
            const leveled = applyProfileXpWithRaceCap(member, rewardXp);
            member.level = leveled.level;
            member.xp = leveled.xp;
            member.skillPoints = Math.max(0, Number(member.skillPoints) || 0) + Math.max(0, Number(leveled.skillPointsGain) || 0);
            member.crystals = Math.max(0, Number(member.crystals) || 0) + rewardCrystals;
            await member.save({ transaction });
            memberSummaries.push({
                profileId: member.id,
                name: member.name,
                xp: rewardXp,
                crystals: rewardCrystals
            });
        }

        const nowMs = Date.now();
        for (const cycle of claimableCycles) {
            const target = cycle === 'daily' ? mission.daily : mission.weekly;
            target.claimed = true;
            target.claimedAt = nowMs;
            target.claimedByProfileId = profile.id;
        }
        guild.missionState = mission;
        await guild.save({ transaction });

        return {
            ok: true,
            guild,
            mission,
            claimedCycles: claimableCycles,
            memberCount: members.length,
            rewardXp,
            rewardCrystals,
            memberSummaries
        };
    });
}

async function getOwnerName(ownerProfileId) {
    if (!ownerProfileId) return 'Unknown';
    const owner = await Profiles.findByPk(ownerProfileId);
    return owner?.name || 'Unknown';
}

module.exports = {
    GUILD_MEMBER_CAP,
    GUILD_MAX_LEVEL,
    GUILD_CREATE_COST_CRYSTALS,
    normalizeGuildName,
    getGuildBonuses,
    getGuildRole,
    canManageGuild,
    canClaimGuildRewards,
    createGuildForProfile,
    joinGuildForProfile,
    leaveGuildForProfile,
    setOfficerByUserId,
    getGuildByProfile,
    canProfileClaimGuildRewards,
    claimGuildMissionRewards,
    getGuildInfo,
    getGuildTop,
    getOwnerName,
    recordGuildProgressByProfile
};
