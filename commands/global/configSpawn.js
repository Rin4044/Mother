const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, MessageFlags } = require('discord.js');

const { SpawnConfig, SpawnChannels } = require('../../database');
const MAX_SPAWN_CHANNELS = 25;

function buildSpawnPanel(config, channels, ownerId) {
    const channelList = channels.length
        ? channels.map((c) =>
            `<#${c.channelId}> -> Monsters: ${Array.isArray(c.monsterIds) && c.monsterIds.length ? c.monsterIds.join(',') : 'legacy levels'} | Timer: ${c.baseTimer ?? config.baseTimer}s +/- ${c.variance ?? config.variance}s | XP x${c.xpMultiplier ?? 1}`
        ).join('\n')
        : 'No spawn channels configured.';

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle('Monster Spawn Configuration')
        .setDescription(
            `**Status:** ${config.enabled ? 'ON' : 'OFF'}\n` +
            `**Default Timer:** ${config.baseTimer}s\n` +
            `**Default Variance:** ${config.variance}s\n` +
            `**Channels:** ${channels.length}/${MAX_SPAWN_CHANNELS}\n` +
            `(each channel can override timer)\n\n` +
            `**Spawn Channels:**\n${channelList}`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`spawn_toggle_${ownerId}`)
            .setLabel(config.enabled ? 'ON' : 'OFF')
            .setStyle(config.enabled ? ButtonStyle.Success : ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`spawn_timer_${ownerId}`)
            .setLabel('Set Default Timer')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`spawn_channels_${ownerId}`)
            .setLabel('Manage Channels')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embed, row };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Admin configuration')
        .addSubcommand((sub) =>
            sub.setName('spawnmonster')
                .setDescription('Open monster spawn configuration panel')
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Admin only.', flags: MessageFlags.Ephemeral });
        }

        let config = await SpawnConfig.findOne({
            where: { guildId: interaction.guild.id }
        });

        if (!config) {
            config = await SpawnConfig.create({
                guildId: interaction.guild.id,
                enabled: false,
                baseTimer: 300,
                variance: 60
            });
        }

        const channels = await SpawnChannels.findAll({
            where: { guildId: interaction.guild.id }
        });

        const { embed, row } = buildSpawnPanel(config, channels, interaction.user.id);

        return interaction.reply({
            embeds: [embed],
            components: [row],
            flags: MessageFlags.Ephemeral
        });
    }
};

module.exports.buildSpawnPanel = buildSpawnPanel;
