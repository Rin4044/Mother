const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const synthesisService = require('./synthesisService');
const { formatCoreItemLabel } = require('./coreEmoji');

function buildSynthesisButtons(entries) {
    const row = new ActionRowBuilder();
    for (const entry of entries || []) {
        const label = entry.definition.key === 'heal' ? 'Heal Synthesis' : 'Poison Synthesis';
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`synthesis_btn_${entry.definition.key}`)
                .setLabel(label)
                .setStyle(ButtonStyle.Primary)
        );
    }
    return [row];
}

function buildSynthesisEmbed(profileName, panel, collected = []) {
    const queueCount = Math.max(0, Number(panel?.queueCount) || 0);
    const queueMax = Math.max(1, Number(panel?.queueMax) || 3);
    const lines = [];

    for (const entry of panel?.entries || []) {
        lines.push(
            `**${entry.definition.label}**` +
            `\nRequires: ${entry.definition.requiredSkillName}` +
            `\nStatus: ${entry.unlocked ? `Unlocked (Lv ${entry.skillLevel})` : 'Locked'}` +
            `\nTime per item: ${synthesisService.formatDuration(entry.perItemMs)}`
        );
        lines.push('');
    }

    const collectedText = collected.length
        ? collected.map((x) => `- ${formatCoreItemLabel(x.itemName)} x${x.quantity}`).join('\n')
        : 'none';

    const queueLines = (panel?.queueJobs || []).length
        ? panel.queueJobs.map((job) => {
            const unix = Math.max(0, Math.floor((Number(job.endsAt) || 0) / 1000));
            return `- ${formatCoreItemLabel(job.itemName)} x${job.quantity} (ready <t:${unix}:R> at <t:${unix}:t>)`;
        })
        : (panel?.queueLines || ['- none']);

    return new EmbedBuilder()
        .setColor('#1f1f23')
        .setTitle(`${profileName} - Synthesis ${queueCount}/${queueMax}`)
        .setDescription(
            `${lines.join('\n').trim()}\n\n` +
            `**Queue ${queueCount}/${queueMax}**\n${queueLines.join('\n')}\n\n` +
            `**Collected now**\n${collectedText}`
        )
        .setFooter({ text: 'Click a synthesis type to start crafting.' });
}

module.exports = {
    buildSynthesisButtons,
    buildSynthesisEmbed
};
