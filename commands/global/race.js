const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const { Profiles, UserTitles, Titles, UserSkills, Skills } = require('../../database.js');
const {
    EVOLUTION_TREE,
    getEvolutionRule,
    formatRaceName
} = require('../../utils/evolutionConfig');
const { RACES } = require('../../utils/races');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('racetree')
        .setDescription('View evolution trees by race branch')
        .addSubcommand(sub =>
            sub
                .setName('human')
                .setDescription('Show the Human evolution tree')
        )
        .addSubcommand(sub =>
            sub
                .setName('demon')
                .setDescription('Show the Demon evolution tree')
        )
        .addSubcommand(sub =>
            sub
                .setName('taratect')
                .setDescription('Show the Taratect evolution tree')
        )
        .addSubcommand(sub =>
            sub
                .setName('elf')
                .setDescription('Show the Elf evolution tree')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const branchRootMap = {
            human: 'human',
            demon: 'lesser demon',
            taratect: 'small lesser taratect',
            elf: 'young elf'
        };
        const branchRoot = branchRootMap[subcommand];
        if (!branchRoot) return;

        const profile = await Profiles.findOne({
            where: { userId: interaction.user.id }
        });

        const rootKey = toRuleKey(branchRoot);
        const initialEmbed = await buildRaceDetailEmbed(rootKey, profile);
        initialEmbed.setTitle(`${formatRaceName(rootKey)} Tree`);
        initialEmbed.setDescription(buildTreeOverview(rootKey));

        await interaction.reply({
            embeds: [initialEmbed],
            flags: MessageFlags.Ephemeral
        });
    }
};

function buildTreeOverview(rootKey) {
    const rootRace = fromRuleKey(rootKey);
    const branchKeys = collectBranchKeys(rootRace);
    const lines = [];
    for (const [parent, children] of Object.entries(EVOLUTION_TREE)) {
        const parentKey = toRuleKey(parent);
        if (!branchKeys.has(parentKey)) continue;
        const left = formatRaceName(toRuleKey(parent));
        const right = (children || [])
            .map(c => toRuleKey(c))
            .filter(childKey => branchKeys.has(childKey))
            .map(c => formatRaceName(c))
            .join(', ') || '-';
        lines.push(`**${left}** -> ${right}`);
    }
    return lines.join('\n') || 'No evolutions found for this branch.';
}

function collectBranchKeys(rootRace) {
    const visited = new Set();
    const queue = [rootRace];

    while (queue.length) {
        const current = queue.shift();
        const currentKey = toRuleKey(current);
        if (visited.has(currentKey)) continue;
        visited.add(currentKey);

        const children = EVOLUTION_TREE[current] || [];
        for (const child of children) {
            queue.push(child);
        }
    }

    return visited;
}

async function buildRaceDetailEmbed(ruleKey, profile) {
    const raceName = fromRuleKey(ruleKey);
    const raceData = RACES[raceName];
    const rule = getEvolutionRule(ruleKey);
    const branchKeys = collectBranchKeys(raceName);
    const branchRaces = [...branchKeys]
        .map(key => formatRaceName(key))
        .sort((a, b) => a.localeCompare(b));
    const next = (EVOLUTION_TREE[raceName] || []).map(toRuleKey);

    const requirements = formatRequirements(rule);
    const rewards = formatRewards(rule);
    const baseStats = raceData
        ? formatBaseStats(raceData.base)
        : 'No base stats found for this race.';

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .addFields(
            { name: 'Selected Race', value: clampField(formatRaceName(ruleKey)), inline: false },
            { name: 'Requirements', value: clampField(requirements), inline: false },
            { name: 'Evolution Gains', value: clampField(rewards), inline: false },
            { name: 'Base Stats', value: clampField(baseStats), inline: false },
            {
                name: 'Next Evolutions',
                value: clampField(next.length ? next.map(k => formatRaceName(k)).join(', ') : 'None'),
                inline: false
            },
            { name: 'Branch Races', value: clampField(branchRaces.join(', ')), inline: false }
        );

    if (profile) {
        const eligibility = await buildEligibilityText(profile, rule);
        embed.addFields({ name: 'Your Eligibility', value: clampField(eligibility), inline: false });
    }

    return embed;
}

function formatRequirements(rule) {
    const titles = (rule.requiredTitles || []).length
        ? (rule.requiredTitles || []).join(', ')
        : 'None';
    const skills = (rule.requiredSkills || []).length
        ? (rule.requiredSkills || []).map(s => `${s.name} Lv${s.level || 1}`).join(', ')
        : 'None';
    return `Titles: ${titles}\nSkills: ${skills}`;
}

function formatRewards(rule) {
    const rewards = rule.grantedSkills || [];
    if (!rewards.length) return 'None';
    return rewards.map(s => `${s.name} Lv${s.level || 1}`).join(', ');
}

function formatBaseStats(base) {
    const keys = [
        'hp',
        'mp',
        'stamina',
        'vitalStamina',
        'offense',
        'defense',
        'magic',
        'resistance',
        'speed'
    ];
    return keys.map(k => `${k}: ${base?.[k] ?? 0}`).join('\n');
}

async function buildEligibilityText(profile, rule) {
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

    const titleSet = new Set(
        ownedTitles.map(t => normalizeName(t.Title?.name)).filter(Boolean)
    );
    const skillMap = new Map();
    for (const us of ownedSkills) {
        const key = normalizeName(us.Skill?.name);
        if (!key) continue;
        const current = skillMap.get(key) || 0;
        skillMap.set(key, Math.max(current, Number(us.level) || 1));
    }

    const missingTitles = (rule.requiredTitles || [])
        .filter(t => !titleSet.has(normalizeName(t)));
    const missingSkills = (rule.requiredSkills || [])
        .filter(s => (skillMap.get(normalizeName(s.name)) || 0) < (s.level || 1));

    if (!missingTitles.length && !missingSkills.length) {
        return 'Eligible';
    }

    const parts = [];
    if (missingTitles.length) {
        parts.push(`Missing titles: ${missingTitles.join(', ')}`);
    }
    if (missingSkills.length) {
        parts.push(`Missing skills: ${missingSkills.map(s => `${s.name} Lv${s.level || 1}`).join(', ')}`);
    }

    return parts.join('\n');
}

function normalizeName(value) {
    return String(value || '').toLowerCase().trim();
}

function toRuleKey(value) {
    return String(value || '').toLowerCase().trim().replace(/\s+/g, '_');
}

function fromRuleKey(value) {
    return String(value || '').toLowerCase().trim().replace(/_/g, ' ');
}

function clampField(value, max = 1000) {
    const text = String(value || 'None');
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}
