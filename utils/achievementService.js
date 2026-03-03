const { sequelize, Profiles, InventoryItems, Titles, UserTitles } = require('../database');
const { normalizeItemKey } = require('./inventoryService');
const { getAchievementRoleId } = require('./achievementRoleRewards');

const TIER_REWARDS = {
    1: { itemName: 'Healing Potion', quantity: 3 },
    2: { itemName: 'XP Potion +5% (15m)', quantity: 1 },
    3: { itemName: 'XP Potion +10% (20m)', quantity: 1 },
    4: { itemName: 'Raid Key', quantity: 1 },
    5: { itemName: 'XP Potion +20% (10m)', quantity: 1 },
    6: { itemName: 'XP Potion +25% (1h)', quantity: 1 },
    7: { itemName: 'XP Potion +50% (20m)', quantity: 1 }
};

const ACHIEVEMENT_DEFINITIONS = [
    {
        key: 'damageDealt',
        label: 'Damage Dealt',
        thresholds: [10000, 50000, 200000, 1000000, 5000000, 12000000, 25000000],
        finalTitle: 'Berserker'
    },
    {
        key: 'damageTaken',
        label: 'Damage Taken',
        thresholds: [10000, 50000, 200000, 1000000, 5000000, 12000000, 25000000],
        finalTitle: 'Iron Wall'
    },
    {
        key: 'statusInflictedTicks',
        label: 'Status Dealt',
        thresholds: [100, 500, 2000, 8000, 30000, 90000, 180000],
        finalTitle: 'Plague Master'
    },
    {
        key: 'statusTakenTicks',
        label: 'Status Taken',
        thresholds: [100, 500, 2000, 8000, 30000, 90000, 180000],
        finalTitle: 'Endurer'
    },
    {
        key: 'xp',
        label: 'XP Gained',
        thresholds: [5000, 20000, 80000, 300000, 1200000, 5000000, 12000000],
        finalTitle: 'Scholar'
    },
    {
        key: 'kills',
        label: 'Monsters Killed',
        thresholds: [100, 300, 1000, 3000, 9000, 20000, 50000],
        finalTitle: 'Exterminator'
    },
    {
        key: 'questsClaimed',
        label: 'Quests Claimed',
        thresholds: [10, 30, 80, 200, 500, 1200, 3000],
        finalTitle: 'Guild Veteran'
    }
];

function normalizeAchievementRoot(root = {}) {
    const src = root && typeof root === 'object' ? { ...root } : {};
    const progress = src.achievementProgress && typeof src.achievementProgress === 'object'
        ? { ...src.achievementProgress }
        : {};
    const claims = src.achievementClaims && typeof src.achievementClaims === 'object'
        ? { ...src.achievementClaims }
        : {};

    for (const def of ACHIEVEMENT_DEFINITIONS) {
        progress[def.key] = Math.max(0, Number(progress[def.key]) || 0);
        claims[def.key] = Math.max(0, Number(claims[def.key]) || 0);
    }

    return {
        ...src,
        achievementProgress: progress,
        achievementClaims: claims
    };
}

function unlockedTierCount(progressValue, thresholds = []) {
    let unlocked = 0;
    for (const threshold of thresholds) {
        if (Math.max(0, Number(progressValue) || 0) >= Math.max(1, Number(threshold) || 1)) {
            unlocked += 1;
        }
    }
    return unlocked;
}

async function upsertInventoryItemTx(profileId, itemName, quantity, transaction) {
    const safeQty = Math.max(0, Number(quantity) || 0);
    if (!profileId || !itemName || safeQty <= 0) return;
    const itemKey = normalizeItemKey(itemName);

    const existing = await InventoryItems.findOne({
        where: { profileId, itemKey },
        transaction,
        lock: transaction.LOCK.UPDATE
    });

    if (!existing) {
        await InventoryItems.create({
            profileId,
            itemKey,
            itemName,
            quantity: safeQty
        }, { transaction });
        return;
    }

    existing.quantity = Math.max(0, Number(existing.quantity) || 0) + safeQty;
    if (!existing.itemName) existing.itemName = itemName;
    await existing.save({ transaction });
}

async function grantTitleTx(profileId, titleName, transaction) {
    if (!titleName) return false;
    const existingTitle = await Titles.findOne({ where: { name: titleName }, transaction });
    const title = existingTitle || await Titles.create({
        name: titleName,
        description: `Cosmetic achievement title: ${titleName}`
    }, { transaction });

    const owned = await UserTitles.findOne({
        where: { profileId, titleId: title.id },
        transaction
    });
    if (owned) return false;
    await UserTitles.create({ profileId, titleId: title.id }, { transaction });
    return true;
}

function getAchievementsPanelDataFromRoot(root = {}) {
    const normalized = normalizeAchievementRoot(root);
    const rows = ACHIEVEMENT_DEFINITIONS.map((def) => {
        const progress = Math.max(0, Number(normalized.achievementProgress[def.key]) || 0);
        const claimedTier = Math.max(0, Number(normalized.achievementClaims[def.key]) || 0);
        const unlockedTier = unlockedTierCount(progress, def.thresholds);
        const claimable = Math.max(0, unlockedTier - claimedTier);
        const nextTierIndex = Math.min(def.thresholds.length - 1, unlockedTier);
        const nextTarget = unlockedTier >= def.thresholds.length ? null : Math.max(1, Number(def.thresholds[nextTierIndex]) || 1);
        return {
            key: def.key,
            label: def.label,
            progress,
            claimedTier,
            unlockedTier,
            claimable,
            nextTarget,
            maxTier: def.thresholds.length
        };
    });
    return { root: normalized, rows };
}

async function getAchievementsPanelData(profileId) {
    const profile = await Profiles.findByPk(profileId);
    if (!profile) return null;
    const payload = getAchievementsPanelDataFromRoot(profile.rulerProgress || {});
    if (JSON.stringify(payload.root) !== JSON.stringify(profile.rulerProgress || {})) {
        profile.rulerProgress = payload.root;
        await profile.save();
    }
    return payload;
}

async function claimAllAchievements(profileId) {
    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!profile) return { ok: false, reason: 'NO_PROFILE' };

        const { root, rows } = getAchievementsPanelDataFromRoot(profile.rulerProgress || {});
        const rewards = [];
        const titlesGranted = [];
        const roleRewards = [];
        let totalClaims = 0;

        for (const row of rows) {
            if (row.claimable <= 0) continue;
            const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.key === row.key);
            if (!def) continue;
            const startTier = row.claimedTier + 1;
            const endTier = row.unlockedTier;

            for (let tier = startTier; tier <= endTier; tier++) {
                const reward = TIER_REWARDS[tier];
                if (reward?.itemName && (Number(reward.quantity) || 0) > 0) {
                    await upsertInventoryItemTx(profileId, reward.itemName, reward.quantity, transaction);
                    rewards.push(`${reward.itemName} x${reward.quantity}`);
                }
                if (tier >= def.thresholds.length && def.finalTitle) {
                    const granted = await grantTitleTx(profileId, def.finalTitle, transaction);
                    if (granted) {
                        titlesGranted.push(def.finalTitle);
                    }
                    const roleId = getAchievementRoleId(def.key);
                    if (roleId) {
                        roleRewards.push({
                            key: def.key,
                            label: def.label,
                            roleId
                        });
                    }
                }
                totalClaims += 1;
            }

            root.achievementClaims[row.key] = endTier;
        }

        profile.rulerProgress = root;
        await profile.save({ transaction });

        return {
            ok: true,
            totalClaims,
            rewards,
            titlesGranted,
            roleRewards,
            pendingRoleReward: totalClaims > 0 && roleRewards.length > 0
        };
    });
}

module.exports = {
    ACHIEVEMENT_DEFINITIONS,
    TIER_REWARDS,
    normalizeAchievementRoot,
    getAchievementsPanelData,
    claimAllAchievements
};
