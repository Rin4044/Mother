const { AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

const IMAGE_MAP = {
    'small lesser taratect': 'small_lesser_taratect.png',
    'small taratect': 'small_taratect.jpg',
    'lesser taratect': 'lesser_taratect.jpg',
    'taratect': '1_taratect.jpg',
    'small poison taratect': 'smallpoison_taratect.jpg',
    'greater taratect': 'greater_taratect.jpg',
    'arch taratect': 'arch_taratect.jpg',
    'poison taratect': 'poison_taratect.jpg',
    'queen taratect': 'queen_taratect.jpg',
    'zoa ele': 'zoa_ele.jpg',
    'ede saine': 'ede_saine.jpg',
    'zana horowa': 'zana_horowa.jpg',
    'arachne': '1_arachne.jpg'
};

function resolveImage(profile) {
    if (!profile?.race) return null;

    const race = profile.race.toLowerCase().trim();
    const file = IMAGE_MAP[race];
    if (!file) return null;

    const imagePath = path.resolve('utils', 'images', file);
    if (!fs.existsSync(imagePath)) return null;

    return new AttachmentBuilder(imagePath, { name: file });
}

module.exports = { resolveImage };