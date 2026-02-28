const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, MessageFlags, ChannelType } = require('discord.js');

const { SpawnConfig, SpawnChannels, BotLogConfig } = require('../../database');
const { updateGuildStatus } = require('../../utils/botLogService');
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
        )
        .addSubcommand((sub) =>
            sub.setName('log')
                .setDescription('Configure bot status/crash logs')
                .addChannelOption((option) =>
                    option
                        .setName('status_channel')
                        .setDescription('Channel that will keep the live bot status embed')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
                .addChannelOption((option) =>
                    option
                        .setName('crash_channel')
                        .setDescription('Channel that receives crash reports (optional)')
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Admin only.', flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'log') {
            const statusChannel = interaction.options.getChannel('status_channel', true);
            const crashChannel = interaction.options.getChannel('crash_channel', false) || statusChannel;

            if (!statusChannel?.isTextBased()) {
                return interaction.reply({
                    content: 'Status channel must be a text channel.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!crashChannel?.isTextBased()) {
                return interaction.reply({
                    content: 'Crash channel must be a text channel.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const me = interaction.guild.members.me;
            const statusPerms = statusChannel.permissionsFor(me);
            const crashPerms = crashChannel.permissionsFor(me);

            if (!statusPerms?.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
                return interaction.reply({
                    content: 'I need `Send Messages` and `Embed Links` permissions in the status channel.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (!crashPerms?.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks])) {
                return interaction.reply({
                    content: 'I need `Send Messages` and `Embed Links` permissions in the crash channel.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const [config] = await BotLogConfig.findOrCreate({
                where: { guildId: interaction.guild.id },
                defaults: {
                    guildId: interaction.guild.id,
                    statusChannelId: statusChannel.id,
                    crashChannelId: crashChannel.id,
                    statusMessageId: null
                }
            });

            const statusChannelChanged = config.statusChannelId !== statusChannel.id;
            config.statusChannelId = statusChannel.id;
            config.crashChannelId = crashChannel.id;
            if (statusChannelChanged) {
                config.statusMessageId = null;
            }
            await config.save();

            const currentState = interaction.client.isReady() ? 'online' : 'starting';
            const statusInitialized = await updateGuildStatus(
                interaction.client,
                interaction.guild.id,
                currentState,
                `Configured by ${interaction.user.tag}`
            ).catch((error) => {
                console.error(`Failed to initialize status embed for guild ${interaction.guild.id}:`, error?.message || error);
                return false;
            });

            return interaction.reply({
                content:
                    `Log configuration updated.\n` +
                    `Status channel: <#${statusChannel.id}>\n` +
                    `Crash channel: <#${crashChannel.id}>\n` +
                    `Status embed: ${statusInitialized ? 'ready' : 'failed to post (check channel access)'}`,
                flags: MessageFlags.Ephemeral
            });
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
