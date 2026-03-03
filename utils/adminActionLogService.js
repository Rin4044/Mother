const { EmbedBuilder } = require('discord.js');
const { Op } = require('sequelize');
const { AdminActionLog, BotLogConfig } = require('../database');
const { applySanctionFromLog, LOCK_DURATION_MS } = require('./adminSanctionService');

const OWNER_USER_ID = process.env.BOT_OWNER_USER_ID || '1017124302048481330';
const BURST_WINDOW_MS = Number(process.env.ADMIN_ALERT_WINDOW_MS || 2 * 60 * 1000);
const BURST_THRESHOLD = Number(process.env.ADMIN_ALERT_THRESHOLD || 5);
const ALERT_COOLDOWN_MS = Number(process.env.ADMIN_ALERT_COOLDOWN_MS || 5 * 60 * 1000);
const alertCooldownByExecutor = new Map();

function trimText(value, max = 1024) {
    const text = String(value ?? '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function buildTargetText(targetUserId, targetLabel) {
    if (targetUserId && targetLabel) return `<@${targetUserId}> (${targetLabel})`;
    if (targetUserId) return `<@${targetUserId}>`;
    if (targetLabel) return trimText(targetLabel, 200);
    return 'n/a';
}

function classifyRisk(commandName, actionGroup, actionName, metadata = {}) {
    if (metadata.denied) return { score: 6, level: 'high' };

    const key = `${commandName}:${actionGroup}:${actionName}`.toLowerCase();
    const exactHigh = new Set([
        'resetdata:command:execute',
        'admin:currency:set',
        'admin:currency:remove',
        'admin:inventory:set',
        'admin:inventory:remove',
        'admin:skill:setlevel',
        'admin:skill:remove',
        'questboard:admin:force_reset',
        'questboard:admin:set_mix',
        'questboard:admin:set_refresh',
        'config:adminlog:set_channel'
    ]);

    const exactMedium = new Set([
        'admin:currency:add',
        'admin:inventory:add',
        'admin:skill:grant',
        'questboard:admin:reroll',
        'questboard:admin:preview',
        'admin:whitelist:add',
        'admin:whitelist:remove'
    ]);

    if (exactHigh.has(key)) return { score: 5, level: 'high' };
    if (exactMedium.has(key)) return { score: 3, level: 'medium' };
    return { score: 1, level: 'low' };
}

function buildAuditEmbed(log) {
    const actionPath = `/${log.commandName} ${log.actionGroup} ${log.actionName}`.trim();
    const reason = trimText(log.reason || 'No reason provided.', 1024);
    const changes = trimText(log.changes || 'n/a', 1024);
    const target = buildTargetText(log.targetUserId, log.targetLabel);
    const riskLevel = String(log.metadata?.riskLevel || 'low').toUpperCase();
    const riskScore = Number(log.metadata?.riskScore || 0);

    return new EmbedBuilder()
        .setColor(0x8e44ad)
        .setTitle(`Admin Action Log #${log.id}`)
        .addFields(
            { name: 'Action', value: actionPath, inline: true },
            { name: 'Executor', value: `<@${log.executorUserId}> (${trimText(log.executorTag || 'unknown', 80)})`, inline: true },
            { name: 'Target', value: target, inline: true },
            { name: 'Risk', value: `${riskLevel} (${riskScore})`, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { name: 'Changes', value: changes, inline: false }
        )
        .setTimestamp(log.createdAt || new Date());
}

async function getAdminLogChannel(interaction) {
    if (!interaction.guildId) return null;
    const config = await BotLogConfig.findOne({ where: { guildId: interaction.guildId } });
    const channelId = config?.adminLogChannelId;
    if (!channelId) return null;
    const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;
    return channel;
}

async function sendAuditEmbed(interaction, log) {
    try {
        const channel = await getAdminLogChannel(interaction);
        if (!channel) return;
        await channel.send({ embeds: [buildAuditEmbed(log)] });
    } catch (error) {
        console.error('Failed to send admin audit log:', error?.message || error);
    }
}

async function maybeSendBurstAlert(interaction, log) {
    try {
        const executorId = String(log.executorUserId || '');
        if (!executorId) return;

        const now = Date.now();
        const cooldownKey = `${log.guildId}:${executorId}`;
        const lastAlertAt = Number(alertCooldownByExecutor.get(cooldownKey) || 0);
        if ((now - lastAlertAt) < ALERT_COOLDOWN_MS) return { triggered: false, recentCount: 0 };

        const recentCount = await AdminActionLog.count({
            where: {
                guildId: log.guildId,
                executorUserId: executorId,
                createdAt: { [Op.gte]: new Date(now - BURST_WINDOW_MS) }
            }
        });

        if (recentCount < BURST_THRESHOLD) return { triggered: false, recentCount };

        const channel = await getAdminLogChannel(interaction);
        if (!channel) return;

        const topRisk = Number(log.metadata?.riskScore || 0);
        const embed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('Admin Security Alert')
            .setDescription(
                `Rapid admin activity detected for <@${executorId}>.\n` +
                `Count: **${recentCount}** actions in the last **${Math.floor(BURST_WINDOW_MS / 1000)}s**.\n` +
                `Latest log: #${log.id} | risk score ${topRisk}`
            )
            .addFields(
                { name: 'Executor', value: `<@${executorId}>`, inline: true },
                { name: 'Latest Action', value: `/${log.commandName} ${log.actionGroup} ${log.actionName}`, inline: true },
                { name: 'When', value: `<t:${Math.floor(now / 1000)}:F>`, inline: true }
            )
            .setTimestamp(new Date(now));

        await channel.send({
            content: `<@${OWNER_USER_ID}>`,
            embeds: [embed]
        });

        alertCooldownByExecutor.set(cooldownKey, now);
        return { triggered: true, recentCount };
    } catch (error) {
        console.error('Failed to send admin security alert:', error?.message || error);
        return { triggered: false, recentCount: 0 };
    }
}

async function maybeSendSanctionAlert(interaction, log, sanctionResult) {
    try {
        if (!sanctionResult?.applied) return;
        const outcome = String(sanctionResult.outcome || '');
        if (!['warn', 'locked'].includes(outcome)) return;

        // Prevent owner spam: only notify on threshold crossing.
        const shouldNotify = outcome === 'locked'
            ? Boolean(sanctionResult.crossedLock)
            : Boolean(sanctionResult.crossedWarn);
        if (!shouldNotify) return;

        const channel = await getAdminLogChannel(interaction);
        if (!channel) return;

        const isLock = outcome === 'locked';
        const embed = new EmbedBuilder()
            .setColor(isLock ? 0xc0392b : 0xf39c12)
            .setTitle(isLock ? 'Admin Sanction Applied: LOCK' : 'Admin Sanction Warning')
            .setDescription(
                isLock
                    ? `Admin <@${log.executorUserId}> has been auto-locked from sensitive commands.`
                    : `Admin <@${log.executorUserId}> crossed warning threshold.`
            )
            .addFields(
                { name: 'User', value: `<@${log.executorUserId}>`, inline: true },
                { name: 'Points', value: String(sanctionResult.points), inline: true },
                { name: 'Total Strikes', value: String(sanctionResult.totalStrikes), inline: true },
                {
                    name: 'Lock Until',
                    value: isLock
                        ? `<t:${Math.floor((Number(sanctionResult.lockedUntil) || (Date.now() + LOCK_DURATION_MS)) / 1000)}:F>`
                        : 'n/a',
                    inline: true
                },
                {
                    name: 'Trigger',
                    value: `Log #${log.id} - /${log.commandName} ${log.actionGroup} ${log.actionName}`,
                    inline: false
                }
            )
            .setTimestamp(new Date());

        await channel.send({
            content: `<@${OWNER_USER_ID}>`,
            embeds: [embed]
        });
    } catch (error) {
        console.error('Failed to send sanction alert:', error?.message || error);
    }
}

async function recordAdminAction(interaction, payload = {}) {
    if (!interaction?.guildId) return null;

    try {
        const commandName = String(payload.commandName || 'admin');
        const actionGroup = String(payload.actionGroup || 'unknown');
        const actionName = String(payload.actionName || 'unknown');
        const baseMetadata = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
        const risk = classifyRisk(commandName, actionGroup, actionName, baseMetadata);

        const metadata = {
            ...baseMetadata,
            riskScore: risk.score,
            riskLevel: risk.level,
            actionKey: `${commandName}:${actionGroup}:${actionName}`.toLowerCase()
        };

        const log = await AdminActionLog.create({
            guildId: interaction.guildId,
            commandName,
            actionGroup,
            actionName,
            executorUserId: String(interaction.user?.id || payload.executorUserId || ''),
            executorTag: String(interaction.user?.tag || payload.executorTag || 'unknown'),
            targetUserId: payload.targetUserId ? String(payload.targetUserId) : null,
            targetLabel: payload.targetLabel ? String(payload.targetLabel) : null,
            reason: payload.reason ? String(payload.reason) : null,
            changes: payload.changes ? String(payload.changes) : null,
            metadata
        });

        await sendAuditEmbed(interaction, log);
        const burstInfo = await maybeSendBurstAlert(interaction, log);
        if (burstInfo?.triggered) {
            log.metadata = { ...(log.metadata || {}), burstTriggered: true, burstCount: burstInfo.recentCount };
            await log.save().catch(() => {});
        }
        const sanctionResult = await applySanctionFromLog(log);
        await maybeSendSanctionAlert(interaction, log, sanctionResult);
        return log;
    } catch (error) {
        console.error('Failed to record admin action log:', error?.message || error);
        return null;
    }
}

module.exports = {
    recordAdminAction
};
