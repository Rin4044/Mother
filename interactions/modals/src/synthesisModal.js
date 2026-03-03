const { MessageFlags } = require('discord.js');
const synthesisService = require('../../../utils/synthesisService');
const { buildSynthesisEmbed, buildSynthesisButtons } = require('../../../utils/synthesisUi');
const { formatCoreItemLabel } = require('../../../utils/coreEmoji');

async function handleSynthesisModal(interaction) {
    const parts = String(interaction.customId || '').split('_');
    const kind = parts[2];
    const definition = synthesisService.getSynthesisDefinition(kind);
    if (!definition) {
        return interaction.reply({
            content: 'Unknown synthesis type.',
            flags: MessageFlags.Ephemeral
        });
    }

    const profile = await synthesisService.getProfileByUserId(interaction.user.id);
    if (!profile) {
        return interaction.reply({
            content: 'You are not registered. Use /start.',
            flags: MessageFlags.Ephemeral
        });
    }

    const rawQty = interaction.fields.getTextInputValue('quantity');
    const quantity = parseInt(String(rawQty || '').trim(), 10);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > synthesisService.MAX_SYNTHESIS_QTY_PER_JOB) {
        return interaction.reply({
            content: `Quantity must be between 1 and ${synthesisService.MAX_SYNTHESIS_QTY_PER_JOB}.`,
            flags: MessageFlags.Ephemeral
        });
    }

    const collected = await synthesisService.settleCompletedSynthesisJobs(profile.id);
    const started = await synthesisService.startSynthesisJob({
        profileId: profile.id,
        kind,
        quantity
    });

    if (!started.ok) {
        if (started.reason === 'MISSING_SKILL') {
            return interaction.reply({
                content: `You cannot synthesize this yet. You need **${definition.requiredSkillName}**.`,
                flags: MessageFlags.Ephemeral
            });
        }
        if (started.reason === 'QUEUE_FULL') {
            return interaction.reply({
                content: `Synthesis queue is full (${synthesisService.MAX_SYNTHESIS_JOBS}/${synthesisService.MAX_SYNTHESIS_JOBS}). Wait for a job to complete.`,
                flags: MessageFlags.Ephemeral
            });
        }
        return interaction.reply({
            content: 'Could not start synthesis right now.',
            flags: MessageFlags.Ephemeral
        });
    }

    const perItemText = synthesisService.formatDuration(started.perItemMs);
    const totalText = synthesisService.formatDuration(Math.max(0, Number(started.totalMs) || 0));
    const waitText = synthesisService.formatDuration(Math.max(0, Number(started.waitMs) || 0));
    const craftText = synthesisService.formatDuration(Math.max(0, Number(started.craftMs) || 0));
    const readyUnix = Math.max(0, Math.floor((Number(started.job?.endsAt) || 0) / 1000));
    const collectedText = collected.length
        ? `\nCollected completed jobs:\n${collected.map((x) => `- ${formatCoreItemLabel(x.itemName)} x${x.quantity}`).join('\n')}`
        : '';
    const panel = await synthesisService.buildSynthesisPanel(profile.id);
    const embed = buildSynthesisEmbed(profile.name, panel, collected);
    const components = buildSynthesisButtons(panel.entries);
    const startMessage =
        `Synthesis started: **${formatCoreItemLabel(started.definition.itemName)} x${started.job.quantity}**` +
        `\nTime per item: ${perItemText}` +
        `\nEstimated ready in: ${totalText}` +
        `\nReady timestamp: <t:${readyUnix}:R> (at <t:${readyUnix}:t>)` +
        `\nQueue wait: ${waitText}` +
        `\nCraft time: ${craftText}` +
        `\nSkill XP gained: +${started.gainedXp}` +
        (started.xpProgress?.level ? ` (Lv ${started.xpProgress.level})` : '') +
        `${collectedText}`;

    try {
        await interaction.update({
            embeds: [embed],
            components
        });
    } catch (error) {
        return interaction.reply({
            content: startMessage,
            flags: MessageFlags.Ephemeral
        });
    }

    return interaction.followUp({
        content: startMessage,
        flags: MessageFlags.Ephemeral
    });
}

module.exports = { handleSynthesisModal };
