const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

const {
    Profiles,
    Monsters,
    FightProgress,
    UserSkills,
    Skills
} = require('../../../database.js');

const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');

const { calculateScaling } = require('../../../utils/combatEngine');
const { calculatePlayerStats } = require('../../../utils/playerStats');
const { resolveImage } = require('../../../utils/resolveProfileImage');
const { processRulerProgress } = require('../../../utils/rulerTitleService');

async function handleFightStart(interaction) {

    const profileId = parseInt(interaction.customId.split('_')[2], 10);
    const userId = interaction.user.id;

    const profile = await Profiles.findByPk(profileId);
    if (!profile || profile.userId !== userId) {
        return interaction.reply({
            content: 'This is not your fight.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (profile.combatState) {
        return interaction.reply({
            content: 'You are already in another combat. Finish it first.',
            flags: MessageFlags.Ephemeral
        });
    }

    const progress = await FightProgress.findOne({ where: { profileId } });
    if (!progress) {
        return interaction.reply({
            content: 'Fight progress not found.',
            flags: MessageFlags.Ephemeral
        });
    }

    const queue = parseMonsterQueue(progress.monsterQueue);
    if (!queue) {
        return interaction.reply({
            content: 'Invalid fight queue. Use /fight view to reinitialize.',
            flags: MessageFlags.Ephemeral
        });
    }

    const entry = queue[progress.stage - 1];
    if (!entry || typeof entry.monsterId !== 'number') {
        return interaction.reply({
            content: 'Invalid stage data. Use /fight view to refresh your floor.',
            flags: MessageFlags.Ephemeral
        });
    }

    const monster = await Monsters.findByPk(entry.monsterId);
    if (!monster) {
        return interaction.reply({
            content: 'Monster missing.',
            flags: MessageFlags.Ephemeral
        });
    }

    const scaled = calculateScaling(
        monster,
        progress.tier,
        progress.stage
    ).stats;

    const isContinuing = progress.currentMonsterHp !== null;
    const playerMax = await calculatePlayerStats(profile);
    if (!playerMax) {
        return interaction.reply({
            content: 'Unable to calculate player stats.',
            flags: MessageFlags.Ephemeral
        });
    }

    const unlockedRulers = await processRulerProgress(profile, {
        isBattleEnd: false,
        levelAfterUpdate: profile.level,
        tierBeforeUpdate: progress.tier,
        stageBeforeUpdate: progress.stage
    });
    if (unlockedRulers.length) {
        await interaction.followUp({
            content: `New title unlocked:\n${unlockedRulers.map((name) => `- ${name}`).join('\n')}`,
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }

    if (!isContinuing) {
        await progress.update({
            currentMonsterHp: scaled.hp,
            skillXpSummary: null,
            playerEffects: null,
            monsterEffects: null
        });

        await profile.update({
            remainingHp: playerMax.hp,
            remainingMp: playerMax.mp,
            remainingStamina: playerMax.stamina,
            remainingVitalStamina: playerMax.vitalStamina
        });
    }

    const playerCurrent = {
        hp: profile.remainingHp ?? playerMax.hp,
        mp: profile.remainingMp ?? playerMax.mp,
        stamina: profile.remainingStamina ?? playerMax.stamina,
        vitalStamina: profile.remainingVitalStamina ?? playerMax.vitalStamina
    };

    const monsterCurrent = {
        hp: isContinuing ? progress.currentMonsterHp : scaled.hp,
        mp: scaled.mp,
        stamina: scaled.stamina,
        vitalStamina: scaled.vitalStamina
    };

    const userSkills = await UserSkills.findAll({
        where: {
            profileId: profile.id,
            equippedSlot: { [Op.not]: null }
        },
        include: {
            model: Skills,
            where: {
                effect_type_main: {
                    [Op.in]: ['Physical', 'Magic', 'Debuff', 'Buff']
                }
            }
        }
    });

    if (!userSkills.length) {
        return interaction.reply({
            content: "You can't fight without any equipped skills. Use /loadout equip first.",
            flags: MessageFlags.Ephemeral
        });
    }

    const options = userSkills.slice(0, 25).map(us => ({
        label: us.Skill.name,
        value: us.Skill.id.toString(),
        description: buildSkillOptionDescription(playerMax, scaled, us.Skill, us.level)
    }));

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`attack_${profile.id}`)
            .setPlaceholder('Choose a skill')
            .addOptions(options)
    );

    const playerImage = resolveImage(profile);
    const monsterImage = resolveMonsterImage(monster);

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`Fight: ${interaction.user.username} vs ${monster.name}`)
        .setDescription(
            buildDetailedStats(
                interaction.user.username,
                monster.name,
                playerCurrent,
                playerMax,
                monsterCurrent,
                scaled
            )
        )
        .setFooter({ text: 'Choose your skill.' });

    if (playerImage) {
        embed.setImage(`attachment://${playerImage.name}`);
    }

    if (monsterImage) {
        embed.setThumbnail(`attachment://${monsterImage.name}`);
    }

    return interaction.update({
        embeds: [embed],
        components: [row],
        files: [
            ...(playerImage ? [playerImage] : []),
            ...(monsterImage ? [monsterImage] : [])
        ]
    });
}

module.exports = { handleFightStart };

function parseMonsterQueue(rawQueue) {
    if (!rawQueue) return null;

    try {
        let parsed = JSON.parse(rawQueue);

        // Handle legacy/double-encoded queue values.
        if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
        }

        if (!Array.isArray(parsed)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function buildDetailedStats(
    username,
    monsterName,
    playerCurrent,
    playerMax,
    monsterCurrent,
    monsterMax
) {
    return (
        `Player: **${username}**\n` +
        `❤️ HP: ${playerCurrent.hp}/${playerMax.hp}\n` +
        `🔵 MP: ${playerCurrent.mp}/${playerMax.mp}\n` +
        `🟨 Stamina: ${playerCurrent.stamina}/${playerMax.stamina}\n` +
        `🟩 Vital Stamina: ${playerCurrent.vitalStamina}/${playerMax.vitalStamina}\n` +
        `⚔️ Offense: ${playerMax.offense}\n` +
        `🛡️ Defense: ${playerMax.defense}\n` +
        `✨ Magic: ${playerMax.magic}\n` +
        `🧿 Resistance: ${playerMax.resistance}\n` +
        `💨 Speed: ${playerMax.speed}\n\n` +
        `Monster: **${monsterName}**\n` +
        `❤️ HP: ${monsterCurrent.hp}/${monsterMax.hp}\n` +
        `🔵 MP: ${monsterCurrent.mp}/${monsterMax.mp}\n` +
        `🟨 Stamina: ${monsterCurrent.stamina}/${monsterMax.stamina}\n` +
        `🟩 Vital Stamina: ${monsterCurrent.vitalStamina}/${monsterMax.vitalStamina}\n` +
        `⚔️ Offense: ${monsterMax.offense}\n` +
        `🛡️ Defense: ${monsterMax.defense}\n` +
        `✨ Magic: ${monsterMax.magic}\n` +
        `🧿 Resistance: ${monsterMax.resistance}\n` +
        `💨 Speed: ${monsterMax.speed}`
    );
}

function resolveMonsterImage(monster) {
    if (!monster?.image) return null;

    const imagePath = path.resolve('utils', 'images', monster.image);
    if (!fs.existsSync(imagePath)) return null;

    return new AttachmentBuilder(imagePath, { name: monster.image });
}

function estimateSkillDamage(attackerStats, defenderStats, skill, skillLevel = 1) {
    const effectivePower = (Number(skill?.power) || 0) + ((Math.max(1, Number(skillLevel) || 1) - 1) * 0.1);
    let attackStat = 0;
    let defenseStat = 0;

    if (skill?.effect_type_main === 'Physical') {
        attackStat = Math.max(0, Number(attackerStats?.offense) || 0);
        defenseStat = Math.max(0, Number(defenderStats?.defense) || 0);
    } else if (skill?.effect_type_main === 'Magic') {
        attackStat = Math.max(0, Number(attackerStats?.magic) || 0);
        defenseStat = Math.max(0, Number(defenderStats?.resistance) || 0);
    } else {
        return 0;
    }

    const multiplier = 1 + (effectivePower * 0.1);
    const rawDamage = attackStat * multiplier;
    const reducedDamage = rawDamage * (100 / (100 + defenseStat));
    return Math.max(0, Math.floor(reducedDamage));
}

function getGuaranteedEvilEyeBonus(attackerStats, defenderStats, skill) {
    const name = String(skill?.name || '').toLowerCase().trim();
    if (!name.includes('evil eye')) return { bonus: 0, note: '' };

    const atkMagic = Math.max(0, Number(attackerStats?.magic) || 0);
    const targetHp = Math.max(0, Number(defenderStats?.hp) || 0);

    if (name.includes('evil eye of extinction') || name.includes('extinction evil eye')) {
        const burst = Math.max(10, Math.floor(atkMagic * 0.06));
        const rotTick = Math.max(5, Math.floor(atkMagic * 0.06));
        return {
            bonus: burst + rotTick,
            note: `+FX ${burst + rotTick} (100% proc)`
        };
    }

    if (name.includes('annihilating')) {
        const burst = Math.max(12, Math.floor(atkMagic * 0.05));
        return {
            bonus: burst,
            note: `+FX ${burst} (100% proc)`
        };
    }

    if (name.includes('phantom pain')) {
        const burst = Math.max(8, Math.floor(atkMagic * 0.04));
        return {
            bonus: burst,
            note: `+FX ${burst} (100% proc)`
        };
    }

    if (name.includes('evil eye of grudge')) {
        const drainHp = Math.max(0, Math.floor(targetHp * 0.06));
        return {
            bonus: drainHp,
            note: `+Drain ${drainHp} (100% proc)`
        };
    }

    return { bonus: 0, note: '100% utility proc' };
}

function buildSkillOptionDescription(attackerStats, defenderStats, skill, skillLevel = 1) {
    const base = estimateSkillDamage(attackerStats, defenderStats, skill, skillLevel);
    const evilEye = getGuaranteedEvilEyeBonus(attackerStats, defenderStats, skill);
    const total = base + evilEye.bonus;

    const parts = [`~DMG ${total}`];
    if (evilEye.note) parts.push(evilEye.note);
    const mpCost = Math.max(0, Number(skill?.mp_cost) || 0);
    const spCost = Math.max(0, Number(skill?.sp_cost) || 0);
    if (mpCost > 0) parts.push(`MP ${mpCost}`);
    if (spCost > 0) parts.push(`SP ${spCost}`);

    const text = parts.join(' | ');
    return text.length <= 100 ? text : text.slice(0, 97) + '...';
}
