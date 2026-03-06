const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');

const { Profiles, UserTitles, Titles, UserSkills, Skills } = require('../../database.js');
const { EVOLUTION_TREE, formatRaceName, getMaxLevelForRace, getEvolutionRule } = require('../../utils/evolutionConfig');

const activeEvolutions = new Set();
const evolutionSessions = new Map();
const EVOLUTION_TIMEOUT_MS = 30_000;
const SKILL_REQUIREMENT_ALIASES = {
    resistance: ['Resistance', 'Magic Resistance', 'Heresy Resistance']
};

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

function canonicalizeRequiredSkillName(raceKey, skillName) {
    const race = normalizeName(String(raceKey || '').replace(/_/g, ' '));
    const name = String(skillName || '').trim();
    if (!name) return name;
    if (normalizeName(name) === 'resistance' && race.includes('spirit')) {
        return 'Magic Resistance';
    }
    return name;
}

function formatRequirementLabel(raceKey, req) {
    const name = canonicalizeRequiredSkillName(raceKey, req?.name);
    const level = req?.level || 1;
    return `${name} Lv${level}`;
}

function evaluateEvolutionEligibility(raceKey, rule, titleNameSet, skillLevelMap) {
    const requiredTitles = rule.requiredTitles || [];
    const requiredSkills = (rule.requiredSkills || []).map((req) => ({
        ...req,
        name: canonicalizeRequiredSkillName(raceKey, req?.name)
    }));

    const missingTitles = requiredTitles.filter(title => !titleNameSet.has(normalizeName(title)));
    const missingSkills = requiredSkills.filter(req => {
        const current = getBestSkillLevelForRequirement(skillLevelMap, req.name);
        return current < (req.level || 1);
    });

    return {
        eligible: missingTitles.length === 0 && missingSkills.length === 0,
        missingTitles,
        missingSkills
    };
}

function getRequiredSkillAliases(skillName) {
    const raw = String(skillName || '').trim();
    if (!raw) return [];
    const normalized = normalizeName(raw);
    const aliases = SKILL_REQUIREMENT_ALIASES[normalized] || [];
    return Array.from(new Set([raw, ...aliases]));
}

function getBestSkillLevelForRequirement(skillLevelMap, skillName) {
    const aliases = getRequiredSkillAliases(skillName);
    let best = 0;
    for (const alias of aliases) {
        const level = Number(skillLevelMap.get(normalizeName(alias)) || 0);
        if (level > best) best = level;
    }
    return best;
}

async function syncCurrentRaceGrantedSkills(profile) {
    if (!profile?.id || !profile?.race) return;

    const raceKey = String(profile.race).toLowerCase().trim().replace(/\s+/g, '_');
    const rewards = getEvolutionRule(raceKey)?.grantedSkills || [];
    if (!rewards.length) return;

    const wantedNames = new Set();
    const rewardCandidates = rewards.map((reward) => {
        const aliases = getRequiredSkillAliases(reward?.name);
        aliases.forEach((name) => wantedNames.add(normalizeName(name)));
        return {
            reward,
            aliases: aliases.map((name) => normalizeName(name)).filter(Boolean)
        };
    });

    if (!wantedNames.size) return;

    const skillRows = await Skills.findAll({
        where: {
            [Op.or]: [...wantedNames].map((name) => ({
                [Op.and]: [
                    {
                        name: {
                            [Op.iLike]: name
                        }
                    }
                ]
            }))
        }
    });

    const byName = new Map(skillRows.map((row) => [normalizeName(row.name), row]));

    for (const entry of rewardCandidates) {
        const targetLevel = Math.max(1, Number(entry.reward?.level) || 1);
        const targetSkill = entry.aliases.map((name) => byName.get(name)).find(Boolean);
        if (!targetSkill?.id) continue;

        const existing = await UserSkills.findOne({
            where: { profileId: profile.id, skillId: targetSkill.id }
        });
        if (!existing) {
            await UserSkills.create({
                profileId: profile.id,
                skillId: targetSkill.id,
                level: targetLevel,
                xp: 0
            });
            continue;
        }

        if ((existing.level || 1) < targetLevel) {
            await existing.update({ level: targetLevel });
        }
    }
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

        await syncCurrentRaceGrantedSkills(profile);

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
            const gate = evaluateEvolutionEligibility(raceKey, rule, titleNameSet, skillLevelMap);

            const reasons = [];
            if (gate.missingTitles.length) {
                reasons.push(`titles: ${gate.missingTitles.join(', ')}`);
            }
            if (gate.missingSkills.length) {
                const missingSkills = gate.missingSkills
                    .map((s) => formatRequirementLabel(raceKey, s))
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
