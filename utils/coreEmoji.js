const CORE_EMOJI_BY_NAME = {
    'Mediocre Monster Core': '<:mediocre:1476988448274518067>',
    'Cracked Monster Core': '<:cracked:1476988344289460337>',
    'Solid Monster Core': '<:solid:1476988489173045248>',
    'Superior Monster Core': '<:superior:1476988220423278602>',
    'Primal Monster Core': '<:primal:1476988008019394756>',
    'Healing Potion': '<:healpotion:1478389763940552726>',
    'Poison Potion': '<:poisonpotion:1478394432024875108>',
    'XP Potion I': '<:xppotion1:1478395830535852113>',
    'XP Potion II': '<:xppotion2:1478395950279164026>',
    'XP Potion III': '<:xppotion3:1478395986240864459>',
    'XP Potion IV': '<:xppotion4:1478396015806644339>',
    'XP Potion V': '<:xppotion5:1478396043023487039>',
    'XP Potion VI': '<:xppotion6:1478396065265750127>',
    'XP Potion +5% (15m)': '<:xppotion1:1478395830535852113>',
    'XP Potion +10% (20m)': '<:xppotion2:1478395950279164026>',
    'XP Potion +20% (10m)': '<:xppotion3:1478395986240864459>',
    'XP Potion +25% (1h)': '<:xppotion4:1478396015806644339>',
    'XP Potion +50% (20m)': '<:xppotion5:1478396043023487039>',
    'XP Potion +75% (1h)': '<:xppotion6:1478396065265750127>',
    'Name Change Ticket': '<:namechangeticket:1478394399724408964>'
};
const CRYSTAL_EMOJI = '<:crystals:1478128084912832635>';
const RAID_KEY_EMOJI = '<:raidkey:1478154892337086607>';

function formatCoreItemLabel(itemName = '') {
    const name = String(itemName || '').trim();
    const emoji = CORE_EMOJI_BY_NAME[name];
    if (!emoji) return name;
    return `${emoji} ${name}`;
}

function formatCrystalLabel(amount = 0) {
    const value = Math.max(0, Number(amount) || 0);
    return `${CRYSTAL_EMOJI} ${value} crystals`;
}

function formatRaidKeyLabel(quantity = 1) {
    const qty = Math.max(1, Number(quantity) || 1);
    return qty > 1
        ? `${RAID_KEY_EMOJI} Raid Key x${qty}`
        : `${RAID_KEY_EMOJI} Raid Key`;
}

module.exports = {
    CORE_EMOJI_BY_NAME,
    CRYSTAL_EMOJI,
    RAID_KEY_EMOJI,
    formatCoreItemLabel,
    formatCrystalLabel,
    formatRaidKeyLabel
};
