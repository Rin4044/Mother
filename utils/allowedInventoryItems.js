const { normalizeItemKey } = require('./inventoryService');

const CANONICAL_ITEMS = [
    'XP Potion +5% (15m)',
    'XP Potion +10% (20m)',
    'XP Potion +20% (10m)',
    'XP Potion +25% (1h)',
    'XP Potion +50% (20m)',
    'XP Potion +75% (1h)',
    'Name Change Ticket',
    'Healing Potion',
    'Poison Potion',
    'Raid Key'
];

const ALIAS_TO_CANONICAL = new Map([
    ['xp potion 1', 'XP Potion +5% (15m)'],
    ['xp potion 2', 'XP Potion +10% (20m)'],
    ['xp potion 3', 'XP Potion +20% (10m)'],
    ['xp potion 4', 'XP Potion +25% (1h)'],
    ['xp potion 5', 'XP Potion +50% (20m)'],
    ['xp potion 6', 'XP Potion +75% (1h)'],
    ['name ticket', 'Name Change Ticket'],
    ['rename ticket', 'Name Change Ticket'],
    ['name change ticket', 'Name Change Ticket'],
    ['heal potion', 'Healing Potion'],
    ['healing potion', 'Healing Potion'],
    ['poison potion', 'Poison Potion'],
    ['raid key', 'Raid Key']
]);

const KEY_TO_CANONICAL = new Map();
for (const name of CANONICAL_ITEMS) {
    KEY_TO_CANONICAL.set(normalizeItemKey(name), name);
}
for (const [alias, canonical] of ALIAS_TO_CANONICAL.entries()) {
    KEY_TO_CANONICAL.set(normalizeItemKey(alias), canonical);
}

function resolveAllowedInventoryItemName(rawItemName) {
    const key = normalizeItemKey(rawItemName);
    return KEY_TO_CANONICAL.get(key) || null;
}

function getAllowedInventoryItems() {
    return [...CANONICAL_ITEMS];
}

module.exports = {
    resolveAllowedInventoryItemName,
    getAllowedInventoryItems
};
