const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const { Profiles, UserTitles, Titles, UserSkills, Skills } = require('../../database.js');
const { EVOLUTION_TREE, formatRaceName, getMaxLevelForRace, getEvolutionRule } = require('../../utils/evolutionConfig');

const activeEvolutions = new Set();
const evolutionSessions = new Map();
const EVOLUTION_TIMEOUT_MS = 30_000;

function buildDisabledComponents(components = []) {
    return components.map(row => {
        const disabledRow = new ActionRowBuilder();
        row.components.forEach(component => {
            disabledRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
        });
        return disabledRow;
    });
}

function clearEvolutionLock(userId) {
    const session = evolutionSessions.get(userId);
    if (session?.timeout) {
        clearTimeout(session.timeout);
    }

    evolutionSessions.delete(userId);
    activeEvolutions.delete(userId);
}

async function expireEvolutionSession(userId) {
    const session = evolutionSessions.get(userId);
    if (!session) return;

    evolutionSessions.delete(userId);
    activeEvolutions.delete(userId);

    if (!session.channelId || !session.messageId || !session.client) return;

    try {
        const channel = await session.client.channels.fetch(session.channelId);
        if (!channel?.messages) return;

        const message = await channel.messages.fetch(session.messageId);
        if (!message) return;

        await message.edit({
            content: "You didn't decide in time. Use /evolution again.",
            components: buildDisabledComponents(message.components),
            embeds: []
        });
    } catch (error) {
        console.log(`Evolution timeout cleanup failed for ${userId}:`, error.message);
    }
}

function startEvolutionLock(userId, client) {
    clearEvolutionLock(userId);
    activeEvolutions.add(userId);

    const timeout = setTimeout(() => {
        void expireEvolutionSession(userId);
    }, EVOLUTION_TIMEOUT_MS);

    evolutionSessions.set(userId, {
        client,
        timeout,
        channelId: null,
        messageId: null
    });
}

function attachEvolutionMessage(userId, message) {
    const session = evolutionSessions.get(userId);
    if (!session) return;

    session.channelId = message.channelId;
    session.messageId = message.id;
}

function isEvolutionActive(userId) {
    return activeEvolutions.has(userId);
}

function normalizeName(value) {
    return String(value || '').toLowerCase().trim();
}

function evaluateEvolutionEligibility(rule, titleNameSet, skillLevelMap) {
    const requiredTitles = rule.requiredTitles || [];
    const requiredSkills = rule.requiredSkills || [];

    const missingTitles = requiredTitles.filter(title => !titleNameSet.has(normalizeName(title)));
    const missingSkills = requiredSkills.filter(req => {
        const current = skillLevelMap.get(normalizeName(req.name)) || 0;
        return current < (req.level || 1);
    });

    return {
        eligible: missingTitles.length === 0 && missingSkills.length === 0,
        missingTitles,
        missingSkills
    };
}

module.exports = {

    data: new SlashCommandBuilder()
        .setName('evolution')
        .setDescription('Evolve your race when you reach its max level.'),

    activeEvolutions,
    clearEvolutionLock,
    isEvolutionActive,

    async execute(interaction) {

        const userId = interaction.user.id;

        if (activeEvolutions.has(userId)) {
            return interaction.reply({
                content: "You are already evolving.",
                flags: MessageFlags.Ephemeral
            });
        }

        startEvolutionLock(userId, interaction.client);

        const profile = await Profiles.findOne({ where: { userId } });

        if (!profile) {
            clearEvolutionLock(userId);
            return interaction.reply({
                content: "Profile not found.",
                flags: MessageFlags.Ephemeral
            });
        }

        const maxLevel = getMaxLevelForRace(profile.race);
        const currentLevel = Number(profile.level) || 0;
        const currentRace = profile.race.toLowerCase().trim();

        if (currentLevel < maxLevel) {
            clearEvolutionLock(userId);
            return interaction.reply({
                content: `You must reach level ${maxLevel} to evolve. Current: ${currentLevel}/${maxLevel} (${formatRaceName(currentRace)}).`,
                flags: MessageFlags.Ephemeral
            });
        }

        const evolutions = EVOLUTION_TREE[currentRace];

        if (!evolutions) {
            clearEvolutionLock(userId);
            return interaction.reply({
                content: "You are already at your final evolution.",
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#290003')
            .setTitle("Choose Your Evolution")
            .setDescription("Select your next evolution:");

        const [ownedTitles, ownedSkills] = await Promise.all([
            UserTitles.findAll({
                where: { profileId: profile.id },
                include: [{ model: Titles, attributes: ['name'] }]
            }),
            UserSkills.findAll({
                where: { profileId: profile.id },
                include: [{ model: Skills, attributes: ['name'] }]
            })
        ]);

        const titleNameSet = new Set(
            ownedTitles
                .map(entry => normalizeName(entry.Title?.name))
                .filter(Boolean)
        );

        const skillLevelMap = new Map();
        for (const us of ownedSkills) {
            const name = normalizeName(us.Skill?.name);
            if (!name) continue;
            const current = skillLevelMap.get(name) || 0;
            skillLevelMap.set(name, Math.max(current, Number(us.level) || 1));
        }

        const statusLines = [];
        const row = new ActionRowBuilder();

        evolutions.forEach(raceKey => {
            const rule = getEvolutionRule(raceKey);
            const gate = evaluateEvolutionEligibility(rule, titleNameSet, skillLevelMap);

            const reasons = [];
            if (gate.missingTitles.length) {
                reasons.push(`titles: ${gate.missingTitles.join(', ')}`);
            }
            if (gate.missingSkills.length) {
                const missingSkills = gate.missingSkills
                    .map(s => `${s.name} Lv${s.level || 1}`)
                    .join(', ');
                reasons.push(`skills: ${missingSkills}`);
            }

            statusLines.push(
                gate.eligible
                    ? `✅ ${formatRaceName(raceKey)}`
                    : `🔒 ${formatRaceName(raceKey)} (${reasons.join(' | ')})`
            );

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`evo_preview_${userId}_${raceKey}`)
                    .setLabel(formatRaceName(raceKey))
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(!gate.eligible)
            );
        });

        if (statusLines.length) {
            embed.setDescription(
                `Select your next evolution:\n\n${statusLines.join('\n')}`
            );
        }

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
        const message = await interaction.fetchReply();

        attachEvolutionMessage(userId, message);
        return message;
    }
};
