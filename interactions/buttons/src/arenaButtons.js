const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');

const { sequelize, Profiles, UserSkills, Skills, FightProgress } = require('../../../database');
const { calculatePlayerStats } = require('../../../utils/playerStats');
const { isAbyssAttack } = require('../../../utils/abyssSkill');
const { activeFights, clearFightTimeout, scheduleTurnTimeout } = require('../../../commands/global/arena');

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
    const race = String(profile?.race || '').toLowerCase().trim();
    const file = IMAGE_MAP[race];
    if (!file) return null;

    const imagePath = path.resolve('utils', 'images', file);
    if (!fs.existsSync(imagePath)) return null;
    return new AttachmentBuilder(imagePath, { name: file });
}

function buildStats(stats) {
    return [
        `❤️ HP: ${stats.hp}/${stats.hp}`,
        `🔵 MP: ${stats.mp}/${stats.mp}`,
        `🟨 Stamina: ${stats.stamina}/${stats.stamina}`,
        `🟩 Vital: ${stats.vitalStamina}/${stats.vitalStamina}`,
        '',
        `⚔️ Offense: ${stats.offense}`,
        `🛡️ Defense: ${stats.defense}`,
        `✨ Magic: ${stats.magic}`,
        `🌀 Resistance: ${stats.resistance}`,
        `💨 Speed: ${stats.speed}`
    ].join('\n');
}

async function reserveBetPot(inviterId, opponentId, betAmount) {
    if (betAmount <= 0) return { ok: true, pot: 0 };

    return sequelize.transaction(async (transaction) => {
        const [inviter, opponent] = await Promise.all([
            Profiles.findOne({ where: { userId: inviterId }, transaction, lock: transaction.LOCK.UPDATE }),
            Profiles.findOne({ where: { userId: opponentId }, transaction, lock: transaction.LOCK.UPDATE })
        ]);
        if (!inviter || !opponent) return { ok: false, reason: 'NO_PROFILE' };

        const inviterCrystals = Math.max(0, Number(inviter.crystals) || 0);
        const opponentCrystals = Math.max(0, Number(opponent.crystals) || 0);
        if (inviterCrystals < betAmount) return { ok: false, reason: 'INVITER_NOT_ENOUGH' };
        if (opponentCrystals < betAmount) return { ok: false, reason: 'OPPONENT_NOT_ENOUGH' };

        inviter.crystals = inviterCrystals - betAmount;
        opponent.crystals = opponentCrystals - betAmount;
        await inviter.save({ transaction });
        await opponent.save({ transaction });
        return { ok: true, pot: betAmount * 2 };
    });
}

async function fetchEquippedCombatSkills(profileId) {
    return UserSkills.findAll({
        where: { profileId, equippedSlot: { [Op.not]: null } },
        include: [{
            model: Skills,
            as: 'Skill',
            where: { effect_type_main: { [Op.in]: ALLOWED_COMBAT_TYPES } }
        }]
    });
}

async function handleArena(interaction, client) {
    const parts = String(interaction.customId || '').split('_');
    const action = parts[0];
    const opponentId = parts[1];
    const inviterId = parts[2];
    const customBetAmount = Math.max(0, Number(parts[3]) || 0);

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

    const [inviterStats, opponentStats, inviterSkills, opponentSkills] = await Promise.all([
        calculatePlayerStats(inviterProfile),
        calculatePlayerStats(opponentProfile),
        fetchEquippedCombatSkills(inviterProfile.id),
        fetchEquippedCombatSkills(opponentProfile.id)
    ]);

    if (!inviterSkills.length) {
        activeFights.delete(inviterId);
        activeFights.delete(opponentId);
        return interaction.update({
            content: `${inviterUser.username} has no equipped combat skills. Use /loadout equip first.`,
            embeds: [],
            components: [],
            files: []
        });
    }
    if (!opponentSkills.length) {
        activeFights.delete(inviterId);
        activeFights.delete(opponentId);
        return interaction.update({
            content: `${opponentUser.username} has no equipped combat skills. Arena canceled.`,
            embeds: [],
            components: [],
            files: []
        });
    }

    const betAmount = Math.max(0, Number(pendingFight.betAmount) || customBetAmount || 0);
    const betReserve = await reserveBetPot(inviterId, opponentId, betAmount);
    if (!betReserve.ok) {
        activeFights.delete(inviterId);
        activeFights.delete(opponentId);
        const reason = betReserve.reason === 'INVITER_NOT_ENOUGH'
            ? `${inviterUser.username} does not have enough crystals for the bet.`
            : betReserve.reason === 'OPPONENT_NOT_ENOUGH'
                ? `${opponentUser.username} does not have enough crystals for the bet.`
                : 'Bet validation failed.';
        return interaction.update({
            content: `Arena canceled. ${reason}`,
            embeds: [],
            components: [],
            files: []
        });
    }

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
        mode: String(pendingFight.mode || 'normal'),
        betAmount,
        betPot: Math.max(0, Number(betReserve.pot) || 0),
        messageId: interaction.message.id,
        channelId: interaction.channelId
    };
    activeFights.set(inviterId, fight);
    activeFights.set(opponentId, fight);
    scheduleTurnTimeout(fight, client);

    const inviterImage = resolveImage(inviterProfile);
    const opponentImage = resolveImage(opponentProfile);

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`Arena: ${inviterUser.username} vs ${opponentUser.username}`)
        .addFields(
            { name: inviterUser.username, value: buildStats(inviterStats), inline: true },
            { name: opponentUser.username, value: buildStats(opponentStats), inline: true },
            ...(betAmount > 0
                ? [{
                    name: 'Bet',
                    value: `Each paid: ${betAmount} crystals\nWinner takes: ${fight.betPot} crystals`,
                    inline: false
                }]
                : [])
        )
        .setFooter({ text: `It's ${inviterUser.username}'s turn.` });

    if (inviterImage) embed.setImage(`attachment://${inviterImage.name}`);
    if (opponentImage) embed.setThumbnail(`attachment://${opponentImage.name}`);

    const select = new StringSelectMenuBuilder()
        .setCustomId('pvp_attack')
        .setPlaceholder('Select a skill')
        .addOptions(
            inviterSkills.slice(0, 25).map((us) => ({
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
    const abyssAttack = isAbyssAttack(skill);

    if (skill?.effect_type_main === 'Physical') {
        attackStat = Math.max(0, Number(attackerStats?.offense) || 0);
        defenseStat = abyssAttack ? 0 : Math.max(0, Number(defenderStats?.defense) || 0);
    } else if (skill?.effect_type_main === 'Magic') {
        attackStat = Math.max(0, Number(attackerStats?.magic) || 0);
        defenseStat = abyssAttack ? 0 : Math.max(0, Number(defenderStats?.resistance) || 0);
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
    return text.length <= 100 ? text : `${text.slice(0, 97)}...`;
}
