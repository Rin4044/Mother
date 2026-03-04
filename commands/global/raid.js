const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');
const { sequelize, RaidInstances, Monsters, Skills, Profiles, UserSkills, InventoryItems } = require('../../database');
const { calculatePlayerStats } = require('../../utils/playerStats');
const { resolveMonsterImage } = require('../../utils/resolveMonsterImage');
const { executeTurn } = require('../../utils/combatEngine');
const { calculateEffectiveSkillPower } = require('../../utils/skillProgression');
const { calculateXpForLevel } = require('../../utils/xpUtils');
const { applyXpBoost } = require('../../utils/xpBoostService');
const { getMaxLevelForRace } = require('../../utils/evolutionConfig');
const { normalizeItemKey } = require('../../utils/inventoryService');
const { formatCrystalLabel, formatRaidKeyLabel } = require('../../utils/coreEmoji');
const { processTitleAchievementsByProfileId } = require('../../utils/titleAchievementService');
const { isAbyssAttack } = require('../../utils/abyssSkill');
const { incrementQuestKillProgress } = require('../../utils/adventurerGuildQuestService');
const { buildStatusModifiersFromSkills } = require('../../utils/combatStatusModifiers');
const { grantRecoveryPassiveXpFromTurn } = require('../../utils/recoveryPassiveXpService');
const { recordJournalProgress } = require('../../utils/journalService');
const { recordGuildProgressByProfile } = require('../../utils/playerGuildService');

const RAID_KEY_ITEM_NAME = 'Raid Key';
const LOBBY_SECONDS_DEFAULT = 60;
const ACTIVE_SECONDS = 20 * 60;
const ALLOWED_COMBAT_TYPES = ['Physical', 'Magic', 'Debuff'];
const META_KEY = '__raidMeta';
const SETUP_KEY = '__raidSetup';
const RAID_PHASE_2_THRESHOLD = 0.7;
const RAID_PHASE_3_THRESHOLD = 0.35;
const lobbyTimers = new Map();
const activeTimers = new Map();
const raidPanelMessages = new Map();
const RAID_BOSSES = {
    1: { label: 'Raid I - Orthocadinaht', names: ['orthocadinaht'] },
    2: { label: 'Raid II - Horo Neia', names: ['horo neia', 'horo_neia'] },
    3: { label: 'Raid III - Queen Taratect', names: ['queen taratect', 'queen_taratect'] }
};
const RAID_BOSS_PATTERNS = {
    1: {
        1: ['physical', 'magic', 'pressure', 'debuff'],
        2: ['pressure', 'magic', 'physical', 'burst', 'debuff'],
        3: ['burst', 'pressure', 'finisher', 'debuff']
    },
    2: {
        1: ['magic', 'debuff', 'physical', 'pressure'],
        2: ['magic', 'burst', 'debuff', 'pressure', 'physical'],
        3: ['burst', 'magic', 'finisher', 'debuff']
    },
    3: {
        1: ['pressure', 'physical', 'magic', 'debuff'],
        2: ['burst', 'pressure', 'physical', 'magic', 'debuff'],
        3: ['finisher', 'burst', 'pressure', 'debuff']
    }
};
const RAID_ROLE_BALANCE = {
    support: {
        minActionsForTeamRegen: 1,
        hpRegenPct: 2.5,
        mpRegenPct: 4
    },
    dps: {
        burstThresholdBossMaxHpPct: 6,
        burstMinDamage: 140,
        burstsForNextRoundBonus: 2,
        nextRoundDamageBonusPct: 10
    },
    tank: {
        anchorThresholdPlayerMaxHpPct: 9,
        anchorMinDamage: 130,
        nextBossMitigationPct: 10,
        mitigationCapPct: 40
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('raid')
        .setDescription('Create and monitor raid lobbies.')
        .addSubcommand(s => s.setName('create').setDescription('Create a raid lobby (consumes 1 Raid Key).')
            .addIntegerOption(o => o.setName('raid_level').setDescription('Raid line').setRequired(true)
                .addChoices(
                    { name: 'Raid I - Orthocadinaht', value: 1 },
                    { name: 'Raid II - Horo Neia', value: 2 },
                    { name: 'Raid III - Queen Taratect', value: 3 }
                ))
            .addIntegerOption(o => o.setName('tier').setDescription('Raid tier 1-10').setRequired(true).setMinValue(1).setMaxValue(10)))
        .addSubcommand(s => s.setName('info').setDescription('Show raid info')),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'create') return handleCreate(interaction);
        return handleInfo(interaction);
    },
    handleRaidAttackSelect,
    handleRaidLobbyButton
};

async function handleCreate(interaction) {
    const existing = await getChannelRaid(interaction.guild.id, interaction.channel.id);
    if (existing) return interaction.reply({ content: `Raid already exists (${existing.status}).`, flags: MessageFlags.Ephemeral });

    const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
    if (!profile) return interaction.reply({ content: "You don't have a profile.", flags: MessageFlags.Ephemeral });

    const raidLevel = interaction.options.getInteger('raid_level', true);
    const tier = interaction.options.getInteger('tier', true);
    const preset = RAID_BOSSES[raidLevel];
    if (!preset) return interaction.reply({ content: 'Invalid raid level.', flags: MessageFlags.Ephemeral });

    const monster = await findRaidMonsterByPreset(preset);
    if (!monster) return interaction.reply({ content: `Could not find boss for ${preset.label}.`, flags: MessageFlags.Ephemeral });

    const keyConsumed = await consumeRaidKey(profile.id);
    if (!keyConsumed) return interaction.reply({ content: `You need **${formatRaidKeyLabel(1)}** to create a raid.`, flags: MessageFlags.Ephemeral });

    const bossState = buildRaidBossState(monster, tier, raidLevel);
    const raid = await RaidInstances.create({
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        createdBy: interaction.user.id,
        status: 'lobby',
        raidTier: tier,
        bossMonsterId: monster.id,
        bossName: monster.name,
        bossState,
        phase: 1,
        bossMechanicState: {},
        raidLog: [],
        participants: [],
        participantStates: {
            [SETUP_KEY]: {
                raidLevel,
                raidLabel: preset.label
            }
        },
        rewardXpBase: Math.floor((300 + tier * 120) + monster.level * 80 + bossState.maxHp * 0.08),
        rewardCrystalsBase: Math.floor((25 + tier * 12) + monster.level * 4),
        endsAt: Date.now() + (LOBBY_SECONDS_DEFAULT * 1000)
    });

    scheduleLobbyTimeout(interaction.client, raid.id, LOBBY_SECONDS_DEFAULT);
    const payload = await buildRaidPayload(
        raid,
        `${interaction.user.username} opened this raid and consumed **${formatRaidKeyLabel(1)}**.\nLobby closes in ${LOBBY_SECONDS_DEFAULT}s.`
    );
    await interaction.reply(payload);
    const message = await interaction.fetchReply();
    raidPanelMessages.set(raid.id, {
        channelId: interaction.channel.id,
        messageId: message.id
    });
    return;
}

async function handleInfo(interaction) {
    let raid = await getChannelRaid(interaction.guild.id, interaction.channel.id);
    if (!raid) return interaction.reply({ content: 'No raid in this channel.', flags: MessageFlags.Ephemeral });
    raid = await settleExpiredLobbyIfNeeded(interaction.client, raid);
    return interaction.reply({ ...(await buildRaidPayload(raid)), flags: MessageFlags.Ephemeral });
}

async function handleRaidLobbyButton(interaction) {
    const parts = interaction.customId.split('_');
    const action = parts[2];
    const raidId = parseInt(parts[3], 10);
    if (!Number.isInteger(raidId)) {
        return interaction.reply({ content: 'Invalid raid interaction.', flags: MessageFlags.Ephemeral });
    }

    let raid = await RaidInstances.findByPk(raidId);
    if (!raid || raid.channelId !== interaction.channelId) {
        return interaction.reply({ content: 'This raid panel is no longer valid.', flags: MessageFlags.Ephemeral });
    }
    raid = await settleExpiredLobbyIfNeeded(interaction.client, raid);
    if (raid.status !== 'lobby') {
        const content = raid.status === 'active'
            ? 'Raid started. Use the raid panel to play your turn.'
            : 'Raid lobby is closed.';
        return interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }

    const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
    if (!profile) return interaction.reply({ content: "You don't have a profile.", flags: MessageFlags.Ephemeral });

    if (action === 'join') {
        if ((raid.participants || []).includes(profile.id)) {
            return interaction.reply({ content: 'You already joined this raid.', flags: MessageFlags.Ephemeral });
        }

        const userSkill = await UserSkills.findOne({
            where: {
                profileId: profile.id,
                equippedSlot: { [Op.not]: null }
            },
            include: [{
                model: Skills,
                as: 'Skill',
                required: true,
                where: { effect_type_main: { [Op.in]: ALLOWED_COMBAT_TYPES } }
            }]
        });
        if (!userSkill) {
            return interaction.reply({ content: 'Equip at least one combat skill before joining.', flags: MessageFlags.Ephemeral });
        }

        const stats = await calculatePlayerStats(profile);
        if (!stats) return interaction.reply({ content: 'Could not calculate stats.', flags: MessageFlags.Ephemeral });

        const states = cloneStates(raid.participantStates);
        states[String(profile.id)] = {
            profileId: profile.id,
            name: profile.name,
            userId: profile.userId,
            hp: stats.hp,
            maxHp: stats.hp,
            mp: stats.mp,
            maxMp: stats.mp,
            stamina: stats.stamina,
            maxStamina: stats.stamina,
            vitalStamina: stats.vitalStamina,
            maxVitalStamina: stats.vitalStamina,
            defeated: false,
            totalDamage: 0,
            effects: []
        };
        raid.participants = [...(raid.participants || []), profile.id];
        raid.participantStates = states;
        await raid.save();
        await upsertRaidPanelMessage(interaction.client, raid, `${interaction.user.username} joined the lobby.`);
        return interaction.reply({ content: `Joined. Participants: ${raid.participants.length}.`, flags: MessageFlags.Ephemeral });
    }

    if (action === 'leave') {
        if (!(raid.participants || []).includes(profile.id)) {
            return interaction.reply({ content: 'You are not in this raid.', flags: MessageFlags.Ephemeral });
        }

        raid.participants = (raid.participants || []).filter((id) => id !== profile.id);
        const states = cloneStates(raid.participantStates);
        delete states[String(profile.id)];
        normalizeMeta(states, raid.participants || []);
        raid.participantStates = states;
        await raid.save();
        await upsertRaidPanelMessage(interaction.client, raid, `${interaction.user.username} left the lobby.`);
        return interaction.reply({ content: 'You left the raid lobby.', flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({ content: 'Unknown raid action.', flags: MessageFlags.Ephemeral });
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
    ensureRaidMechanicState(raid, states);
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
    const allPlayerSkills = await UserSkills.findAll({
        where: { profileId: profile.id },
        include: [{ model: Skills, as: 'Skill', required: false }]
    });
    const playerStatusModifiers = buildStatusModifiersFromSkills(allPlayerSkills);
    const monsterData = await Monsters.findByPk(raid.bossMonsterId, {
        include: [{ model: Skills, through: { attributes: [] } }]
    });
    const monsterStatusModifiers = buildStatusModifiersFromSkills(monsterData?.Skills || []);

    const skill = { ...userSkill.Skill.toJSON(), power: calculateEffectiveSkillPower(userSkill.Skill.power, userSkill.level) };
    const reason = insufficientReason(playerState, skill);
    if (reason) return interaction.reply({ content: reason, flags: MessageFlags.Ephemeral });

    const maxStats = await calculatePlayerStats(profile);
    if (!maxStats) return interaction.reply({ content: 'Stat calculation failed.', flags: MessageFlags.Ephemeral });
    await safeDeferUpdate(interaction);
    await upsertRaidPanelMessage(interaction.client, raid, `Resolving action for **${profile.name}**...`);
    const raidWideDamageBonusPct = Math.max(0, Number(raid.bossMechanicState.currentRoundDamageBonusPct) || 0);
    const boostedStats = applyRaidWideDamageBonus(maxStats, raidWideDamageBonusPct);

    const playerTurn = {
        entityA: {
            ...boostedStats,
            hp: playerState.hp,
            mp: playerState.mp,
            stamina: playerState.stamina,
            vitalStamina: playerState.vitalStamina,
            effects: playerState.effects || [],
            statusResistance: playerStatusModifiers.statusResistance,
            statusEnhancement: playerStatusModifiers.statusEnhancement,
            rulerPassives: playerStatusModifiers.rulerPassives
        },
        entityB: {
            ...raid.bossState,
            effects: raid.bossState?.effects || [],
            statusResistance: monsterStatusModifiers.statusResistance,
            statusEnhancement: monsterStatusModifiers.statusEnhancement,
            rulerPassives: {
                ...(raid.bossState?.rulerPassives || {}),
                ...(monsterStatusModifiers.rulerPassives || {})
            }
        }
    };
    const playerResult = executeTurn(playerTurn, skill, []);
    await grantRecoveryPassiveXpFromTurn({
        profileId: profile.id,
        userSkills: allPlayerSkills,
        regenData: playerResult?.endTurnRegen?.player
    });
    registerPlayerRoleAction(raid, {
        skill,
        damageDone: playerResult.playerDamageDone || 0,
        bossMaxHp: raid.bossState?.maxHp || raid.bossState?.hp || 1
    });

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

    const phaseLogsAfterPlayer = applyRaidPhaseIfNeeded(raid);
    if (phaseLogsAfterPlayer.length) {
        logsPush(playerResult.log, phaseLogsAfterPlayer);
    }

    if (raid.bossState.hp <= 0 || playerResult.victory) {
        raid.participantStates = states;
        raid.raidLog = appendRaidLogs(raid.raidLog, playerResult.log || []);
        await raid.save();
        await concludeVictory(interaction.client, raid);
        return;
    }

    const logs = [...(playerResult.log || [])];
    const aliveAfterPlayer = participants.filter(id => isAlive(states[String(id)]));
    if (!aliveAfterPlayer.length) {
        raid.status = 'ended';
        raid.participantStates = states;
        raid.raidLog = appendRaidLogs(raid.raidLog, logs);
        await raid.save();
        const bossHp = Math.max(0, Number(raid.bossState?.hp) || 0);
        const bossMaxHp = Math.max(1, Number(raid.bossState?.maxHp) || bossHp || 1);
        const contribution = buildRaidContributionLines(states, participants);
        await upsertRaidPanelMessage(
            interaction.client,
            raid,
            `Raid failed: all raiders are down.\nBoss HP: ${bossHp}/${bossMaxHp}\n\nFinal Contribution:\n${contribution.join('\n') || '- none'}`
        );
        clearTimers(raid.id);
        return;
    }

    let nextMeta = { ...meta, turnOrder: aliveAfterPlayer, turnIndex: turnIndex + 1 };
    if (nextMeta.turnIndex >= aliveAfterPlayer.length) {
        const monster = monsterData || await Monsters.findByPk(raid.bossMonsterId, { include: [{ model: Skills, through: { attributes: [] } }] });
        const preBossRoleLogs = applyRoundSupportBonuses({
            raid,
            participants,
            states
        });
        logs.push(...preBossRoleLogs);
        const bossSkillPool = (monster?.Skills || []).filter(s => ALLOWED_COMBAT_TYPES.includes(s.effect_type_main));
        const targetId = aliveAfterPlayer[Math.floor(Math.random() * aliveAfterPlayer.length)];
        const target = states[String(targetId)];
        const setup = getRaidSetup(states);
        const raidLevel = Math.max(1, Math.min(3, Number(setup.raidLevel) || 1));
        const bossPatternPick = pickBossPatternSkill({
            raid,
            raidLevel,
            skillPool: bossSkillPool
        });
        const bossSkill = applyPendingTankMitigation(raid, bossPatternPick.skill);
        logs.push(`Boss pattern action: ${bossPatternPick.actionLabel} -> ${bossSkill.name}`);
        const targetUserSkills = await UserSkills.findAll({
            where: { profileId: targetId },
            include: [{ model: Skills, as: 'Skill', required: false }]
        });
        const targetStatusModifiers = buildStatusModifiersFromSkills(targetUserSkills);

        const bossTurn = {
            entityA: {
                ...raid.bossState,
                effects: raid.bossState.effects || [],
                statusResistance: monsterStatusModifiers.statusResistance,
                statusEnhancement: monsterStatusModifiers.statusEnhancement,
                rulerPassives: {
                    ...(raid.bossState?.rulerPassives || {}),
                    ...(monsterStatusModifiers.rulerPassives || {})
                }
            },
            entityB: {
                hp: target.hp,
                mp: target.mp,
                stamina: target.stamina,
                vitalStamina: target.vitalStamina,
                maxHp: target.maxHp,
                maxMp: target.maxMp,
                maxStamina: target.maxStamina,
                maxVitalStamina: target.maxVitalStamina,
                offense: 0,
                defense: 0,
                magic: 0,
                resistance: 0,
                speed: 1,
                effects: target.effects || [],
                statusResistance: targetStatusModifiers.statusResistance,
                statusEnhancement: targetStatusModifiers.statusEnhancement,
                rulerPassives: targetStatusModifiers.rulerPassives
            }
        };
        const bossResult = executeTurn(bossTurn, bossSkill, []);
        await grantRecoveryPassiveXpFromTurn({
            profileId: targetId,
            userSkills: targetUserSkills,
            regenData: bossResult?.endTurnRegen?.enemy
        });
        logs.push(...(bossResult.log || []));

        raid.bossState = {
            ...raid.bossState,
            hp: Math.max(0, bossTurn.entityA.hp),
            mp: Math.max(0, bossTurn.entityA.mp),
            stamina: Math.max(0, bossTurn.entityA.stamina),
            vitalStamina: Math.max(0, bossTurn.entityA.vitalStamina),
            effects: bossTurn.entityA.effects || []
        };
        const phaseLogsAfterBoss = applyRaidPhaseIfNeeded(raid);
        if (phaseLogsAfterBoss.length) {
            logs.push(...phaseLogsAfterBoss);
        }
        states[String(targetId)] = {
            ...target,
            hp: Math.max(0, bossTurn.entityB.hp),
            mp: Math.max(0, bossTurn.entityB.mp),
            stamina: Math.max(0, bossTurn.entityB.stamina),
            vitalStamina: Math.max(0, bossTurn.entityB.vitalStamina),
            effects: bossTurn.entityB.effects || [],
            defeated: !isAlive({ hp: bossTurn.entityB.hp, vitalStamina: bossTurn.entityB.vitalStamina })
        };
        const tankLogs = evaluateTankAnchorAfterBossHit({
            raid,
            targetState: target,
            hpBefore: target.hp,
            hpAfter: bossTurn.entityB.hp
        });
        logs.push(...tankLogs);

        const aliveAfterBoss = participants.filter(id => isAlive(states[String(id)]));
        if (!aliveAfterBoss.length) {
            raid.status = 'ended';
            raid.participantStates = states;
            raid.raidLog = appendRaidLogs(raid.raidLog, logs);
            await raid.save();
            const bossHp = Math.max(0, Number(raid.bossState?.hp) || 0);
            const bossMaxHp = Math.max(1, Number(raid.bossState?.maxHp) || bossHp || 1);
            const contribution = buildRaidContributionLines(states, participants);
            await upsertRaidPanelMessage(
                interaction.client,
                raid,
                `Raid failed: all raiders are down.\nBoss HP: ${bossHp}/${bossMaxHp}\n\nFinal Contribution:\n${contribution.join('\n') || '- none'}`
            );
            clearTimers(raid.id);
            return;
        }
        nextMeta = { round: (meta.round || 1) + 1, turnIndex: 0, turnOrder: aliveAfterBoss };
        rotateRoundRoleState(raid, nextMeta.round);
    }

    setMeta(states, nextMeta);
    raid.participantStates = states;
    raid.raidLog = appendRaidLogs(raid.raidLog, logs);
    await raid.save();

    const nextId = nextMeta.turnOrder[nextMeta.turnIndex];
    const nextUserId = states[String(nextId)]?.userId;
    const nextName = nextUserId ? `<@${nextUserId}>` : (states[String(nextId)]?.name || 'Unknown');
    await upsertRaidPanelMessage(
        interaction.client,
        raid,
        `Last action by ${profile.name}\nNext turn: **${nextName}**\n\n${formatRaidTurnLogSections(logs)}`
    );
}

async function concludeVictory(client, raid) {
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
        const questOutcome = await incrementQuestKillProgress(p.id, raid.guildId, 1, {
            monsterId: raid?.bossState?.id || raid?.bossMonsterId,
            monsterName: raid?.bossState?.name || raid?.bossName,
            monsterLevel: raid?.bossState?.level,
            monsterRarity: raid?.bossState?.rarity
        }).catch(() => null);
        await recordJournalProgress(p.id, {
            type: 'raid_victory',
            kills: 1,
            xp: xpGain,
            crystals: crystalGain,
            damageDealt: Math.max(0, Number(e.damage) || 0),
            note: `Raid clear: ${raid.bossName}`
        }).catch(() => {});
        const guildProgressOut = await recordGuildProgressByProfile(p.id, {
            raidWins: 1,
            kills: 1,
            xpGained: xpGain
        }).catch(() => null);
        const guildMissionReadyParts = [];
        if (guildProgressOut?.dailyNewReady) guildMissionReadyParts.push('daily');
        if (guildProgressOut?.weeklyNewReady) guildMissionReadyParts.push('weekly');
        lines.push(
            `- ${p.name}: +${xpGain} XP` +
            (xpBoost.bonusXp > 0 ? ` (Boost +${xpBoost.bonusXp})` : '') +
            `, +${formatCrystalLabel(crystalGain)} (${Math.round(ratio * 100)}% dmg)` +
            `${formatQuestOutcomeInline(questOutcome)}` +
            (guildMissionReadyParts.length ? `, Guild mission ready: ${guildMissionReadyParts.join(', ')}` : '')
        );
    }

    const hostProfile = await Profiles.findOne({ where: { userId: raid.createdBy } });
    let hostTitleLines = [];
    if (hostProfile) {
        const participantIds = raid.participants || [];
        const teammateIds = participantIds.filter((id) => id !== hostProfile.id);
        const teammatesAlive = teammateIds.filter((id) => isAlive(states[String(id)])).length;
        const hostAlive = isAlive(states[String(hostProfile.id)]);
        const unlocked = await processTitleAchievementsByProfileId(hostProfile.id, {
            raidHostWinWithTeam: participantIds.length >= 2,
            raidHostWinNoDeaths: participantIds.length >= 2 && (participantIds.filter((id) => !isAlive(states[String(id)])).length === 0),
            raidHostWinAlliesDead: participantIds.length >= 2 && hostAlive && teammateIds.length > 0 && teammatesAlive === 0
        });
        if (unlocked.length) {
            hostTitleLines = [`Host unlocked title(s): ${unlocked.map((name) => `**${name}**`).join(', ')}`];
        }
    }

    raid.status = 'ended';
    raid.raidLog = appendRaidLogs(raid.raidLog, [`Raid cleared: ${raid.bossName}`]);
    await raid.save();
    const contributionLines = buildRaidContributionLines(states, ids);
    await upsertRaidPanelMessage(
        client,
        raid,
        `Raid cleared: ${raid.bossName}\n\nRewards:\n${lines.join('\n') || 'No rewards.'}` +
        `\n\nFinal Contribution:\n${contributionLines.join('\n') || '- none'}` +
        (hostTitleLines.length ? `\n\n${hostTitleLines.join('\n')}` : '')
    );
    clearTimers(raid.id);
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

function buildRaidBossState(monster, tier, raidLevel = 1) {
    const safeTier = Math.max(1, Math.min(10, Number(tier) || 1));
    const safeLevel = Math.max(1, Math.min(3, Number(raidLevel) || 1));
    const tierScale = 1 + ((safeTier - 1) * 0.28);
    const lineScale = 1 + ((safeLevel - 1) * 0.35);
    const hpMul = 5.2 * tierScale * lineScale;
    const statMul = 2.4 * tierScale * lineScale;
    const speedMul = 1 + ((safeTier - 1) * 0.05) + ((safeLevel - 1) * 0.06);
    const maxHp = Math.floor(monster.hp * hpMul);
    const maxMp = Math.floor(monster.mp * (2.8 * tierScale));
    const maxStamina = Math.floor(monster.stamina * (3.2 * tierScale));
    const maxVital = Math.floor(monster.vitalStamina * (3.2 * tierScale));
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

async function findRaidMonsterByPreset(preset) {
    const terms = Array.isArray(preset?.names) ? preset.names : [];
    for (const term of terms) {
        const monster = await Monsters.findOne({
            where: { name: { [Op.iLike]: `%${term}%` } },
            order: [['level', 'ASC']]
        });
        if (monster) return monster;
    }
    return null;
}

async function consumeRaidKey(profileId) {
    const key = normalizeItemKey(RAID_KEY_ITEM_NAME);

    return sequelize.transaction(async (transaction) => {
        const item = await InventoryItems.findOne({
            where: { profileId, itemKey: key },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        const qty = Math.max(0, Number(item?.quantity) || 0);
        if (qty < 1) return false;

        if (qty === 1) {
            await item.destroy({ transaction });
        } else {
            item.quantity = qty - 1;
            await item.save({ transaction });
        }

        return true;
    });
}

async function buildRaidPayload(raid, note = null) {
    const participants = raid.participants || [];
    const states = raid.participantStates || {};
    const setup = states[SETUP_KEY] || {};
    const alive = participants.filter(id => isAlive(states[String(id)])).length;
    const meta = getMeta(states);
    const turnId = meta.turnOrder?.[meta.turnIndex || 0];
    const turnUserId = turnId ? states[String(turnId)]?.userId : null;
    const turnDisplay = turnUserId ? `<@${turnUserId}>` : (turnId ? (states[String(turnId)]?.name || 'Unknown') : null);
    const countdown = raid.status === 'lobby' && raid.endsAt ? Math.max(0, Math.ceil((raid.endsAt - Date.now()) / 1000)) : null;
    const boss = raid.bossState || {};
    const phase = Math.max(1, Number(raid.phase) || 1);
    const raidLogLines = Array.isArray(raid.raidLog) ? raid.raidLog.slice(-8) : [];
    const roleBuffText = buildRoleBuffSummary(raid.bossMechanicState);
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
        .setTitle('Raid Board')
        .setDescription(
            `Status: **${raid.status.toUpperCase()}**\n` +
            `Raid Line: **${setup.raidLabel || 'Unknown'}**\n` +
            `Raid Tier: **${raid.raidTier}/10**\n` +
            `Phase: **${phase}/3**\n` +
            `Boss: **${raid.bossName}**\n` +
            `--------------------\n` +
            `Boss HP: **${raid.bossState.hp}/${raid.bossState.maxHp}**\n` +
            `Boss MP: **${boss.mp ?? 0}/${boss.maxMp ?? boss.mp ?? 0}**\n` +
            `Boss Stamina: **${boss.stamina ?? 0}/${boss.maxStamina ?? boss.stamina ?? 0}**\n` +
            `Boss Vital: **${boss.vitalStamina ?? 0}/${boss.maxVitalStamina ?? boss.vitalStamina ?? 0}**\n` +
            `--------------------\n` +
            `Participants HP:\n${participantHpLines}\n` +
            `--------------------\n` +
            `Participants: **${participants.length}** (alive: ${alive})\n` +
            `Base Rewards: **${raid.rewardXpBase} XP**, **${formatCrystalLabel(raid.rewardCrystalsBase)}**` +
            (roleBuffText ? `\nRole buffs: ${roleBuffText}` : '') +
            (raid.status === 'active' ? `\nRound: **${meta.round || 1}**` : '') +
            (turnDisplay ? `\nCurrent Turn: **${turnDisplay}**` : '') +
            (countdown !== null ? `\nLobby countdown: **${countdown}s**` : '') +
            (raidLogLines.length ? `\n\nRecent Raid Log:\n${formatRaidTurnLogSections(raidLogLines)}` : '') +
            (note ? `\n\n${note}` : '')
        );

    if (image) {
        embed.setThumbnail(`attachment://${image.name}`);
    }

    const components = await buildRaidComponents(raid, states);
    return {
        embeds: [embed],
        files: image ? [image] : [],
        components
    };
}

async function buildRaidComponents(raid, states) {
    if (raid.status === 'lobby') {
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`raid_lobby_join_${raid.id}`)
                    .setLabel('Join')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`raid_lobby_leave_${raid.id}`)
                    .setLabel('Leave')
                    .setStyle(ButtonStyle.Secondary)
            )
        ];
    }

    if (raid.status !== 'active') return [];

    const participants = raid.participants || [];
    normalizeMeta(states, participants);
    const meta = getMeta(states);
    const order = (meta.turnOrder || []).filter(id => isAlive(states[String(id)]));
    if (!order.length) return [];
    const turnIndex = Math.min(Math.max(0, meta.turnIndex || 0), order.length - 1);
    const currentProfileId = order[turnIndex];

    const profile = await Profiles.findByPk(currentProfileId);
    if (!profile) return [];

    const userSkills = await UserSkills.findAll({
        where: { profileId: profile.id, equippedSlot: { [Op.not]: null } },
        include: [{ model: Skills, as: 'Skill', where: { effect_type_main: { [Op.in]: ALLOWED_COMBAT_TYPES } } }],
        order: [['equippedSlot', 'ASC']]
    });
    if (!userSkills.length) return [];

    const playerStats = await calculatePlayerStats(profile);
    if (!playerStats) return [];

    const select = new StringSelectMenuBuilder()
        .setCustomId(`raid_attack_select_${raid.id}_${profile.id}`)
        .setPlaceholder(`Turn: ${profile.name}`)
        .addOptions(userSkills.slice(0, 25).map(us => ({
            label: us.Skill.name,
            value: String(us.Skill.id),
            description: buildRaidSkillOptionDescription(playerStats, raid.bossState || {}, us.Skill, us.level)
        })));

    return [new ActionRowBuilder().addComponents(select)];
}

async function getChannelRaid(guildId, channelId) {
    return RaidInstances.findOne({
        where: { guildId, channelId, status: { [Op.in]: ['lobby', 'active'] } },
        order: [['id', 'DESC']]
    });
}

async function settleExpiredLobbyIfNeeded(client, raid) {
    if (!raid || raid.status !== 'lobby') return raid;
    if (!raid.endsAt || raid.endsAt > Date.now()) return raid;

    const latest = await RaidInstances.findByPk(raid.id);
    if (!latest || latest.status !== 'lobby') return latest || raid;
    if (!latest.endsAt || latest.endsAt > Date.now()) return latest;

    const participants = latest.participants || [];
    if (!participants.length) {
        latest.status = 'cancelled';
        await latest.save();
        await upsertRaidPanelMessage(client, latest, 'Raid canceled: nobody joined in time.');
        clearTimers(latest.id);
        return latest;
    }

    await activateRaid(client, latest, 'Lobby timer ended. Raid started.');
    return latest;
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
            if (!participants.length) {
                raid.status = 'cancelled';
                await raid.save();
                await upsertRaidPanelMessage(client, raid, 'Raid canceled: nobody joined in time.');
                clearTimers(raidId);
                return;
            }
            await activateRaid(client, raid, 'Lobby timer ended. Raid started.');
        } catch (e) {
            console.error('raid lobby timeout error:', e);
        }
    }, Math.max(1000, seconds * 1000));
    lobbyTimers.set(raidId, timer);
}

async function activateRaid(client, raid, reasonText) {
    raid.status = 'active';
    raid.endsAt = Date.now() + (ACTIVE_SECONDS * 1000);
    raid.phase = 1;
    raid.bossMechanicState = {
        currentRoundDamageBonusPct: 0,
        nextRoundDamageBonusPct: 0,
        pendingBossMitigationPct: 0
    };
    const states = cloneStates(raid.participantStates);
    setMeta(states, { round: 1, turnIndex: 0, turnOrder: raid.participants || [] });
    normalizeMeta(states, raid.participants || []);
    ensureRaidMechanicState(raid, states);
    raid.participantStates = states;
    raid.raidLog = appendRaidLogs(raid.raidLog, ['Raid has started.']);
    await raid.save();
    await upsertRaidPanelMessage(client, raid, reasonText);
    scheduleActiveTimeout(client, raid.id, ACTIVE_SECONDS);
}

function scheduleActiveTimeout(client, raidId, seconds) {
    const timer = setTimeout(async () => {
        try {
            const raid = await RaidInstances.findByPk(raidId);
            if (!raid || raid.status !== 'active') return;
            raid.status = 'ended';
            await raid.save();
            const states = raid.participantStates || {};
            const participants = raid.participants || [];
            const bossHp = Math.max(0, Number(raid.bossState?.hp) || 0);
            const bossMaxHp = Math.max(1, Number(raid.bossState?.maxHp) || bossHp || 1);
            const contribution = buildRaidContributionLines(states, participants);
            await upsertRaidPanelMessage(
                client,
                raid,
                `Raid failed: time is up. ${raid.bossName} disappeared.\nBoss HP: ${bossHp}/${bossMaxHp}\n\nFinal Contribution:\n${contribution.join('\n') || '- none'}`
            );
            clearTimers(raidId);
        } catch (e) {
            console.error('raid active timeout error:', e);
        }
    }, Math.max(1000, seconds * 1000));
    activeTimers.set(raidId, timer);
}

function estimateRaidSkillDamage(playerStats, bossState, skill, skillLevel) {
    const effectivePower = calculateEffectiveSkillPower(skill?.power || 0, skillLevel || 1);
    let attackStat = 0;
    let defenseStat = 0;
    const abyssAttack = isAbyssAttack(skill);

    if (skill?.effect_type_main === 'Physical') {
        attackStat = Math.max(0, Number(playerStats?.offense) || 0);
        defenseStat = abyssAttack ? 0 : Math.max(0, Number(bossState?.defense) || 0);
    } else if (skill?.effect_type_main === 'Magic') {
        attackStat = Math.max(0, Number(playerStats?.magic) || 0);
        defenseStat = abyssAttack ? 0 : Math.max(0, Number(bossState?.resistance) || 0);
    } else {
        return 1;
    }

    const multiplier = 1 + (effectivePower * 0.1);
    const raw = attackStat * multiplier;
    const reduced = raw * (100 / (100 + defenseStat));
    return Math.max(1, Math.floor(reduced));
}

function getExpectedRaidPhase(bossState) {
    const hp = Math.max(0, Number(bossState?.hp) || 0);
    const maxHp = Math.max(1, Number(bossState?.maxHp) || hp || 1);
    const ratio = hp / maxHp;
    if (ratio <= RAID_PHASE_3_THRESHOLD) return 3;
    if (ratio <= RAID_PHASE_2_THRESHOLD) return 2;
    return 1;
}

function applyRaidPhaseIfNeeded(raid) {
    const logs = [];
    if (!raid?.bossState) return logs;
    const expected = getExpectedRaidPhase(raid.bossState);
    let current = Math.max(1, Number(raid.phase) || 1);
    if (expected <= current) return logs;

    if (!raid.bossMechanicState || typeof raid.bossMechanicState !== 'object') {
        raid.bossMechanicState = {};
    }
    if (!raid.bossState.rulerPassives || typeof raid.bossState.rulerPassives !== 'object') {
        raid.bossState.rulerPassives = {};
    }

    for (let phase = current + 1; phase <= expected; phase++) {
        if (phase === 2) {
            raid.bossState.offense = Math.max(1, Math.floor((Number(raid.bossState.offense) || 1) * 1.12));
            raid.bossState.magic = Math.max(1, Math.floor((Number(raid.bossState.magic) || 1) * 1.12));
            raid.bossState.speed = Math.max(1, Math.floor((Number(raid.bossState.speed) || 1) * 1.08));
            raid.bossState.rulerPassives.baseDamageReductionPct = 8;
            logs.push('Boss entered Phase 2: attack power surged and skin hardened.');
        } else if (phase === 3) {
            raid.bossState.offense = Math.max(1, Math.floor((Number(raid.bossState.offense) || 1) * 1.15));
            raid.bossState.magic = Math.max(1, Math.floor((Number(raid.bossState.magic) || 1) * 1.15));
            raid.bossState.speed = Math.max(1, Math.floor((Number(raid.bossState.speed) || 1) * 1.10));
            raid.bossState.rulerPassives.baseDamageReductionPct = 15;
            logs.push('Boss entered Phase 3: berserk state activated.');
        }
    }

    current = expected;
    raid.phase = current;
    raid.bossMechanicState.lastPhaseShiftAt = Date.now();
    return logs;
}

function getRaidSetup(states) {
    return (states && typeof states === 'object' && states[SETUP_KEY] && typeof states[SETUP_KEY] === 'object')
        ? states[SETUP_KEY]
        : {};
}

function getBossPatternSequence(raidLevel, phase) {
    const safeLevel = Math.max(1, Math.min(3, Number(raidLevel) || 1));
    const safePhase = Math.max(1, Math.min(3, Number(phase) || 1));
    return RAID_BOSS_PATTERNS[safeLevel]?.[safePhase] || ['pressure', 'physical', 'magic', 'debuff'];
}

function nextBossPatternAction(raid, raidLevel) {
    if (!raid.bossMechanicState || typeof raid.bossMechanicState !== 'object') {
        raid.bossMechanicState = {};
    }

    const phase = Math.max(1, Math.min(3, Number(raid.phase) || 1));
    const sequence = getBossPatternSequence(raidLevel, phase);
    const phaseKey = String(phase);
    const cursorByPhase = (raid.bossMechanicState.patternCursorByPhase && typeof raid.bossMechanicState.patternCursorByPhase === 'object')
        ? { ...raid.bossMechanicState.patternCursorByPhase }
        : {};
    const cursor = Math.max(0, Number(cursorByPhase[phaseKey]) || 0);
    const action = sequence[cursor % sequence.length] || 'pressure';
    cursorByPhase[phaseKey] = cursor + 1;

    raid.bossMechanicState.patternCursorByPhase = cursorByPhase;
    raid.bossMechanicState.lastPatternAction = action;
    return action;
}

function getSkillPowerScore(skill) {
    return Math.max(0, Number(skill?.power) || 0);
}

function pickStrongestSkill(skillPool) {
    if (!Array.isArray(skillPool) || !skillPool.length) return null;
    return [...skillPool].sort((a, b) => getSkillPowerScore(b) - getSkillPowerScore(a))[0] || null;
}

function pickSkillByMain(skillPool, effectMain) {
    const filtered = (skillPool || []).filter((s) => String(s?.effect_type_main || '') === String(effectMain || ''));
    return pickStrongestSkill(filtered);
}

function pickDebuffSkill(skillPool) {
    const filtered = (skillPool || []).filter((s) => String(s?.effect_type_main || '') === 'Debuff');
    return pickStrongestSkill(filtered);
}

function withBossActionScaling(skill, action, phase) {
    if (!skill) return null;
    const safePhase = Math.max(1, Math.min(3, Number(phase) || 1));
    let mul = 1;

    if (action === 'burst') {
        mul = safePhase >= 3 ? 1.25 : 1.15;
    } else if (action === 'finisher') {
        mul = safePhase >= 3 ? 1.35 : 1.2;
    } else if (action === 'pressure' && safePhase >= 2) {
        mul = 1.08;
    }

    if (mul <= 1) return skill;
    return {
        ...skill,
        power: Math.max(1, Math.round((Number(skill.power) || 1) * mul * 10) / 10)
    };
}

function pickBossPatternSkill({ raid, raidLevel, skillPool }) {
    const action = nextBossPatternAction(raid, raidLevel);
    const phase = Math.max(1, Math.min(3, Number(raid.phase) || 1));

    let picked = null;
    if (action === 'physical') {
        picked = pickSkillByMain(skillPool, 'Physical');
    } else if (action === 'magic') {
        picked = pickSkillByMain(skillPool, 'Magic');
    } else if (action === 'debuff') {
        picked = pickDebuffSkill(skillPool);
    } else if (action === 'pressure' || action === 'burst' || action === 'finisher') {
        picked = pickStrongestSkill(skillPool);
    }

    if (!picked) {
        picked = pickStrongestSkill(skillPool);
    }
    if (!picked) {
        picked = { name: 'Raid Smash', effect_type_main: 'Physical', power: 2, mp_cost: 0, sp_cost: 0 };
    }

    return {
        skill: withBossActionScaling(picked, action, phase),
        action,
        actionLabel: action.charAt(0).toUpperCase() + action.slice(1)
    };
}

function appendRaidLogs(currentLog, extraLines) {
    const existing = Array.isArray(currentLog) ? currentLog.map((x) => String(x || '').trim()).filter(Boolean) : [];
    const added = Array.isArray(extraLines) ? extraLines.map((x) => String(x || '').trim()).filter(Boolean) : [];
    return [...existing, ...added].slice(-30);
}

function formatRaidTurnLogSections(logLines = []) {
    const lines = Array.isArray(logLines) ? logLines.filter(Boolean).map((v) => String(v)) : [];
    if (!lines.length) return 'No actions this turn.';

    const playerActions = [];
    const enemyActions = [];
    const effects = [];

    for (const line of lines) {
        if (line.startsWith('Used ') || line.startsWith('You ')) {
            playerActions.push(line);
            continue;
        }
        if (line.startsWith('Enemy used ')) {
            enemyActions.push(line);
            continue;
        }
        effects.push(line);
    }

    const sections = [];
    if (playerActions.length) {
        sections.push('Player Actions:');
        sections.push(playerActions.map((line) => `- ${line}`).join('\n'));
    }
    if (enemyActions.length) {
        sections.push('Enemy Actions:');
        sections.push(enemyActions.map((line) => `- ${line}`).join('\n'));
    }
    if (effects.length) {
        sections.push('Effects:');
        sections.push(effects.map((line) => `- ${line}`).join('\n'));
    }
    return sections.join('\n\n');
}

function buildRaidContributionLines(states = {}, participantIds = []) {
    return (participantIds || [])
        .map((id) => {
            const state = states[String(id)] || {};
            return {
                id,
                name: state.name || `ID ${id}`,
                damage: Math.max(0, Number(state.totalDamage) || 0),
                alive: isAlive(state)
            };
        })
        .sort((a, b) => b.damage - a.damage)
        .map((entry) => `- ${entry.name}: ${entry.damage} dmg (${entry.alive ? 'Alive' : 'Down'})`);
}

function formatQuestOutcomeInline(questOutcome) {
    const crystals = Math.max(0, Number(questOutcome?.rewardCrystals) || 0);
    const xp = Math.max(0, Number(questOutcome?.rewardXp) || 0);
    const daily = Math.max(0, Number(questOutcome?.dailyCompleted) || 0);
    const weekly = Math.max(0, Number(questOutcome?.weeklyCompleted) || 0);
    const totalCompleted = daily + weekly;
    if (crystals <= 0 && xp <= 0 && totalCompleted <= 0) return '';

    const parts = [];
    if (crystals > 0) parts.push(`+${crystals} crystals`);
    if (xp > 0) parts.push(`+${xp} XP`);
    if (totalCompleted > 0) parts.push(`${totalCompleted} quest(s)`);
    return ` | Quest: ${parts.join(', ')}`;
}

function logsPush(logArray, lines) {
    if (!Array.isArray(logArray) || !Array.isArray(lines) || !lines.length) return;
    for (const line of lines) {
        const text = String(line || '').trim();
        if (!text) continue;
        logArray.push(text);
    }
}

async function safeDeferUpdate(interaction) {
    try {
        await interaction.deferUpdate();
    } catch (error) {
        if (error?.code === 40060 || error?.code === 10062) return;
        throw error;
    }
}

function ensureRaidMechanicState(raid, states = null) {
    if (!raid.bossMechanicState || typeof raid.bossMechanicState !== 'object') {
        raid.bossMechanicState = {};
    }
    const metaRound = states ? Math.max(1, Number(getMeta(states)?.round) || 1) : 1;
    if (!raid.bossMechanicState.roundRoleState || typeof raid.bossMechanicState.roundRoleState !== 'object') {
        raid.bossMechanicState.roundRoleState = {
            round: metaRound,
            supportActions: 0,
            dpsBursts: 0
        };
    }
    if (!Number.isFinite(Number(raid.bossMechanicState.currentRoundDamageBonusPct))) {
        raid.bossMechanicState.currentRoundDamageBonusPct = 0;
    }
    if (!Number.isFinite(Number(raid.bossMechanicState.nextRoundDamageBonusPct))) {
        raid.bossMechanicState.nextRoundDamageBonusPct = 0;
    }
    if (!Number.isFinite(Number(raid.bossMechanicState.pendingBossMitigationPct))) {
        raid.bossMechanicState.pendingBossMitigationPct = 0;
    }
}

function applyRaidWideDamageBonus(stats, bonusPct) {
    const pct = Math.max(0, Math.min(60, Number(bonusPct) || 0));
    if (pct <= 0) return stats;
    const mul = 1 + (pct / 100);
    return {
        ...stats,
        offense: Math.max(1, Math.floor((Number(stats?.offense) || 1) * mul)),
        magic: Math.max(1, Math.floor((Number(stats?.magic) || 1) * mul))
    };
}

function registerPlayerRoleAction(raid, { skill, damageDone, bossMaxHp }) {
    ensureRaidMechanicState(raid);
    const role = raid.bossMechanicState.roundRoleState;
    const main = String(skill?.effect_type_main || '').trim();

    if (main === 'Debuff') {
        role.supportActions = Math.max(0, Number(role.supportActions) || 0) + 1;
    }

    const dmg = Math.max(0, Number(damageDone) || 0);
    const threshold = Math.max(
        Number(RAID_ROLE_BALANCE.dps.burstMinDamage) || 0,
        Math.floor(Math.max(1, Number(bossMaxHp) || 1) * ((Number(RAID_ROLE_BALANCE.dps.burstThresholdBossMaxHpPct) || 0) / 100))
    );
    if (dmg >= threshold) {
        role.dpsBursts = Math.max(0, Number(role.dpsBursts) || 0) + 1;
    }
}

function applyRoundSupportBonuses({ raid, participants, states }) {
    ensureRaidMechanicState(raid, states);
    const logs = [];
    const role = raid.bossMechanicState.roundRoleState;
    const supportActions = Math.max(0, Number(role.supportActions) || 0);
    const dpsBursts = Math.max(0, Number(role.dpsBursts) || 0);

    if (supportActions >= Math.max(1, Number(RAID_ROLE_BALANCE.support.minActionsForTeamRegen) || 1)) {
        let healedCount = 0;
        for (const id of participants || []) {
            const ps = states[String(id)];
            if (!isAlive(ps)) continue;
            const maxHp = Math.max(1, Number(ps.maxHp) || Number(ps.hp) || 1);
            const maxMp = Math.max(1, Number(ps.maxMp) || Number(ps.mp) || 1);
            const hpGain = Math.max(1, Math.floor(maxHp * ((Number(RAID_ROLE_BALANCE.support.hpRegenPct) || 0) / 100)));
            const mpGain = Math.max(1, Math.floor(maxMp * ((Number(RAID_ROLE_BALANCE.support.mpRegenPct) || 0) / 100)));
            ps.hp = Math.min(maxHp, Math.max(0, Number(ps.hp) || 0) + hpGain);
            ps.mp = Math.min(maxMp, Math.max(0, Number(ps.mp) || 0) + mpGain);
            healedCount++;
        }
        if (healedCount > 0) {
            logs.push(`Support synergy activated: team recovered before boss action.`);
        }
    }

    if (dpsBursts >= Math.max(1, Number(RAID_ROLE_BALANCE.dps.burstsForNextRoundBonus) || 1)) {
        raid.bossMechanicState.nextRoundDamageBonusPct = Math.max(0, Number(RAID_ROLE_BALANCE.dps.nextRoundDamageBonusPct) || 0);
        logs.push(`DPS synergy prepared: +${raid.bossMechanicState.nextRoundDamageBonusPct}% raid damage next round.`);
    }

    return logs;
}

function applyPendingTankMitigation(raid, skill) {
    ensureRaidMechanicState(raid);
    const pct = Math.max(
        0,
        Math.min(
            Math.max(1, Number(RAID_ROLE_BALANCE.tank.mitigationCapPct) || 40),
            Number(raid.bossMechanicState.pendingBossMitigationPct) || 0
        )
    );
    if (pct <= 0) return skill;
    raid.bossMechanicState.pendingBossMitigationPct = 0;
    return {
        ...skill,
        power: Math.max(1, Math.round((Number(skill?.power) || 1) * (1 - (pct / 100)) * 10) / 10)
    };
}

function evaluateTankAnchorAfterBossHit({ raid, targetState, hpBefore, hpAfter }) {
    const logs = [];
    ensureRaidMechanicState(raid);
    const before = Math.max(0, Number(hpBefore) || 0);
    const after = Math.max(0, Number(hpAfter) || 0);
    const taken = Math.max(0, before - after);
    if (taken <= 0) return logs;

    const maxHp = Math.max(1, Number(targetState?.maxHp) || before || 1);
    const threshold = Math.max(
        Number(RAID_ROLE_BALANCE.tank.anchorMinDamage) || 0,
        Math.floor(maxHp * ((Number(RAID_ROLE_BALANCE.tank.anchorThresholdPlayerMaxHpPct) || 0) / 100))
    );
    const alive = after > 0;

    if (alive && taken >= threshold) {
        raid.bossMechanicState.pendingBossMitigationPct = Math.max(0, Number(RAID_ROLE_BALANCE.tank.nextBossMitigationPct) || 0);
        logs.push(`Tank anchor established: next boss action power reduced by ${raid.bossMechanicState.pendingBossMitigationPct}%.`);
    }

    return logs;
}

function rotateRoundRoleState(raid, newRound) {
    ensureRaidMechanicState(raid);
    raid.bossMechanicState.currentRoundDamageBonusPct = Math.max(
        0,
        Number(raid.bossMechanicState.nextRoundDamageBonusPct) || 0
    );
    raid.bossMechanicState.nextRoundDamageBonusPct = 0;
    raid.bossMechanicState.roundRoleState = {
        round: Math.max(1, Number(newRound) || 1),
        supportActions: 0,
        dpsBursts: 0
    };
}

function buildRoleBuffSummary(mechanicState) {
    const ms = mechanicState && typeof mechanicState === 'object' ? mechanicState : {};
    const parts = [];
    const dmg = Math.max(0, Number(ms.currentRoundDamageBonusPct) || 0);
    const nextDmg = Math.max(0, Number(ms.nextRoundDamageBonusPct) || 0);
    const tank = Math.max(0, Number(ms.pendingBossMitigationPct) || 0);

    if (dmg > 0) parts.push(`DPS +${dmg}%`);
    if (nextDmg > 0) parts.push(`Next DPS +${nextDmg}%`);
    if (tank > 0) parts.push(`Tank Guard ${tank}%`);
    return parts.join(' | ');
}

async function upsertRaidPanelMessage(client, raid, note = null) {
    const channel = await client.channels.fetch(raid.channelId).catch(() => null);
    if (!channel) return;

    const payload = await buildRaidPayload(raid, note);
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



