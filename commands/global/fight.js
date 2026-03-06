const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');

const { Profiles, Monsters, FightProgress } = require('../../database.js');
const { calculateScaling } = require('../../utils/combatEngine');
const { progressTutorial } = require('../../utils/tutorialService');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('fight')
        .setDescription('Manage your PvE progression')
        .addSubcommand(sub =>
            sub.setName('start').setDescription('Start or continue your fight')
        )
        .addSubcommand(sub =>
            sub.setName('view').setDescription('View current floor progression')
        ),

    async execute(interaction) {

        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();

        const profile = await Profiles.findOne({ where: { userId } });
        if (!profile) {
            return interaction.reply({
                content: "You don't have a profile.",
                flags: MessageFlags.Ephemeral
            });
        }

        const progress = await getOrCreateProgress(profile.id);

        if (subcommand === 'view') {
            await progressTutorial(profile.id, 'used_fight_view');
            return handleView(interaction, progress);
        }

        if (subcommand === 'start') {
            await progressTutorial(profile.id, 'used_fight_start');
            return handleStart(interaction, profile, progress);
        }
    }
};

// ==========================================
// PROGRESS
// ==========================================

async function getOrCreateProgress(profileId) {

    let progress = await FightProgress.findOne({ where: { profileId } });

    if (!progress) {
        progress = await FightProgress.create({
            profileId,
            tier: 1,
            stage: 1,
            wins: 0,
            monsterQueue: null,
            currentMonsterHp: null
        });
    }

    return progress;
}

// ==========================================
// VIEW
// ==========================================

async function handleView(interaction, progress) {

    let queue = parseMonsterQueue(progress.monsterQueue);

    if (!queue) {
        const generated = await generateMonsterQueue(progress);
        if (!generated) {
            return interaction.reply({
                content: 'No monsters available for this tier.',
                flags: MessageFlags.Ephemeral
            });
        }

        queue = parseMonsterQueue(progress.monsterQueue);
    }

    if (!queue) {
        return interaction.reply({
            content: 'Failed to initialize floor progression.',
            flags: MessageFlags.Ephemeral
        });
    }

    const monsters = await Promise.all(
        queue.map(q => Monsters.findByPk(q.monsterId))
    );

    const list = monsters.map((monster, index) => {

        const stage = index + 1;

        if (!monster) return `? Stage ${stage} - Unknown`;
        if (stage < progress.stage) return `🔴 Stage ${stage} - ${monster.name}`;
        if (stage === progress.stage) return `🟢 Stage ${stage} - ${monster.name}`;
        return `⚪ Stage ${stage} - ${monster.name}`;

    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle('Floor Progression')
        .setDescription(
            `Tier: **${progress.tier}**\n` +
            `Stage: **${progress.stage} / 10**\n\n` +
            list
        );

    return interaction.reply({ embeds: [embed] });
}

// ==========================================
// START PREVIEW
// ==========================================

async function handleStart(interaction, profile, progress) {
    if (profile.combatState) {
        return interaction.reply({
            content: 'You are already in another combat. Finish it first.',
            flags: MessageFlags.Ephemeral
        });
    }

    const hasOngoingFight = progress.currentMonsterHp !== null;

    if (progress.stage > 10) {

        await progress.update({
            tier: progress.tier + 1,
            stage: 1,
            monsterQueue: null
        });

        await generateMonsterQueue(progress);

        return interaction.reply({
            content: 'Tier cleared! Moving to next tier.',
            flags: MessageFlags.Ephemeral
        });
    }

    let queue = parseMonsterQueue(progress.monsterQueue);
    if (!queue) {
        const generated = await generateMonsterQueue(progress);
        if (!generated) {
            return interaction.reply({
                content: 'No monsters available for this tier.',
                flags: MessageFlags.Ephemeral
            });
        }

        queue = parseMonsterQueue(progress.monsterQueue);
    }

    if (!queue) {
        return interaction.reply({
            content: 'Failed to initialize floor progression.',
            flags: MessageFlags.Ephemeral
        });
    }

    const entry = queue[progress.stage - 1];
    if (!entry) {
        return interaction.reply({
            content: 'No monster found for this stage.',
            flags: MessageFlags.Ephemeral
        });
    }

    const monster = await Monsters.findByPk(entry.monsterId);
    if (!monster) {
        return interaction.reply({
            content: 'Monster not found.',
            flags: MessageFlags.Ephemeral
        });
    }

    const scaled = calculateScaling(
        monster,
        progress.tier,
        progress.stage
    ).stats;

    const monsterHpToShow = hasOngoingFight ? progress.currentMonsterHp : scaled.hp;

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`Tier ${progress.tier} - Stage ${progress.stage}`)
        .setDescription(
            `Monster: **${monster.name}**\n\n` +
            `${formatResourceLine('❤️', 'HP', monsterHpToShow, scaled.hp)}\n` +
            `${formatResourceLine('🔵', 'MP', scaled.mp, scaled.mp)}\n` +
            `${formatResourceLine('🟨', 'Stamina', scaled.stamina, scaled.stamina)}\n` +
            `${formatResourceLine('🟩', 'Vital Stamina', scaled.vitalStamina, scaled.vitalStamina)}\n` +
            `${formatStatLine('⚔️', 'Offense', scaled.offense)}\n` +
            `${formatStatLine('🛡️', 'Defense', scaled.defense)}\n` +
            `${formatStatLine('✨', 'Magic', scaled.magic)}\n` +
            `${formatStatLine('🧿', 'Resistance', scaled.resistance)}\n` +
            `${formatStatLine('💨', 'Speed', scaled.speed)}`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`fight_start_${profile.id}`)
            .setLabel(hasOngoingFight ? 'Continue Battle' : 'Start Battle')
            .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({ embeds: [embed], components: [row] });
}

function formatResourceLine(icon, label, current, max) {
    const now = Math.max(0, Number(current) || 0);
    const cap = Math.max(1, Number(max) || 1);
    const value = `${now}/${cap}`;
    const left = `${icon} ${String(label).padEnd(13, ' ')}`;
    const right = `${String(value).padStart(13, ' ')} ${buildBar(now, cap)}`;
    return `\`${left}${right}\``;
}

function formatStatLine(icon, label, value) {
    const left = `${icon} ${String(label).padEnd(13, ' ')}`;
    const right = `${String(Math.max(0, Number(value) || 0)).padStart(13, ' ')}`;
    return `\`${left}${right}\``;
}

function buildBar(current, max, width = 10) {
    const safeWidth = Math.max(6, Number(width) || 10);
    const ratio = Math.max(0, Math.min(1, (Number(current) || 0) / Math.max(1, Number(max) || 1)));
    const filled = Math.max(0, Math.min(safeWidth, Math.round(ratio * safeWidth)));
    const empty = safeWidth - filled;
    const pct = Math.round(ratio * 100);
    const bar = `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
    return pct >= 100 ? bar : `${bar} ${pct}%`;
}

// ==========================================
// MONSTER QUEUE
// ==========================================

async function generateMonsterQueue(progress) {

    const firstStageRange = getMonsterLevelRange(progress.tier, 1);
    const lastStageRange = getMonsterLevelRange(progress.tier, 10);
    const minLevel = Math.min(firstStageRange.min, lastStageRange.min);
    const maxLevel = Math.max(firstStageRange.max, lastStageRange.max);

    const monsters = await Monsters.findAll({
        where: {
            level: { [Op.between]: [minLevel, maxLevel] }
        }
    });

    if (!monsters.length) return false;

    const queue = [];

    for (let i = 0; i < 10; i++) {
        const stage = i + 1;
        const stageRange = getMonsterLevelRange(progress.tier, stage);
        const stageCandidates = monsters.filter(m =>
            m.level >= stageRange.min && m.level <= stageRange.max
        );
        const pool = stageCandidates.length ? stageCandidates : monsters;
        const random = pool[Math.floor(Math.random() * pool.length)];
        queue.push({ monsterId: random.id });
    }

    await progress.update({
        monsterQueue: queue
    });

    return true;
}

function parseMonsterQueue(rawQueue) {
    if (!rawQueue) return null;

    if (Array.isArray(rawQueue)) {
        return rawQueue;
    }

    try {
        let parsed = JSON.parse(rawQueue);

        // Handle legacy/double-encoded queue values.
        if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
        }

        if (!Array.isArray(parsed)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function getMonsterLevelRange(tier, stage = 1) {
    let base;

    if (tier === 1) {
        base = { min: 1, max: 1 };
    } else if (tier <= 3) {
        base = { min: 1, max: 4 };
    } else if (tier <= 5) {
        base = { min: 2, max: 6 };
    } else if (tier <= 10) {
        base = { min: 4, max: 12 };
    } else if (tier <= 15) {
        base = { min: 8, max: 18 };
    } else if (tier <= 20) {
        base = { min: 12, max: 24 };
    } else if (tier <= 30) {
        base = { min: 20, max: 35 };
    } else {
        base = { min: 30, max: 50 };
    }

    const safeStage = Math.max(1, Number(stage) || 1);
    const stageBonus = Math.floor((safeStage - 1) / 2);

    return {
        min: base.min + stageBonus,
        max: base.max + (stageBonus * 2)
    };
}
