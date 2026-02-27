const { EmbedBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');

const { calculateScaling, executeTurn } = require('../../../utils/combatEngine');
const { calculateXpForLevel } = require('../../../utils/xpUtils');
const { calculatePlayerStats } = require('../../../utils/playerStats');
const { rollLoot } = require('../../../utils/lootSystem');
const { addInventoryItem } = require('../../../utils/inventoryService');
const { applyXpBoost } = require('../../../utils/xpBoostService');
const { formatCoreItemLabel } = require('../../../utils/coreEmoji');
const { resolveImage } = require('../../../utils/resolveProfileImage');
const { processRulerProgress, countStatusTicks } = require('../../../utils/rulerTitleService');
const { getMaxLevelForRace } = require('../../../utils/evolutionConfig');

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
    const skillId = parseInt(interaction.values[0], 10);

    if (isNaN(profileId) || isNaN(skillId)) return;

    const [profile, skill, progress] = await Promise.all([
        Profiles.findByPk(profileId),
        Skills.findByPk(skillId),
        FightProgress.findOne({ where: { profileId } })
    ]);

    if (!profile || !skill) return;
    const hasKinEaterTitle = await profileHasTitle(profile.id, 'Kin Eater');

    const userSkill = await UserSkills.findOne({
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

    const allPlayerSkills = await UserSkills.findAll({
        where: { profileId: profile.id }
    });
    const playerStatusModifiers = buildStatusModifiersFromSkills(allPlayerSkills);

    const combatSkill = {
        ...skill.toJSON(),
        power: calculateEffectiveSkillPower(skill.power, userSkill.level)
    };

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

        const insufficientReason = getInsufficientResourceReason(state.entityA, combatSkill);
        if (insufficientReason) {
            await interaction.followUp({
                content: insufficientReason,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const monsterData = await Monsters.findByPk(monster.id, {
            include: [{ model: Skills, through: { attributes: [] } }]
        });

        const monsterSkills = monsterData?.Skills || [];
        const monsterStatusModifiers = buildStatusModifiersFromSkills(monsterSkills);
        state.entityA.statusResistance = playerStatusModifiers.statusResistance;
        state.entityA.statusEnhancement = playerStatusModifiers.statusEnhancement;
        state.entityA.rulerPassives = playerStatusModifiers.rulerPassives;
        state.entityB.statusResistance = monsterStatusModifiers.statusResistance;
        state.entityB.statusEnhancement = monsterStatusModifiers.statusEnhancement;
        state.entityB.rulerPassives = monsterStatusModifiers.rulerPassives;
        const playerHpBeforeTurn = Math.max(0, Number(state.entityA.hp) || 0);
        const result = executeTurn(state, combatSkill, monsterSkills);
        let turnSkillXpSummary = {};

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

        const resistanceXpSummary = await grantResistanceXpFromStatusDamage(
            profile.id,
            result.statusDamageTaken?.player,
            { monsterLevel: monster.level || 1, towerTier: 1, victory: result.victory }
        );
        turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, resistanceXpSummary);
        const enhancementXpSummary = await grantEnhancementXpFromStatusDamage(
            profile.id,
            result.statusDamageTaken?.enemy,
            { monsterLevel: monster.level || 1, towerTier: 1, victory: result.victory }
        );
        turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, enhancementXpSummary);

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
            const spawnChannel = await SpawnChannels.findByPk(spawnInstance.spawnChannelId);
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

            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('Spawn Victory')
                        .setDescription(
                            `${formatSkillXpSummary(sessionSkillXpSummary)}\n\n` +
                            `+${xpGain} XP` +
                            (xpBoost.bonusXp > 0 ? ` (Boost +${xpBoost.bonusXp})` : '') +
                            `\nChannel XP Multiplier: x${channelXpMultiplier}` +
                            (xpBoost.bonusXp > 0 ? `\nXP Boost Remaining: ${xpBoost.remainingLabel}` : '') +
                            (loot ? `\nLoot: ${formatCoreItemLabel(loot.item)} x${loot.quantity}` : '') +
                            (skillPointsGain > 0 ? `\nLevel Up: ${newLevel}` : '')
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

        return interaction.editReply({
            embeds: [embed],
            components: interaction.message.components,
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

    const insufficientReason = getInsufficientResourceReason(state.entityA, combatSkill);
    if (insufficientReason) {
        await interaction.followUp({
            content: insufficientReason,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const monsterWithSkills = await Monsters.findByPk(monster.id, {
        include: [{ model: Skills, through: { attributes: [] } }]
    });

    const monsterSkills = monsterWithSkills?.Skills || [];
    const monsterStatusModifiers = buildStatusModifiersFromSkills(monsterSkills);
    state.entityA.statusResistance = playerStatusModifiers.statusResistance;
    state.entityA.statusEnhancement = playerStatusModifiers.statusEnhancement;
    state.entityA.rulerPassives = playerStatusModifiers.rulerPassives;
    state.entityB.statusResistance = monsterStatusModifiers.statusResistance;
    state.entityB.statusEnhancement = monsterStatusModifiers.statusEnhancement;
    state.entityB.rulerPassives = monsterStatusModifiers.rulerPassives;
    const playerHpBeforeTurn = Math.max(0, Number(state.entityA.hp) || 0);
    const result = executeTurn(state, combatSkill, monsterSkills);
    let turnSkillXpSummary = {};

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

    const resistanceXpSummary = await grantResistanceXpFromStatusDamage(
        profile.id,
        result.statusDamageTaken?.player,
        { monsterLevel: monster.level || 1, towerTier: progress.tier || 1, victory: result.victory }
    );
    turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, resistanceXpSummary);
    const enhancementXpSummary = await grantEnhancementXpFromStatusDamage(
        profile.id,
        result.statusDamageTaken?.enemy,
        { monsterLevel: monster.level || 1, towerTier: progress.tier || 1, victory: result.victory }
    );
    turnSkillXpSummary = mergeSkillXpSummaries(turnSkillXpSummary, enhancementXpSummary);

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

    return updateFightEmbed(interaction, profile, monster, monsterMax, state, result, sessionSkillXpSummary);
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
        `❤️ HP: ${state.entityA.hp}/${playerMaxHp}${playerShield > 0 ? ` | 🛡 ${playerShield}` : ''}\n` +
        `🔵 MP: ${state.entityA.mp}/${playerMaxMp}\n` +
        `🟨 Stamina: ${state.entityA.stamina}/${playerMaxStamina}\n` +
        `🟩 Vital Stamina: ${state.entityA.vitalStamina}/${playerMaxVital}\n` +
        `⚔️ Offense: ${state.entityA.offense}\n` +
        `🛡️ Defense: ${state.entityA.defense}\n` +
        `✨ Magic: ${state.entityA.magic}\n` +
        `🧿 Resistance: ${state.entityA.resistance}\n` +
        `💨 Speed: ${state.entityA.speed}\n\n` +
        `Monster: **${monsterName}${monsterSuffix}**\n` +
        `❤️ HP: ${state.entityB.hp}/${monsterMaxHp}${monsterShield > 0 ? ` | 🛡 ${monsterShield}` : ''}\n` +
        `🔵 MP: ${state.entityB.mp}/${monsterMaxMp}\n` +
        `🟨 Stamina: ${state.entityB.stamina}/${monsterMaxStamina}\n` +
        `🟩 Vital Stamina: ${state.entityB.vitalStamina}/${monsterMaxVital}\n` +
        `⚔️ Offense: ${state.entityB.offense}\n` +
        `🛡️ Defense: ${state.entityB.defense}\n` +
        `✨ Magic: ${state.entityB.magic}\n` +
        `🧿 Resistance: ${state.entityB.resistance}\n` +
        `💨 Speed: ${state.entityB.speed}`
    );
}

async function updateFightEmbed(interaction, profile, monster, monsterMaxStats, state, result, skillXpSummary) {

    const progress = await FightProgress.findOne({ where: { profileId: profile.id } });
    if (!progress) return;

    const maxPlayer = await calculatePlayerStats(profile);
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

    return interaction.editReply({
        embeds: [embed],
        components: interaction.message.components,
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
                        `${formatSkillXpSummary(skillXpSummary)}\n\n` +
                        `+${xpGain} XP` +
                        (xpBoost.bonusXp > 0 ? ` (Boost +${xpBoost.bonusXp})` : '') +
                        `\nTier ${progress.tier} • Stage ${progress.stage}` +
                        (xpBoost.bonusXp > 0 ? `\nXP Boost Remaining: ${xpBoost.remainingLabel}` : '') +
                        (loot ? `\nLoot: ${formatCoreItemLabel(loot.item)} x${loot.quantity}` : '') +
                        (skillPointsGain > 0 ? `\nLevel Up! Now level ${newLevel}` : '') +
                        progressionText
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
        sections.push(playerActions.join('\n'));
    }
    if (enemyActions.length) {
        sections.push('Enemy Actions:');
        sections.push(enemyActions.join('\n'));
    }
    if (effects.length) {
        sections.push('Effects:');
        sections.push(effects.join('\n'));
    }

    return sections.join('\n\n');
}

function buildStatusModifiersFromSkills(skills = []) {
    const effects = ['Poison', 'Fire', 'Cutting', 'Rot'];
    const statusResistance = Object.fromEntries(effects.map((effect) => [effect, 0]));
    const statusEnhancement = Object.fromEntries(effects.map((effect) => [effect, 0]));
    const skillLevels = new Map();

    for (const entry of skills || []) {
        const name = String(entry?.name || entry?.Skill?.name || '').trim();
        if (!name) continue;
        const lowerName = name.toLowerCase();
        const level = Math.max(1, Number(entry?.level) || 1);
        skillLevels.set(lowerName, Math.max(level, Number(skillLevels.get(lowerName)) || 0));

        const tier = Math.max(1, Number(entry?.tier || entry?.Skill?.tier) || 1);
        const lower = lowerName;
        const specificLower = String(entry?.effect_type_specific || entry?.Skill?.effect_type_specific || '').toLowerCase().trim();

        let mappedEffect = null;
        if (specificLower === 'poison') mappedEffect = 'Poison';
        else if (specificLower === 'fire') mappedEffect = 'Fire';
        else if (specificLower === 'cutting') mappedEffect = 'Cutting';
        else if (specificLower === 'rot') mappedEffect = 'Rot';

        for (const effect of effects) {
            const token = effect.toLowerCase();
            const matchesEffect = mappedEffect === effect || lower.includes(token);
            if (!matchesEffect) continue;

            if (lower.includes('enhancement')) {
                const enhancementPercent = 10 + (3 * level);
                statusEnhancement[effect] = Math.max(statusEnhancement[effect], enhancementPercent);
            }

            const isNullification = lower.includes('nullification') || lower.includes('nullify');
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
        lowHpDamageReductionPct: scaled(mercy, 10, 1.8, 35),
        endTurnRegenPct: scaled(diligence, 2, 0.5, 12),
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

function calculateResistanceSkillXp({
    damageTaken = 0,
    monsterLevel = 1,
    towerTier = 1,
    victory = false
} = {}) {
    const safeDamage = Math.max(0, Number(damageTaken) || 0);
    if (safeDamage <= 0) return 0;

    const safeLevel = Math.max(1, Number(monsterLevel) || 1);
    const safeTier = Math.max(1, Number(towerTier) || 1);
    const victoryBonus = victory ? 1 : 0;

    const raw = (Math.sqrt(safeDamage) * 1.1) + (safeLevel * 0.4) + ((safeTier - 1) * 0.8) + victoryBonus;
    return Math.max(1, Math.min(25, Math.round(raw)));
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

async function grantResistanceXpFromStatusDamage(profileId, statusDamageByType, context = {}) {
    const entries = Object.entries(statusDamageByType || {})
        .filter(([, totalDamage]) => (Number(totalDamage) || 0) > 0);

    if (!entries.length) return {};

    const statusTypes = entries.map(([statusType]) => String(statusType));

    const resistanceUserSkills = await UserSkills.findAll({
        where: { profileId },
        include: [{
            model: Skills,
            where: {
                type: 'Resistance Skills',
                effect_type_main: 'Buff',
                effect_type_specific: { [Op.in]: statusTypes }
            }
        }]
    });

    let summary = {};

    for (const userSkill of resistanceUserSkills) {
        const passiveSkill = userSkill.Skill;
        if (!passiveSkill) continue;

        const damageTaken = Math.max(0, Number(statusDamageByType[passiveSkill.effect_type_specific]) || 0);
        if (damageTaken <= 0) continue;

        const gainedXp = calculateResistanceSkillXp({
            damageTaken,
            monsterLevel: context.monsterLevel || 1,
            towerTier: context.towerTier || 1,
            victory: !!context.victory
        });

        const progress = await grantSkillXp(profileId, passiveSkill.id, gainedXp);
        summary = appendSkillProgress(summary, passiveSkill, progress);
    }

    return summary;
}

async function grantEnhancementXpFromStatusDamage(profileId, statusDamageByType, context = {}) {
    const entries = Object.entries(statusDamageByType || {})
        .filter(([, totalDamage]) => (Number(totalDamage) || 0) > 0);

    if (!entries.length) return {};

    const statusTypes = entries.map(([statusType]) => String(statusType));

    const enhancementUserSkills = await UserSkills.findAll({
        where: { profileId },
        include: [{
            model: Skills,
            where: {
                effect_type_main: 'Buff',
                effect_type_specific: { [Op.in]: statusTypes },
                name: { [Op.like]: '%Enhancement%' }
            }
        }]
    });

    let summary = {};

    for (const userSkill of enhancementUserSkills) {
        const passiveSkill = userSkill.Skill;
        if (!passiveSkill) continue;

        const damageDone = Math.max(0, Number(statusDamageByType[passiveSkill.effect_type_specific]) || 0);
        if (damageDone <= 0) continue;

        const gainedXp = calculateResistanceSkillXp({
            damageTaken: damageDone,
            monsterLevel: context.monsterLevel || 1,
            towerTier: context.towerTier || 1,
            victory: !!context.victory
        });

        const progress = await grantSkillXp(profileId, passiveSkill.id, gainedXp);
        summary = appendSkillProgress(summary, passiveSkill, progress);
    }

    return summary;
}

function resolveMonsterImage(monster) {
    if (!monster?.image) return null;

    const imagePath = path.resolve('utils', 'images', monster.image);
    if (!fs.existsSync(imagePath)) return null;

    return new AttachmentBuilder(imagePath, { name: monster.image });
}





