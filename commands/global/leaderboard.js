const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../database.js');
const { EVOLUTION_TREE, getMaxLevelForRace } = require('../../utils/evolutionConfig');
const { calculateXpForLevel } = require('../../utils/xpUtils');

const ROOT_RACE = 'small lesser taratect';
const TOP_LIMIT = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show progression leaderboards.')
        .addSubcommand(sub =>
            sub
                .setName('global')
                .setDescription('Top progression across all races/paths')
        )
        .addSubcommand(sub =>
            sub
                .setName('race')
                .setDescription('Top progression for one race')
                .addStringOption(option =>
                    option
                        .setName('race')
                        .setDescription('Race name (optional). Default: your race')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'global') {
            return handleGlobalLeaderboard(interaction);
        }

        if (subcommand === 'race') {
            return handleRaceLeaderboard(interaction);
        }
    }
};

async function handleGlobalLeaderboard(interaction) {
    const profiles = await Profiles.findAll();
    if (!profiles.length) {
        return interaction.reply({ content: 'No players found yet.', flags: MessageFlags.Ephemeral });
    }

    const raceDepthMap = buildRaceDepthMap();

    const ranked = profiles
        .map(profile => buildRankRow(profile, raceDepthMap))
        .sort(compareGlobalRows)
        .slice(0, TOP_LIMIT);

    const names = await Promise.all(ranked.map(row => resolveDisplayName(interaction, row)));
    const lines = ranked.map((row, index) => {
        const raceLabel = formatRace(row.race);
        return `**#${index + 1}** ${names[index]} - Lv.${row.level} ${raceLabel} (${row.progressPercent}%) • Score: ${row.globalScore}`;
    });

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle('Global Leaderboard')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Global score = depth, then level, then XP progress.' });

    return interaction.reply({ embeds: [embed] });
}

async function handleRaceLeaderboard(interaction) {
    const raceInput = interaction.options.getString('race');

    let raceFilter = raceInput?.toLowerCase().trim();
    if (!raceFilter) {
        const viewer = await Profiles.findOne({ where: { userId: interaction.user.id } });
        if (!viewer) {
            return interaction.reply({
                content: "You don't have a profile. Provide a race in the command option.",
                flags: MessageFlags.Ephemeral
            });
        }
        raceFilter = viewer.race.toLowerCase().trim();
    }

    const profiles = await Profiles.findAll();
    const filtered = profiles.filter(p => (p.race || '').toLowerCase().trim() === raceFilter);

    if (!filtered.length) {
        return interaction.reply({
            content: `No players found for race "${raceFilter}".`,
            flags: MessageFlags.Ephemeral
        });
    }

    const ranked = filtered
        .map(profile => buildRankRow(profile, new Map()))
        .sort((a, b) => {
            if (b.level !== a.level) return b.level - a.level;
            if (b.progressRatio !== a.progressRatio) return b.progressRatio - a.progressRatio;
            return b.xp - a.xp;
        })
        .slice(0, TOP_LIMIT);

    const names = await Promise.all(ranked.map(row => resolveDisplayName(interaction, row)));
    const lines = ranked.map((row, index) =>
        `**#${index + 1}** ${names[index]} - Lv.${row.level} (${row.progressPercent}%)`
    );

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`Race Leaderboard: ${raceFilter}`)
        .setDescription(lines.join('\n'));

    return interaction.reply({ embeds: [embed] });
}

function buildRankRow(profile, raceDepthMap) {
    const level = Number(profile.level) || 1;
    const xp = Math.max(0, Number(profile.xp) || 0);
    const race = (profile.race || 'unknown').toLowerCase().trim();
    const maxLevel = getMaxLevelForRace(race);
    const xpNeeded = safeXpNeeded(level + 1, race);
    const isCapped = level >= maxLevel || !Number.isFinite(xpNeeded);
    const progressRatio = isCapped ? 1 : Math.max(0, Math.min(1, xp / xpNeeded));
    const progressPercent = Math.round(progressRatio * 100);
    const depth = raceDepthMap.get(race) ?? -1;
    const globalScore = buildGlobalScore(depth, level, progressRatio);

    return {
        profileId: profile.id,
        userId: profile.userId,
        name: profile.name || 'no name',
        race,
        level,
        xp,
        progressRatio,
        progressPercent,
        depth,
        globalScore
    };
}

function buildGlobalScore(depth, level, progressRatio) {
    const safeDepth = Math.max(0, Number(depth) || 0);
    const safeLevel = Math.max(1, Number(level) || 1);
    const safeProgress = Math.max(0, Math.min(1, Number(progressRatio) || 0));

    // Depth dominates, then level, then progress.
    return (safeDepth * 1_000_000) + (safeLevel * 1_000) + Math.round(safeProgress * 1000);
}

function safeXpNeeded(nextLevel, race) {
    try {
        return calculateXpForLevel(nextLevel, race);
    } catch {
        return Infinity;
    }
}

async function resolveDisplayName(interaction, row) {
    if (!row.userId) return row.name;
    const cached = interaction.client.users.cache.get(row.userId);
    if (cached?.username) return cached.username;
    try {
        const fetched = await interaction.client.users.fetch(row.userId);
        if (fetched?.username) return fetched.username;
    } catch {
        // ignore and fallback
    }
    return row.name;
}

function formatRace(race) {
    return race
        .split(' ')
        .map(part => part ? part[0].toUpperCase() + part.slice(1) : part)
        .join(' ');
}

function compareGlobalRows(a, b) {
    if (b.depth !== a.depth) return b.depth - a.depth;
    if (b.level !== a.level) return b.level - a.level;
    if (b.progressRatio !== a.progressRatio) return b.progressRatio - a.progressRatio;
    if (b.xp !== a.xp) return b.xp - a.xp;
    return a.profileId - b.profileId;
}

function buildRaceDepthMap() {
    const map = new Map([[ROOT_RACE, 0]]);
    const queue = [ROOT_RACE];

    while (queue.length) {
        const current = queue.shift();
        const currentDepth = map.get(current) ?? 0;
        const children = EVOLUTION_TREE[current] || [];

        for (const childKey of children) {
            const childRace = childKey.replace(/_/g, ' ').toLowerCase().trim();
            const previous = map.get(childRace);
            const nextDepth = currentDepth + 1;
            if (previous === undefined || nextDepth < previous) {
                map.set(childRace, nextDepth);
                queue.push(childRace);
            }
        }
    }

    return map;
}
