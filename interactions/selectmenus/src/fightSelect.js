const { EmbedBuilder, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');

const { calculateScaling, executeTurn } = require('../../../utils/combatEngine');
const { calculateXpForLevel } = require('../../../utils/xpUtils');
const { calculatePlayerStats } = require('../../../utils/playerStats');
const { rollLoot } = require('../../../utils/lootSystem');
const { addInventoryItem, consumeInventoryItem, getInventoryQuantity } = require('../../../utils/inventoryService');
const { applyXpBoost } = require('../../../utils/xpBoostService');
const { formatCoreItemLabel } = require('../../../utils/coreEmoji');
const { resolveImage } = require('../../../utils/resolveProfileImage');
const { resolveMonsterImage } = require('../../../utils/resolveMonsterImage');
const { processRulerProgress, countStatusTicks } = require('../../../utils/rulerTitleService');
const { getMaxLevelForRace } = require('../../../utils/evolutionConfig');
const passiveSkillAcquisitionService = require('../../../utils/passiveSkillAcquisitionService');
const { processTitleAchievements } = require('../../../utils/titleAchievementService');
const { isAbyssAttack } = require('../../../utils/abyssSkill');
const { COMBAT_BALANCE, getHealPotionRatio, getHealPotionLabel } = require('../../../utils/combatBalanceConfig');
const { incrementQuestKillProgress } = require('../../../utils/adventurerGuildQuestService');
const { buildStatusModifiersFromSkills: buildStatusModifiersFromSkillsUtil } = require('../../../utils/combatStatusModifiers');
const { grantRecoveryPassiveXpFromTurn } = require('../../../utils/recoveryPassiveXpService');
const { recordJournalProgress } = require('../../../utils/journalService');
const { recordGuildProgressByProfile } = require('../../../utils/playerGuildService');

const {
    Profiles,
    Monsters,
    FightProgress,
    UserSkills,
    UserTitles,
    Titles,
    Skills,
    SpawnInstances,
    SpawnChannels
} = require('../../../database');
const {
    calculateEffectiveSkillPower,
    grantSkillXp,
    calculatePveSkillXp
} = require('../../../utils/skillProgression');

const MONSTER_SKILLS_CACHE_TTL_MS = 60 * 1000;
const monsterSkillsCache = new Map();

async function getCachedMonsterSkills(monsterId) {
    const id = Number(monsterId);
    if (!Number.isFinite(id) || id <= 0) return [];

    const now = Date.now();
    const cached = monsterSkillsCache.get(id);
    if (cached && (now - cached.at) <= MONSTER_SKILLS_CACHE_TTL_MS) {
        return Array.isArray(cached.skills) ? cached.skills : [];
    }

    const monsterWithSkills = await Monsters.findByPk(id, {
        include: [{ model: Skills, through: { attributes: [] } }]
    });
    const skills = monsterWithSkills?.Skills || [];
    monsterSkillsCache.set(id, { at: now, skills });
    return skills;
}

async function handleFightAttack(interaction) {

    try {
        await interaction.deferUpdate();
    } catch (error) {
        if (error?.code === 10062 || error?.code === 40060 || [502, 503, 504].includes(Number(error?.status))) {
            return;
        }
        throw error;
    }

    const customIdParts = interaction.customId.split('_');
    const profileId = parseInt(customIdParts[customIdParts.length - 1], 10);
    const selectedAction = String(interaction.values[0] || '').trim();
    const isHealPotionAction = selectedAction === 'potion_heal';
    const skillId = parseInt(selectedAction, 10);

    if (isNaN(profileId) || (!isHealPotionAction && isNaN(skillId))) return;

    const [profile, progress] = await Promise.all([
        Profiles.findByPk(profileId),
        FightProgress.findOne({ where: { profileId } })
    ]);
    if (!profile) return;

    const allPlayerSkills = await UserSkills.findAll({
        where: { profileId: profile.id },
        include: [{ model: Skills, as: 'Skill', required: false }]
    });
    const playerStatusModifiers = buildStatusModifiersFromSkillsUtil(allPlayerSkills);
    let skill = null;
    let userSkill = null;
    let hasKinEaterTitle = false;
    let combatSkill = {
        name: 'Heal Potion',
        effect_type_main: 'Heal',
        effect_type_specific: 'Other',
        mp_cost: 0,
        sp_cost: 0,
        power: 0
    };

    if (!isHealPotionAction) {
        skill = await Skills.findByPk(skillId);
        if (!skill) return;
        hasKinEaterTitle = await profileHasTitle(profile.id, 'Kin Eater');

        userSkill = await UserSkills.findOne({
            where: {
                profileId: profile.id,
                skillId: skill.id,
                equippedSlot: { [Op.not]: null }
            }
        });

        if (!userSkill) {
            return interaction.followUp({
                content: 'This skill is not equipped. Use /loadout equip first.',
                flags: MessageFlags.Ephemeral
            });
        }

        combatSkill = {
            ...skill.toJSON(),
            power: calculateEffectiveSkillPower(skill.power, userSkill.level)
        };
    }

    // =====================================================
    // SPAWN MODE
    // =====================================================

    if (profile.combatState?.type === 'spawn') {

        const spawnInstance = await SpawnInstances.findByPk(
            profile.combatState.spawnInstanceId
        );

        if (!spawnInstance || !spawnInstance.monster) {
            await profile.update({ combatState: null });
            return;
        }

        const monster = spawnInstance.monster;
        const spawnChannel = await SpawnChannels.findByPk(spawnInstance.spawnChannelId);

        if (Date.now() >= profile.combatState.timeoutAt) {
            spawnInstance.occupiedBy = null;
            await spawnInstance.save();
            await profile.update({ combatState: null });

            await interaction.channel.send(
                `Time up: ${interaction.user.username} took too long. ${monster.name} is available again.`
            );

            return interaction.editReply({ components: [] });
        }

        const playerStats = await calculatePlayerStats(profile);
        const combatState = profile.combatState || {};

        const state = {
            entityA: {
                ...playerStats,
                hp: combatState.hp ?? playerStats.hp,
                maxHp: playerStats.hp,
                mp: combatState.mp ?? playerStats.mp,
                maxMp: playerStats.mp,
                stamina: combatState.stamina ?? playerStats.stamina,
                maxStamina: playerStats.stamina,
                vitalStamina: combatState.vitalStamina ?? playerStats.vitalStamina,
                maxVitalStamina: playerStats.vitalStamina,
                effects: Array.isArray(combatState.effects) ? combatState.effects : [],
                shield: Math.max(0, Number(combatState.shield) || 0)
            },
            entityB: {
                ...monster,
                maxHp: Math.max(1, Number(monster?.maxHp) || Number(monster?.hp) || 1),
                maxMp: Math.max(1, Number(monster?.maxMp) || Number(monster?.mp) || 1),
                maxStamina: Math.max(1, Number(monster?.maxStamina) || Number(monster?.stamina) || 1),
                maxVitalStamina: Math.max(1, Number(monster?.maxVitalStamina) || Number(monster?.vitalStamina) || 1),
                effects: Array.isArray(monster.effects) ? monster.effects : [],
                shield: Math.max(0, Number(monster.shield) || 0)
            }
        };

        let potionHealAmount = 0;
        if (isHealPotionAction) {
            const consumed = await consumeInventoryItem(profile.id, 'Healing Potion', 1);
            if (!consumed) {
                await interaction.followUp({
                    content: 'You do not have any **Healing Potion**.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            const maxHp = Math.max(1, Number(state.entityA.maxHp) || Number(state.entityA.hp) || 1);
            potionHealAmount = Math.max(1, Math.floor(maxHp * getHealPotionRatio()));
            state.entityA.hp = Math.min(maxHp, Math.max(0, Number(state.entityA.hp) || 0) + potionHealAmount);
        } else {
            const insufficientReason = getInsufficientResourceReason(state.entityA, combatSkill);
            if (insufficientReason) {
                await interaction.followUp({
                    content: insufficientReason,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
        }

        const monsterSkills = await getCachedMonsterSkills(monster.id);
        const monsterStatusModifiers = buildStatusModifiersFromSkillsUtil(monsterSkills);
        state.entityA.statusResistance = playerStatusModifiers.statusResistance;
        state.entityA.statusEnhancement = playerStatusModifiers.statusEnhancement;
        state.entityA.rulerPassives = playerStatusModifiers.rulerPassives;
        state.entityB.statusResistance = monsterStatusModifiers.statusResistance;
        state.entityB.statusEnhancement = monsterStatusModifiers.statusEnhancement;
        state.entityB.rulerPassives = monsterStatusModifiers.rulerPassives;
        const monsterHpBeforeTurn = Math.max(0, Number(state.entityB.hp) || 0);
        const monsterMaxHpForOneShot = Math.max(1, Number(state.entityB.maxHp) || monsterHpBeforeTurn || 1);
        const playerHpBeforeTurn = Math.max(0, Number(state.entityA.hp) || 0);
        const result = executeTurn(state, combatSkill, monsterSkills);
        if (isHealPotionAction) {
            result.log = sanitizePotionTurnLog(result.log, potionHealAmount);
        }
        const terrainType = normalizeTerrainType(
            monster?.terrainDamageType || spawnChannel?.terrainDamageType
        );
        if (terrainType && !result.victory && !result.defeat) {
            const terrain = applyTerrainDamageTick({
                state,
                terrainType,
                playerResistanceMap: playerStatusModifiers.statusResistance,
                enemyResistanceMap: monsterStatusModifiers.statusResistance
            });

            result.log = [
                ...(result.log || []),
                formatTerrainLogLine(terrainType, terrain)
            ];

            result.statusDamageTaken = result.statusDamageTaken || { player: {}, enemy: {} };
            result.statusDamageTaken.player = result.statusDamageTaken.player || {};
            result.statusDamageTaken.enemy = result.statusDamageTaken.enemy || {};
            result.statusDamageTaken.player[terrainType] =
                (result.statusDamageTaken.player[terrainType] || 0) + terrain.playerDamage;
            result.statusDamageTaken.enemy[terrainType] =
                (result.statusDamageTaken.enemy[terrainType] || 0) + terrain.enemyDamage;

            if (state.entityB.hp <= 0) result.victory = true;
            if (state.entityA.hp <= 0) result.defeat = true;
        }
        let turnSkillXpSummary = {};
        const recoveryTurnXp = await grantRecoveryPassiveXpFromTurn({
            profileId: profile.id,
            userSkills: allPlayerSkills,
            regenData: result.endTurnRegen?.player
        });
        turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, recoveryTurnXp.summary);

        if (!isHealPotionAction) {
            const gainedSkillXp = calculatePveSkillXp({
                uses: result.playerSkillUses || 0,
                damageDone: result.playerDamageDone || 0,
                monsterLevel: monster.level || 1,
                towerTier: 1,
                rarityXpMultiplier: monster.xpMultiplier || 1,
                victory: result.victory
            });
            const skillProgress = await grantSkillXp(profile.id, skill.id, gainedSkillXp);
            turnSkillXpSummary = appendSkillProgress(turnSkillXpSummary, skill, skillProgress);
            const tabooProgress = await grantTabooXpFromSkillUse(
                profile.id,
                skill,
                { monsterLevel: monster.level || 1, towerTier: 1, victory: result.victory, hasKinEaterTitle }
            );
            turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, tabooProgress.summary);
            await sendTabooRevelationsEphemeral(interaction, tabooProgress.revelations);
        }

        const resistanceResult = await passiveSkillAcquisitionService.grantResistanceXpFromStatusDamage(
            profile.id,
            result.statusDamageTaken?.player,
            { monsterLevel: monster.level || 1, towerTier: 1, victory: result.victory }
        );
        turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, resistanceResult.summary);
        const enhancementResult = await passiveSkillAcquisitionService.grantEnhancementXpFromStatusDamage(
            profile.id,
            result.statusDamageTaken?.enemy,
            { monsterLevel: monster.level || 1, towerTier: 1, victory: result.victory }
        );
        turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, enhancementResult.summary);
        await passiveSkillAcquisitionService.sendObtainedSkillsEphemeral(interaction, [
            ...passiveSkillAcquisitionService.collectUnlockedSkillsFromSummary(turnSkillXpSummary),
            ...(resistanceResult.unlockedSkills || []),
            ...(enhancementResult.unlockedSkills || [])
        ]);

        const sessionSkillXpSummary = mergeSkillXpSummaries(
            profile.combatState?.skillXpSummary,
            turnSkillXpSummary
        );
        const isBattleEnd = !!(result.victory || result.defeat);
        const statusInflictedTicks = countStatusTicks(result.statusDamageTaken?.enemy);
        const statusTicksTaken = countStatusTicks(result.statusDamageTaken?.player);
        const poisonTickDamage = Math.max(0, Number(result.statusDamageTaken?.enemy?.Poison) || 0);
        const directPoisonDamage = String(combatSkill.effect_type_specific || '').toLowerCase() === 'poison'
            ? Math.max(0, Number(result.playerDamageDone) || 0)
            : 0;
        const damageTakenThisTurn = Math.max(
            0,
            playerHpBeforeTurn - Math.max(0, Number(result.state?.entityA?.hp) || 0)
        );
        const unlockedTitles = await processTitleAchievements(profile, {
            skillName: combatSkill.name,
            skillEffectMain: combatSkill.effect_type_main,
            skillEffectSpecific: combatSkill.effect_type_specific,
            poisonDamageTaken: Math.max(0, Number(result.statusDamageTaken?.player?.Poison) || 0),
            usedHealConsumable: isHealPotionAction,
            victoryAgainstMonster: !!result.victory,
            monsterName: monster.name,
            monsterType: monster.monsterType,
            oneShotKill: !!result.victory &&
                monsterHpBeforeTurn >= Math.floor(monsterMaxHpForOneShot * 0.9) &&
                (Math.max(0, Number(result.playerDamageDone) || 0) >= monsterHpBeforeTurn)
        });
        await sendUnlockedRulersEphemeral(interaction, unlockedTitles);

        if (!isBattleEnd) {
            await processRulerProgress(profile, {
                isBattleEnd: false,
                statusInflictedTicks,
                statusTicksTaken,
                poisonDamageDealt: poisonTickDamage + directPoisonDamage,
                damageTakenThisTurn
            });
        }

        if (result.victory) {
            const channelXpMultiplier = spawnChannel?.xpMultiplier ?? 1;
            const baseXpGain = Math.floor(50 * monster.level * (monster.xpMultiplier || 1) * channelXpMultiplier);
            const xpBoost = await applyXpBoost(profile, baseXpGain);
            const xpGain = xpBoost.finalXp;
            const loot = rollLoot({
                rarity: monster.rarity,
                monsterLevel: monster.level
            });
            if (loot) {
                await addInventoryItem(profile.id, loot.item, loot.quantity || 1);
            }

            const leveled = applyProfileXpWithRaceCap(profile, xpGain);
            const newXp = leveled.xp;
            const newLevel = leveled.level;
            const skillPointsGain = leveled.skillPointsGain;

            await profile.update({
                level: newLevel,
                xp: newXp,
                skillPoints: profile.skillPoints + skillPointsGain,
                combatState: null
            });
            const unlockedRulers = await processRulerProgress(profile, {
                isBattleEnd: true,
                victory: true,
                defeat: false,
                tierBeforeUpdate: 1,
                stageBeforeUpdate: 1,
                monsterRarity: monster.rarity,
                playerHpRatioAfterBattle: Math.max(0, Number(result.state?.entityA?.hp) || 0) / Math.max(1, Number(playerStats.hp) || 1),
                levelAfterUpdate: newLevel,
                statusInflictedTicks,
                statusTicksTaken,
                poisonDamageDealt: poisonTickDamage + directPoisonDamage,
                damageTakenThisTurn
            });
            await sendUnlockedRulersEphemeral(interaction, unlockedRulers);

            await clearSpawn(spawnInstance, interaction.client, {
                despawnNotice: `⚠ ${monster.name} has been slain.`,
                removeButton: true
            });

            await interaction.channel.send(
                `${monster.name} has been slain by ${interaction.user.username}.`
            );
            const questOutcome = await incrementQuestKillProgress(profile.id, interaction.guildId, 1, {
                monsterId: monster?.id,
                monsterName: monster?.name,
                monsterLevel: monster?.level,
                monsterRarity: monster?.rarity
            }).catch(() => null);
            await sendQuestReadyNotificationEphemeral(interaction, questOutcome);
            const questRewardLine = formatQuestAutoRewardLine(questOutcome);
            await recordJournalProgress(profile.id, {
                type: 'spawn_victory',
                kills: 1,
                xp: xpGain,
                damageDealt: Math.max(0, Number(result.playerDamageDone) || 0),
                damageTaken: Math.max(0, Number(damageTakenThisTurn) || 0),
                statusInflictedTicks: Math.max(0, Number(statusInflictedTicks) || 0),
                statusTakenTicks: Math.max(0, Number(statusTicksTaken) || 0),
                lootText: loot ? `${loot.item} x${loot.quantity}` : ''
            }).catch(() => {});
            const guildProgressOut = await recordGuildProgressByProfile(profile.id, {
                kills: 1,
                xpGained: xpGain
            }).catch(() => null);
            await sendGuildMissionReadyNotificationEphemeral(interaction, guildProgressOut);
            const guildMissionLine = formatGuildMissionReadyLine(guildProgressOut);

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('Spawn Victory')
                        .setDescription(
                            `Rewards:\n` +
                            `- XP: +${xpGain}` +
                            (xpBoost.bonusXp > 0 ? ` (Boost +${xpBoost.bonusXp})` : '') +
                            `\n- Channel XP Multiplier: x${channelXpMultiplier}` +
                            (xpBoost.bonusXp > 0 ? `\n- XP Boost Remaining: ${xpBoost.remainingLabel}` : '') +
                            (loot ? `\n- Loot: ${formatCoreItemLabel(loot.item)} x${loot.quantity}` : '') +
                            (skillPointsGain > 0 ? `\n- Level Up: ${newLevel}` : '') +
                            (questRewardLine ? `\n- ${questRewardLine}` : '') +
                            (guildMissionLine ? `\n- ${guildMissionLine}` : '') +
                            `\n\n${formatSkillXpSummary(sessionSkillXpSummary)}`
                        )
                ],
                components: [],
                files: [],
                attachments: []
            });
        }

        if (result.defeat) {
            const unlockedRulers = await processRulerProgress(profile, {
                isBattleEnd: true,
                victory: false,
                defeat: true,
                tierBeforeUpdate: 1,
                stageBeforeUpdate: 1,
                monsterRarity: monster.rarity,
                playerHpRatioAfterBattle: 0,
                levelAfterUpdate: profile.level,
                statusInflictedTicks,
                statusTicksTaken,
                poisonDamageDealt: poisonTickDamage + directPoisonDamage,
                damageTakenThisTurn
            });
            await sendUnlockedRulersEphemeral(interaction, unlockedRulers);
            spawnInstance.monster = {
                ...spawnInstance.monster,
                hp: Math.max(0, state.entityB.hp),
                mp: Math.max(0, state.entityB.mp),
                stamina: Math.max(0, state.entityB.stamina),
                vitalStamina: Math.max(0, state.entityB.vitalStamina),
                effects: Array.isArray(state.entityB.effects) ? state.entityB.effects : [],
                shield: Math.max(0, Number(state.entityB.shield) || 0)
            };
            spawnInstance.occupiedBy = null;
            await spawnInstance.save();
            await profile.update({ combatState: null });

            await interaction.channel.send(
                `${monster.name} remains in the area and can still be challenged.`
            );
            await recordJournalProgress(profile.id, {
                type: 'spawn_defeat',
                damageDealt: Math.max(0, Number(result.playerDamageDone) || 0),
                damageTaken: Math.max(0, Number(damageTakenThisTurn) || 0),
                statusInflictedTicks: Math.max(0, Number(statusInflictedTicks) || 0),
                statusTakenTicks: Math.max(0, Number(statusTicksTaken) || 0),
                note: `Defeated by ${monster.name}`
            }).catch(() => {});

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Defeat')
                        .setDescription(
                            formatSkillXpSummary(sessionSkillXpSummary)
                        )
                ],
                components: [],
                files: [],
                attachments: []
            });
        }

        profile.combatState = {
            ...profile.combatState,
            timeoutAt: Date.now() + (3 * 60 * 1000),
            hp: Math.max(0, state.entityA.hp),
            mp: Math.max(0, state.entityA.mp),
            stamina: Math.max(0, state.entityA.stamina),
            vitalStamina: Math.max(0, state.entityA.vitalStamina),
            effects: Array.isArray(state.entityA.effects) ? state.entityA.effects : [],
            shield: Math.max(0, Number(state.entityA.shield) || 0),
            skillXpSummary: sessionSkillXpSummary
        };

        spawnInstance.monster = {
            ...spawnInstance.monster,
            hp: Math.max(0, state.entityB.hp),
            mp: Math.max(0, state.entityB.mp),
            stamina: Math.max(0, state.entityB.stamina),
            vitalStamina: Math.max(0, state.entityB.vitalStamina),
            effects: Array.isArray(state.entityB.effects) ? state.entityB.effects : [],
            shield: Math.max(0, Number(state.entityB.shield) || 0)
        };

        await Promise.all([
            profile.save(),
            spawnInstance.save()
        ]);

        const playerImage = resolveImage(profile);
        const monsterImage = resolveMonsterImage(monster);

        const embed = new EmbedBuilder()
            .setColor('#290003')
            .setTitle(`Fight: ${interaction.user.username} vs ${monster.name}`)
            .setDescription(
                buildFullStatsEmbed(
                    interaction.user.username,
                    state,
                    playerStats,
                    monster
                ) +
                '\n--------------------\n' +
                formatTurnLogSections(result.log)
            )
            .setFooter({ text: 'Choose your skill.' });

        if (playerImage) embed.setImage(`attachment://${playerImage.name}`);
        if (monsterImage) embed.setThumbnail(`attachment://${monsterImage.name}`);
        const components = await buildFightActionComponents({
            profileId: profile.id,
            attackerStats: playerStats,
            defenderStats: state.entityB,
            userSkills: allPlayerSkills
        });

        return interaction.editReply({
            embeds: [embed],
            components,
            files: [
                ...(playerImage ? [playerImage] : []),
                ...(monsterImage ? [monsterImage] : [])
            ]
        });
    }

    // =====================================================
    // NORMAL PVE
    // =====================================================

    if (!progress || !progress.monsterQueue) return;

    const queue = parseMonsterQueue(progress.monsterQueue);
    if (!queue) return;

    const currentEntry = queue[progress.stage - 1];
    if (!currentEntry || typeof currentEntry.monsterId !== 'number') return;

    const monster = await Monsters.findByPk(currentEntry.monsterId);
    if (!monster) return;

    const playerMax = await calculatePlayerStats(profile);
    if (!playerMax) return;

    const { stats: monsterStats } = calculateScaling(monster, progress.tier, progress.stage);
    const monsterMax = { ...monsterStats };

    const state = {
        entityA: {
            ...playerMax,
            hp: profile.remainingHp ?? playerMax.hp,
            maxHp: playerMax.hp,
            mp: profile.remainingMp ?? playerMax.mp,
            maxMp: playerMax.mp,
            stamina: profile.remainingStamina ?? playerMax.stamina,
            maxStamina: playerMax.stamina,
            vitalStamina: profile.remainingVitalStamina ?? playerMax.vitalStamina,
            maxVitalStamina: playerMax.vitalStamina,
            effects: Array.isArray(progress.playerEffects) ? progress.playerEffects : [],
            shield: 0
        },
        entityB: {
            ...monsterStats,
            hp: progress.currentMonsterHp ?? monsterStats.hp,
            maxHp: monsterStats.hp,
            maxMp: monsterStats.mp,
            maxStamina: monsterStats.stamina,
            maxVitalStamina: monsterStats.vitalStamina,
            effects: Array.isArray(progress.monsterEffects) ? progress.monsterEffects : [],
            shield: 0
        }
    };

    let potionHealAmount = 0;
    if (isHealPotionAction) {
        const consumed = await consumeInventoryItem(profile.id, 'Healing Potion', 1);
        if (!consumed) {
            await interaction.followUp({
                content: 'You do not have any **Healing Potion**.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        const maxHp = Math.max(1, Number(state.entityA.maxHp) || Number(state.entityA.hp) || 1);
        potionHealAmount = Math.max(1, Math.floor(maxHp * getHealPotionRatio()));
        state.entityA.hp = Math.min(maxHp, Math.max(0, Number(state.entityA.hp) || 0) + potionHealAmount);
    } else {
        const insufficientReason = getInsufficientResourceReason(state.entityA, combatSkill);
        if (insufficientReason) {
            await interaction.followUp({
                content: insufficientReason,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    const monsterSkills = await getCachedMonsterSkills(monster.id);
    const monsterStatusModifiers = buildStatusModifiersFromSkillsUtil(monsterSkills);
    state.entityA.statusResistance = playerStatusModifiers.statusResistance;
    state.entityA.statusEnhancement = playerStatusModifiers.statusEnhancement;
    state.entityA.rulerPassives = playerStatusModifiers.rulerPassives;
    state.entityB.statusResistance = monsterStatusModifiers.statusResistance;
    state.entityB.statusEnhancement = monsterStatusModifiers.statusEnhancement;
    state.entityB.rulerPassives = monsterStatusModifiers.rulerPassives;
    const monsterHpBeforeTurn = Math.max(0, Number(state.entityB.hp) || 0);
    const monsterMaxHpForOneShot = Math.max(1, Number(state.entityB.maxHp) || monsterHpBeforeTurn || 1);
    const playerHpBeforeTurn = Math.max(0, Number(state.entityA.hp) || 0);
    const result = executeTurn(state, combatSkill, monsterSkills);
    if (isHealPotionAction) {
        result.log = sanitizePotionTurnLog(result.log, potionHealAmount);
    }
    let turnSkillXpSummary = {};
    const recoveryTurnXp = await grantRecoveryPassiveXpFromTurn({
        profileId: profile.id,
        userSkills: allPlayerSkills,
        regenData: result.endTurnRegen?.player
    });
    turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, recoveryTurnXp.summary);

    if (!isHealPotionAction) {
        const gainedSkillXp = calculatePveSkillXp({
            uses: result.playerSkillUses || 0,
            damageDone: result.playerDamageDone || 0,
            monsterLevel: monster.level || 1,
            towerTier: progress.tier || 1,
            rarityXpMultiplier: 1,
            victory: result.victory
        });
        const skillProgress = await grantSkillXp(profile.id, skill.id, gainedSkillXp);
        turnSkillXpSummary = appendSkillProgress(turnSkillXpSummary, skill, skillProgress);
        const tabooProgress = await grantTabooXpFromSkillUse(
            profile.id,
            skill,
            { monsterLevel: monster.level || 1, towerTier: progress.tier || 1, victory: result.victory, hasKinEaterTitle }
        );
        turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, tabooProgress.summary);
        await sendTabooRevelationsEphemeral(interaction, tabooProgress.revelations);
    }

    const resistanceResult = await passiveSkillAcquisitionService.grantResistanceXpFromStatusDamage(
        profile.id,
        result.statusDamageTaken?.player,
        { monsterLevel: monster.level || 1, towerTier: progress.tier || 1, victory: result.victory }
    );
    turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, resistanceResult.summary);
    const enhancementResult = await passiveSkillAcquisitionService.grantEnhancementXpFromStatusDamage(
        profile.id,
        result.statusDamageTaken?.enemy,
        { monsterLevel: monster.level || 1, towerTier: progress.tier || 1, victory: result.victory }
    );
    turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, enhancementResult.summary);
    await passiveSkillAcquisitionService.sendObtainedSkillsEphemeral(interaction, [
        ...passiveSkillAcquisitionService.collectUnlockedSkillsFromSummary(turnSkillXpSummary),
        ...(resistanceResult.unlockedSkills || []),
        ...(enhancementResult.unlockedSkills || [])
    ]);

    const sessionSkillXpSummary = mergeSkillXpSummaries(
        progress.skillXpSummary,
        turnSkillXpSummary
    );
    const isBattleEnd = !!(result.victory || result.defeat);
    const statusInflictedTicks = countStatusTicks(result.statusDamageTaken?.enemy);
    const statusTicksTaken = countStatusTicks(result.statusDamageTaken?.player);
    const poisonTickDamage = Math.max(0, Number(result.statusDamageTaken?.enemy?.Poison) || 0);
    const directPoisonDamage = String(combatSkill.effect_type_specific || '').toLowerCase() === 'poison'
        ? Math.max(0, Number(result.playerDamageDone) || 0)
        : 0;
    const damageTakenThisTurn = Math.max(
        0,
        playerHpBeforeTurn - Math.max(0, Number(result.state?.entityA?.hp) || 0)
    );
    const unlockedTitles = await processTitleAchievements(profile, {
        skillName: combatSkill.name,
        skillEffectMain: combatSkill.effect_type_main,
        skillEffectSpecific: combatSkill.effect_type_specific,
        poisonDamageTaken: Math.max(0, Number(result.statusDamageTaken?.player?.Poison) || 0),
        usedHealConsumable: isHealPotionAction,
        victoryAgainstMonster: !!result.victory,
        monsterName: monster.name,
        monsterType: monster.monsterType,
        oneShotKill: !!result.victory &&
            monsterHpBeforeTurn >= Math.floor(monsterMaxHpForOneShot * 0.9) &&
            (Math.max(0, Number(result.playerDamageDone) || 0) >= monsterHpBeforeTurn)
    });
    await sendUnlockedRulersEphemeral(interaction, unlockedTitles);

    if (!isBattleEnd) {
        await processRulerProgress(profile, {
            isBattleEnd: false,
            statusInflictedTicks,
            statusTicksTaken,
            poisonDamageDealt: poisonTickDamage + directPoisonDamage,
            damageTakenThisTurn
        });
    }

    if (result.victory) {
        return resolveNormalCombat(interaction, profile, progress, monster, result, true, sessionSkillXpSummary, {
            statusInflictedTicks,
            statusTicksTaken,
            poisonDamageDealt: poisonTickDamage + directPoisonDamage,
            damageTakenThisTurn,
            playerMaxHp: playerMax.hp
        });
    }

    if (result.defeat) {
        return resolveNormalCombat(interaction, profile, progress, monster, result, false, sessionSkillXpSummary, {
            statusInflictedTicks,
            statusTicksTaken,
            poisonDamageDealt: poisonTickDamage + directPoisonDamage,
            damageTakenThisTurn,
            playerMaxHp: playerMax.hp
        });
    }

    return updateFightEmbed(interaction, profile, monster, monsterMax, state, result, sessionSkillXpSummary, {
        progress,
        maxPlayer: playerMax,
        userSkills: allPlayerSkills
    });
}

module.exports = { handleFightAttack };

async function clearSpawn(spawnInstance, client, options = {}) {
    const {
        despawnNotice = null,
        removeButton = true
    } = options;

    spawnInstance.occupiedBy = null;
    const spawnMessageId = spawnInstance.spawnMessageId;
    spawnInstance.spawnMessageId = null;

    await spawnInstance.save();

    if (spawnMessageId) {
        try {
            const channel = await client.channels.fetch(spawnInstance.channelId);
            const message = await channel.messages.fetch(spawnMessageId);
            await message.edit({
                ...(despawnNotice ? { content: despawnNotice } : {}),
                ...(removeButton ? { components: [] } : {})
            });
        } catch (err) {
            console.log('Spawn cleanup failed:', err.message);
        }
    }

    await spawnInstance.destroy();
}

function buildFullStatsEmbed(username, state, maxPlayer, monster, monsterMaxStats = null) {

    const monsterName = monster?.name || 'Unknown Monster';
    const monsterSuffix = monster?.rarity ? ` (${monster.rarity})` : '';

    const monsterMaxHp = Math.max(
        state.entityB.hp,
        monsterMaxStats?.hp ?? 0,
        monster?.maxHp ?? 0,
        monster?.hp ?? 0
    );
    const monsterMaxMp = Math.max(
        state.entityB.mp,
        monsterMaxStats?.mp ?? 0,
        monster?.maxMp ?? 0,
        monster?.mp ?? 0
    );
    const monsterMaxStamina = Math.max(
        state.entityB.stamina,
        monsterMaxStats?.stamina ?? 0,
        monster?.maxStamina ?? 0,
        monster?.stamina ?? 0
    );
    const monsterMaxVital = Math.max(
        state.entityB.vitalStamina,
        monsterMaxStats?.vitalStamina ?? 0,
        monster?.maxVitalStamina ?? 0,
        monster?.vitalStamina ?? 0
    );
    const playerMaxHp = Math.max(state.entityA.hp, maxPlayer.hp ?? 0);
    const playerMaxMp = Math.max(state.entityA.mp, maxPlayer.mp ?? 0);
    const playerMaxStamina = Math.max(state.entityA.stamina, maxPlayer.stamina ?? 0);
    const playerMaxVital = Math.max(state.entityA.vitalStamina, maxPlayer.vitalStamina ?? 0);
    const playerShield = Math.max(0, Number(state.entityA.shield) || 0);
    const monsterShield = Math.max(0, Number(state.entityB.shield) || 0);

    return (
        `Player: **${username}**\n` +
        `${formatResourceLine('❤️', 'HP', state.entityA.hp, playerMaxHp, playerShield > 0 ? ` | 🛡 ${playerShield}` : '')}\n` +
        `${formatResourceLine('🔵', 'MP', state.entityA.mp, playerMaxMp)}\n` +
        `${formatResourceLine('🟨', 'Stamina', state.entityA.stamina, playerMaxStamina)}\n` +
        `${formatResourceLine('🟩', 'Vital Stamina', state.entityA.vitalStamina, playerMaxVital)}\n` +
        `⚔️ Offense: ${state.entityA.offense}\n` +
        `🛡️ Defense: ${state.entityA.defense}\n` +
        `✨ Magic: ${state.entityA.magic}\n` +
        `🧿 Resistance: ${state.entityA.resistance}\n` +
        `💨 Speed: ${state.entityA.speed}\n\n` +
        `Monster: **${monsterName}${monsterSuffix}**\n` +
        `${formatResourceLine('❤️', 'HP', state.entityB.hp, monsterMaxHp, monsterShield > 0 ? ` | 🛡 ${monsterShield}` : '')}\n` +
        `${formatResourceLine('🔵', 'MP', state.entityB.mp, monsterMaxMp)}\n` +
        `${formatResourceLine('🟨', 'Stamina', state.entityB.stamina, monsterMaxStamina)}\n` +
        `${formatResourceLine('🟩', 'Vital Stamina', state.entityB.vitalStamina, monsterMaxVital)}\n` +
        `⚔️ Offense: ${state.entityB.offense}\n` +
        `🛡️ Defense: ${state.entityB.defense}\n` +
        `✨ Magic: ${state.entityB.magic}\n` +
        `🧿 Resistance: ${state.entityB.resistance}\n` +
        `💨 Speed: ${state.entityB.speed}`
    );
}

function formatResourceLine(icon, label, current, max, suffix = '') {
    const now = Math.max(0, Number(current) || 0);
    const cap = Math.max(1, Number(max) || 1);
    return `${icon} ${label}: ${now}/${cap} ${buildBar(now, cap)}${suffix}`;
}

function buildBar(current, max, width = 12) {
    const safeWidth = Math.max(6, Number(width) || 12);
    const ratio = Math.max(0, Math.min(1, (Number(current) || 0) / Math.max(1, Number(max) || 1)));
    const filled = Math.max(0, Math.min(safeWidth, Math.round(ratio * safeWidth)));
    const empty = safeWidth - filled;
    const pct = Math.round(ratio * 100);
    return `[${'#'.repeat(filled)}${'-'.repeat(empty)}] ${pct}%`;
}

async function updateFightEmbed(interaction, profile, monster, monsterMaxStats, state, result, skillXpSummary, options = {}) {

    const progress = options.progress || await FightProgress.findOne({ where: { profileId: profile.id } });
    if (!progress) return;

    const maxPlayer = options.maxPlayer || await calculatePlayerStats(profile);
    if (!maxPlayer) return;

    await Promise.all([
        profile.update({
            remainingHp: Math.max(0, state.entityA.hp),
            remainingMp: Math.max(0, state.entityA.mp),
            remainingStamina: Math.max(0, state.entityA.stamina),
            remainingVitalStamina: Math.max(0, state.entityA.vitalStamina)
        }),
        progress.update({
            currentMonsterHp: Math.max(0, state.entityB.hp),
            skillXpSummary: skillXpSummary || null,
            playerEffects: Array.isArray(state.entityA.effects) ? state.entityA.effects : [],
            monsterEffects: Array.isArray(state.entityB.effects) ? state.entityB.effects : [],
            isInCombat: true,
            lastFightAt: new Date()
        })
    ]);

    const playerImage = resolveImage(profile);
    const monsterImage = resolveMonsterImage(monster);

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`Fight: ${interaction.user.username} vs ${monster?.name || 'Unknown Monster'}`)
        .setDescription(
            buildFullStatsEmbed(
                interaction.user.username,
                state,
                maxPlayer,
                monster,
                monsterMaxStats
            ) +
            '\n--------------------\n' +
            formatTurnLogSections(result.log)
        )
        .setFooter({ text: 'Choose your skill.' });

    if (playerImage) embed.setImage(`attachment://${playerImage.name}`);
    if (monsterImage) embed.setThumbnail(`attachment://${monsterImage.name}`);
    const components = await buildFightActionComponents({
        profileId: profile.id,
        attackerStats: maxPlayer,
        defenderStats: state.entityB,
        userSkills: options.userSkills
    });

    return interaction.editReply({
        embeds: [embed],
        components,
        files: [
            ...(playerImage ? [playerImage] : []),
            ...(monsterImage ? [monsterImage] : [])
        ]
    });
}

async function resolveNormalCombat(interaction, profile, progress, monster, result, victory, skillXpSummary, rulerTurnContext = {}) {

    const playerState = result.state.entityA;

    if (victory) {
        const baseXpGain = calculateTowerXpGain(monster, progress);
        const xpBoost = await applyXpBoost(profile, baseXpGain);
        const xpGain = xpBoost.finalXp;
        const loot = rollLoot({
            rarity: monster.rarity,
            monsterLevel: monster.level
        });
        if (loot) {
            await addInventoryItem(profile.id, loot.item, loot.quantity || 1);
        }
        const nextStage = progress.stage + 1;
        const nextTier = progress.tier + 1;
        const progressionText = nextStage > 10
            ? `\nNext Tier: ${nextTier} - Stage 1`
            : `\nNext stage: ${nextStage}/10`;

        const leveled = applyProfileXpWithRaceCap(profile, xpGain);
        const newXp = leveled.xp;
        const newLevel = leveled.level;
        const skillPointsGain = leveled.skillPointsGain;
        await Promise.all([
            profile.update({
                level: newLevel,
                xp: newXp,
                skillPoints: profile.skillPoints + skillPointsGain,
                remainingHp: Math.max(0, playerState.hp),
                remainingMp: Math.max(0, playerState.mp),
                remainingStamina: Math.max(0, playerState.stamina),
                remainingVitalStamina: Math.max(0, playerState.vitalStamina)
            }),
            progress.update({
                stage: nextStage,
                wins: progress.wins + 1,
                currentMonsterHp: null,
                skillXpSummary: null,
                playerEffects: null,
                monsterEffects: null,
                isInCombat: false,
                lastFightAt: new Date()
            })
        ]);
        const questOutcome = await incrementQuestKillProgress(profile.id, interaction.guildId, 1, {
            monsterId: monster?.id,
            monsterName: monster?.name,
            monsterLevel: monster?.level,
            monsterRarity: monster?.rarity
        }).catch(() => null);
        await sendQuestReadyNotificationEphemeral(interaction, questOutcome);
        const questRewardLine = formatQuestAutoRewardLine(questOutcome);
        await recordJournalProgress(profile.id, {
            type: 'tower_victory',
            kills: 1,
            xp: xpGain,
            damageDealt: Math.max(0, Number(result.playerDamageDone) || 0),
            damageTaken: Math.max(0, Number(rulerTurnContext.damageTakenThisTurn) || 0),
            statusInflictedTicks: Math.max(0, Number(rulerTurnContext.statusInflictedTicks) || 0),
            statusTakenTicks: Math.max(0, Number(rulerTurnContext.statusTicksTaken) || 0),
            lootText: loot ? `${loot.item} x${loot.quantity}` : ''
        }).catch(() => {});
        const guildProgressOut = await recordGuildProgressByProfile(profile.id, {
            kills: 1,
            xpGained: xpGain
        }).catch(() => null);
        await sendGuildMissionReadyNotificationEphemeral(interaction, guildProgressOut);
        const guildMissionLine = formatGuildMissionReadyLine(guildProgressOut);
        const unlockedRulers = await processRulerProgress(profile, {
            isBattleEnd: true,
            victory: true,
            defeat: false,
            tierBeforeUpdate: progress.tier,
            stageBeforeUpdate: progress.stage,
            monsterRarity: monster.rarity,
            playerHpRatioAfterBattle: Math.max(0, Number(playerState.hp) || 0) / Math.max(1, Number(rulerTurnContext.playerMaxHp) || 1),
            levelAfterUpdate: newLevel,
            statusInflictedTicks: rulerTurnContext.statusInflictedTicks,
            statusTicksTaken: rulerTurnContext.statusTicksTaken,
            poisonDamageDealt: rulerTurnContext.poisonDamageDealt,
            damageTakenThisTurn: rulerTurnContext.damageTakenThisTurn
        });
        await sendUnlockedRulersEphemeral(interaction, unlockedRulers);

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('Victory')
                    .setDescription(
                        `Rewards:\n` +
                        `- XP: +${xpGain}` +
                        (xpBoost.bonusXp > 0 ? ` (Boost +${xpBoost.bonusXp})` : '') +
                        `\n- Tier ${progress.tier} | Stage ${progress.stage}` +
                        (xpBoost.bonusXp > 0 ? `\n- XP Boost Remaining: ${xpBoost.remainingLabel}` : '') +
                        (loot ? `\n- Loot: ${formatCoreItemLabel(loot.item)} x${loot.quantity}` : '') +
                        (skillPointsGain > 0 ? `\n- Level Up: ${newLevel}` : '') +
                        (questRewardLine ? `\n- ${questRewardLine}` : '') +
                        (guildMissionLine ? `\n- ${guildMissionLine}` : '') +
                        progressionText +
                        `\n\n${formatSkillXpSummary(skillXpSummary)}`
                    )
            ],
            components: [],
            files: [],
            attachments: []
        });
    }

    const resetStats = await calculatePlayerStats(profile);

    await Promise.all([
        profile.update({
            remainingHp: resetStats?.hp ?? 0,
            remainingMp: resetStats?.mp ?? 0,
            remainingStamina: resetStats?.stamina ?? 0,
            remainingVitalStamina: resetStats?.vitalStamina ?? 0
        }),
        progress.update({
            currentMonsterHp: null,
            skillXpSummary: null,
            playerEffects: null,
            monsterEffects: null,
            isInCombat: false,
            lastFightAt: new Date()
        })
    ]);
    const unlockedRulers = await processRulerProgress(profile, {
        isBattleEnd: true,
        victory: false,
        defeat: true,
        tierBeforeUpdate: progress.tier,
        stageBeforeUpdate: progress.stage,
        monsterRarity: monster.rarity,
        playerHpRatioAfterBattle: 0,
        levelAfterUpdate: profile.level,
        statusInflictedTicks: rulerTurnContext.statusInflictedTicks,
        statusTicksTaken: rulerTurnContext.statusTicksTaken,
        poisonDamageDealt: rulerTurnContext.poisonDamageDealt,
        damageTakenThisTurn: rulerTurnContext.damageTakenThisTurn
    });
    await sendUnlockedRulersEphemeral(interaction, unlockedRulers);
    await recordJournalProgress(profile.id, {
        type: 'tower_defeat',
        damageDealt: Math.max(0, Number(result.playerDamageDone) || 0),
        damageTaken: Math.max(0, Number(rulerTurnContext.damageTakenThisTurn) || 0),
        statusInflictedTicks: Math.max(0, Number(rulerTurnContext.statusInflictedTicks) || 0),
        statusTakenTicks: Math.max(0, Number(rulerTurnContext.statusTicksTaken) || 0),
        note: `Defeated by ${monster.name}`
    }).catch(() => {});

    return interaction.editReply({
        embeds: [
                new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('Defeat')
                .setDescription(
                    formatSkillXpSummary(skillXpSummary)
                )
        ],
        components: [],
        files: [],
        attachments: []
    });
}

function calculateTowerXpGain(monster, progress) {
    const monsterLevel = Math.max(1, Number(monster?.level) || 1);
    const tier = Math.max(1, Number(progress?.tier) || 1);
    const stage = Math.max(1, Number(progress?.stage) || 1);
    const { stats: scaled } = calculateScaling(monster, tier, stage);

    const baseXp = 60 + (monsterLevel * 40);
    const tierMultiplier = 1 + ((tier - 1) * 0.18);
    const stageMultiplier = 1 + ((stage - 1) * 0.05);
    const difficultyBonus = Math.floor(
        ((scaled.hp || 0) / 8) +
        ((scaled.offense || 0) / 3) +
        ((scaled.defense || 0) / 4) +
        ((scaled.magic || 0) / 4) +
        ((scaled.resistance || 0) / 4) +
        ((scaled.speed || 0) / 2)
    );

    return Math.max(
        100,
        Math.floor((baseXp * tierMultiplier * stageMultiplier) + difficultyBonus)
    );
}

function parseMonsterQueue(rawQueue) {
    if (!rawQueue) return null;

    try {
        let parsed = JSON.parse(rawQueue);
        if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
        }
        if (!Array.isArray(parsed)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function getInsufficientResourceReason(entity, skill) {
    const mpCost = Math.max(0, Number(skill?.mp_cost) || 0);
    const spCost = Math.max(0, Number(skill?.sp_cost) || 0);
    const vital = Math.max(0, Number(entity?.vitalStamina) || 0);
    const currentMp = Math.max(0, Number(entity?.mp) || 0);
    const currentStamina = Math.max(0, Number(entity?.stamina) || 0);

    const mpDeficit = Math.max(0, mpCost - currentMp);
    const staminaDeficit = Math.max(0, spCost - currentStamina);
    const totalDeficit = mpDeficit + staminaDeficit;

    // Vital Stamina can now cover both MP and Stamina deficits.
    if (totalDeficit <= vital) return null;

    return `Not enough resources for **${skill.name}**. Missing ${totalDeficit} total (MP/Stamina), Vital available: ${vital}. Choose another skill.`;
}

function mergeSkillXpSummaries(baseSummary, gainedSummary) {
    const merged = { ...(baseSummary || {}) };

    for (const [skillId, gained] of Object.entries(gainedSummary || {})) {
        const current = merged[skillId] || {
            skillId: Number(skillId),
            skillName: gained.skillName || 'Unknown Skill',
            totalXp: 0,
            level: null,
            unlocked: []
        };

        current.skillName = gained.skillName || current.skillName;
        current.totalXp += Math.max(0, Number(gained.totalXp) || 0);
        if (typeof gained.level === 'number') {
            current.level = gained.level;
        }

        const unlocked = Array.isArray(gained.unlocked) ? gained.unlocked : [];
        for (const unlockedSkill of unlocked) {
            if (!unlockedSkill?.id) continue;
            if (!current.unlocked.some((entry) => entry.id === unlockedSkill.id)) {
                current.unlocked.push(unlockedSkill);
            }
        }

        merged[skillId] = current;
    }

    return merged;
}

function appendSkillProgress(summary, skill, skillProgress) {
    if (!skill || !skillProgress?.gainedXp) return summary || {};

    const nextSummary = { ...(summary || {}) };
    const skillId = String(skill.id);
    const current = nextSummary[skillId] || {
        skillId: Number(skill.id),
        skillName: skill.name || 'Unknown Skill',
        totalXp: 0,
        level: null,
        unlocked: []
    };

    current.totalXp += Math.max(0, Number(skillProgress.gainedXp) || 0);
    current.skillName = skill.name || current.skillName;
    current.level = typeof skillProgress.level === 'number' ? skillProgress.level : current.level;

    if (skillProgress.unlockedSkill?.id) {
        if (!current.unlocked.some((entry) => entry.id === skillProgress.unlockedSkill.id)) {
            current.unlocked.push(skillProgress.unlockedSkill);
        }
    }

    nextSummary[skillId] = current;
    return nextSummary;
}

function formatSkillXpSummary(summary) {
    const grouped = {};
    for (const entry of Object.values(summary || {})) {
        const totalXp = Number(entry?.totalXp) || 0;
        if (totalXp <= 0) continue;

        const key = String(entry?.skillName || 'Unknown Skill').trim().toLowerCase();
        const current = grouped[key] || {
            skillName: entry?.skillName || 'Unknown Skill',
            totalXp: 0,
            level: null,
            unlocked: []
        };

        current.totalXp += totalXp;

        const currentLevel = Number(current.level);
        const nextLevel = Number(entry?.level);
        if (!Number.isNaN(nextLevel) && (Number.isNaN(currentLevel) || nextLevel > currentLevel)) {
            current.level = nextLevel;
        }

        for (const unlocked of entry?.unlocked || []) {
            if (!unlocked?.id) continue;
            if (!current.unlocked.some((existing) => existing.id === unlocked.id)) {
                current.unlocked.push(unlocked);
            }
        }

        grouped[key] = current;
    }

    const entries = Object.values(grouped)
        .sort((a, b) => (Number(b.totalXp) || 0) - (Number(a.totalXp) || 0));

    if (!entries.length) {
        return 'Skill XP Total:\nNo skill XP gained in this fight.';
    }

    const lines = ['Skill XP Total:'];
    for (const entry of entries) {
        lines.push(
            `${entry.skillName}: +${entry.totalXp} XP` +
            (typeof entry.level === 'number' ? ` (Level ${entry.level})` : '')
        );

        for (const unlocked of entry.unlocked || []) {
            lines.push(`Evolution unlocked: ${unlocked.name} (Tier ${unlocked.tier})`);
        }
    }

    return lines.join('\n');
}

async function sendUnlockedRulersEphemeral(interaction, unlockedRulers = []) {
    if (!Array.isArray(unlockedRulers) || !unlockedRulers.length) return;
    try {
        await interaction.followUp({
            content:
                `New title unlocked:\n` +
                unlockedRulers.map((name) => `- ${name}`).join('\n'),
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        if (error?.code === 10062 || error?.code === 40060) return;
        console.error('ruler unlock followUp error:', error);
    }
}

function formatTurnLogSections(logLines = []) {
    const lines = Array.isArray(logLines) ? logLines.filter(Boolean).map((v) => String(v)) : [];
    if (!lines.length) return 'No actions this turn.';

    const playerActions = [];
    const enemyActions = [];
    const effects = [];

    for (const line of lines) {
        if (line.startsWith('Used ') || line.startsWith('Used Heal Potion')) {
            playerActions.push(line);
            continue;
        }

        if (line.startsWith('Enemy used ')) {
            enemyActions.push(line);
            continue;
        }

        if (line.startsWith('You regenerated') || line.startsWith('Enemy regenerated')) {
            effects.push(line);
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

function formatQuestAutoRewardLine(questOutcome) {
    const crystals = Math.max(0, Number(questOutcome?.rewardCrystals) || 0);
    const xp = Math.max(0, Number(questOutcome?.rewardXp) || 0);
    const daily = Math.max(0, Number(questOutcome?.dailyCompleted) || 0);
    const weekly = Math.max(0, Number(questOutcome?.weeklyCompleted) || 0);
    const totalCompleted = daily + weekly;

    if (crystals <= 0 && xp <= 0 && totalCompleted <= 0) return '';

    const parts = [];
    if (crystals > 0) parts.push(`+${crystals} crystals`);
    if (xp > 0) parts.push(`+${xp} XP`);
    if (totalCompleted > 0) parts.push(`${totalCompleted} quest(s) completed`);
    return `Quest rewards: ${parts.join(', ')}`;
}

function formatGuildMissionReadyLine(guildProgressOut) {
    const daily = !!guildProgressOut?.dailyNewReady;
    const weekly = !!guildProgressOut?.weeklyNewReady;
    if (!daily && !weekly) return '';
    const parts = [];
    if (daily) parts.push('daily');
    if (weekly) parts.push('weekly');
    return `Guild mission ready: ${parts.join(', ')}`;
}

async function sendGuildMissionReadyNotificationEphemeral(interaction, guildProgressOut) {
    const daily = !!guildProgressOut?.dailyNewReady;
    const weekly = !!guildProgressOut?.weeklyNewReady;
    if (!daily && !weekly) return;

    const parts = [];
    if (daily) parts.push('daily');
    if (weekly) parts.push('weekly');

    try {
        await interaction.followUp({
            content: `Guild mission ready to claim: ${parts.join(', ')}. Leader/officers can use \`/guild claim\`.`,
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        if (error?.code === 10062 || error?.code === 40060) return;
        console.error('guild mission ready followUp error:', error);
    }
}

async function sendQuestReadyNotificationEphemeral(interaction, questOutcome) {
    const dailyReady = Math.max(0, Number(questOutcome?.dailyNewReady) || 0);
    const weeklyReady = Math.max(0, Number(questOutcome?.weeklyNewReady) || 0);
    if (dailyReady <= 0 && weeklyReady <= 0) return;

    const parts = [];
    if (dailyReady > 0) parts.push(`${dailyReady} daily`);
    if (weeklyReady > 0) parts.push(`${weeklyReady} weekly`);

    try {
        await interaction.followUp({
            content: `New quests are ready to claim: ${parts.join(', ')}. Use \`/quest\` then \`Claim\`.`,
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        if (error?.code === 10062 || error?.code === 40060) return;
        console.error('quest ready followUp error:', error);
    }
}

function sanitizePotionTurnLog(logLines = [], potionHealAmount = 0) {
    const lines = Array.isArray(logLines) ? logLines.map((line) => String(line || '')) : [];
    const filtered = lines.filter((line) => !line.startsWith('Used Heal Potion ->'));
    return [`Used Heal Potion -> +${Math.max(0, Number(potionHealAmount) || 0)} HP`, ...filtered];
}

function estimateMenuSkillDamage(attackerStats, defenderStats, skill, skillLevel = 1) {
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

async function buildFightActionComponents({ profileId, attackerStats, defenderStats, userSkills = null }) {
    let resolvedSkills = Array.isArray(userSkills) ? userSkills : null;
    if (!resolvedSkills) {
        resolvedSkills = await UserSkills.findAll({
            where: {
                profileId,
                equippedSlot: { [Op.not]: null }
            },
            include: [{
                model: Skills,
                required: true,
                where: {
                    effect_type_main: {
                        [Op.in]: ['Physical', 'Magic', 'Debuff', 'Buff']
                    }
                }
            }],
            order: [['equippedSlot', 'ASC']]
        });
    }

    const combatUserSkills = (resolvedSkills || [])
        .filter((us) => us?.equippedSlot !== null && us?.equippedSlot !== undefined)
        .filter((us) => ['Physical', 'Magic', 'Debuff', 'Buff'].includes(String(us?.Skill?.effect_type_main || '')))
        .sort((a, b) => Number(a?.equippedSlot || 0) - Number(b?.equippedSlot || 0));

    const options = combatUserSkills.slice(0, 25).map((us) => ({
        label: us.Skill.name,
        value: String(us.Skill.id),
        description: buildSkillSelectDescription(
            estimateMenuSkillDamage(attackerStats, defenderStats, us.Skill, us.level),
            us.Skill
        )
    }));

    const healPotionQty = await getInventoryQuantity(profileId, 'Healing Potion');
    if (healPotionQty > 0 && options.length < 25) {
        options.push({
            label: 'Heal Potion',
            value: 'potion_heal',
            description: `${getHealPotionLabel()} | x${healPotionQty}`
        });
    }

    if (!options.length) return [];
    return [{
        type: 1,
        components: [{
            type: 3,
            custom_id: `attack_${profileId}`,
            placeholder: 'Choose a skill',
            options
        }]
    }];
}

function buildSkillSelectDescription(damage, skill) {
    const parts = [`~DMG ${damage}`];
    const mpCost = Number(skill?.mp_cost) || 0;
    const spCost = Number(skill?.sp_cost) || 0;

    if (mpCost > 0) parts.push(`MP ${mpCost}`);
    if (spCost > 0) parts.push(`SP ${spCost}`);

    return parts.join(' | ');
}

function normalizeTerrainType(rawType) {
    const key = String(rawType || '').toLowerCase().trim();
    if (!key || key === 'none') return null;
    const normalized = key.charAt(0).toUpperCase() + key.slice(1);
    return COMBAT_BALANCE.terrainDamage.allowedTypes.includes(normalized) ? normalized : null;
}

function getResistancePercent(resistanceMap, effectType) {
    const key = String(effectType || '').trim();
    if (!key) return 0;
    return Math.max(0, Math.min(100, Number(resistanceMap?.[key]) || 0));
}

function applyTerrainDamageTick({
    state,
    terrainType,
    playerResistanceMap,
    enemyResistanceMap
}) {
    const playerMaxHp = Math.max(1, Number(state?.entityA?.maxHp) || Number(state?.entityA?.hp) || 1);
    const enemyMaxHp = Math.max(1, Number(state?.entityB?.maxHp) || Number(state?.entityB?.hp) || 1);
    const ratio = Math.max(0, Math.min(100, Number(COMBAT_BALANCE.terrainDamage.percentMaxHp) || 0)) / 100;
    const minDamage = Math.max(0, Number(COMBAT_BALANCE.terrainDamage.minDamage) || 0);
    const basePlayer = Math.max(minDamage, Math.floor(playerMaxHp * ratio));
    const baseEnemy = Math.max(minDamage, Math.floor(enemyMaxHp * ratio));

    const playerRes = getResistancePercent(playerResistanceMap, terrainType);
    const enemyRes = getResistancePercent(enemyResistanceMap, terrainType);

    const playerDamage = Math.max(0, Math.floor(basePlayer * (1 - (playerRes / 100))));
    const enemyDamage = Math.max(0, Math.floor(baseEnemy * (1 - (enemyRes / 100))));

    state.entityA.hp = Math.max(0, Math.floor((Number(state?.entityA?.hp) || 0) - playerDamage));
    state.entityB.hp = Math.max(0, Math.floor((Number(state?.entityB?.hp) || 0) - enemyDamage));

    return { playerDamage, enemyDamage, playerRes, enemyRes };
}

function formatTerrainLogLine(terrainType, terrain = {}) {
    const playerDamage = Math.max(0, Number(terrain.playerDamage) || 0);
    const enemyDamage = Math.max(0, Number(terrain.enemyDamage) || 0);
    const playerRes = Math.max(0, Number(terrain.playerRes) || 0);
    const enemyRes = Math.max(0, Number(terrain.enemyRes) || 0);

    if (playerDamage <= 0 && enemyDamage <= 0) {
        return `Terrain (${terrainType}) was nullified by resistances.`;
    }

    return `Terrain (${terrainType}) -> You -${playerDamage} HP (${playerRes}% res), Enemy -${enemyDamage} HP (${enemyRes}% res)`;
}

function buildStatusModifiersFromSkills(skills = []) {
    const effects = ['Poison', 'Fire', 'Cutting', 'Rot'];
    const statusResistance = Object.fromEntries(effects.map((effect) => [effect, 0]));
    const statusEnhancement = Object.fromEntries(effects.map((effect) => [effect, 0]));
    const skillLevels = new Map();
    const recovery = { hp: 0, mp: 0, sp: 0 };
    const consumptionReduction = { mp: 0, sp: 0 };
    let hasImmortality = false;
    const hasNullificationToken = (value) => {
        const text = String(value || '').toLowerCase();
        return (
            text.includes('nullification') ||
            text.includes('nulification') ||
            text.includes('nulhification') ||
            text.includes('nullify') ||
            text.includes('nulhify')
        );
    };

    for (const entry of skills || []) {
        const name = String(entry?.name || entry?.Skill?.name || '').trim();
        if (!name) continue;
        const lowerName = name.toLowerCase();
        const level = Math.max(1, Number(entry?.level) || 1);
        skillLevels.set(lowerName, Math.max(level, Number(skillLevels.get(lowerName)) || 0));
        if (lowerName.includes('immortality')) {
            hasImmortality = true;
        }

        const tier = Math.max(1, Number(entry?.tier || entry?.Skill?.tier) || 1);
        const lower = lowerName;
        const specificLower = String(entry?.effect_type_specific || entry?.Skill?.effect_type_specific || '').toLowerCase().trim();

        let mappedEffect = null;
        if (specificLower === 'poison') mappedEffect = 'Poison';
        else if (specificLower === 'fire') mappedEffect = 'Fire';
        else if (specificLower === 'cutting') mappedEffect = 'Cutting';
        else if (specificLower === 'rot') mappedEffect = 'Rot';

        const hasHpToken = lower.includes('hp');
        const hasMpToken = lower.includes('mp');
        const hasSpToken = lower.includes('sp') || lower.includes('stamina');
        const inferTargets = () => {
            if (hasHpToken) return ['hp'];
            if (hasMpToken) return ['mp'];
            if (hasSpToken) return ['sp'];
            return ['mp', 'sp'];
        };

        if (lower.includes('recovery speed') || lower.includes('rapid recovery')) {
            const isRapid = lower.includes('rapid recovery');
            const regenPct = isRapid
                ? Math.min(20, 2 + (1.2 * level))
                : Math.min(12, 1 + (0.7 * level));
            for (const target of inferTargets()) {
                recovery[target] = Math.max(recovery[target], regenPct);
            }
        }

        if (lower.includes('lessened consumption') || lower.includes('minimized consumption')) {
            const isMinimized = lower.includes('minimized consumption');
            const reductionPct = isMinimized
                ? Math.min(45, 8 + (1.8 * level))
                : Math.min(28, 4 + (1.3 * level));
            for (const target of inferTargets()) {
                if (target === 'mp' || target === 'sp') {
                    consumptionReduction[target] = Math.max(consumptionReduction[target], reductionPct);
                }
            }
        }

        for (const effect of effects) {
            const token = effect.toLowerCase();
            const matchesEffect = mappedEffect === effect || lower.includes(token);
            if (!matchesEffect) continue;

            if (lower.includes('enhancement')) {
                const enhancementPercent = 10 + (3 * level);
                statusEnhancement[effect] = Math.max(statusEnhancement[effect], enhancementPercent);
            }

            const isNullification = hasNullificationToken(lower);
            const isSuperResistance =
                (lower.includes('super') && lower.includes('resistance')) ||
                (tier >= 2 && lower.includes('resistance') && !isNullification);
            const isBaseResistance = lower.includes('resistance');

            if (isNullification) {
                statusResistance[effect] = 100;
                continue;
            }

            if (isSuperResistance) {
                const superResistancePercent = 25 + (3 * level);
                statusResistance[effect] = Math.max(statusResistance[effect], superResistancePercent);
                continue;
            }

            if (isBaseResistance) {
                const baseResistancePercent = 5 + (2 * level);
                statusResistance[effect] = Math.max(statusResistance[effect], baseResistancePercent);
            }
        }
    }

    const getLvl = (skillName) => Math.max(0, Number(skillLevels.get(String(skillName).toLowerCase())) || 0);
    const pride = getLvl('Pride');
    const wrath = getLvl('Wrath');
    const greed = getLvl('Greed');
    const lust = getLvl('Lust');
    const envy = getLvl('Envy');
    const gluttony = getLvl('Gluttony');
    const sloth = getLvl('Sloth');
    const temperance = getLvl('Temperance');
    const mercy = getLvl('Mercy');
    const diligence = getLvl('Diligence');
    const humility = getLvl('Humility');
    const chastity = getLvl('Chastity');
    const wisdom = getLvl('Wisdom');
    const scaled = (lvl, base, perLevel, cap) => (
        lvl > 0 ? Math.min(cap, Math.max(0, base + (lvl * perLevel))) : 0
    );

    const rulerPassives = {
        damageBonusHighHpPct: scaled(pride, 6, 1.5, 28),
        damageBonusLowHpPct: scaled(wrath, 8, 2, 35),
        lowHpVulnerabilityPct: scaled(wrath, 4, 0.8, 20),
        resourceLeechPct: scaled(greed, 3, 0.7, 14),
        lifestealPct: scaled(lust, 4, 0.9, 20),
        onHitShieldPct: scaled(envy, 6, 1.2, 25),
        shieldOnHitPct: scaled(gluttony, 8, 1.4, 30),
        baseDamageReductionPct: scaled(sloth, 6, 1.5, 30),
        costReductionPct: scaled(temperance, 5, 1.2, 30),
        mpCostReductionPct: Math.max(
            scaled(temperance, 5, 1.2, 30),
            Math.max(0, Number(consumptionReduction.mp) || 0)
        ),
        spCostReductionPct: Math.max(
            scaled(temperance, 5, 1.2, 30),
            Math.max(0, Number(consumptionReduction.sp) || 0)
        ),
        lowHpDamageReductionPct: scaled(mercy, 10, 1.8, 35),
        endTurnRegenPct: scaled(diligence, 2, 0.5, 12),
        hpRegenPct: Math.max(0, Number(recovery.hp) || 0),
        mpRegenPct: Math.max(
            scaled(diligence, 2, 0.5, 12),
            Math.max(0, Number(recovery.mp) || 0)
        ),
        spRegenPct: Math.max(
            scaled(diligence, 2, 0.5, 12),
            Math.max(0, Number(recovery.sp) || 0)
        ),
        immortalityEnabled: hasImmortality,
        magicDamageBonusPct: scaled(wisdom, 6, 1.7, 30)
    };

    const allStatusBonus = Math.min(60, scaled(humility, 5, 1.2, 25) + scaled(chastity, 7, 1.3, 30));
    if (allStatusBonus > 0) {
        for (const effect of effects) {
            statusResistance[effect] = Math.min(100, Math.max(0, Number(statusResistance[effect]) || 0) + allStatusBonus);
        }
    }

    return { statusResistance, statusEnhancement, rulerPassives };
}

function applyProfileXpWithRaceCap(profile, xpGain) {
    const maxLevel = Math.max(1, Number(getMaxLevelForRace(profile?.race)) || 1);
    let level = Math.max(1, Number(profile?.level) || 1);
    let xp = Math.max(0, Number(profile?.xp) || 0);
    let skillPointsGain = 0;
    const gain = Math.max(0, Number(xpGain) || 0);

    // At race cap, XP gain is fully blocked.
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

    // Reaching cap discards overflow XP.
    if (level >= maxLevel) {
        level = maxLevel;
        xp = 0;
    }

    return { level, xp, skillPointsGain };
}

async function sendTabooRevelationsEphemeral(interaction, revelations = []) {
    if (!Array.isArray(revelations) || revelations.length === 0) return;

    const formatted = revelations.map((line) => {
        const match = /^Level\s+(\d+):\s*(.*)$/i.exec(String(line || ''));
        if (!match) {
            return `A part of the truth is revealed:\n${line}`;
        }

        const [, level, revelationText] = match;
        return `Taboo leveled up to ${level} - A part of the truth is revealed:\n${revelationText}`;
    }).join('\n\n');

    try {
        await interaction.followUp({
            content: formatted,
            flags: MessageFlags.Ephemeral
        });
    } catch (error) {
        if (error?.code === 10062 || error?.code === 40060) return;
        console.error('taboo revelation followUp error:', error);
    }
}

function getTabooRevelationForLevel(level) {
    const revelations = {
        1: 'Level 1: A distant voice whispers that this world is built on a lie.',
        2: 'Level 2: Souls do not vanish. They are counted.',
        3: 'Level 3: Death is not an end, but a resource.',
        4: 'Level 4: Skills are not gifts. They are assigned functions.',
        5: 'Level 5: An unseen administration monitors all growth.',
        6: 'Level 6: The laws of this world can be rewritten by those above.',
        7: 'Level 7: Pain and life force are fuel for the System.',
        8: 'Level 8: Heresy reveals the hidden structure beneath reality.',
        9: 'Level 9: Rulers carry authorities beyond ordinary morality.',
        10: 'Level 10: Partial truth unveiled: this world is a cage maintained by the System.'
    };

    return revelations[level] || null;
}

function collectTabooRevelations(previousLevel, newLevel) {
    const fromLevel = Math.max(1, Number(previousLevel) || 1);
    const toLevel = Math.max(fromLevel, Number(newLevel) || fromLevel);
    const lines = [];

    for (let level = fromLevel + 1; level <= toLevel; level++) {
        const message = getTabooRevelationForLevel(level);
        if (message) lines.push(message);
    }

    return lines;
}

function calculateTabooSkillXp({
    skillPower = 0,
    monsterLevel = 1,
    towerTier = 1,
    victory = false,
    sourceBonus = 0,
    kinEaterBonus = 0
} = {}) {
    const safePower = Math.max(0, Number(skillPower) || 0);
    const safeLevel = Math.max(1, Number(monsterLevel) || 1);
    const safeTier = Math.max(1, Number(towerTier) || 1);
    const safeSourceBonus = Math.max(0, Number(sourceBonus) || 0);
    const safeKinEaterBonus = Math.max(0, Number(kinEaterBonus) || 0);
    const victoryBonus = victory ? 1 : 0;

    const raw =
        2 +
        (safePower * 0.35) +
        (safeLevel * 0.25) +
        ((safeTier - 1) * 0.5) +
        victoryBonus +
        safeSourceBonus +
        safeKinEaterBonus;
    return Math.max(1, Math.min(20, Math.round(raw)));
}

async function loadSkillLineage(skill) {
    let cursor = skill;
    const lineage = [];
    const visited = new Set();

    while (cursor && cursor.id && !visited.has(cursor.id)) {
        visited.add(cursor.id);
        lineage.push(cursor);

        const parentId = Number(cursor.parent) || 0;
        if (!parentId) break;
        cursor = await Skills.findByPk(parentId);
    }

    return lineage;
}

function getTabooSources(lineage) {
    const nameHas = (value, needle) => String(value || '').toLowerCase().includes(needle);
    const typeHas = (value, needle) => String(value || '').toLowerCase().includes(needle);

    const isHeresyRelated = lineage.some((entry) =>
        nameHas(entry.name, 'heretic') ||
        nameHas(entry.name, 'heresy') ||
        nameHas(entry.name, 'evil eye')
    );

    const isRulerRelated = lineage.some((entry) => typeHas(entry.type, 'ruler'));

    return { isHeresyRelated, isRulerRelated };
}

async function grantTabooXpFromSkillUse(profileId, usedSkill, context = {}) {
    if (!usedSkill?.id) return { summary: {}, revelations: [] };

    const tabooSkill = await Skills.findOne({ where: { name: 'Taboo' } });
    if (!tabooSkill) return { summary: {}, revelations: [] };

    const normalizedSkill = await Skills.findByPk(usedSkill.id);
    if (!normalizedSkill) return { summary: {}, revelations: [] };

    const lineage = await loadSkillLineage(normalizedSkill);
    const tabooSources = getTabooSources(lineage);
    const hasKinEaterTitle = !!context.hasKinEaterTitle;

    if (!tabooSources.isHeresyRelated && !tabooSources.isRulerRelated) {
        return { summary: {}, revelations: [] };
    }

    const gainedXp = calculateTabooSkillXp({
        skillPower: normalizedSkill.power || 0,
        monsterLevel: context.monsterLevel || 1,
        towerTier: context.towerTier || 1,
        victory: !!context.victory,
        sourceBonus: (tabooSources.isHeresyRelated ? 2 : 0) + (tabooSources.isRulerRelated ? 2 : 0),
        kinEaterBonus: hasKinEaterTitle ? 2 : 0
    });

    const progress = await grantSkillXp(profileId, tabooSkill.id, gainedXp);
    const summary = appendSkillProgress({}, tabooSkill, progress);
    const revelations = collectTabooRevelations(progress?.previousLevel, progress?.level);

    return { summary, revelations };
}

async function profileHasTitle(profileId, titleName) {
    if (!profileId || !titleName) return false;

    const userTitle = await UserTitles.findOne({
        where: { profileId },
        include: [{
            model: Titles,
            attributes: ['name'],
            where: { name: titleName }
        }]
    });

    return !!userTitle;
}


