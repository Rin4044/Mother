const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } = require('discord.js');

const { Profiles, UserTitles, Titles, UserSkills, Skills } = require('../../database.js');
const {
    EVOLUTION_TREE,
    getEvolutionRule,
    formatRaceName
} = require('../../utils/evolutionConfig');
const { RACES } = require('../../utils/races');

const SELECT_CUSTOM_ID = 'race_tree_select';
const SELECT_TIMEOUT_MS = 120000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('race')
        .setDescription('Race information')
        .addSubcommand(sub =>
            sub
                .setName('tree')
                .setDescription('View evolution tree and race details')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand !== 'tree') return;

        const profile = await Profiles.findOne({
            where: { userId: interaction.user.id }
        });

        const raceOptions = buildRaceOptions();
        const initialRaceKey = toRuleKey(profile?.race || 'small lesser taratect');

        const initialEmbed = await buildRaceDetailEmbed(initialRaceKey, profile);
        initialEmbed.setTitle('Race Tree');
        initialEmbed.setDescription(
            `${buildTreeOverview()}\n\n${initialEmbed.data.description || ''}`
        );

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(SELECT_CUSTOM_ID)
                .setPlaceholder('Select a race to inspect')
                .addOptions(raceOptions)
        );

        await interaction.reply({
            embeds: [initialEmbed],
            components: [row],
            flags: MessageFlags.Ephemeral
        });
        const message = await interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: SELECT_TIMEOUT_MS
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: 'Not your menu.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await i.deferUpdate();

            const selectedKey = i.values[0];
            const embed = await buildRaceDetailEmbed(selectedKey, profile);
            embed.setTitle('Race Tree');
            embed.setDescription(
                `${buildTreeOverview()}\n\n${embed.data.description || ''}`
            );

            await i.editReply({
                embeds: [embed],
                components: [row]
            });
        });

        collector.on('end', async () => {
            await message.edit({ components: [] }).catch(() => {});
        });
    }
};

function buildRaceOptions() {
    const keys = getAllRaceKeys();
    return keys.slice(0, 25).map(key => ({
        label: formatRaceName(key),
        value: key
    }));
}

function getAllRaceKeys() {
    const set = new Set();
    for (const parent of Object.keys(EVOLUTION_TREE)) {
        set.add(toRuleKey(parent));
        for (const child of EVOLUTION_TREE[parent] || []) {
            set.add(toRuleKey(child));
        }
    }
    for (const race of Object.keys(RACES)) {
        set.add(toRuleKey(race));
    }
    return [...set].sort((a, b) => formatRaceName(a).localeCompare(formatRaceName(b)));
}

function buildTreeOverview() {
    const lines = [];
    for (const [parent, children] of Object.entries(EVOLUTION_TREE)) {
        const left = formatRaceName(toRuleKey(parent));
        const right = (children || []).map(c => formatRaceName(toRuleKey(c))).join(', ') || '-';
        lines.push(`**${left}** -> ${right}`);
    }
    return lines.join('\n');
}

async function buildRaceDetailEmbed(ruleKey, profile) {
    const raceName = fromRuleKey(ruleKey);
    const raceData = RACES[raceName];
    const rule = getEvolutionRule(ruleKey);
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
            }
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
