const CORE_EMOJI_BY_NAME = {
    'Mediocre Monster Core': '<:mediocre:1476988448274518067>',
    'Cracked Monster Core': '<:cracked:1476988344289460337>',
    'Solid Monster Core': '<:solid:1476988489173045248>',
    'Superior Monster Core': '<:superior:1476988220423278602>',
    'Primal Monster Core': '<:primal:1476988008019394756>'
};

function formatCoreItemLabel(itemName = '') {
    const name = String(itemName || '').trim();
    const emoji = CORE_EMOJI_BY_NAME[name];
    if (!emoji) return name;
    return `${emoji} ${name}`;
}

module.exports = {
    CORE_EMOJI_BY_NAME,
    formatCoreItemLabel
};
