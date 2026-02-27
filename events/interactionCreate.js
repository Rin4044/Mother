const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const path = require('path');
const fs = require('fs');

const { routeButton } = require('../interactions/buttons');
const { routeSelectMenu } = require('../interactions/selectmenus');

const { buildSpawnPanel } = require('../commands/global/configSpawn');

const { SpawnChannels, SpawnConfig, SpawnInstances, Profiles, UserSkills, Skills, FightProgress } = require('../database');
const { Op } = require('sequelize');

const { calculatePlayerStats } = require('../utils/playerStats');
const { resolveImage } = require('../utils/resolveProfileImage');
const { progressTutorial } = require('../utils/tutorialService');
const MAX_SPAWN_CHANNELS = 25;

module.exports = {
    name: 'interactionCreate',

    async execute(interaction, client) {

        // =========================
        // SELECT MENUS
        // =========================

        if (interaction.isStringSelectMenu()) {
            const id = interaction.customId;

            if (id.startsWith('spawn_edit_channel_select_')) {
                const ownerId = id.split('_')[4];

                if (interaction.user.id !== ownerId) {
                    return interaction.reply({ content: "Not your menu.", flags: MessageFlags.Ephemeral });
                }

                const selectedChannelId = parseInt(interaction.values[0], 10);
                if (isNaN(selectedChannelId)) {
                    return interaction.reply({ content: "Invalid channel selection.", flags: MessageFlags.Ephemeral });
                }

                const spawnChannel = await SpawnChannels.findOne({
                    where: {
                        id: selectedChannelId,
                        guildId: interaction.guild.id
                    }
                });

                if (!spawnChannel) {
                    return interaction.reply({ content: "Spawn channel not found.", flags: MessageFlags.Ephemeral });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`spawn_edit_channel_modal_${ownerId}_${spawnChannel.id}`)
                    .setTitle(`Edit Spawn Channel #${spawnChannel.id}`);

                const monstersInput = new TextInputBuilder()
                    .setCustomId('monsterIds')
                    .setLabel('Monster IDs (example: 1,5,8)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setValue(Array.isArray(spawnChannel.monsterIds) ? spawnChannel.monsterIds.join(',') : '');

                const baseTimerInput = new TextInputBuilder()
                    .setCustomId('baseTimer')
                    .setLabel('Channel timer seconds (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setValue(spawnChannel.baseTimer !== null && spawnChannel.baseTimer !== undefined ? String(spawnChannel.baseTimer) : '');

                const varianceInput = new TextInputBuilder()
                    .setCustomId('variance')
                    .setLabel('Channel variance seconds (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setValue(spawnChannel.variance !== null && spawnChannel.variance !== undefined ? String(spawnChannel.variance) : '');

                const xpMultiplierInput = new TextInputBuilder()
                    .setCustomId('xpMultiplier')
                    .setLabel('XP multiplier (optional, e.g. 1.5)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setValue(spawnChannel.xpMultiplier !== null && spawnChannel.xpMultiplier !== undefined ? String(spawnChannel.xpMultiplier) : '');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(monstersInput),
                    new ActionRowBuilder().addComponents(baseTimerInput),
                    new ActionRowBuilder().addComponents(varianceInput),
                    new ActionRowBuilder().addComponents(xpMultiplierInput)
                );

                return interaction.showModal(modal);
            }

            return routeSelectMenu(interaction, client);
        }

        // =========================
        // BUTTONS
        // =========================

        if (interaction.isButton()) {

            const id = interaction.customId;

            // ===== SPAWN TOGGLE =====
            if (id.startsWith('spawn_toggle_')) {

                const ownerId = id.split('_')[2];
                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your panel.", flags: MessageFlags.Ephemeral });

                const config = await SpawnConfig.findOne({
                    where: { guildId: interaction.guild.id }
                });

                config.enabled = !config.enabled;
                await config.save();

                const channels = await SpawnChannels.findAll({
                    where: { guildId: interaction.guild.id }
                });

                const { embed, row } = buildSpawnPanel(config, channels, ownerId);

                return interaction.update({
                    embeds: [embed],
                    components: [row]
                });
            }

            // ===== SPAWN TIMER BUTTON =====
            if (id.startsWith('spawn_timer_')) {

                const ownerId = id.split('_')[2];
                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your panel.", flags: MessageFlags.Ephemeral });

                const modal = new ModalBuilder()
                    .setCustomId(`spawn_timer_modal_${ownerId}`)
                    .setTitle('Set Spawn Timer');

                const baseInput = new TextInputBuilder()
                    .setCustomId('base')
                    .setLabel('Base Timer (seconds)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const varianceInput = new TextInputBuilder()
                    .setCustomId('variance')
                    .setLabel('Variance (seconds)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(baseInput),
                    new ActionRowBuilder().addComponents(varianceInput)
                );

                return interaction.showModal(modal);
            }

            // ===== SPAWN CHANNEL MANAGER =====
            if (id.startsWith('spawn_channels_')) {

                const ownerId = id.split('_')[2];

                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your panel.", flags: MessageFlags.Ephemeral });

                const config = await SpawnConfig.findOne({
                    where: { guildId: interaction.guild.id }
                });

                const channels = await SpawnChannels.findAll({
                    where: { guildId: interaction.guild.id }
                });

                const channelList = channels.length
                    ? channels.map(c =>
                        `<#${c.channelId}> -> Monsters: ${Array.isArray(c.monsterIds) && c.monsterIds.length ? c.monsterIds.join(',') : 'legacy levels'} | Timer: ${c.baseTimer ?? config.baseTimer}s +/- ${c.variance ?? config.variance}s | XP x${c.xpMultiplier ?? 1}`
                    ).join('\n')
                    : "No spawn channels configured.";

                const embed = new EmbedBuilder()
                    .setColor('#290003')
                    .setTitle('Spawn Channel Manager')
                    .setDescription(`Configured channels: **${channels.length}/${MAX_SPAWN_CHANNELS}**\n\n${channelList}`);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`spawn_add_channel_${ownerId}`)
                        .setLabel('Add Channel')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(channels.length >= MAX_SPAWN_CHANNELS),

                    new ButtonBuilder()
                        .setCustomId(`spawn_edit_channel_${ownerId}`)
                        .setLabel('Edit Channel')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(!channels.length),

                    new ButtonBuilder()
                        .setCustomId(`spawn_delete_channel_${ownerId}`)
                        .setLabel('Delete Channel')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(!channels.length),

                    new ButtonBuilder()
                        .setCustomId(`spawn_back_${ownerId}`)
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                );

                return interaction.update({
                    embeds: [embed],
                    components: [row]
                });
            }

            // ===== SPAWN FIGHT BUTTON =====
            if (id.startsWith('spawn_fight_instance_')) {

                const spawnInstanceId = id.split('_')[3];

                const spawnInstance = await SpawnInstances.findByPk(spawnInstanceId);

                if (!spawnInstance || !spawnInstance.monster) {
                    return interaction.update({
                        content: "⚠ This monster has already disappeared.",
                        embeds: [],
                        components: [],
                        attachments: []
                    });
                }

                if (spawnInstance.occupiedBy)
                    return interaction.reply({ content: "This monster is already being fought.", flags: MessageFlags.Ephemeral });

                const profile = await Profiles.findOne({
                    where: { userId: interaction.user.id }
                });

                if (!profile)
                    return interaction.reply({ content: "You don't have a profile.", flags: MessageFlags.Ephemeral });

                const towerProgress = await FightProgress.findOne({
                    where: { profileId: profile.id }
                });

                const hasTowerCombat = towerProgress && towerProgress.currentMonsterHp !== null;
                if (profile.combatState || hasTowerCombat)
                    return interaction.reply({
                        content: "You are already in a combat. Finish it before starting another one.",
                        flags: MessageFlags.Ephemeral
                    });

                await progressTutorial(profile.id, 'used_wandering_fight');

                const playerStats = await calculatePlayerStats(profile);

                const userSkills = await UserSkills.findAll({
                    where: {
                        profileId: profile.id,
                        equippedSlot: { [Op.not]: null }
                    },
                    include: [{
                        model: Skills,
                        as: 'Skill',
                        where: {
                            effect_type_main: {
                                [Op.in]: ['Physical', 'Magic', 'Debuff', 'Buff']
                            }
                        }
                    }]
                });

                const playerSkills = userSkills.map(us => us.Skill);

                if (!playerSkills.length)
                    return interaction.reply({
                        content: "You can't fight without any equipped skills. Use /loadout equip first.",
                        flags: MessageFlags.Ephemeral
                    });

                // Atomic lock: only one user can claim this spawn instance.
                const [lockedRows] = await SpawnInstances.update(
                    { occupiedBy: profile.id },
                    { where: { id: spawnInstance.id, occupiedBy: null } }
                );

                if (!lockedRows) {
                    return interaction.reply({
                        content: "This monster is already being fought.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                profile.combatState = {
                    type: "spawn",
                    spawnInstanceId: spawnInstance.id,
                    timeoutAt: Date.now() + (3 * 60 * 1000),
                    hp: playerStats.hp,
                    mp: playerStats.mp,
                    stamina: playerStats.stamina,
                    vitalStamina: playerStats.vitalStamina,
                    skillXpSummary: null
                };
                await profile.save();
                const monster = spawnInstance.monster;

                const select = new StringSelectMenuBuilder()
                    .setCustomId(`attack_${profile.id}`)
                    .setPlaceholder('Choose a skill')
                    .addOptions(
                        userSkills.slice(0, 25).map(us => ({
                            label: us.Skill.name,
                            value: us.Skill.id.toString(),
                            description: buildSkillSelectDescription(
                                estimateSkillDamage(playerStats, monster, us.Skill, us.level),
                                us.Skill
                            )
                        }))
                    );

                const row = new ActionRowBuilder().addComponents(select);

                // 👇 On appelle directement la logique combat initiale
                const embed = new EmbedBuilder()
                    .setColor('#290003')
                    .setTitle(`⚔ Spawn Fight: ${interaction.user.username} vs ${monster.name}`)
                    .setDescription(
                        `👤 **${interaction.user.username}**\n` +
                        `❤️ HP: ${playerStats.hp}/${playerStats.hp}\n` +
                        `🔵 MP: ${playerStats.mp}/${playerStats.mp}\n` +
                        `🟨 Stamina: ${playerStats.stamina}/${playerStats.stamina}\n` +
                        `🟩 Vital Stamina: ${playerStats.vitalStamina}/${playerStats.vitalStamina}\n` +
                        `⚔️ Offense: ${playerStats.offense}\n` +
                        `🛡️ Defense: ${playerStats.defense}\n` +
                        `✨ Magic: ${playerStats.magic}\n` +
                        `🧿 Resistance: ${playerStats.resistance}\n` +
                        `💨 Speed: ${playerStats.speed}\n\n` +

                        `👹 **${monster.name} (${monster.rarity})**\n` +
                        `❤️ HP: ${monster.hp}/${monster.maxHp}\n` +
                        `🔵 MP: ${monster.mp}/${monster.maxMp}\n` +
                        `🟨 Stamina: ${monster.stamina}/${monster.maxStamina ?? monster.stamina}\n` +
                        `🟩 Vital Stamina: ${monster.vitalStamina}/${monster.maxVitalStamina ?? monster.vitalStamina}\n` +
                        `⚔️ Offense: ${monster.offense}\n` +
                        `🛡️ Defense: ${monster.defense}\n` +
                        `✨ Magic: ${monster.magic}\n` +
                        `🧿 Resistance: ${monster.resistance}\n` +
                        `💨 Speed: ${monster.speed}\n\n` +

                        `────────────────────────\nChoose your first move.`
                    );

                const playerImage = resolveImage(profile);
                const monsterImage = resolveMonsterImage(monster);
                if (playerImage) embed.setImage(`attachment://${playerImage.name}`);
                if (monsterImage) embed.setThumbnail(`attachment://${monsterImage.name}`);

                await interaction.deferUpdate();

                return interaction.channel.send({
                    embeds: [embed],
                    components: [row],
                    files: [
                        ...(playerImage ? [playerImage] : []),
                        ...(monsterImage ? [monsterImage] : [])
                    ]
                });
            }

            if (id.startsWith('spawn_fight_')) {
                return interaction.reply({
                    content: "This spawn interaction is outdated. Wait for new spawns.",
                    flags: MessageFlags.Ephemeral
                });
            }

            // ===== EDIT SPAWN CHANNEL BUTTON =====
            if (id.startsWith('spawn_edit_channel_')) {
                const ownerId = id.split('_')[3];

                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your panel.", flags: MessageFlags.Ephemeral });

                const config = await SpawnConfig.findOne({
                    where: { guildId: interaction.guild.id }
                });

                const channels = await SpawnChannels.findAll({
                    where: { guildId: interaction.guild.id },
                    order: [['id', 'ASC']]
                });

                if (!channels.length) {
                    return interaction.reply({
                        content: "No spawn channels to edit.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const channelList = channels
                    .map(c =>
                        `<#${c.channelId}> -> Monsters: ${Array.isArray(c.monsterIds) && c.monsterIds.length ? c.monsterIds.join(',') : 'legacy levels'} | Timer: ${c.baseTimer ?? config.baseTimer}s +/- ${c.variance ?? config.variance}s | XP x${c.xpMultiplier ?? 1}`
                    ).join('\n');

                const embed = new EmbedBuilder()
                    .setColor('#290003')
                    .setTitle('Edit Spawn Channel')
                    .setDescription(`Configured channels: **${channels.length}/${MAX_SPAWN_CHANNELS}**\nSelect one channel to edit.\n\n${channelList}`);

                const select = new StringSelectMenuBuilder()
                    .setCustomId(`spawn_edit_channel_select_${ownerId}`)
                    .setPlaceholder('Select a channel to edit')
                    .addOptions(
                        channels.slice(0, MAX_SPAWN_CHANNELS).map(c => ({
                            label: `Channel ${c.id} • ${c.channelId}`,
                            value: String(c.id),
                            description: `Monsters ${Array.isArray(c.monsterIds) ? c.monsterIds.length : 0} | XP x${c.xpMultiplier ?? 1}`
                        }))
                    );

                const selectRow = new ActionRowBuilder().addComponents(select);
                const backRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`spawn_channels_${ownerId}`)
                        .setLabel('Back')
                        .setStyle(ButtonStyle.Secondary)
                );

                return interaction.update({
                    embeds: [embed],
                    components: [selectRow, backRow]
                });
            }

            // ===== ADD SPAWN CHANNEL BUTTON =====
            if (id.startsWith('spawn_add_channel_')) {

                const ownerId = id.split('_')[3];

                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your panel.", flags: MessageFlags.Ephemeral });

                const modal = new ModalBuilder()
                    .setCustomId(`spawn_add_channel_modal_${ownerId}`)
                    .setTitle('Add Spawn Channel');

                const channelInput = new TextInputBuilder()
                    .setCustomId('channelId')
                    .setLabel('Channel ID')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const levelsInput = new TextInputBuilder()
                    .setCustomId('monsterIds')
                    .setLabel('Monster IDs (example: 1,5,8)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const baseTimerInput = new TextInputBuilder()
                    .setCustomId('baseTimer')
                    .setLabel('Channel timer seconds (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const varianceInput = new TextInputBuilder()
                    .setCustomId('variance')
                    .setLabel('Channel variance seconds (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const xpMultiplierInput = new TextInputBuilder()
                    .setCustomId('xpMultiplier')
                    .setLabel('XP multiplier (optional, e.g. 1.5)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(channelInput),
                    new ActionRowBuilder().addComponents(levelsInput),
                    new ActionRowBuilder().addComponents(baseTimerInput),
                    new ActionRowBuilder().addComponents(varianceInput),
                    new ActionRowBuilder().addComponents(xpMultiplierInput)
                );

                return interaction.showModal(modal);
            }

            // ===== DELETE SPAWN CHANNEL BUTTON =====
            if (id.startsWith('spawn_delete_channel_')) {

                const ownerId = id.split('_')[3];

                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your panel.", flags: MessageFlags.Ephemeral });

                const modal = new ModalBuilder()
                    .setCustomId(`spawn_delete_channel_modal_${ownerId}`)
                    .setTitle('Delete Spawn Channel');

                const channelInput = new TextInputBuilder()
                    .setCustomId('channelId')
                    .setLabel('Channel ID to delete')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(channelInput)
                );

                return interaction.showModal(modal);
            }

            // ===== BACK TO SPAWN MAIN PANEL =====
            if (id.startsWith('spawn_back_')) {

                const ownerId = id.split('_')[2];

                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your panel.", flags: MessageFlags.Ephemeral });

                const config = await SpawnConfig.findOne({
                    where: { guildId: interaction.guild.id }
                });

                const channels = await SpawnChannels.findAll({
                    where: { guildId: interaction.guild.id }
                });

                const { embed, row } = buildSpawnPanel(config, channels, ownerId);

                return interaction.update({
                    embeds: [embed],
                    components: [row]
                });
            }

            // ===== OTHER BUTTONS =====
            return routeButton(interaction, client);
        }

        // =========================
        // MODALS
        // =========================

        if (interaction.isModalSubmit()) {

            const id = interaction.customId;

            if (id.startsWith('spawn_timer_modal_')) {

                const ownerId = id.split('_')[3];

                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your modal.", flags: MessageFlags.Ephemeral });

                const base = parseInt(interaction.fields.getTextInputValue('base'));
                const variance = parseInt(interaction.fields.getTextInputValue('variance'));

                if (isNaN(base) || isNaN(variance))
                    return interaction.reply({ content: "Invalid numbers.", flags: MessageFlags.Ephemeral });

                const config = await SpawnConfig.findOne({
                    where: { guildId: interaction.guild.id }
                });

                config.baseTimer = base;
                config.variance = variance;
                await config.save();

                const channels = await SpawnChannels.findAll({
                    where: { guildId: interaction.guild.id }
                });

                const { embed, row } = buildSpawnPanel(config, channels, ownerId);

                return interaction.update({
                    embeds: [embed],
                    components: [row]
                });
            }

            if (id.startsWith('spawn_add_channel_modal_')) {

                const ownerId = id.split('_')[4];

                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your modal.", flags: MessageFlags.Ephemeral });

                const channelId = interaction.fields.getTextInputValue('channelId');
                const monsterIdsInput = interaction.fields.getTextInputValue('monsterIds');
                const baseTimerInput = interaction.fields.getTextInputValue('baseTimer')?.trim();
                const varianceInput = interaction.fields.getTextInputValue('variance')?.trim();
                const xpMultiplierInput = interaction.fields.getTextInputValue('xpMultiplier')?.trim();

                const existingCount = await SpawnChannels.count({
                    where: { guildId: interaction.guild.id }
                });

                if (existingCount >= MAX_SPAWN_CHANNELS) {
                    return interaction.reply({
                        content: `Maximum spawn channels reached (${MAX_SPAWN_CHANNELS}/${MAX_SPAWN_CHANNELS}).`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const monsterIds = monsterIdsInput.split(',')
                    .map(v => parseInt(v.trim(), 10))
                    .filter(v => !isNaN(v) && v > 0);

                if (!monsterIds.length)
                    return interaction.reply({ content: "Invalid monster IDs.", flags: MessageFlags.Ephemeral });

                const baseTimer = baseTimerInput ? parseInt(baseTimerInput, 10) : null;
                const variance = varianceInput ? parseInt(varianceInput, 10) : null;
                const xpMultiplier = xpMultiplierInput ? parseFloat(xpMultiplierInput) : null;

                if (baseTimerInput && (isNaN(baseTimer) || baseTimer < 10))
                    return interaction.reply({ content: "Channel timer must be >= 10.", flags: MessageFlags.Ephemeral });

                if (varianceInput && (isNaN(variance) || variance < 0))
                    return interaction.reply({ content: "Channel variance must be >= 0.", flags: MessageFlags.Ephemeral });

                if (xpMultiplierInput && (isNaN(xpMultiplier) || xpMultiplier <= 0))
                    return interaction.reply({ content: "XP multiplier must be > 0.", flags: MessageFlags.Ephemeral });

                await SpawnChannels.create({
                    guildId: interaction.guild.id,
                    channelId,
                    levels: [],
                    monsterIds,
                    baseTimer,
                    variance,
                    xpMultiplier
                });

                const config = await SpawnConfig.findOne({
                    where: { guildId: interaction.guild.id }
                });

                const channels = await SpawnChannels.findAll({
                    where: { guildId: interaction.guild.id }
                });

                const { embed, row } = buildSpawnPanel(config, channels, ownerId);

                return interaction.update({
                    embeds: [embed],
                    components: [row]
                });
            }

            if (id.startsWith('spawn_edit_channel_modal_')) {

                const ownerId = id.split('_')[4];
                const spawnChannelId = parseInt(id.split('_')[5], 10);

                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your modal.", flags: MessageFlags.Ephemeral });

                if (isNaN(spawnChannelId))
                    return interaction.reply({ content: "Invalid spawn channel.", flags: MessageFlags.Ephemeral });

                const spawnChannel = await SpawnChannels.findOne({
                    where: {
                        id: spawnChannelId,
                        guildId: interaction.guild.id
                    }
                });

                if (!spawnChannel)
                    return interaction.reply({ content: "Spawn channel not found.", flags: MessageFlags.Ephemeral });

                const monsterIdsInput = interaction.fields.getTextInputValue('monsterIds');
                const baseTimerInput = interaction.fields.getTextInputValue('baseTimer')?.trim();
                const varianceInput = interaction.fields.getTextInputValue('variance')?.trim();
                const xpMultiplierInput = interaction.fields.getTextInputValue('xpMultiplier')?.trim();

                const monsterIds = monsterIdsInput.split(',')
                    .map(v => parseInt(v.trim(), 10))
                    .filter(v => !isNaN(v) && v > 0);

                if (!monsterIds.length)
                    return interaction.reply({ content: "Invalid monster IDs.", flags: MessageFlags.Ephemeral });

                const baseTimer = baseTimerInput ? parseInt(baseTimerInput, 10) : null;
                const variance = varianceInput ? parseInt(varianceInput, 10) : null;
                const xpMultiplier = xpMultiplierInput ? parseFloat(xpMultiplierInput) : null;

                if (baseTimerInput && (isNaN(baseTimer) || baseTimer < 10))
                    return interaction.reply({ content: "Channel timer must be >= 10.", flags: MessageFlags.Ephemeral });

                if (varianceInput && (isNaN(variance) || variance < 0))
                    return interaction.reply({ content: "Channel variance must be >= 0.", flags: MessageFlags.Ephemeral });

                if (xpMultiplierInput && (isNaN(xpMultiplier) || xpMultiplier <= 0))
                    return interaction.reply({ content: "XP multiplier must be > 0.", flags: MessageFlags.Ephemeral });

                spawnChannel.monsterIds = monsterIds;
                spawnChannel.baseTimer = baseTimer;
                spawnChannel.variance = variance;
                spawnChannel.xpMultiplier = xpMultiplier;
                await spawnChannel.save();

                const config = await SpawnConfig.findOne({
                    where: { guildId: interaction.guild.id }
                });

                const channels = await SpawnChannels.findAll({
                    where: { guildId: interaction.guild.id }
                });

                const { embed, row } = buildSpawnPanel(config, channels, ownerId);

                return interaction.update({
                    embeds: [embed],
                    components: [row]
                });
            }

            if (id.startsWith('spawn_delete_channel_modal_')) {

                const ownerId = id.split('_')[4];

                if (interaction.user.id !== ownerId)
                    return interaction.reply({ content: "Not your modal.", flags: MessageFlags.Ephemeral });

                const channelId = interaction.fields.getTextInputValue('channelId').trim();

                const deleted = await SpawnChannels.destroy({
                    where: {
                        guildId: interaction.guild.id,
                        channelId
                    }
                });

                if (!deleted) {
                    return interaction.reply({
                        content: "No spawn channel found with this ID.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                const config = await SpawnConfig.findOne({
                    where: { guildId: interaction.guild.id }
                });

                const channels = await SpawnChannels.findAll({
                    where: { guildId: interaction.guild.id }
                });

                const { embed, row } = buildSpawnPanel(config, channels, ownerId);

                return interaction.update({
                    embeds: [embed],
                    components: [row]
                });
            }
        }
    }
};

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
        return 1;
    }

    const multiplier = 1 + (effectivePower * 0.1);
    const rawDamage = attackStat * multiplier;
    const reducedDamage = rawDamage * (100 / (100 + defenseStat));
    return Math.max(1, Math.floor(reducedDamage));
}

function buildSkillSelectDescription(damage, skill) {
    const parts = [`~DMG ${damage}`];
    const mpCost = Number(skill?.mp_cost) || 0;
    const spCost = Number(skill?.sp_cost) || 0;

    if (mpCost > 0) parts.push(`MP ${mpCost}`);
    if (spCost > 0) parts.push(`SP ${spCost}`);

    return parts.join(' | ');
}



