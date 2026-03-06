const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { Profiles, UserSkills, Skills, UserTitles, Titles } = require('../../database.js');
const path = require('path');
const fs = require('fs');

const { calculatePlayerStats } = require('../../utils/playerStats');
const { progressTutorial } = require('../../utils/tutorialService');
const { formatCrystalLabel } = require('../../utils/coreEmoji');

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
    'abyssal fallen demon': 'abyssal_fallen_demon.jpg',

    'shiraori': 'shiraori.jpg',
    'sariel': 'sariel.jpg',
    'meido': 'meido.jpg',
    'guliedistodiez': 'guliedistodiez.jpg',
    'gueliedistodiez': 'guliedistodiez.jpg',
    'd': 'd.jpg'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Displays your profile.'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const profile = await Profiles.findOne({ where: { userId } });

        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start.',
                flags: MessageFlags.Ephemeral
            });
        }

        const userSkills = await UserSkills.findAll({
            where: { profileId: profile.id },
            include: { model: Skills }
        });

        const userTitles = await UserTitles.findAll({
            where: { profileId: profile.id },
            include: { model: Titles }
        });

        const stats = await calculatePlayerStats(profile);
        const skillLines = formatSkillLines(userSkills);
        const titleLines = formatTitleLines(userTitles);
        const imageFile = resolveProfileImage(profile);

        const embed = new EmbedBuilder()
            .setColor('#1f1f23')
            .setTitle(`Profile: ${profile.name}`)
            .setDescription(
                `**Race:** ${profile.race}\n` +
                `**Level:** ${profile.level}\n` +
                `**XP:** ${profile.xp}\n` +
                `**Skill Points:** ${profile.skillPoints}\n` +
                `**Crystals:** ${formatCrystalLabel(profile.crystals || 0)}`
            )
            .addFields({
                name: 'Stats',
                value:
                    `HP: ${stats.hp}\n` +
                    `MP: ${stats.mp}\n` +
                    `Stamina: ${stats.stamina}\n` +
                    `Vital Stamina: ${stats.vitalStamina}\n\n` +
                    `Offense: ${stats.offense}\n` +
                    `Defense: ${stats.defense}\n` +
                    `Magic: ${stats.magic}\n` +
                    `Resistance: ${stats.resistance}\n` +
                    `Speed: ${stats.speed}`
            })
            .setFooter({ text: 'Adventure awaits.' })
            .setTimestamp();

        for (const [index, value] of chunkLinesForEmbedField(titleLines).entries()) {
            embed.addFields({
                name: index === 0 ? 'Titles' : 'Titles (cont.)',
                value
            });
        }

        for (const [index, value] of chunkLinesForEmbedField(skillLines).entries()) {
            embed.addFields({
                name: index === 0 ? 'Skills' : 'Skills (cont.)',
                value
            });
        }

        await progressTutorial(profile.id, 'used_profile');

        if (imageFile) {
            embed.setImage(`attachment://${imageFile.name}`);
            return interaction.reply({ embeds: [embed], files: [imageFile] });
        }

        return interaction.reply({ embeds: [embed] });
    }
};

function formatSkillLines(userSkills) {
    if (!userSkills.length) return ['No skills'];
    return userSkills.map((us) => `- ${us.Skill?.name || 'Unknown'} (Lvl ${us.level})`);
}

function formatTitleLines(userTitles) {
    if (!userTitles.length) return ['No titles'];
    return userTitles.map((ut) => `- ${ut.Title?.name || 'Unknown'}`);
}

function chunkLinesForEmbedField(lines, limit = 1024) {
    const safeLines = Array.isArray(lines) && lines.length ? lines : ['-'];
    const chunks = [];
    let current = '';

    for (const rawLine of safeLines) {
        const line = String(rawLine || '-');

        if (line.length > limit) {
            const clipped = line.slice(0, limit - 3) + '...';
            if (current) {
                chunks.push(current);
                current = '';
            }
            chunks.push(clipped);
            continue;
        }

        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length > limit) {
            if (current) {
                chunks.push(current);
            }
            current = line;
        } else {
            current = candidate;
        }
    }

    if (current) {
        chunks.push(current);
    }

    return chunks.length ? chunks : ['-'];
}

function resolveProfileImage(profile) {
    const keyName = String(profile.name || '').toLowerCase().trim();
    const keyRace = String(profile.race || '').toLowerCase().trim();

    const fileName = IMAGE_MAP[keyName] || IMAGE_MAP[keyRace];
    if (!fileName) return null;

    const imagePath = path.resolve('utils', 'images', fileName);
    if (!fs.existsSync(imagePath)) return null;

    return new AttachmentBuilder(imagePath, { name: fileName });
}
