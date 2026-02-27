const { InventoryItems } = require('../database');

function normalizeItemKey(itemName = '') {
    return String(itemName)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
}

async function addInventoryItem(profileId, itemName, quantity = 1) {
    const safeQuantity = Math.max(0, Number(quantity) || 0);
    if (!profileId || !itemName || safeQuantity <= 0) return null;

    const itemKey = normalizeItemKey(itemName);

    const [entry, created] = await InventoryItems.findOrCreate({
        where: { profileId, itemKey },
        defaults: {
            profileId,
            itemKey,
            itemName,
            quantity: safeQuantity
        }
    });

    if (!created) {
        entry.quantity = Math.max(0, Number(entry.quantity) || 0) + safeQuantity;
        if (!entry.itemName) {
            entry.itemName = itemName;
        }
        await entry.save();
    }

    return entry;
}

async function getInventory(profileId) {
    if (!profileId) return [];

    return InventoryItems.findAll({
        where: { profileId },
        order: [['itemName', 'ASC']]
    });
}

async function getInventoryItem(profileId, itemName) {
    if (!profileId || !itemName) return null;
    const itemKey = normalizeItemKey(itemName);
    return InventoryItems.findOne({ where: { profileId, itemKey } });
}

async function getInventoryQuantity(profileId, itemName) {
    const entry = await getInventoryItem(profileId, itemName);
    return Math.max(0, Number(entry?.quantity) || 0);
}

async function consumeInventoryItem(profileId, itemName, quantity = 1) {
    const safeQuantity = Math.max(0, Number(quantity) || 0);
    if (!profileId || !itemName || safeQuantity <= 0) return false;

    const entry = await getInventoryItem(profileId, itemName);
    if (!entry) return false;

    const current = Math.max(0, Number(entry.quantity) || 0);
    if (current < safeQuantity) return false;

    const next = current - safeQuantity;
    if (next <= 0) {
        await entry.destroy();
        return true;
    }

    entry.quantity = next;
    await entry.save();
    return true;
}

async function consumeInventoryCosts(profileId, costs = []) {
    const normalized = costs
        .map((cost) => ({
            itemName: cost?.itemName,
            quantity: Math.max(0, Number(cost?.quantity) || 0)
        }))
        .filter((cost) => cost.itemName && cost.quantity > 0);

    for (const cost of normalized) {
        const qty = await getInventoryQuantity(profileId, cost.itemName);
        if (qty < cost.quantity) return false;
    }

    for (const cost of normalized) {
        const ok = await consumeInventoryItem(profileId, cost.itemName, cost.quantity);
        if (!ok) return false;
    }

    return true;
}

module.exports = {
    addInventoryItem,
    getInventory,
    normalizeItemKey,
    getInventoryItem,
    getInventoryQuantity,
    consumeInventoryItem,
    consumeInventoryCosts
};
