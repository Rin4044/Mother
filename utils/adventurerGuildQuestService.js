const { sequelize, AdventurerGuildConfig, Profiles, Monsters } = require('../database');
const { calculateXpForLevel } = require('./xpUtils');
const { getMaxLevelForRace } = require('./evolutionConfig');

const KILL_ANY_TARGETS = [3, 5, 8, 12, 18];
const MAX_ACTIVE_QUESTS = 3;
const QUEST_BOARD_SIZE = 5;
const DEFAULT_BOARD_MIX = { generalCount: 2, specificCount: 3 };
const DAILY_KILL_TARGETS = [3, 6, 10];
const WEEKLY_KILL_TARGETS = [20, 45, 80];
const DAILY_QUEST_COUNT = 3;
const WEEKLY_QUEST_COUNT = 3;

function sanitizeRefreshSeconds(value) {
    const seconds = Number(value) || 3600;
    return Math.max(300, seconds);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeQuestMix(rawMix = null) {
    const src = rawMix && typeof rawMix === 'object' ? rawMix : {};

    let generalCount = clamp(
        Math.floor(Number(src.generalCount) || DEFAULT_BOARD_MIX.generalCount),
        1,
        QUEST_BOARD_SIZE
    );
    let specificCount = clamp(
        Math.floor(Number(src.specificCount) || DEFAULT_BOARD_MIX.specificCount),
        0,
        QUEST_BOARD_SIZE
    );

    const total = generalCount + specificCount;
    if (total > QUEST_BOARD_SIZE) {
        const overflow = total - QUEST_BOARD_SIZE;
        if (specificCount >= overflow) {
            specificCount -= overflow;
        } else {
            generalCount = Math.max(1, generalCount - (overflow - specificCount));
            specificCount = 0;
        }
    } else if (total < QUEST_BOARD_SIZE) {
        generalCount = Math.min(QUEST_BOARD_SIZE, generalCount + (QUEST_BOARD_SIZE - total));
    }

    return { generalCount, specificCount };
}

function hashSeed(base, salt = 0) {
    const x = Math.abs(Math.floor(Number(base) || 0)) + (Math.floor(Number(salt) || 0) * 1103515245);
    return Math.abs((x ^ (x >>> 16)) % 2147483647);
}

function pickDeterministicIndices(length, count, seedBase) {
    const safeLength = Math.max(0, Number(length) || 0);
    const safeCount = Math.max(0, Number(count) || 0);
    if (!safeLength || !safeCount) return [];

    const indices = [...Array(safeLength).keys()];
    const out = [];

    let cursorSeed = hashSeed(seedBase, 17);
    while (indices.length > 0 && out.length < safeCount) {
        const idx = cursorSeed % indices.length;
        out.push(indices[idx]);
        indices.splice(idx, 1);
        cursorSeed = hashSeed(cursorSeed, out.length + 3);
    }

    return out;
}

function isBossLikeName(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return false;
    const bossTokens = ['queen', 'lord', 'hero', 'ruler', 'sword god', 'gulied', 'ariel'];
    return bossTokens.some((token) => n.includes(token));
}

function dailyMonsterWeight(monster) {
    const level = Math.max(1, Number(monster?.level) || 1);
    const type = String(monster?.monsterType || 'monster').toLowerCase();
    let w = 1000;

    if (level <= 30) w += 450;
    else if (level <= 60) w += 320;
    else if (level <= 100) w += 160;
    else if (level <= 140) w += 40;
    else w -= 220;

    if (type === 'dragon') w -= 260;
    else if (type === 'wyrm') w -= 140;

    if (isBossLikeName(monster?.name)) w -= 700;
    return Math.max(1, w);
}

function weeklyMonsterWeight(monster) {
    const level = Math.max(1, Number(monster?.level) || 1);
    const type = String(monster?.monsterType || 'monster').toLowerCase();
    let w = 900;

    if (level <= 60) w += 180;
    else if (level <= 120) w += 140;
    else if (level <= 180) w += 80;
    else if (level <= 230) w += 20;
    else w -= 120;

    if (type === 'dragon') w -= 120;
    else if (type === 'wyrm') w -= 70;

    if (isBossLikeName(monster?.name)) w -= 380;
    return Math.max(1, w);
}

function pickWeightedMonsters(monsters, count, seedBase, weightFn) {
    const safe = Array.isArray(monsters) ? monsters : [];
    const need = Math.max(0, Number(count) || 0);
    if (!safe.length || !need) return [];

    const ranked = safe.map((monster, idx) => {
        const seed = hashSeed(seedBase, Number(monster?.id) || (idx + 1));
        const noise = seed % 1000;
        const weight = Math.max(1, Number(weightFn(monster)) || 1);
        return { monster, score: (weight * 1000) + noise };
    });

    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, need).map((entry) => entry.monster);
}

function computeQuestReward(quest) {
    const target = Math.max(1, Number(quest?.targetKills) || 1);
    let reward = 60 + (target * 38);
    if (String(quest?.objectiveType) === 'kill_specific') reward += 100;
    return Math.max(80, Math.floor(reward / 10) * 10);
}

function computeQuestXpReward(quest) {
    const target = Math.max(1, Number(quest?.targetKills) || 1);
    let rewardXp = 90 + (target * 42);
    if (String(quest?.objectiveType) === 'kill_specific') rewardXp += 120;
    return Math.max(80, Math.floor(rewardXp));
}

function buildQuestTitle(quest) {
    const target = Math.max(1, Number(quest?.targetKills) || 1);
    if (String(quest?.objectiveType) !== 'kill_specific') {
        return `Slay ${target} monsters`;
    }
    const monsterName = String(quest?.monsterName || 'specific monster').trim();
    return `Slay ${target}x ${monsterName}`;
}

function normalizeQuest(quest, fallbackId) {
    const src = quest && typeof quest === 'object' ? { ...quest } : {};
    const objectiveType = String(src.objectiveType || 'kill_any').trim().toLowerCase() === 'kill_specific'
        ? 'kill_specific'
        : 'kill_any';

    const normalized = {
        id: String(src.id || fallbackId),
        objectiveType,
        targetKills: Math.max(1, Number(src.targetKills) || 1),
        monsterId: Number.isInteger(Number(src.monsterId)) ? Number(src.monsterId) : null,
        monsterName: src.monsterName ? String(src.monsterName).trim() : null
    };

    normalized.rewardCrystals = Math.max(1, Number(src.rewardCrystals) || computeQuestReward(normalized));
    normalized.rewardXp = Math.max(1, Number(src.rewardXp) || computeQuestXpReward(normalized));
    normalized.title = buildQuestTitle(normalized);

    if (normalized.objectiveType !== 'kill_specific') {
        normalized.monsterId = null;
        normalized.monsterName = null;
    }

    return normalized;
}

function createKillAnyQuest(id, targetKills) {
    return normalizeQuest({ id, objectiveType: 'kill_any', targetKills }, id);
}

function startOfUtcDayMs(nowMs = Date.now()) {
    const d = new Date(nowMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfUtcWeekMs(nowMs = Date.now()) {
    const dayStart = startOfUtcDayMs(nowMs);
    const day = new Date(dayStart).getUTCDay(); // 0 sun ... 6 sat
    const deltaToMonday = (day + 6) % 7;
    return dayStart - (deltaToMonday * 24 * 60 * 60 * 1000);
}

function createCycleQuest(id, targetKills, rewardCrystals, rewardXp, title, objectiveType = 'kill_any', monster = null) {
    return {
        id: String(id),
        objectiveType: objectiveType === 'kill_specific' ? 'kill_specific' : 'kill_any',
        targetKills: Math.max(1, Number(targetKills) || 1),
        rewardCrystals: Math.max(1, Number(rewardCrystals) || 1),
        rewardXp: Math.max(1, Number(rewardXp) || 1),
        title: String(title || `Slay ${targetKills} monsters`),
        monsterId: monster && Number.isInteger(Number(monster.id)) ? Number(monster.id) : null,
        monsterName: monster?.name ? String(monster.name).trim() : null
    };
}

function buildDailyBoard(nowMs = Date.now(), monsterPool = []) {
    const cycleStart = startOfUtcDayMs(nowMs);
    const resetAt = cycleStart + (24 * 60 * 60 * 1000);
    const monsters = Array.isArray(monsterPool)
        ? monsterPool.filter((m) => m && m.id && m.name)
        : [];
    const pickedMonsters = pickWeightedMonsters(
        monsters,
        Math.min(2, monsters.length),
        cycleStart + 711,
        dailyMonsterWeight
    );
    const quests = [];

    // 1 general daily
    const generalTarget = DAILY_KILL_TARGETS[0];
    quests.push(createCycleQuest(
        `daily-${cycleStart}-1`,
        generalTarget,
        70 + (generalTarget * 20),
        80 + (generalTarget * 24),
        `Daily: Slay ${generalTarget} monsters`
    ));

    // up to 2 specific dailies
    let slot = 2;
    for (const monster of pickedMonsters) {
        const target = DAILY_KILL_TARGETS[Math.min(DAILY_KILL_TARGETS.length - 1, slot - 1)];
        quests.push(createCycleQuest(
            `daily-${cycleStart}-${slot}`,
            target,
            100 + (target * 24),
            120 + (target * 28),
            `Daily: Slay ${target}x ${monster.name}`,
            'kill_specific',
            monster
        ));
        slot += 1;
        if (quests.length >= DAILY_QUEST_COUNT) break;
    }

    while (quests.length < DAILY_QUEST_COUNT) {
        const idx = quests.length % DAILY_KILL_TARGETS.length;
        const target = DAILY_KILL_TARGETS[idx];
        quests.push(createCycleQuest(
            `daily-${cycleStart}-${quests.length + 1}`,
            target,
            70 + (target * 20),
            80 + (target * 24),
            `Daily: Slay ${target} monsters`
        ));
    }

    return { cycleStart, resetAt, quests };
}

function buildWeeklyBoard(nowMs = Date.now(), monsterPool = []) {
    const cycleStart = startOfUtcWeekMs(nowMs);
    const resetAt = cycleStart + (7 * 24 * 60 * 60 * 1000);
    const monsters = Array.isArray(monsterPool)
        ? monsterPool.filter((m) => m && m.id && m.name)
        : [];
    const pickedMonsters = pickWeightedMonsters(
        monsters,
        Math.min(2, monsters.length),
        cycleStart + 977,
        weeklyMonsterWeight
    );
    const quests = [];

    // 1 general weekly
    const generalTarget = WEEKLY_KILL_TARGETS[0];
    quests.push(createCycleQuest(
        `weekly-${cycleStart}-1`,
        generalTarget,
        220 + (generalTarget * 14),
        260 + (generalTarget * 20),
        `Weekly: Slay ${generalTarget} monsters`
    ));

    // up to 2 specific weeklies
    let slot = 2;
    for (const monster of pickedMonsters) {
        const target = WEEKLY_KILL_TARGETS[Math.min(WEEKLY_KILL_TARGETS.length - 1, slot - 1)];
        quests.push(createCycleQuest(
            `weekly-${cycleStart}-${slot}`,
            target,
            280 + (target * 16),
            330 + (target * 20),
            `Weekly: Slay ${target}x ${monster.name}`,
            'kill_specific',
            monster
        ));
        slot += 1;
        if (quests.length >= WEEKLY_QUEST_COUNT) break;
    }

    while (quests.length < WEEKLY_QUEST_COUNT) {
        const idx = quests.length % WEEKLY_KILL_TARGETS.length;
        const target = WEEKLY_KILL_TARGETS[idx];
        quests.push(createCycleQuest(
            `weekly-${cycleStart}-${quests.length + 1}`,
            target,
            220 + (target * 14),
            260 + (target * 20),
            `Weekly: Slay ${target} monsters`
        ));
    }

    return { cycleStart, resetAt, quests };
}

function normalizeCycleProgress(raw, board) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const boardIds = new Set((board.quests || []).map((q) => String(q.id)));
    const isSameCycle = Number(src.cycleStart) === Number(board.cycleStart);

    if (!isSameCycle) {
        return {
            cycleStart: Number(board.cycleStart),
            progressByQuestId: {},
            claimedQuestIds: []
        };
    }

    const progressByQuestId = {};
    const srcProgress = src.progressByQuestId && typeof src.progressByQuestId === 'object'
        ? src.progressByQuestId
        : {};
    for (const [qid, value] of Object.entries(srcProgress)) {
        if (!boardIds.has(String(qid))) continue;
        progressByQuestId[String(qid)] = Math.max(0, Number(value) || 0);
    }

    const claimedQuestIds = Array.isArray(src.claimedQuestIds)
        ? src.claimedQuestIds.map(String).filter((qid) => boardIds.has(qid))
        : [];

    return {
        cycleStart: Number(board.cycleStart),
        progressByQuestId,
        claimedQuestIds
    };
}

function buildCycleRows(board, progressState) {
    const claimed = new Set(progressState.claimedQuestIds || []);
    const progress = progressState.progressByQuestId || {};

    return (board.quests || []).map((quest) => {
        const qid = String(quest.id);
        const target = Math.max(1, Number(quest.targetKills) || 1);
        const current = Math.min(target, Math.max(0, Number(progress[qid]) || 0));
        const isClaimed = claimed.has(qid);

        return {
            ...quest,
            current,
            status: isClaimed ? 'completed' : (current >= target ? 'ready' : 'active')
        };
    });
}

function createSpecificQuest(id, monster, variantSeed) {
    const targetKills = clamp(2 + (hashSeed(variantSeed, 15) % 4), 2, 5);
    return normalizeQuest({
        id,
        objectiveType: 'kill_specific',
        targetKills,
        monsterId: Number(monster?.id) || null,
        monsterName: String(monster?.name || '').trim() || null
    }, id);
}

async function loadMonsterPool(transaction = null) {
    try {
        return await Monsters.findAll({
            attributes: ['id', 'name', 'level', 'monsterType'],
            transaction
        });
    } catch {
        return [];
    }
}

function buildQuestBoardFromPool({ cycleStart, resetAt, monsterPool, mix = DEFAULT_BOARD_MIX, seedOverride = null }) {
    const monsters = Array.isArray(monsterPool)
        ? monsterPool.filter((m) => m && m.id && m.name).sort((a, b) => Number(a.id) - Number(b.id))
        : [];

    const resolvedMix = normalizeQuestMix(mix);
    const seedBase = Number(seedOverride) || Number(cycleStart) || Date.now();
    const quests = [];

    const killAnyOffset = Math.abs(Math.floor(seedBase / 1000)) % KILL_ANY_TARGETS.length;
    for (let i = 0; i < resolvedMix.generalCount; i++) {
        const targetIndex = (killAnyOffset + (i * 2)) % KILL_ANY_TARGETS.length;
        quests.push(createKillAnyQuest(`${cycleStart}-${quests.length + 1}`, KILL_ANY_TARGETS[targetIndex]));
    }

    const remainingSlots = Math.max(0, QUEST_BOARD_SIZE - quests.length);
    const specificCount = Math.min(remainingSlots, resolvedMix.specificCount, monsters.length);
    const picked = pickDeterministicIndices(monsters.length, specificCount, seedBase);

    for (const monsterIndex of picked) {
        const monster = monsters[monsterIndex];
        quests.push(createSpecificQuest(`${cycleStart}-${quests.length + 1}`, monster, seedBase + quests.length + 1));
    }

    while (quests.length < QUEST_BOARD_SIZE) {
        const idx = quests.length % KILL_ANY_TARGETS.length;
        quests.push(createKillAnyQuest(`${cycleStart}-${quests.length + 1}`, KILL_ANY_TARGETS[idx]));
    }

    return { cycleStart, resetAt, quests: quests.slice(0, QUEST_BOARD_SIZE) };
}

async function generateBoardForTimestamp({ refreshSeconds, questMix, nowMs, transaction = null, seedOverride = null }) {
    const safeRefresh = sanitizeRefreshSeconds(refreshSeconds);
    const periodMs = safeRefresh * 1000;
    const cycleStart = Math.floor(nowMs / periodMs) * periodMs;
    const resetAt = cycleStart + periodMs;
    const monsterPool = await loadMonsterPool(transaction);

    return buildQuestBoardFromPool({
        cycleStart,
        resetAt,
        monsterPool,
        mix: normalizeQuestMix(questMix),
        seedOverride: seedOverride || cycleStart
    });
}

async function normalizeQuestBoard(rawBoard, refreshSeconds, questMix, nowMs = Date.now(), transaction = null, options = {}) {
    const board = rawBoard && typeof rawBoard === 'object' ? rawBoard : null;
    const forceRegenerate = !!options.forceRegenerate;

    const safeRefresh = sanitizeRefreshSeconds(refreshSeconds);
    const periodMs = safeRefresh * 1000;
    const cycleStart = Math.floor(nowMs / periodMs) * periodMs;
    const resetAt = cycleStart + periodMs;

    if (!forceRegenerate && board && Number(board.cycleStart) === cycleStart && Array.isArray(board.quests) && board.quests.length > 0) {
        const normalizedQuests = board.quests.map((quest, index) => normalizeQuest(quest, `${cycleStart}-${index + 1}`));
        const normalizedBoard = { cycleStart, resetAt, quests: normalizedQuests };
        const changed = JSON.stringify(normalizedBoard) !== JSON.stringify({
            cycleStart: Number(board.cycleStart) || cycleStart,
            resetAt: Number(board.resetAt) || resetAt,
            quests: board.quests
        });

        return { changed, board: normalizedBoard };
    }

    const newBoard = await generateBoardForTimestamp({
        refreshSeconds,
        questMix,
        nowMs,
        transaction,
        seedOverride: options.seedOverride || nowMs
    });

    return { changed: true, board: newBoard };
}

function getGuildQuestStateRoot(profile) {
    const root = profile.rulerProgress && typeof profile.rulerProgress === 'object'
        ? { ...profile.rulerProgress }
        : {};
    const guildRoot = root.adventurerGuildQuests && typeof root.adventurerGuildQuests === 'object'
        ? { ...root.adventurerGuildQuests }
        : {};
    return { root, guildRoot };
}

function getCycleQuestStateRoot(profile) {
    const root = profile.rulerProgress && typeof profile.rulerProgress === 'object'
        ? { ...profile.rulerProgress }
        : {};
    const cycleRoot = root.cycleQuests && typeof root.cycleQuests === 'object'
        ? { ...root.cycleQuests }
        : {};
    return { root, cycleRoot };
}

function normalizePlayerGuildQuestState(rawState, board) {
    const src = rawState && typeof rawState === 'object' ? rawState : {};
    const activeQuestIds = Array.isArray(src.activeQuestIds) ? src.activeQuestIds.map(String) : [];
    const completedQuestIds = Array.isArray(src.completedQuestIds) ? src.completedQuestIds.map(String) : [];
    const progressByQuestId = src.progressByQuestId && typeof src.progressByQuestId === 'object'
        ? { ...src.progressByQuestId }
        : {};
    const boardQuestIdSet = new Set((board.quests || []).map((q) => String(q.id)));

    const isSameCycle = Number(src.boardCycleStart) === Number(board.cycleStart);
    if (!isSameCycle) {
        return {
            boardCycleStart: Number(board.cycleStart),
            activeQuestIds: [],
            completedQuestIds: [],
            progressByQuestId: {}
        };
    }

    const filteredActive = activeQuestIds.filter((id) => boardQuestIdSet.has(id));
    const filteredCompleted = completedQuestIds.filter((id) => boardQuestIdSet.has(id));
    const filteredProgress = {};

    for (const [questId, value] of Object.entries(progressByQuestId)) {
        if (!boardQuestIdSet.has(String(questId))) continue;
        filteredProgress[String(questId)] = Math.max(0, Number(value) || 0);
    }

    return {
        boardCycleStart: Number(board.cycleStart),
        activeQuestIds: filteredActive,
        completedQuestIds: filteredCompleted,
        progressByQuestId: filteredProgress
    };
}

async function ensureGuildQuestBoard(guildId, transaction = null) {
    if (!guildId) return null;

    const config = await AdventurerGuildConfig.findOne({
        where: { guildId },
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined
    });
    if (!config) return null;

    const mix = normalizeQuestMix(config.questBoardMix);
    const normalized = await normalizeQuestBoard(
        config.questBoardState,
        config.questRefreshSeconds,
        mix,
        Date.now(),
        transaction
    );

    if (normalized.changed) {
        config.questBoardState = normalized.board;
        await config.save({ transaction });
    }

    return { config, board: normalized.board };
}

function buildQuestRows(board, playerState) {
    const progress = playerState?.progressByQuestId || {};
    const active = new Set(playerState?.activeQuestIds || []);
    const completed = new Set(playerState?.completedQuestIds || []);

    return (board.quests || []).map((quest) => {
        const normalized = normalizeQuest(quest, quest.id);
        const id = String(normalized.id);
        const target = Math.max(1, Number(normalized.targetKills) || 1);
        const current = Math.min(target, Math.max(0, Number(progress[id]) || 0));

        return {
            ...normalized,
            current,
            status: completed.has(id) ? 'completed' : (active.has(id) ? 'active' : 'available'),
            canComplete: active.has(id) && !completed.has(id) && current >= target
        };
    });
}

async function getQuestPanelData(profileId, guildId) {
    const [profile, boardWrap] = await Promise.all([
        Profiles.findByPk(profileId),
        ensureGuildQuestBoard(guildId)
    ]);
    if (!profile || !boardWrap) return null;

    const { root, guildRoot } = getGuildQuestStateRoot(profile);
    const state = normalizePlayerGuildQuestState(guildRoot[guildId], boardWrap.board);
    guildRoot[guildId] = state;
    root.adventurerGuildQuests = guildRoot;
    profile.rulerProgress = root;
    await profile.save();

    const rows = buildQuestRows(boardWrap.board, state);
    return {
        board: boardWrap.board,
        playerState: state,
        rows,
        maxActive: MAX_ACTIVE_QUESTS
    };
}

async function getDailyWeeklyQuestPanelData(profileId) {
    const profile = await Profiles.findByPk(profileId);
    if (!profile) return null;

    const now = Date.now();
    const monsterPool = await loadMonsterPool();
    const dailyBoard = buildDailyBoard(now, monsterPool);
    const weeklyBoard = buildWeeklyBoard(now, monsterPool);

    const { root, cycleRoot } = getCycleQuestStateRoot(profile);
    const dailyState = normalizeCycleProgress(cycleRoot.daily, dailyBoard);
    const weeklyState = normalizeCycleProgress(cycleRoot.weekly, weeklyBoard);

    cycleRoot.daily = dailyState;
    cycleRoot.weekly = weeklyState;
    root.cycleQuests = cycleRoot;
    profile.rulerProgress = root;
    await profile.save();

    return {
        daily: {
            board: dailyBoard,
            state: dailyState,
            rows: buildCycleRows(dailyBoard, dailyState)
        },
        weekly: {
            board: weeklyBoard,
            state: weeklyState,
            rows: buildCycleRows(weeklyBoard, weeklyState)
        }
    };
}

async function acceptQuest(profileId, guildId, questId) {
    const qid = String(questId || '');
    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };

        const boardWrap = await ensureGuildQuestBoard(guildId, transaction);
        if (!boardWrap) return { ok: false, reason: 'NO_BOARD' };

        const { root, guildRoot } = getGuildQuestStateRoot(profile);
        const state = normalizePlayerGuildQuestState(guildRoot[guildId], boardWrap.board);
        const rows = buildQuestRows(boardWrap.board, state);
        const target = rows.find((row) => String(row.id) === qid);
        if (!target) return { ok: false, reason: 'UNKNOWN_QUEST' };
        if (target.status === 'completed') return { ok: false, reason: 'ALREADY_COMPLETED' };
        if (target.status === 'active') return { ok: false, reason: 'ALREADY_ACTIVE' };
        if ((state.activeQuestIds || []).length >= MAX_ACTIVE_QUESTS) return { ok: false, reason: 'ACTIVE_LIMIT' };

        state.activeQuestIds = [...state.activeQuestIds, qid];
        state.progressByQuestId[qid] = Math.max(0, Number(state.progressByQuestId[qid]) || 0);
        guildRoot[guildId] = state;
        root.adventurerGuildQuests = guildRoot;
        profile.rulerProgress = root;
        await profile.save({ transaction });
        return { ok: true, quest: target };
    });
}

async function abandonQuest(profileId, guildId, questId) {
    const qid = String(questId || '');
    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };

        const boardWrap = await ensureGuildQuestBoard(guildId, transaction);
        if (!boardWrap) return { ok: false, reason: 'NO_BOARD' };

        const { root, guildRoot } = getGuildQuestStateRoot(profile);
        const state = normalizePlayerGuildQuestState(guildRoot[guildId], boardWrap.board);
        const isActive = state.activeQuestIds.includes(qid);
        if (!isActive) return { ok: false, reason: 'NOT_ACTIVE' };

        state.activeQuestIds = state.activeQuestIds.filter((id) => id !== qid);
        delete state.progressByQuestId[qid];
        guildRoot[guildId] = state;
        root.adventurerGuildQuests = guildRoot;
        profile.rulerProgress = root;
        await profile.save({ transaction });
        return { ok: true };
    });
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

async function completeQuest(profileId, guildId, questId) {
    const qid = String(questId || '');
    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };

        const boardWrap = await ensureGuildQuestBoard(guildId, transaction);
        if (!boardWrap) return { ok: false, reason: 'NO_BOARD' };

        const { root, guildRoot } = getGuildQuestStateRoot(profile);
        const state = normalizePlayerGuildQuestState(guildRoot[guildId], boardWrap.board);
        const rows = buildQuestRows(boardWrap.board, state);
        const target = rows.find((row) => String(row.id) === qid);
        if (!target) return { ok: false, reason: 'UNKNOWN_QUEST' };
        if (!state.activeQuestIds.includes(qid)) return { ok: false, reason: 'NOT_ACTIVE' };
        if (state.completedQuestIds.includes(qid)) return { ok: false, reason: 'ALREADY_COMPLETED' };
        if (target.current < target.targetKills) return { ok: false, reason: 'NOT_FINISHED' };

        state.activeQuestIds = state.activeQuestIds.filter((id) => id !== qid);
        state.completedQuestIds = [...state.completedQuestIds, qid];
        guildRoot[guildId] = state;
        root.adventurerGuildQuests = guildRoot;
        profile.rulerProgress = root;

        const rewardXp = Math.max(0, Number(target.rewardXp) || 0);
        const leveled = applyProfileXpWithRaceCap(profile, rewardXp);
        profile.level = leveled.level;
        profile.xp = leveled.xp;
        profile.skillPoints = Math.max(0, Number(profile.skillPoints) || 0) + leveled.skillPointsGain;
        profile.crystals = Math.max(0, Number(profile.crystals) || 0) + Math.max(0, Number(target.rewardCrystals) || 0);
        await profile.save({ transaction });

        return {
            ok: true,
            quest: target,
            rewardCrystals: Math.max(0, Number(target.rewardCrystals) || 0),
            rewardXp,
            levelAfter: Math.max(1, Number(profile.level) || 1),
            skillPointsGain: Math.max(0, Number(leveled.skillPointsGain) || 0),
            balanceCrystals: Math.max(0, Number(profile.crystals) || 0)
        };
    });
}

function normalizeKillMeta(input) {
    const src = input && typeof input === 'object' ? input : {};
    return {
        monsterId: Number.isInteger(Number(src.monsterId)) ? Number(src.monsterId) : null,
        monsterName: src.monsterName ? String(src.monsterName).trim().toLowerCase() : ''
    };
}

function doesKillMatchQuest(quest, killMeta) {
    if (!quest || quest.objectiveType !== 'kill_specific') return false;

    if (quest.monsterId !== null) {
        if (killMeta.monsterId === null || Number(killMeta.monsterId) !== Number(quest.monsterId)) {
            return false;
        }
    } else if (quest.monsterName) {
        if (!killMeta.monsterName || killMeta.monsterName !== String(quest.monsterName).trim().toLowerCase()) {
            return false;
        }
    }

    return true;
}

async function incrementQuestKillProgress(profileId, guildId, killCountOrMeta = 1, maybeMeta = null) {
    const isMetaOnly = killCountOrMeta && typeof killCountOrMeta === 'object' && !Array.isArray(killCountOrMeta);
    const count = isMetaOnly ? 1 : Math.max(0, Number(killCountOrMeta) || 0);
    const killMeta = normalizeKillMeta(isMetaOnly ? killCountOrMeta : maybeMeta);

    if (!profileId || count <= 0) {
        return {
            guildChanged: false,
            cycleChanged: false,
            dailyCompleted: 0,
            weeklyCompleted: 0,
            dailyNewReady: 0,
            weeklyNewReady: 0,
            rewardCrystals: 0,
            rewardXp: 0
        };
    }

    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile) {
            return {
                guildChanged: false,
                cycleChanged: false,
                dailyCompleted: 0,
                weeklyCompleted: 0,
                dailyNewReady: 0,
                weeklyNewReady: 0,
                rewardCrystals: 0,
                rewardXp: 0
            };
        }

        let guildChanged = false;
        if (guildId) {
            const boardWrap = await ensureGuildQuestBoard(guildId, transaction);
            if (boardWrap) {
                const { root, guildRoot } = getGuildQuestStateRoot(profile);
                const state = normalizePlayerGuildQuestState(guildRoot[guildId], boardWrap.board);
                const rows = buildQuestRows(boardWrap.board, state);

                for (const row of rows) {
                    const qid = String(row.id);
                    if (!state.activeQuestIds.includes(qid)) continue;
                    if (state.completedQuestIds.includes(qid)) continue;

                    if (row.objectiveType === 'kill_specific' && !doesKillMatchQuest(row, killMeta)) continue;

                    const prev = Math.max(0, Number(state.progressByQuestId[qid]) || 0);
                    const next = Math.min(Math.max(1, Number(row.targetKills) || 1), prev + count);
                    if (next !== prev) {
                        state.progressByQuestId[qid] = next;
                        guildChanged = true;
                    }
                }

                if (guildChanged) {
                    guildRoot[guildId] = state;
                    root.adventurerGuildQuests = guildRoot;
                    profile.rulerProgress = root;
                }
            }
        }

        const now = Date.now();
        const monsterPool = await loadMonsterPool(transaction);
        const dailyBoard = buildDailyBoard(now, monsterPool);
        const weeklyBoard = buildWeeklyBoard(now, monsterPool);

        const { root: cycleRootWrapper, cycleRoot } = getCycleQuestStateRoot(profile);
        const dailyState = normalizeCycleProgress(cycleRoot.daily, dailyBoard);
        const weeklyState = normalizeCycleProgress(cycleRoot.weekly, weeklyBoard);

        const applyProgress = (board, state) => {
            let changed = false;
            let newlyReadyCount = 0;
            let completedCount = 0;
            const claimed = new Set(state.claimedQuestIds || []);

            for (const quest of board.quests || []) {
                const qid = String(quest.id);
                if (claimed.has(qid)) continue;
                if (quest.objectiveType === 'kill_specific' && !doesKillMatchQuest(quest, killMeta)) continue;

                const prev = Math.max(0, Number(state.progressByQuestId[qid]) || 0);
                const target = Math.max(1, Number(quest.targetKills) || 1);
                const wasReady = prev >= target;
                const next = Math.min(target, prev + count);
                if (next !== prev) {
                    state.progressByQuestId[qid] = next;
                    changed = true;
                }

                if (next >= target && !wasReady) {
                    newlyReadyCount += 1;
                }
            }

            return { changed, newlyReadyCount, completedCount };
        };

        const dailyOut = applyProgress(dailyBoard, dailyState);
        const weeklyOut = applyProgress(weeklyBoard, weeklyState);
        const cycleChanged = dailyOut.changed || weeklyOut.changed;

        if (cycleChanged) {
            cycleRoot.daily = dailyState;
            cycleRoot.weekly = weeklyState;
            cycleRootWrapper.cycleQuests = cycleRoot;
            profile.rulerProgress = cycleRootWrapper;
        }

        if (!guildChanged && !cycleChanged) {
            return {
                guildChanged: false,
                cycleChanged: false,
                dailyCompleted: 0,
                weeklyCompleted: 0,
                dailyNewReady: 0,
                weeklyNewReady: 0,
                rewardCrystals: 0,
                rewardXp: 0
            };
        }
        await profile.save({ transaction });
        return {
            guildChanged,
            cycleChanged,
            dailyCompleted: 0,
            weeklyCompleted: 0,
            dailyNewReady: Math.max(0, Number(dailyOut.newlyReadyCount) || 0),
            weeklyNewReady: Math.max(0, Number(weeklyOut.newlyReadyCount) || 0),
            rewardCrystals: 0,
            rewardXp: 0
        };
    });
}

async function claimCycleQuests(profileId, scope = 'all') {
    const mode = String(scope || 'all').toLowerCase();
    const allowDaily = mode === 'all' || mode === 'daily';
    const allowWeekly = mode === 'all' || mode === 'weekly';

    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };

        const now = Date.now();
        const monsterPool = await loadMonsterPool(transaction);
        const dailyBoard = buildDailyBoard(now, monsterPool);
        const weeklyBoard = buildWeeklyBoard(now, monsterPool);

        const { root, cycleRoot } = getCycleQuestStateRoot(profile);
        const dailyState = normalizeCycleProgress(cycleRoot.daily, dailyBoard);
        const weeklyState = normalizeCycleProgress(cycleRoot.weekly, weeklyBoard);

        const claimFromBoard = (board, state, enabled) => {
            if (!enabled) return { claimed: 0, rewardCrystals: 0, rewardXp: 0 };

            let claimed = 0;
            let rewardCrystals = 0;
            let rewardXp = 0;
            const claimedSet = new Set(state.claimedQuestIds || []);

            for (const quest of board.quests || []) {
                const qid = String(quest.id);
                if (claimedSet.has(qid)) continue;
                const target = Math.max(1, Number(quest.targetKills) || 1);
                const current = Math.max(0, Number(state.progressByQuestId?.[qid]) || 0);
                if (current < target) continue;

                claimedSet.add(qid);
                claimed += 1;
                rewardCrystals += Math.max(0, Number(quest.rewardCrystals) || 0);
                rewardXp += Math.max(0, Number(quest.rewardXp) || 0);
            }

            state.claimedQuestIds = [...claimedSet];
            return { claimed, rewardCrystals, rewardXp };
        };

        const dailyOut = claimFromBoard(dailyBoard, dailyState, allowDaily);
        const weeklyOut = claimFromBoard(weeklyBoard, weeklyState, allowWeekly);
        const totalClaimed = dailyOut.claimed + weeklyOut.claimed;
        const totalCrystals = dailyOut.rewardCrystals + weeklyOut.rewardCrystals;
        const totalXp = dailyOut.rewardXp + weeklyOut.rewardXp;

        cycleRoot.daily = dailyState;
        cycleRoot.weekly = weeklyState;
        root.cycleQuests = cycleRoot;
        profile.rulerProgress = root;

        if (totalCrystals > 0) {
            profile.crystals = Math.max(0, Number(profile.crystals) || 0) + totalCrystals;
        }

        const leveled = applyProfileXpWithRaceCap(profile, totalXp);
        profile.level = leveled.level;
        profile.xp = leveled.xp;
        profile.skillPoints = Math.max(0, Number(profile.skillPoints) || 0) + Math.max(0, Number(leveled.skillPointsGain) || 0);

        await profile.save({ transaction });

        return {
            ok: true,
            scope: mode,
            claimedTotal: totalClaimed,
            claimedDaily: dailyOut.claimed,
            claimedWeekly: weeklyOut.claimed,
            rewardCrystals: totalCrystals,
            rewardXp: totalXp,
            skillPointsGain: Math.max(0, Number(leveled.skillPointsGain) || 0),
            levelAfter: Math.max(1, Number(profile.level) || 1),
            balanceCrystals: Math.max(0, Number(profile.crystals) || 0)
        };
    });
}

async function getQuestBoardAdminPreview(guildId) {
    const wrap = await ensureGuildQuestBoard(guildId);
    if (!wrap) return null;

    const refreshSeconds = sanitizeRefreshSeconds(wrap.config.questRefreshSeconds);
    const periodMs = refreshSeconds * 1000;
    const nextCycleStart = Number(wrap.board.cycleStart) + periodMs;
    const mix = normalizeQuestMix(wrap.config.questBoardMix);

    const nextBoard = await generateBoardForTimestamp({
        refreshSeconds,
        questMix: mix,
        nowMs: nextCycleStart,
        seedOverride: nextCycleStart
    });

    return {
        currentBoard: wrap.board,
        nextBoard,
        refreshSeconds,
        mix
    };
}

async function adminRerollQuestBoard(guildId) {
    return sequelize.transaction(async (transaction) => {
        const config = await AdventurerGuildConfig.findOne({
            where: { guildId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!config) return { ok: false, reason: 'NO_CONFIG' };

        const mix = normalizeQuestMix(config.questBoardMix);
        const board = await normalizeQuestBoard(
            config.questBoardState,
            config.questRefreshSeconds,
            mix,
            Date.now(),
            transaction,
            { forceRegenerate: true, seedOverride: Date.now() }
        );

        config.questBoardState = board.board;
        await config.save({ transaction });
        return { ok: true, board: board.board, mix, refreshSeconds: config.questRefreshSeconds };
    });
}

async function adminForceResetQuestBoard(guildId) {
    return sequelize.transaction(async (transaction) => {
        const config = await AdventurerGuildConfig.findOne({
            where: { guildId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!config) return { ok: false, reason: 'NO_CONFIG' };

        const mix = normalizeQuestMix(config.questBoardMix);
        const refreshSeconds = sanitizeRefreshSeconds(config.questRefreshSeconds);
        const board = await generateBoardForTimestamp({
            refreshSeconds,
            questMix: mix,
            nowMs: Date.now(),
            transaction,
            seedOverride: Date.now() + 1337
        });

        config.questBoardState = board;
        await config.save({ transaction });
        return { ok: true, board, mix, refreshSeconds };
    });
}

async function adminSetQuestRefresh(guildId, refreshSeconds) {
    return sequelize.transaction(async (transaction) => {
        const config = await AdventurerGuildConfig.findOne({
            where: { guildId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!config) return { ok: false, reason: 'NO_CONFIG' };

        const safeRefresh = sanitizeRefreshSeconds(refreshSeconds);
        config.questRefreshSeconds = safeRefresh;
        await config.save({ transaction });
        return { ok: true, refreshSeconds: safeRefresh };
    });
}

async function adminSetQuestMix(guildId, generalCount, specificCount) {
    return sequelize.transaction(async (transaction) => {
        const config = await AdventurerGuildConfig.findOne({
            where: { guildId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!config) return { ok: false, reason: 'NO_CONFIG' };

        const mix = normalizeQuestMix({ generalCount, specificCount });
        config.questBoardMix = mix;
        await config.save({ transaction });
        return { ok: true, mix };
    });
}

module.exports = {
    MAX_ACTIVE_QUESTS,
    QUEST_BOARD_SIZE,
    DEFAULT_BOARD_MIX,
    normalizeQuestMix,
    ensureGuildQuestBoard,
    getQuestPanelData,
    getDailyWeeklyQuestPanelData,
    acceptQuest,
    abandonQuest,
    completeQuest,
    incrementQuestKillProgress,
    claimCycleQuests,
    getQuestBoardAdminPreview,
    adminRerollQuestBoard,
    adminForceResetQuestBoard,
    adminSetQuestRefresh,
    adminSetQuestMix
};
