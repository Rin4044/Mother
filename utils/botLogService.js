const { EmbedBuilder } = require('discord.js');
const { Op } = require('sequelize');
const { BotLogConfig } = require('../database');

const STATUS_STYLE = {
    online: { label: 'Online', emoji: '🟢', color: 0x2ecc71 },
    offline: { label: 'Offline', emoji: '🔴', color: 0xe74c3c },
    restarting: { label: 'Restarting', emoji: '🟠', color: 0xf39c12 },
    starting: { label: 'Starting', emoji: '🔵', color: 0x3498db }
};

function truncate(value, maxLength) {
    const text = String(value ?? '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function buildStatusEmbed(client, statusKey, reason = null) {
    const style = STATUS_STYLE[statusKey] || STATUS_STYLE.offline;
    const memory = process.memoryUsage();
    const uptimeMs = process.uptime() * 1000;
    const wsPing = client.ws?.ping;
    const guildCount = client.guilds?.cache?.size ?? 0;

    const embed = new EmbedBuilder()
        .setColor(style.color)
        .setTitle(`${style.emoji} Mother Bot Status`)
        .setDescription(reason ? truncate(reason, 512) : 'No extra details.')
        .addFields(
            { name: 'State', value: `${style.emoji} ${style.label}`, inline: true },
            { name: 'Guilds', value: String(guildCount), inline: true },
            { name: 'Latency', value: Number.isFinite(wsPing) ? `${Math.round(wsPing)}ms` : 'n/a', inline: true },
            { name: 'Uptime', value: `<t:${Math.floor((Date.now() - uptimeMs) / 1000)}:R>`, inline: true },
            { name: 'Memory (RSS)', value: `${Math.round(memory.rss / 1024 / 1024)} MB`, inline: true },
            { name: 'Node', value: process.version, inline: true }
        )
        .setTimestamp(new Date());

    if (client.user) {
        embed.setFooter({ text: `${client.user.tag} (${client.user.id})` });
    }

    return embed;
}

function buildCrashEmbed(error, context = 'unknown') {
    const errName = truncate(error?.name || 'Error', 100);
    const errMessage = truncate(error?.message || String(error), 1000);
    const stack = truncate(error?.stack || 'No stack trace available.', 950);

    return new EmbedBuilder()
        .setColor(0xc0392b)
        .setTitle('💥 Bot Crash Report')
        .setDescription(`Context: \`${truncate(context, 200)}\``)
        .addFields(
            { name: 'Error', value: `\`${errName}\`` },
            { name: 'Message', value: `\`\`\`${errMessage}\`\`\`` },
            { name: 'Stack', value: `\`\`\`${stack}\`\`\`` }
        )
        .setTimestamp(new Date());
}

async function upsertGuildStatusMessage(client, config, status, reason = null) {
    if (!config?.statusChannelId) return false;

    const channel = await client.channels.fetch(config.statusChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    const embed = buildStatusEmbed(client, status, reason);
    let message = null;

    if (config.statusMessageId) {
        message = await channel.messages.fetch(config.statusMessageId).catch(() => null);
    }

    if (message) {
        await message.edit({ embeds: [embed] });
        return true;
    }

    const created = await channel.send({ embeds: [embed] });
    config.statusMessageId = created.id;
    await config.save();
    return true;
}

async function updateGuildStatus(client, guildId, status, reason = null) {
    const config = await BotLogConfig.findOne({ where: { guildId } });
    if (!config) return false;

    return upsertGuildStatusMessage(client, config, status, reason);
}

async function updateAllGuildStatuses(client, status, reason = null) {
    const configs = await BotLogConfig.findAll({
        where: { statusChannelId: { [Op.ne]: null } }
    });

    for (const config of configs) {
        try {
            await upsertGuildStatusMessage(client, config, status, reason);
        } catch (error) {
            console.error(`Failed to update status message for guild ${config.guildId}:`, error?.message || error);
        }
    }
}

async function sendCrashReport(client, error, context = 'unknown') {
    const configs = await BotLogConfig.findAll({
        where: { crashChannelId: { [Op.ne]: null } }
    });

    if (!configs.length) return;

    const embed = buildCrashEmbed(error, context);

    for (const config of configs) {
        try {
            const channel = await client.channels.fetch(config.crashChannelId).catch(() => null);
            if (!channel || !channel.isTextBased()) continue;
            await channel.send({ embeds: [embed] });
        } catch (sendError) {
            console.error(`Failed to send crash report for guild ${config.guildId}:`, sendError?.message || sendError);
        }
    }
}

module.exports = {
    updateGuildStatus,
    updateAllGuildStatuses,
    sendCrashReport
};
