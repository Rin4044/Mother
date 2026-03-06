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
    'arachne': '1_arachne.jpg',

    'human': 'human.jpg',
    'trained human': 'trained_human.jpg',
    'advanced human': 'advanced_human.jpg',
    'high human': 'high_human.jpg',
    'transcendent human': 'transcendent_human.jpg',
    'blade human': 'blade_human.jpg',
    'warborn human': 'warborn_human.jpg',
    'mythic blademaster': 'mythic_blademaster.jpg',
    'arcane human': 'arcane_human.jpg',
    'runic human': 'runic_human.jpg',
    'astral human': 'astral_human.jpg',
    'holy human': 'holy_human.jpg',
    'sacred human': 'sacred_human.jpg',
    'divine human': 'divine_human.jpg',

    'young elf': 'young_elf.jpg',
    'adult elf': 'adult_elf.jpg',
    'high elf': 'high_elf.jpg',
    'moon elf': 'moon_elf.jpg',
    'silver moon elf': 'silver_moon_elf.jpg',
    'lunar arch elf': 'lunar_arch_elf.jpg',
    'sun elf': 'sun_elf.jpg',
    'radiant sun elf': 'radiant_sun_elf.jpg',
    'solar arch elf': 'solar_arch_elf.jpg',
    'spirit elf': 'spirit_elf.jpg',
    'spiritbound elf': 'spiritbound_elf.jpg',
    'astral arch elf': 'astral_arch_elf.jpg',
    'shadow elf': 'shadow_elf.jpg',
    'nightshade elf': 'nightshade_elf.jpg',
    'void elf': 'void_elf.jpg',

    'lesser demon': 'lesser_demon.jpg',
    'true demon': 'true_demon.jpg',
    'greater demon': 'greater_demon.jpg',
    'arch demon': 'arch_demon.jpg',
    'demon semi divinity': 'demon_semi_divinity.jpg',
    'demon divinity': 'demon_divinity.jpg',
    'oni': 'oni.jpg',
    'calamity oni': 'calamity_oni.jpg',
    'oni tyrant': 'oni_tyrant.jpg',
    'succubus': 'succubus.jpg',
    'night succubus': 'night_succubus.jpg',
    'queen succubus': 'queen_succubus.jpg',
    'vampire': 'vampire.jpg',
    'elder vampire': 'elder_vampire.jpg',
    'progenitor vampire': 'progenitor_vampire.jpg',
    'fallen demon': 'fallen_demon.jpg',
    'dread fallen demon': 'dread_fallen_demon.jpg',
    'abyssal fallen demon': 'abyssal_fallen_demon.jpg'
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
