const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { RaidInstances, Monsters, Skills, Profiles, UserSkills } = require('../../database');
const { calculatePlayerStats } = require('../../utils/playerStats');
const { executeTurn } = require('../../utils/combatEngine');
const { calculateEffectiveSkillPower } = require('../../utils/skillProgression');
const { calculateXpForLevel } = require('../../utils/xpUtils');
const { applyXpBoost } = require('../../utils/xpBoostService');
const { getMaxLevelForRace } = require('../../utils/evolutionConfig');

const LOBBY_SECONDS_DEFAULT = 60;
const LOBBY_SECONDS_MAX = 300;
const ACTIVE_SECONDS = 20 * 60;
const ALLOWED_COMBAT_TYPES = ['Physical', 'Magic', 'Debuff'];
const META_KEY = '__raidMeta';
const lobbyTimers = new Map();
const activeTimers = new Map();
const raidPanelMessages = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raid')
        .setDescription('Create and fight raid bosses.')
        .addSubcommand(s => s.setName('create').setDescription('Create a raid lobby (admin)')
            .addIntegerOption(o => o.setName('tier').setDescription('Raid tier 1-30').setRequired(true).setMinValue(1).setMaxValue(30))
            .addIntegerOption(o => o.setName('countdown').setDescription('Lobby seconds 10-300').setRequired(false).setMinValue(10).setMaxValue(LOBBY_SECONDS_MAX)))
        .addSubcommand(s => s.setName('join').setDescription('Join lobby'))
        .addSubcommand(s => s.setName('leave').setDescription('Leave raid'))
        .addSubcommand(s => s.setName('start').setDescription('Start raid now'))
        .addSubcommand(s => s.setName('attack').setDescription('Open your turn menu'))
        .addSubcommand(s => s.setName('info').setDescription('Show raid info')),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'create') return handleCreate(interaction);
        if (sub === 'join') return handleJoin(interaction);
        if (sub === 'leave') return handleLeave(interaction);
        if (sub === 'start') return handleStart(interaction);
        if (sub === 'attack') return handleAttack(interaction);
        return handleInfo(interaction);
    },
    handleRaidAttackSelect
};

async function handleCreate(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: 'Admin only.', flags: MessageFlags.Ephemeral });
    }
    const existing = await getChannelRaid(interaction.guild.id, interaction.channel.id);
    if (existing) return interaction.reply({ content: `Raid already exists (${existing.status}).`, flags: MessageFlags.Ephemeral });

    const tier = interaction.options.getInteger('tier', true);
    const countdown = interaction.options.getInteger('countdown') ?? LOBBY_SECONDS_DEFAULT;
    const monster = await chooseRaidMonster(tier);
    if (!monster) return interaction.reply({ content: 'No monsters for this tier.', flags: MessageFlags.Ephemeral });

    const bossState = buildRaidBossState(monster, tier);
    const raid = await RaidInstances.create({
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        createdBy: interaction.user.id,
        status: 'lobby',
        raidTier: tier,
        bossMonsterId: monster.id,
        bossName: monster.name,
        bossState,
        participants: [],
        participantStates: {},
        rewardXpBase: Math.floor((300 + tier * 120) + monster.level * 80 + bossState.maxHp * 0.08),
        rewardCrystalsBase: Math.floor((25 + tier * 12) + monster.level * 4),
        endsAt: Date.now() + (countdown * 1000)
    });

    scheduleLobbyTimeout(interaction.client, raid.id, countdown);
    const payload = buildRaidPayload(raid, `Use \`/raid join\` now. Auto-start in ${countdown}s.`);
    await interaction.reply(payload);
    const message = await interaction.fetchReply();
    raidPanelMessages.set(raid.id, {
        channelId: interaction.channel.id,
        messageId: message.id
    });
    return;
}

async function handleJoin(interaction) {
    const raid = await getChannelRaid(interaction.guild.id, interaction.channel.id);
    if (!raid || raid.status !== 'lobby') return interaction.reply({ content: 'No raid lobby here.', flags: MessageFlags.Ephemeral });
    const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
    if (!profile) return interaction.reply({ content: "You don't have a profile.", flags: MessageFlags.Ephemeral });
    if ((raid.participants || []).includes(profile.id)) return interaction.reply({ content: 'Already joined.', flags: MessageFlags.Ephemeral });
    const stats = await calculatePlayerStats(profile);
    if (!stats) return interaction.reply({ content: 'Could not calculate stats.', flags: MessageFlags.Ephemeral });

    const states = cloneStates(raid.participantStates);
    states[String(profile.id)] = {
        profileId: profile.id, name: profile.name, userId: profile.userId,
        hp: stats.hp, mp: stats.mp, stamina: stats.stamina, vitalStamina: stats.vitalStamina,
        defeated: false, totalDamage: 0, effects: []
    };
    raid.participants = [...(raid.participants || []), profile.id];
    raid.participantStates = states;
    await raid.save();
    await upsertRaidPanelMessage(interaction.client, raid, `Use \`/raid join\` now. Auto-start soon.`);
    return interaction.reply({ content: `Joined. Participants: ${raid.participants.length}.`, flags: MessageFlags.Ephemeral });
}

async function handleLeave(interaction) {
    const raid = await getChannelRaid(interaction.guild.id, interaction.channel.id);
    if (!raid) return interaction.reply({ content: 'No raid here.', flags: MessageFlags.Ephemeral });
    const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
    if (!profile) return interaction.reply({ content: "You don't have a profile.", flags: MessageFlags.Ephemeral });
    if (!(raid.participants || []).includes(profile.id)) return interaction.reply({ content: 'You are not in this raid.', flags: MessageFlags.Ephemeral });

    raid.participants = (raid.participants || []).filter(id => id !== profile.id);
    const states = cloneStates(raid.participantStates);
    delete states[String(profile.id)];
    normalizeMeta(states, raid.participants || []);
    raid.participantStates = states;
    if (!raid.participants.length) {
        raid.status = 'cancelled';
        clearTimers(raid.id);
    }
    await raid.save();
    if (raid.status !== 'cancelled') {
        await upsertRaidPanelMessage(interaction.client, raid, `Use \`/raid join\` now. Auto-start soon.`);
    }
    return interaction.reply({ content: 'You left the raid.', flags: MessageFlags.Ephemeral });
}

async function handleStart(interaction) {
    const raid = await getChannelRaid(interaction.guild.id, interaction.channel.id);
    if (!raid || raid.status !== 'lobby') return interaction.reply({ content: 'No lobby to start.', flags: MessageFlags.Ephemeral });
    const allowed = raid.createdBy === interaction.user.id || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!allowed) return interaction.reply({ content: 'Creator/admin only.', flags: MessageFlags.Ephemeral });
    if (!(raid.participants || []).length) {
        raid.status = 'cancelled';
        await raid.save();
        clearTimers(raid.id);
        return interaction.reply({ content: 'Cancelled: nobody joined.', flags: MessageFlags.Ephemeral });
    }
    await activateRaid(interaction.client, raid, 'Raid started manually.');
    return interaction.reply({ content: 'Raid started.', flags: MessageFlags.Ephemeral });
}

async function handleInfo(interaction) {
    const raid = await getChannelRaid(interaction.guild.id, interaction.channel.id);
    if (!raid) return interaction.reply({ content: 'No raid in this channel.', flags: MessageFlags.Ephemeral });
    return interaction.reply(buildRaidPayload(raid));
}

async function handleAttack(interaction) {
    const raid = await getChannelRaid(interaction.guild.id, interaction.channel.id);
    if (!raid || raid.status !== 'active') return interaction.reply({ content: 'No active raid.', flags: MessageFlags.Ephemeral });
    const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
    if (!profile) return interaction.reply({ content: "You don't have a profile.", flags: MessageFlags.Ephemeral });
    return sendTurnSkillMenu(interaction, raid, profile);
}

async function handleRaidAttackSelect(interaction) {
    const parts = interaction.customId.split('_');
    const raidId = parseInt(parts[3], 10);
    const profileId = parseInt(parts[4], 10);
    const skillId = parseInt(interaction.values[0], 10);
    if (isNaN(raidId) || isNaN(profileId) || isNaN(skillId)) {
        return interaction.reply({ content: 'Invalid raid action.', flags: MessageFlags.Ephemeral });
    }

    const raid = await RaidInstances.findByPk(raidId);
    if (!raid || raid.status !== 'active') return interaction.reply({ content: 'Raid inactive.', flags: MessageFlags.Ephemeral });
    const profile = await Profiles.findByPk(profileId);
    if (!profile || profile.userId !== interaction.user.id) return interaction.reply({ content: 'Not your menu.', flags: MessageFlags.Ephemeral });

    const states = cloneStates(raid.participantStates);
    const participants = raid.participants || [];
    normalizeMeta(states, participants);
    const meta = getMeta(states);
    const order = (meta.turnOrder || []).filter(id => isAlive(states[String(id)]));
    if (!order.length) return interaction.reply({ content: 'Raid already finished.', flags: MessageFlags.Ephemeral });
    const turnIndex = Math.min(Math.max(0, meta.turnIndex || 0), order.length - 1);
    const expected = order[turnIndex];
    if (expected !== profile.id) {
        const expectedUserId = states[String(expected)]?.userId;
        const expectedDisplay = expectedUserId
            ? `<@${expectedUserId}>`
            : (states[String(expected)]?.name || 'unknown');
        return interaction.reply({ content: `Not your turn. Current: ${expectedDisplay}.`, flags: MessageFlags.Ephemeral });
    }

    const playerState = states[String(profile.id)];
    if (!isAlive(playerState)) return interaction.reply({ content: 'You are defeated.', flags: MessageFlags.Ephemeral });

    const userSkill = await UserSkills.findOne({
        where: { profileId: profile.id, skillId, equippedSlot: { [Op.not]: null } },
        include: [{ model: Skills, as: 'Skill', where: { effect_type_main: { [Op.in]: ALLOWED_COMBAT_TYPES } } }]
    });
    if (!userSkill || !userSkill.Skill) return interaction.reply({ content: 'Skill not usable.', flags: MessageFlags.Ephemeral });

    const skill = { ...userSkill.Skill.toJSON(), power: calculateEffectiveSkillPower(userSkill.Skill.power, userSkill.level) };
    const reason = insufficientReason(playerState, skill);
    if (reason) return interaction.reply({ content: reason, flags: MessageFlags.Ephemeral });

    const maxStats = await calculatePlayerStats(profile);
    if (!maxStats) return interaction.reply({ content: 'Stat calculation failed.', flags: MessageFlags.Ephemeral });

    const playerTurn = {
        entityA: { ...maxStats, hp: playerState.hp, mp: playerState.mp, stamina: playerState.stamina, vitalStamina: playerState.vitalStamina, effects: playerState.effects || [] },
        entityB: { ...raid.bossState, effects: raid.bossState?.effects || [] }
    };
    const playerResult = executeTurn(playerTurn, skill, []);

    states[String(profile.id)] = {
        ...playerState,
        hp: Math.max(0, playerTurn.entityA.hp),
        mp: Math.max(0, playerTurn.entityA.mp),
        stamina: Math.max(0, playerTurn.entityA.stamina),
        vitalStamina: Math.max(0, playerTurn.entityA.vitalStamina),
        effects: playerTurn.entityA.effects || [],
        totalDamage: Math.max(0, Number(playerState.totalDamage) || 0) + (playerResult.playerDamageDone || 0),
        defeated: !isAlive({ hp: playerTurn.entityA.hp, vitalStamina: playerTurn.entityA.vitalStamina })
    };
    raid.bossState = {
        ...raid.bossState,
        hp: Math.max(0, playerTurn.entityB.hp),
        mp: Math.max(0, playerTurn.entityB.mp),
        stamina: Math.max(0, playerTurn.entityB.stamina),
        vitalStamina: Math.max(0, playerTurn.entityB.vitalStamina),
        effects: playerTurn.entityB.effects || []
    };

    if (raid.bossState.hp <= 0 || playerResult.victory) {
        raid.participantStates = states;
        await raid.save();
        await interaction.update({ content: 'Attack submitted.', components: [] });
        await concludeVictory(interaction.channel, raid);
        return;
    }

    const logs = [...(playerResult.log || [])];
    const aliveAfterPlayer = participants.filter(id => isAlive(states[String(id)]));
    if (!aliveAfterPlayer.length) {
        raid.status = 'ended';
        raid.participantStates = states;
        await raid.save();
        clearTimers(raid.id);
        await interaction.update({ content: 'Attack submitted.', components: [] });
        await interaction.channel.send('Raid failed: all raiders are down.');
        return;
    }

    let nextMeta = { ...meta, turnOrder: aliveAfterPlayer, turnIndex: turnIndex + 1 };
    if (nextMeta.turnIndex >= aliveAfterPlayer.length) {
        const monster = await Monsters.findByPk(raid.bossMonsterId, { include: [{ model: Skills, through: { attributes: [] } }] });
        const bossSkillPool = (monster?.Skills || []).filter(s => ALLOWED_COMBAT_TYPES.includes(s.effect_type_main));
        const bossSkill = bossSkillPool[Math.floor(Math.random() * bossSkillPool.length)] || { name: 'Raid Smash', effect_type_main: 'Physical', power: 2, mp_cost: 0, sp_cost: 0 };
        const targetId = aliveAfterPlayer[Math.floor(Math.random() * aliveAfterPlayer.length)];
        const target = states[String(targetId)];

        const bossTurn = {
            entityA: { ...raid.bossState, effects: raid.bossState.effects || [] },
            entityB: { hp: target.hp, mp: target.mp, stamina: target.stamina, vitalStamina: target.vitalStamina, offense: 0, defense: 0, magic: 0, resistance: 0, speed: 1, effects: target.effects || [] }
        };
        const bossResult = executeTurn(bossTurn, bossSkill, []);
        logs.push(...(bossResult.log || []));

        raid.bossState = {
            ...raid.bossState,
            hp: Math.max(0, bossTurn.entityA.hp),
            mp: Math.max(0, bossTurn.entityA.mp),
            stamina: Math.max(0, bossTurn.entityA.stamina),
            vitalStamina: Math.max(0, bossTurn.entityA.vitalStamina),
            effects: bossTurn.entityA.effects || []
        };
        states[String(targetId)] = {
            ...target,
            hp: Math.max(0, bossTurn.entityB.hp),
            mp: Math.max(0, bossTurn.entityB.mp),
            stamina: Math.max(0, bossTurn.entityB.stamina),
            vitalStamina: Math.max(0, bossTurn.entityB.vitalStamina),
            effects: bossTurn.entityB.effects || [],
            defeated: !isAlive({ hp: bossTurn.entityB.hp, vitalStamina: bossTurn.entityB.vitalStamina })
        };

        const aliveAfterBoss = participants.filter(id => isAlive(states[String(id)]));
        if (!aliveAfterBoss.length) {
            raid.status = 'ended';
            raid.participantStates = states;
            await raid.save();
            clearTimers(raid.id);
            await interaction.update({ content: 'Attack submitted.', components: [] });
            await interaction.channel.send('Raid failed: all raiders are down.');
            return;
        }
        nextMeta = { round: (meta.round || 1) + 1, turnIndex: 0, turnOrder: aliveAfterBoss };
    }

    setMeta(states, nextMeta);
    raid.participantStates = states;
    await raid.save();

    const nextId = nextMeta.turnOrder[nextMeta.turnIndex];
    const nextUserId = states[String(nextId)]?.userId;
    const nextName = nextUserId ? `<@${nextUserId}>` : (states[String(nextId)]?.name || 'Unknown');
    await interaction.update({ content: 'Attack submitted.', components: [] });
    await upsertRaidPanelMessage(
        interaction.client,
        raid,
        `Last action by ${profile.name}\nNext turn: **${nextName}**\n\n${logs.join('\n') || 'No log.'}`
    );
}

async function sendTurnSkillMenu(interaction, raid, profile) {
    const participants = raid.participants || [];
    if (!participants.includes(profile.id)) return interaction.reply({ content: 'You are not in this raid.', flags: MessageFlags.Ephemeral });
    const states = cloneStates(raid.participantStates);
    normalizeMeta(states, participants);
    const meta = getMeta(states);
    const order = (meta.turnOrder || []).filter(id => isAlive(states[String(id)]));
    if (!order.length) return interaction.reply({ content: 'No alive raiders left.', flags: MessageFlags.Ephemeral });
    const turnIndex = Math.min(Math.max(0, meta.turnIndex || 0), order.length - 1);
    const expected = order[turnIndex];
    if (expected !== profile.id) {
        const expectedUserId = states[String(expected)]?.userId;
        const expectedDisplay = expectedUserId
            ? `<@${expectedUserId}>`
            : (states[String(expected)]?.name || 'unknown');
        return interaction.reply({ content: `Not your turn. Current: ${expectedDisplay}.`, flags: MessageFlags.Ephemeral });
    }

    const userSkills = await UserSkills.findAll({
        where: { profileId: profile.id, equippedSlot: { [Op.not]: null } },
        include: [{ model: Skills, as: 'Skill', where: { effect_type_main: { [Op.in]: ALLOWED_COMBAT_TYPES } } }],
        order: [['equippedSlot', 'ASC']]
    });
    if (!userSkills.length) return interaction.reply({ content: 'No equipped combat skills.', flags: MessageFlags.Ephemeral });
    const playerStats = await calculatePlayerStats(profile);
    if (!playerStats) return interaction.reply({ content: 'Could not calculate your stats.', flags: MessageFlags.Ephemeral });

    setMeta(states, { ...meta, turnOrder: order, turnIndex });
    raid.participantStates = states;
    await raid.save();

    const select = new StringSelectMenuBuilder()
        .setCustomId(`raid_attack_select_${raid.id}_${profile.id}`)
        .setPlaceholder('Choose your raid skill')
        .addOptions(userSkills.slice(0, 25).map(us => ({
            label: us.Skill.name,
            value: String(us.Skill.id),
            description: buildRaidSkillOptionDescription(playerStats, raid.bossState || {}, us.Skill, us.level)
        })));
    const row = new ActionRowBuilder().addComponents(select);

    return interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor('#290003')
                .setTitle(`Raid Turn: ${profile.name}`)
                .setDescription(
                    `Boss HP: ${raid.bossState.hp}/${raid.bossState.maxHp}\n` +
                    `Round: ${meta.round || 1}\n` +
                    `Turn ${turnIndex + 1}/${order.length}`
                )
        ],
        components: [row],
        flags: MessageFlags.Ephemeral
    });
}

async function concludeVictory(channel, raid) {
    const states = raid.participantStates || {};
    const ids = raid.participants || [];
    const entries = ids.map(id => ({ profileId: id, damage: Math.max(0, Number(states[String(id)]?.totalDamage) || 0) }));
    const total = entries.reduce((a, b) => a + b.damage, 0) || 1;
    const profiles = await Profiles.findAll({ where: { id: { [Op.in]: ids } } });
    const map = new Map(profiles.map(p => [p.id, p]));
    const lines = [];

    for (const e of entries) {
        const p = map.get(e.profileId);
        if (!p) continue;
        const ratio = e.damage / total;
        const baseXpGain = Math.floor(raid.rewardXpBase * (0.5 + ratio * 1.5));
        const xpBoost = await applyXpBoost(p, baseXpGain);
        const xpGain = xpBoost.finalXp;
        const crystalGain = Math.max(1, Math.floor(raid.rewardCrystalsBase * (0.5 + ratio * 1.5)));
        const leveled = applyProfileXpWithRaceCap(p, xpGain);
        const xp = leveled.xp;
        const lvl = leveled.level;
        const sp = leveled.skillPointsGain;
        p.xp = xp;
        p.level = lvl;
        p.skillPoints = (p.skillPoints || 0) + sp;
        p.crystals = (p.crystals || 0) + crystalGain;
        await p.save();
        lines.push(
            `• ${p.name}: +${xpGain} XP` +
            (xpBoost.bonusXp > 0 ? ` (Boost +${xpBoost.bonusXp})` : '') +
            `, +${crystalGain} crystals (${Math.round(ratio * 100)}% dmg)`
        );
    }

    raid.status = 'ended';
    await raid.save();
    clearTimers(raid.id);
    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor('#00aa66')
                .setTitle(`Raid Cleared: ${raid.bossName}`)
                .setDescription(lines.join('\n') || 'No rewards.')
        ]
    });
}

function applyProfileXpWithRaceCap(profile, xpGain) {
    const maxLevel = Math.max(1, Number(getMaxLevelForRace(profile?.race)) || 1);
    let level = Math.max(1, Number(profile?.level) || 1);
    let xp = Math.max(0, Number(profile?.xp) || 0);
    let skillPointsGain = 0;
    const gain = Math.max(0, Number(xpGain) || 0);

    if (level >= maxLevel) {
        return { level: maxLevel, xp: 0, skillPointsGain: 0 };
    }

    xp += gain;
    while (level < maxLevel) {
        const xpNeeded = calculateXpForLevel(level + 1, profile.race);
        if (xp < xpNeeded) break;
        xp -= xpNeeded;
        level += 1;
        skillPointsGain += 5;
    }

    if (level >= maxLevel) {
        level = maxLevel;
        xp = 0;
    }

    return { level, xp, skillPointsGain };
}

function insufficientReason(entity, skill) {
    const mpCost = Math.max(0, Number(skill?.mp_cost) || 0);
    const spCost = Math.max(0, Number(skill?.sp_cost) || 0);
    const vital = Math.max(0, Number(entity?.vitalStamina) || 0);
    const mp = Math.max(0, Number(entity?.mp) || 0);
    const stamina = Math.max(0, Number(entity?.stamina) || 0);
    const missing = Math.max(0, mpCost - mp) + Math.max(0, spCost - stamina);
    if (missing <= vital) return null;
    return `Not enough resources for **${skill.name}**. Missing ${missing}, Vital: ${vital}.`;
}

function buildRaidSkillOptionDescription(attackerStats, defenderStats, skill, skillLevel = 1) {
    const dmg = estimateRaidSkillDamage(attackerStats, defenderStats, skill, skillLevel);
    const parts = [`~DMG ${dmg}`];
    const mpCost = Math.max(0, Number(skill?.mp_cost) || 0);
    const spCost = Math.max(0, Number(skill?.sp_cost) || 0);
    if (mpCost > 0) parts.push(`MP ${mpCost}`);
    if (spCost > 0) parts.push(`SP ${spCost}`);
    const text = parts.join(' | ');
    return text.length <= 100 ? text : text.slice(0, 97) + '...';
}

function buildRaidBossState(monster, tier) {
    const hpMul = 8 + (tier * 1.6);
    const statMul = 3 + (tier * 0.7);
    const speedMul = 1 + (tier * 0.06);
    const maxHp = Math.floor(monster.hp * hpMul);
    const maxMp = Math.floor(monster.mp * (4 + tier * 0.5));
    const maxStamina = Math.floor(monster.stamina * (5 + tier * 0.8));
    const maxVital = Math.floor(monster.vitalStamina * (5 + tier * 0.8));
    return {
        id: monster.id, name: monster.name, rarity: monster.rarity, level: monster.level,
        image: monster.image || null,
        hp: maxHp, maxHp, mp: maxMp, maxMp, stamina: maxStamina, maxStamina,
        vitalStamina: maxVital, maxVitalStamina: maxVital,
        offense: Math.floor(monster.offense * statMul),
        defense: Math.floor(monster.defense * statMul),
        magic: Math.floor(monster.magic * statMul),
        resistance: Math.floor(monster.resistance * statMul),
        speed: Math.max(1, Math.floor(monster.speed * speedMul)),
        effects: []
    };
}

async function chooseRaidMonster(raidTier) {
    const range = getRaidMonsterLevelRange(raidTier);
    let monsters = await Monsters.findAll({ where: { level: { [Op.between]: [range.min, range.max] } } });
    if (!monsters.length) {
        monsters = await Monsters.findAll({ order: [['level', 'DESC']] });
    }
    if (!monsters.length) return null;
    return monsters[Math.floor(Math.random() * monsters.length)];
}

function getRaidMonsterLevelRange(raidTier) {
    const tier = Math.max(1, Number(raidTier) || 1);
    return { min: Math.max(1, Math.floor((tier * 2) - 1)), max: Math.max(1, Math.floor((tier * 3) + 5)) };
}

function buildRaidPayload(raid, note = null) {
    const participants = raid.participants || [];
    const states = raid.participantStates || {};
    const alive = participants.filter(id => isAlive(states[String(id)])).length;
    const meta = getMeta(states);
    const turnId = meta.turnOrder?.[meta.turnIndex || 0];
    const turnUserId = turnId ? states[String(turnId)]?.userId : null;
    const turnDisplay = turnUserId ? `<@${turnUserId}>` : (turnId ? (states[String(turnId)]?.name || 'Unknown') : null);
    const countdown = raid.status === 'lobby' && raid.endsAt ? Math.max(0, Math.ceil((raid.endsAt - Date.now()) / 1000)) : null;
    const boss = raid.bossState || {};
    const image = resolveMonsterImage(raid.bossState?.image);
    const participantHpLines = participants.length
        ? participants.map((id) => {
            const ps = states[String(id)];
            const userLabel = ps?.userId ? `<@${ps.userId}>` : (ps?.name || `ID ${id}`);
            if (!ps || ps.defeated || (ps.hp || 0) <= 0) {
                return `${userLabel}: DEAD`;
            }
            return `${userLabel}: ${ps.hp} HP`;
        }).join('\n')
        : 'No participants';
    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle('Raid')
        .setDescription(
            `Status: **${raid.status.toUpperCase()}**\n` +
            `Raid Tier: **${raid.raidTier}**\n` +
            `Boss: **${raid.bossName}**\n` +
            `────────────\n` +
            `Boss HP: **${raid.bossState.hp}/${raid.bossState.maxHp}**\n` +
            `Boss MP: **${boss.mp ?? 0}/${boss.maxMp ?? boss.mp ?? 0}**\n` +
            `Boss Stamina: **${boss.stamina ?? 0}/${boss.maxStamina ?? boss.stamina ?? 0}**\n` +
            `Boss Vital: **${boss.vitalStamina ?? 0}/${boss.maxVitalStamina ?? boss.vitalStamina ?? 0}**\n` +
            `────────────\n` +
            `Participants HP:\n${participantHpLines}\n` +
            `────────────\n` +
            `Participants: **${participants.length}** (alive: ${alive})\n` +
            `Base Rewards: **${raid.rewardXpBase} XP**, **${raid.rewardCrystalsBase} crystals**` +
            (raid.status === 'active' ? `\nRound: **${meta.round || 1}**` : '') +
            (turnDisplay ? `\nCurrent Turn: **${turnDisplay}**` : '') +
            (countdown !== null ? `\nLobby countdown: **${countdown}s**` : '') +
            (note ? `\n\n${note}` : '')
        );
    if (image) {
        embed.setThumbnail(`attachment://${image.name}`);
    }
    return {
        embeds: [embed],
        files: image ? [image] : []
    };
}

async function getChannelRaid(guildId, channelId) {
    return RaidInstances.findOne({
        where: { guildId, channelId, status: { [Op.in]: ['lobby', 'active'] } },
        order: [['id', 'DESC']]
    });
}

function cloneStates(states) {
    return { ...(states || {}) };
}

function isAlive(state) {
    if (!state) return false;
    return !state.defeated && (state.hp || 0) > 0 && (state.vitalStamina || 0) > 0;
}

function getMeta(states) {
    return states[META_KEY] || { round: 1, turnIndex: 0, turnOrder: [] };
}

function setMeta(states, meta) {
    states[META_KEY] = {
        round: Math.max(1, Number(meta?.round) || 1),
        turnIndex: Math.max(0, Number(meta?.turnIndex) || 0),
        turnOrder: Array.isArray(meta?.turnOrder) ? meta.turnOrder.map(v => Number(v)).filter(Number.isFinite) : []
    };
}

function normalizeMeta(states, participants) {
    const meta = getMeta(states);
    const order = (meta.turnOrder?.length ? meta.turnOrder : participants).filter(id => isAlive(states[String(id)]));
    const idx = order.length ? Math.min(Math.max(0, meta.turnIndex || 0), order.length - 1) : 0;
    setMeta(states, { round: meta.round || 1, turnIndex: idx, turnOrder: order });
}

function clearTimers(raidId) {
    const lt = lobbyTimers.get(raidId);
    if (lt) clearTimeout(lt);
    lobbyTimers.delete(raidId);
    const at = activeTimers.get(raidId);
    if (at) clearTimeout(at);
    activeTimers.delete(raidId);
    raidPanelMessages.delete(raidId);
}

function scheduleLobbyTimeout(client, raidId, seconds) {
    clearTimers(raidId);
    const timer = setTimeout(async () => {
        try {
            const raid = await RaidInstances.findByPk(raidId);
            if (!raid || raid.status !== 'lobby') return;
            const participants = raid.participants || [];
            const channel = await client.channels.fetch(raid.channelId).catch(() => null);
            if (!participants.length) {
                raid.status = 'cancelled';
                await raid.save();
                clearTimers(raidId);
                if (channel) await channel.send('Raid disappeared: nobody joined in time.');
                return;
            }
            await activateRaid(client, raid, 'Lobby timer ended. Raid started automatically.');
            if (channel) await channel.send(`Raid started with ${participants.length} participant(s). Use \`/raid attack\`.`);
        } catch (e) {
            console.error('raid lobby timeout error:', e);
        }
    }, Math.max(1000, seconds * 1000));
    lobbyTimers.set(raidId, timer);
}

async function activateRaid(client, raid, reasonText) {
    raid.status = 'active';
    raid.endsAt = Date.now() + (ACTIVE_SECONDS * 1000);
    const states = cloneStates(raid.participantStates);
    setMeta(states, { round: 1, turnIndex: 0, turnOrder: raid.participants || [] });
    normalizeMeta(states, raid.participants || []);
    raid.participantStates = states;
    await raid.save();
    await upsertRaidPanelMessage(client, raid, `${reasonText}\nUse \`/raid attack\` now.`);
    scheduleActiveTimeout(client, raid.id, ACTIVE_SECONDS);
}

function scheduleActiveTimeout(client, raidId, seconds) {
    const timer = setTimeout(async () => {
        try {
            const raid = await RaidInstances.findByPk(raidId);
            if (!raid || raid.status !== 'active') return;
            raid.status = 'ended';
            await raid.save();
            clearTimers(raidId);
            const channel = await client.channels.fetch(raid.channelId).catch(() => null);
            if (channel) await channel.send(`Raid failed: time is up. ${raid.bossName} disappeared.`);
        } catch (e) {
            console.error('raid active timeout error:', e);
        }
    }, Math.max(1000, seconds * 1000));
    activeTimers.set(raidId, timer);
}

function resolveMonsterImage(imageName) {
    if (!imageName) return null;
    const filePath = path.resolve('utils', 'images', imageName);
    if (!fs.existsSync(filePath)) return null;
    return new AttachmentBuilder(filePath, { name: imageName });
}

function estimateRaidSkillDamage(playerStats, bossState, skill, skillLevel) {
    const effectivePower = calculateEffectiveSkillPower(skill?.power || 0, skillLevel || 1);
    let attackStat = 0;
    let defenseStat = 0;

    if (skill?.effect_type_main === 'Physical') {
        attackStat = Math.max(0, Number(playerStats?.offense) || 0);
        defenseStat = Math.max(0, Number(bossState?.defense) || 0);
    } else if (skill?.effect_type_main === 'Magic') {
        attackStat = Math.max(0, Number(playerStats?.magic) || 0);
        defenseStat = Math.max(0, Number(bossState?.resistance) || 0);
    } else {
        return 1;
    }

    const multiplier = 1 + (effectivePower * 0.1);
    const raw = attackStat * multiplier;
    const reduced = raw * (100 / (100 + defenseStat));
    return Math.max(1, Math.floor(reduced));
}

async function upsertRaidPanelMessage(client, raid, note = null) {
    const channel = await client.channels.fetch(raid.channelId).catch(() => null);
    if (!channel) return;

    const payload = buildRaidPayload(raid, note);
    const saved = raidPanelMessages.get(raid.id);

    if (saved && saved.channelId === raid.channelId) {
        try {
            const message = await channel.messages.fetch(saved.messageId);
            await message.edit(payload);
            return;
        } catch {
            // fallback to send a new panel message
        }
    }

    const message = await channel.send(payload);
    raidPanelMessages.set(raid.id, {
        channelId: raid.channelId,
        messageId: message.id
    });
}
