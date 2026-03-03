const {
    SlashCommandBuilder,
    MessageFlags,
    PermissionFlagsBits,
    EmbedBuilder,
    AttachmentBuilder
} = require('discord.js');
const { Op } = require('sequelize');
const { AdminActionLog } = require('../../database');
const { assertWhitelistedAdmin } = require('../../utils/adminAccessService');

function truncate(value, max = 180) {
    const text = String(value ?? '');
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function buildActionPath(row) {
    return `/${row.commandName} ${row.actionGroup} ${row.actionName}`.trim();
}

function csvCell(value) {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adminlog')
        .setDescription('Search or view admin action logs.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand((sub) =>
            sub
                .setName('show')
                .setDescription('Show one admin action log by ID.')
                .addIntegerOption((o) =>
                    o
                        .setName('log_id')
                        .setDescription('Admin log ID')
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('search')
                .setDescription('Search recent admin action logs in this guild.')
                .addUserOption((o) =>
                    o
                        .setName('executor')
                        .setDescription('Filter by executor user')
                        .setRequired(false)
                )
                .addUserOption((o) =>
                    o
                        .setName('target')
                        .setDescription('Filter by target user')
                        .setRequired(false)
                )
                .addStringOption((o) =>
                    o
                        .setName('command')
                        .setDescription('Filter by command name, e.g. admin, questboard')
                        .setRequired(false)
                        .setMaxLength(40)
                )
                .addStringOption((o) =>
                    o
                        .setName('group')
                        .setDescription('Filter by action group, e.g. skill, currency, admin')
                        .setRequired(false)
                        .setMaxLength(40)
                )
                .addStringOption((o) =>
                    o
                        .setName('action')
                        .setDescription('Filter by action name, e.g. add, set_mix')
                        .setRequired(false)
                        .setMaxLength(40)
                )
                .addStringOption((o) =>
                    o
                        .setName('contains')
                        .setDescription('Text search in reason/changes')
                        .setRequired(false)
                        .setMaxLength(100)
                )
                .addIntegerOption((o) =>
                    o
                        .setName('limit')
                        .setDescription('Result count (1-20)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(20)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('export')
                .setDescription('Export recent admin logs as CSV.')
                .addIntegerOption((o) =>
                    o
                        .setName('limit')
                        .setDescription('Rows to export (100-1000)')
                        .setRequired(false)
                        .setMinValue(100)
                        .setMaxValue(1000)
                )
                .addUserOption((o) =>
                    o
                        .setName('executor')
                        .setDescription('Filter by executor user')
                        .setRequired(false)
                )
                .addUserOption((o) =>
                    o
                        .setName('target')
                        .setDescription('Filter by target user')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'Administrator permission required.',
                flags: MessageFlags.Ephemeral
            });
        }

        const allowed = await assertWhitelistedAdmin(interaction, {
            logDenied: true,
            commandName: 'adminlog',
            actionGroup: 'logs',
            actionName: interaction.options.getSubcommand(true)
        });
        if (!allowed) return;

        if (!interaction.guildId) {
            return interaction.reply({
                content: 'This command can only be used in a server.',
                flags: MessageFlags.Ephemeral
            });
        }

        const sub = interaction.options.getSubcommand(true);
        if (sub === 'show') {
            const logId = interaction.options.getInteger('log_id', true);
            const row = await AdminActionLog.findOne({
                where: { id: logId, guildId: interaction.guildId }
            });

            if (!row) {
                return interaction.reply({
                    content: `No admin action log found with ID #${logId} in this server.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x8e44ad)
                .setTitle(`Admin Action Log #${row.id}`)
                .addFields(
                    { name: 'Action', value: buildActionPath(row), inline: true },
                    { name: 'Executor', value: `<@${row.executorUserId}> (${truncate(row.executorTag || 'unknown', 80)})`, inline: true },
                    { name: 'Target', value: row.targetUserId ? `<@${row.targetUserId}>` : (row.targetLabel || 'n/a'), inline: true },
                    { name: 'Risk', value: `${String(row.metadata?.riskLevel || 'low').toUpperCase()} (${Number(row.metadata?.riskScore || 0)})`, inline: true },
                    { name: 'Reason', value: truncate(row.reason || 'No reason provided.', 1024), inline: false },
                    { name: 'Changes', value: truncate(row.changes || 'n/a', 1024), inline: false }
                )
                .setFooter({ text: `Created` })
                .setTimestamp(row.createdAt || new Date());

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === 'export') {
            const where = { guildId: interaction.guildId };
            const executor = interaction.options.getUser('executor', false);
            const target = interaction.options.getUser('target', false);
            const limit = Number(interaction.options.getInteger('limit', false) || 200);
            if (executor) where.executorUserId = executor.id;
            if (target) where.targetUserId = target.id;

            const rows = await AdminActionLog.findAll({
                where,
                order: [['id', 'DESC']],
                limit: Math.min(1000, Math.max(100, limit))
            });

            if (!rows.length) {
                return interaction.reply({
                    content: 'No admin action logs matched your export filters.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const header = [
                'id',
                'created_at',
                'command',
                'group',
                'action',
                'executor_user_id',
                'executor_tag',
                'target_user_id',
                'target_label',
                'reason',
                'changes',
                'risk_level',
                'risk_score'
            ];
            const lines = [header.join(',')];

            for (const row of rows) {
                lines.push([
                    row.id,
                    row.createdAt ? new Date(row.createdAt).toISOString() : '',
                    row.commandName,
                    row.actionGroup,
                    row.actionName,
                    row.executorUserId,
                    row.executorTag || '',
                    row.targetUserId || '',
                    row.targetLabel || '',
                    row.reason || '',
                    row.changes || '',
                    row.metadata?.riskLevel || '',
                    row.metadata?.riskScore ?? ''
                ].map(csvCell).join(','));
            }

            const csv = lines.join('\n');
            const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), {
                name: `adminlog_export_${interaction.guildId}_${Date.now()}.csv`
            });

            return interaction.reply({
                content: `Export ready: ${rows.length} row(s).`,
                files: [file],
                flags: MessageFlags.Ephemeral
            });
        }

        const where = { guildId: interaction.guildId };
        const executor = interaction.options.getUser('executor', false);
        const target = interaction.options.getUser('target', false);
        const commandName = String(interaction.options.getString('command', false) || '').trim().toLowerCase();
        const actionGroup = String(interaction.options.getString('group', false) || '').trim().toLowerCase();
        const actionName = String(interaction.options.getString('action', false) || '').trim().toLowerCase();
        const contains = String(interaction.options.getString('contains', false) || '').trim();
        const limit = Number(interaction.options.getInteger('limit', false) || 10);

        if (executor) where.executorUserId = executor.id;
        if (target) where.targetUserId = target.id;
        if (commandName) where.commandName = commandName;
        if (actionGroup) where.actionGroup = actionGroup;
        if (actionName) where.actionName = actionName;
        if (contains) {
            where[Op.or] = [
                { reason: { [Op.iLike]: `%${contains}%` } },
                { changes: { [Op.iLike]: `%${contains}%` } }
            ];
        }

        const rows = await AdminActionLog.findAll({
            where,
            order: [['id', 'DESC']],
            limit: Math.min(20, Math.max(1, limit))
        });

        if (!rows.length) {
            return interaction.reply({
                content: 'No admin action logs matched your filters.',
                flags: MessageFlags.Ephemeral
            });
        }

        const lines = rows.map((row) => {
            const at = Math.floor(new Date(row.createdAt || Date.now()).getTime() / 1000);
            const executorText = row.executorUserId ? `<@${row.executorUserId}>` : 'unknown';
            const targetText = row.targetUserId ? `<@${row.targetUserId}>` : (row.targetLabel ? truncate(row.targetLabel, 40) : 'n/a');
            const risk = `${String(row.metadata?.riskLevel || 'low').toUpperCase()}(${Number(row.metadata?.riskScore || 0)})`;
            return `#${row.id} - <t:${at}:f>\n${buildActionPath(row)} | ${risk} | by ${executorText} | target ${targetText}\nReason: ${truncate(row.reason || 'No reason', 120)}`;
        });

        const embed = new EmbedBuilder()
            .setColor(0x8e44ad)
            .setTitle(`Admin Logs (${rows.length} result${rows.length > 1 ? 's' : ''})`)
            .setDescription(lines.join('\n\n').slice(0, 4096))
            .setFooter({ text: 'Use /adminlog show log_id:<id> for full details.' })
            .setTimestamp(new Date());

        return interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    }
};

