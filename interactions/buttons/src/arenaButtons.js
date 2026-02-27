const { Profiles, UserSkills, Skills, FightProgress, database, calculatePlayerStats, utils, playerStats, activeFights, clearFightTimeout, scheduleTurnTimeout, commands, global, arena, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');

const path = require('path');
const fs = require('fs');

const ALLOWED_COMBAT_TYPES = ['Physical', 'Magic', 'Debuff'];

const IMAGE_MAP = {
    'small lesser taratect': 'small_lesser_taratect.png',
    'small taratect': 'small_taratect.jpg',
    'lesser taratect': 'lesser_taratect.jpg',
    taratect: '1_taratect.jpg',
    'small poison taratect': 'smallpoison_taratect.jpg',
    'greater taratect': 'greater_taratect.jpg',
    'arch taratect': 'arch_taratect.jpg',
    'poison taratect': 'poison_taratect.jpg',
    'queen taratect': 'queen_taratect.jpg',
    'zoa ele': 'zoa_ele.jpg',
    'ede saine': 'ede_saine.jpg',
    'zana horowa': 'zana_horowa.jpg',
    arachne: '1_arachne.jpg'
};

function resolveImage(profile) {
    const race = profile.race?.toLowerCase().trim();
    const file = IMAGE_MAP[race];
    if (!file) return null;

    const imagePath = path.resolve('utils', 'images', file);
    if (!fs.existsSync(imagePath)) return null;

    return new AttachmentBuilder(imagePath, { name: file });
}

function buildStats(stats) {
    return [
        `🟥 HP: ${stats.hp}/${stats.hp}`,
        `🟦 MP: ${stats.mp}/${stats.mp}`,
        `🟨 Stamina: ${stats.stamina}/${stats.stamina}`,
        `🟩 Vital: ${stats.vitalStamina}/${stats.vitalStamina}`,
        '',
        `⚔️ Offense: ${stats.offense}`,
        `🛡️ Defense: ${stats.defense}`,
        `✨ Magic: ${stats.magic}`,
        `🔰 Resistance: ${stats.resistance}`,
        `💨 Speed: ${stats.speed}`
    ].join('\n');
}

async function handleArena(interaction, client) {

    const [action, opponentId, inviterId] = interaction.customId.split('_');

    if (interaction.user.id !== opponentId) {
        return interaction.reply({
            content: 'This challenge is not for you.',
            flags: MessageFlags.Ephemeral
        });
    }

    const pendingFight = activeFights.get(inviterId);
    if (!pendingFight || pendingFight.state !== 'pending') {
        return interaction.reply({
            content: 'This challenge is no longer active.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (action === 'decline') {
        clearFightTimeout(pendingFight);
        activeFights.delete(inviterId);
        activeFights.delete(opponentId);

        return interaction.update({
            content: `${interaction.user.username} declined the challenge.`,
            embeds: [],
            components: []
        });
    }

    clearFightTimeout(pendingFight);

    const [inviterProfile, opponentProfile] = await Promise.all([
        Profiles.findOne({ where: { userId: inviterId } }),
        Profiles.findOne({ where: { userId: opponentId } })
    ]);

    if (!inviterProfile || !opponentProfile) {
        return interaction.reply({
            content: 'One of the players does not have a profile.',
            flags: MessageFlags.Ephemeral
        });
    }

    const [inviterTower, opponentTower] = await Promise.all([
        FightProgress.findOne({ where: { profileId: inviterProfile.id } }),
        FightProgress.findOne({ where: { profileId: opponentProfile.id } })
    ]);

    const inviterBusy = !!inviterProfile.combatState || (inviterTower && inviterTower.currentMonsterHp !== null);
    const opponentBusy = !!opponentProfile.combatState || (opponentTower && opponentTower.currentMonsterHp !== null);

    if (inviterBusy || opponentBusy) {
        clearFightTimeout(pendingFight);
        activeFights.delete(inviterId);
        activeFights.delete(opponentId);
        return interaction.update({
            content: 'One player is already in another combat. Arena canceled.',
            embeds: [],
            components: []
        });
    }

    const [inviterUser, opponentUser] = await Promise.all([
        client.users.fetch(inviterId),
        client.users.fetch(opponentId)
    ]);

    const inviterStats = await calculatePlayerStats(inviterProfile);
    const opponentStats = await calculatePlayerStats(opponentProfile);

    await inviterProfile.update({
        combatState: {
            hp: inviterStats.hp,
            mp: inviterStats.mp,
            stamina: inviterStats.stamina,
            vitalStamina: inviterStats.vitalStamina
        }
    });

    await opponentProfile.update({
        combatState: {
            hp: opponentStats.hp,
            mp: opponentStats.mp,
            stamina: opponentStats.stamina,
            vitalStamina: opponentStats.vitalStamina
        }
    });

    const fight = {
        playerA: inviterId,
        playerB: opponentId,
        turn: inviterId,
        state: 'inCombat',
        messageId: interaction.message.id,
        channelId: interaction.channelId
    };

    activeFights.set(inviterId, fight);
    activeFights.set(opponentId, fight);

    const inviterSkills = await UserSkills.findAll({
        where: {
            profileId: inviterProfile.id,
            equippedSlot: { [Op.not]: null }
        },
        include: [{
            model: Skills,
            as: 'Skill',
            where: {
                effect_type_main: {
                    [Op.in]: ALLOWED_COMBAT_TYPES
                }
            }
        }]
    });

    if (!inviterSkills.length) {
        clearFightTimeout(fight);
        activeFights.delete(inviterId);
        activeFights.delete(opponentId);
        return interaction.update({
            content: `${inviterUser.username} has no equipped combat skills. Use /loadout equip first.`,
            embeds: [],
            components: [],
            files: []
        });
    }

    scheduleTurnTimeout(fight, client);

    const inviterImage = resolveImage(inviterProfile);
    const opponentImage = resolveImage(opponentProfile);

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`Arena: ${inviterUser.username} vs ${opponentUser.username}`)
        .addFields(
            { name: inviterUser.username, value: buildStats(inviterStats), inline: true },
            { name: opponentUser.username, value: buildStats(opponentStats), inline: true }
        )
        .setFooter({ text: `It's ${inviterUser.username}'s turn.` });

    if (inviterImage) embed.setImage(`attachment://${inviterImage.name}`);
    if (opponentImage) embed.setThumbnail(`attachment://${opponentImage.name}`);

    const select = new StringSelectMenuBuilder()
        .setCustomId('pvp_attack')
        .setPlaceholder('Select a skill')
        .addOptions(
            inviterSkills.slice(0, 25).map(us => ({
                label: us.Skill.name,
                value: us.Skill.id.toString(),
                description: buildSkillOptionDescription(inviterStats, opponentStats, us.Skill, us.level)
            }))
        );

    const row = new ActionRowBuilder().addComponents(select);

    return interaction.update({
        embeds: [embed],
        components: [row],
        files: [
            ...(inviterImage ? [inviterImage] : []),
            ...(opponentImage ? [opponentImage] : [])
        ]
    });
}

module.exports = { handleArena };

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

function buildSkillOptionDescription(attackerStats, defenderStats, skill, skillLevel = 1) {
    const dmg = estimateSkillDamage(attackerStats, defenderStats, skill, skillLevel);
    const parts = [`~DMG ${dmg}`];
    const mpCost = Math.max(0, Number(skill?.mp_cost) || 0);
    const spCost = Math.max(0, Number(skill?.sp_cost) || 0);
    if (mpCost > 0) parts.push(`MP ${mpCost}`);
    if (spCost > 0) parts.push(`SP ${spCost}`);
    const text = parts.join(' | ');
    return text.length <= 100 ? text : text.slice(0, 97) + '...';
}
