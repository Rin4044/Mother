const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, AttachmentBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');

const {
    Profiles,
    UserTitles,
    Titles,
    UserSkills,
    Skills,
    sequelize
} = require('../../../database.js');
const { calculateXpForLevel } = require('../../../utils/xpUtils');
const {
    RACE_CONFIG,
    formatRaceName,
    getMaxLevelForRace,
    getEvolutionRule
} = require('../../../utils/evolutionConfig');
const { RACES } = require('../../../utils/races.js');
const { clearEvolutionLock, isEvolutionActive } = require('../../../commands/global/evolution.js');

const path = require('path');
const fs = require('fs');

function normalizeName(value) {
    return String(value || '').toLowerCase().trim();
}

function disableButtonRows(components = []) {
    return components.map(row => {
        const disabledRow = new ActionRowBuilder();
        row.components.forEach(component => {
            disabledRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
        });
        return disabledRow;
    });
}

async function getPlayerEvolutionState(profileId) {
    const [ownedTitles, ownedSkills] = await Promise.all([
        UserTitles.findAll({
            where: { profileId },
            include: [{ model: Titles, attributes: ['name'] }]
        }),
        UserSkills.findAll({
            where: { profileId },
            include: [{ model: Skills, attributes: ['name'] }]
        })
    ]);

    const titleNameSet = new Set(
        ownedTitles
            .map(entry => normalizeName(entry.Title?.name))
            .filter(Boolean)
    );

    const skillLevelMap = new Map();
    for (const us of ownedSkills) {
        const name = normalizeName(us.Skill?.name);
        if (!name) continue;
        const current = skillLevelMap.get(name) || 0;
        skillLevelMap.set(name, Math.max(current, Number(us.level) || 1));
    }

    return { titleNameSet, skillLevelMap };
}

function evaluateEvolutionEligibility(rule, titleNameSet, skillLevelMap) {
    const requiredTitles = rule.requiredTitles || [];
    const requiredSkills = rule.requiredSkills || [];

    const missingTitles = requiredTitles.filter(title => !titleNameSet.has(normalizeName(title)));
    const missingSkills = requiredSkills.filter(req => {
        const current = skillLevelMap.get(normalizeName(req.name)) || 0;
        return current < (req.level || 1);
    });

    return {
        eligible: missingTitles.length === 0 && missingSkills.length === 0,
        missingTitles,
        missingSkills
    };
}

function buildGateMessage(gate) {
    const parts = [];
    if (gate.missingTitles.length) {
        parts.push(`Missing titles: ${gate.missingTitles.join(', ')}`);
    }
    if (gate.missingSkills.length) {
        parts.push(`Missing skills: ${gate.missingSkills.map(s => `${s.name} Lv${s.level || 1}`).join(', ')}`);
    }
    return parts.join('\n');
}

async function grantEvolutionSkills(profile, raceKey) {
    const rule = getEvolutionRule(raceKey);
    const rewards = rule.grantedSkills || [];
    if (!rewards.length) return [];

    const rewardNames = rewards.map(r => normalizeName(r.name)).filter(Boolean);
    if (!rewardNames.length) return [];

    const skillRows = await Skills.findAll({
        where: {
            [Op.or]: rewardNames.map(name =>
                sequelize.where(
                    sequelize.fn('lower', sequelize.col('name')),
                    name
                )
            )
        }
    });

    const skillByName = new Map(skillRows.map(s => [normalizeName(s.name), s]));
    const granted = [];

    for (const reward of rewards) {
        const target = skillByName.get(normalizeName(reward.name));
        if (!target) continue;

        const targetLevel = reward.level || 1;
        const existing = await UserSkills.findOne({
            where: { profileId: profile.id, skillId: target.id }
        });

        if (!existing) {
            await UserSkills.create({
                profileId: profile.id,
                skillId: target.id,
                level: targetLevel,
                xp: 0
            });
            granted.push(`${target.name} Lv${targetLevel}`);
            continue;
        }

        if ((existing.level || 1) < targetLevel) {
            await existing.update({ level: targetLevel });
            granted.push(`${target.name} Lv${targetLevel}`);
        }
    }

    return granted;
}

async function handleEvolution(interaction) {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split('_');
    const type = parts[1];
    const userId = parts[2];
    const raceKey = parts.slice(3).join('_');

    if (interaction.user.id !== userId) {
        return interaction.reply({
            content: 'This evolution is not for you.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (!isEvolutionActive(userId)) {
        const disabledRows = disableButtonRows(interaction.message.components);
        return interaction.update({
            content: "You didn't decide in time. Use /evolution again.",
            components: disabledRows
        });
    }

    if (type === 'preview') {
        return previewEvolution(interaction, userId, raceKey);
    }

    if (type === 'confirm') {
        clearEvolutionLock(userId);
        return confirmEvolution(interaction, userId, raceKey);
    }

    if (type === 'back') {
        clearEvolutionLock(userId);
        return interaction.update({
            content: 'Use /evolution again to choose.',
            embeds: [],
            components: [],
            files: []
        });
    }
}

async function confirmEvolution(interaction, userId, raceKey) {
    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
    }

    const profile = await Profiles.findOne({ where: { userId } });
    if (!profile) return;

    const maxLevel = getMaxLevelForRace(profile.race);
    const currentLevel = Number(profile.level) || 0;
    const currentRace = profile.race.toLowerCase().trim();

    if (currentLevel < maxLevel) {
        return interaction.editReply({
            content: `You must reach level ${maxLevel} to evolve. Current: ${currentLevel}/${maxLevel} (${formatRaceName(currentRace)}).`,
            embeds: [],
            components: [],
            files: []
        });
    }

    const playerState = await getPlayerEvolutionState(profile.id);
    const gate = evaluateEvolutionEligibility(
        getEvolutionRule(raceKey),
        playerState.titleNameSet,
        playerState.skillLevelMap
    );

    if (!gate.eligible) {
        return interaction.editReply({
            content: `You do not meet the prerequisites for ${formatRaceName(raceKey)}.\n${buildGateMessage(gate)}`,
            embeds: [],
            components: [],
            files: []
        });
    }

    const newRace = raceKey.replace(/_/g, ' ');
    profile.race = newRace;
    profile.level = 1;
    profile.xp = 0;
    profile.xpToNextLevel = calculateXpForLevel(2, newRace);

    await profile.save();

    const grantedSkills = await grantEvolutionSkills(profile, raceKey);
    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    if (member) {
        const allRaceRoles = Object.values(RACE_CONFIG).map(r => r.role);
        const currentRole = member.roles.cache.find(r => allRaceRoles.includes(r.id));

        if (currentRole) await member.roles.remove(currentRole.id);

        const newRoleId = RACE_CONFIG[raceKey]?.role;
        if (newRoleId) await member.roles.add(newRoleId);
    }

    const grantedText = grantedSkills.length
        ? `\nGranted skills: ${grantedSkills.join(', ')}`
        : '';

    return interaction.editReply({
        content: `✨ You evolved into ${formatRaceName(raceKey)}.\nYour level has been reset to 1.${grantedText}`,
        embeds: [],
        components: [],
        files: []
    });
}

async function previewEvolution(interaction, userId, raceKey) {
    const race = RACES[raceKey.replace(/_/g, ' ')];
    const profile = await Profiles.findOne({ where: { userId } });
    if (!race || !profile) return;

    const playerState = await getPlayerEvolutionState(profile.id);
    const rule = getEvolutionRule(raceKey);
    const gate = evaluateEvolutionEligibility(rule, playerState.titleNameSet, playerState.skillLevelMap);

    const requiredTitles = (rule.requiredTitles || []).join(', ') || 'None';
    const requiredSkills = (rule.requiredSkills || [])
        .map(s => `${s.name} Lv${s.level || 1}`)
        .join(', ') || 'None';
    const rewards = (rule.grantedSkills || [])
        .map(s => `${s.name} Lv${s.level || 1}`)
        .join(', ') || 'None';

    const stats = [
        '```',
        '------------------',
        `HP:              ${race.base.hp}`,
        `MP:              ${race.base.mp}`,
        `Stamina:         ${race.base.stamina}`,
        `Vital Stamina:   ${race.base.vitalStamina}`,
        '------------------',
        `Offense:         ${race.base.offense ?? 0}`,
        `Defense:         ${race.base.defense ?? 0}`,
        `Magic:           ${race.base.magic ?? 0}`,
        `Resistance:      ${race.base.resistance ?? 0}`,
        `Speed:           ${race.base.speed ?? 0}`,
        '------------------',
        '',
        'Requirements',
        `- Titles: ${requiredTitles}`,
        `- Skills: ${requiredSkills}`,
        '',
        'Rewards',
        `- Skills: ${rewards}`,
        '```'
    ].join('\n');

    const footer = gate.eligible
        ? 'Confirm to evolve into this race.'
        : `Locked: ${buildGateMessage(gate)}`;

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(formatRaceName(raceKey))
        .setDescription(stats)
        .setFooter({ text: footer });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`evo_confirm_${userId}_${raceKey}`)
            .setLabel('Confirm Evolution')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!gate.eligible),
        new ButtonBuilder()
            .setCustomId(`evo_back_${userId}`)
            .setLabel('Back')
            .setStyle(ButtonStyle.Secondary)
    );

    const imagePath = path.resolve('utils', 'images', `${raceKey}.jpg`);
    if (fs.existsSync(imagePath)) {
        const attachment = new AttachmentBuilder(imagePath, { name: `${raceKey}.jpg` });
        embed.setImage(`attachment://${raceKey}.jpg`);
        return interaction.update({ embeds: [embed], components: [row], files: [attachment] });
    }

    return interaction.update({ embeds: [embed], components: [row] });
}

module.exports = { handleEvolution };
