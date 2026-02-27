const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { Profiles, UserSkills, Skills, UserTitles, Titles } = require('../../database.js');
const path = require('path');
const fs = require('fs');

const { calculatePlayerStats } = require('../../utils/playerStats');
const { progressTutorial } = require('../../utils/tutorialService');

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
                `**Crystals:** ${profile.crystals || 0}`
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
