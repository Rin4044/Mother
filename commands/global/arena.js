const {
    SlashCommandBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    EmbedBuilder,
    MessageFlags,
    StringSelectMenuBuilder
} = require('discord.js');
const { Op } = require('sequelize');
const { sequelize, Profiles, FightProgress, UserSkills, Skills } = require('../../database.js');
const { calculatePlayerStats } = require('../../utils/playerStats');
const { resolveImage } = require('../../utils/resolveProfileImage');
const { isAbyssAttack } = require('../../utils/abyssSkill');
const { getRankedSeasonState, statusLabel: rankedStatusLabel } = require('../../utils/rankedSeasonService');

const excludedUserId = '1279115859335577763';
const activeFights = new Map();
const rankedQueueByGuild = new Map();
const CHALLENGE_TIMEOUT_MS = 30_000;
const TURN_TIMEOUT_MS = Number(process.env.PVP_TURN_TIMEOUT_MS) > 0
    ? Number(process.env.PVP_TURN_TIMEOUT_MS)
    : 120_000;

const PVP_BET_MIN = 50;
const PVP_BET_MAX = 5000;
const RANKED_BASE_RATING = 1000;
const RANKED_K_FACTOR = Math.max(8, Number(process.env.RANKED_K_FACTOR || 32));
const RANKED_QUEUE_WINDOW_RATING = Math.max(50, Number(process.env.RANKED_QUEUE_WINDOW_RATING || 250));
const ALLOWED_COMBAT_TYPES = ['Physical', 'Magic', 'Debuff'];

function buildSeasonLine(state) {
    const seasonNumber = Math.max(0, Number(state?.seasonNumber) || 0);
    const seasonName = String(state?.seasonName || (seasonNumber === 0 ? 'Alpha and Beta' : `Season ${seasonNumber}`));
    const status = rankedStatusLabel(String(state?.status || 'preseason'));
    return `Season: **${seasonNumber} - ${seasonName}** (${status})`;
}

function clearFightTimeout(fight) {
    if (fight?.timeout) {
        clearTimeout(fight.timeout);
        fight.timeout = null;
    }
}

function buildFightTimeoutEmbed(timedOutUserId) {
    return new EmbedBuilder()
        .setColor('#5b0000')
        .setTitle('Arena Fight Ended')
        .setDescription(`<@${timedOutUserId}> took too long to play. The fight has ended.`);
}

async function awardBetPotToWinner(fight, winnerUserId) {
    const pot = Math.max(0, Number(fight?.betPot) || 0);
    if (!winnerUserId || pot <= 0) return { awarded: false, pot: 0 };

    return sequelize.transaction(async (transaction) => {
        const winner = await Profiles.findOne({
            where: { userId: String(winnerUserId) },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!winner) return { awarded: false, pot: 0 };
        winner.crystals = Math.max(0, Number(winner.crystals) || 0) + pot;
        await winner.save({ transaction });
        return { awarded: true, pot };
    });
}

function getRankedRating(profile) {
    return Math.max(100, Number(profile?.rankedRating) || RANKED_BASE_RATING);
}

function rankNameFromRating(rating) {
    const r = Math.max(0, Number(rating) || 0);
    if (r >= 2200) return 'Master';
    if (r >= 1900) return 'Diamond';
    if (r >= 1600) return 'Platinum';
    if (r >= 1400) return 'Gold';
    if (r >= 1200) return 'Silver';
    return 'Bronze';
}

async function applyRankedMatchResult(winnerUserId, loserUserId) {
    if (!winnerUserId || !loserUserId || winnerUserId === loserUserId) {
        return { ok: false, reason: 'INVALID_PLAYERS' };
    }

    return sequelize.transaction(async (transaction) => {
        const [winner, loser] = await Promise.all([
            Profiles.findOne({ where: { userId: String(winnerUserId) }, transaction, lock: transaction.LOCK.UPDATE }),
            Profiles.findOne({ where: { userId: String(loserUserId) }, transaction, lock: transaction.LOCK.UPDATE })
        ]);
        if (!winner || !loser) return { ok: false, reason: 'MISSING_PROFILE' };

        const rWinner = getRankedRating(winner);
        const rLoser = getRankedRating(loser);
        const expectedWinner = 1 / (1 + (10 ** ((rLoser - rWinner) / 400)));
        const expectedLoser = 1 - expectedWinner;

        const deltaWinner = Math.round(RANKED_K_FACTOR * (1 - expectedWinner));
        const deltaLoser = Math.round(RANKED_K_FACTOR * (0 - expectedLoser));

        winner.rankedRating = Math.max(100, rWinner + deltaWinner);
        loser.rankedRating = Math.max(100, rLoser + deltaLoser);
        winner.rankedWins = Math.max(0, Number(winner.rankedWins) || 0) + 1;
        loser.rankedLosses = Math.max(0, Number(loser.rankedLosses) || 0) + 1;

        await winner.save({ transaction });
        await loser.save({ transaction });

        return {
            ok: true,
            winnerDelta: deltaWinner,
            loserDelta: deltaLoser,
            winnerRating: winner.rankedRating,
            loserRating: loser.rankedRating
        };
    });
}

function scheduleTurnTimeout(fight, client) {
    clearFightTimeout(fight);

    const timedOutUserId = fight.turn;

    fight.timeout = setTimeout(async () => {
        const currentFight = activeFights.get(fight.playerA);

        if (!currentFight || currentFight !== fight || fight.state !== 'inCombat') return;
        if (fight.turn !== timedOutUserId) return;

        activeFights.delete(fight.playerA);
        activeFights.delete(fight.playerB);
        await clearArenaCombatState([fight.playerA, fight.playerB]);
        const winnerUserId = timedOutUserId === fight.playerA ? fight.playerB : fight.playerA;
        const betOut = await awardBetPotToWinner(fight, winnerUserId).catch(() => ({ awarded: false, pot: 0 }));
        const rankedOut = fight.mode === 'ranked'
            ? await applyRankedMatchResult(winnerUserId, timedOutUserId).catch(() => ({ ok: false }))
            : null;

        try {
            const channel = await client.channels.fetch(fight.channelId);
            if (!channel?.isTextBased?.()) return;

            const fightMessage = await channel.messages.fetch(fight.messageId);
            await fightMessage.edit({
                embeds: [
                    buildFightTimeoutEmbed(timedOutUserId).setDescription(
                        `<@${timedOutUserId}> took too long to play. The fight has ended.` +
                        (rankedOut?.ok ? `\nRanked result: <@${winnerUserId}> +${rankedOut.winnerDelta}, <@${timedOutUserId}> ${rankedOut.loserDelta}.` : '') +
                        (betOut.awarded ? `\nBet result: <@${winnerUserId}> wins **${betOut.pot} crystals**.` : '')
                    )
                ],
                components: [],
                attachments: []
            });
        } catch (err) {
            console.error(err);
        }
    }, TURN_TIMEOUT_MS);
}

async function clearArenaCombatState(userIds) {
    await Profiles.update(
        { combatState: null },
        { where: { userId: { [Op.in]: userIds } } }
    );
}

async function fetchEquippedCombatSkills(profileId) {
    return UserSkills.findAll({
        where: { profileId, equippedSlot: { [Op.not]: null } },
        include: [{
            model: Skills,
            as: 'Skill',
            where: { effect_type_main: { [Op.in]: ALLOWED_COMBAT_TYPES } }
        }]
    });
}

function buildStats(stats) {
    return [
        `❤️ HP: ${stats.hp}/${stats.hp}`,
        `🔵 MP: ${stats.mp}/${stats.mp}`,
        `🟨 Stamina: ${stats.stamina}/${stats.stamina}`,
        `🟩 Vital: ${stats.vitalStamina}/${stats.vitalStamina}`,
        '',
        `⚔️ Offense: ${stats.offense}`,
        `🛡️ Defense: ${stats.defense}`,
        `✨ Magic: ${stats.magic}`,
        `🌀 Resistance: ${stats.resistance}`,
        `💨 Speed: ${stats.speed}`
    ].join('\n');
}

function estimateSkillDamage(attackerStats, defenderStats, skill, skillLevel = 1) {
    if (isEnergyConfermentSkill(skill)) {
        return 0;
    }

    const effectivePower = (Number(skill?.power) || 0) + ((Math.max(1, Number(skillLevel) || 1) - 1) * 0.1);
    let attackStat = 0;
    let defenseStat = 0;
    const abyssAttack = isAbyssAttack(skill);

    if (skill?.effect_type_main === 'Physical') {
        attackStat = Math.max(0, Number(attackerStats?.offense) || 0);
        defenseStat = abyssAttack ? 0 : Math.max(0, Number(defenderStats?.defense) || 0);
    } else if (skill?.effect_type_main === 'Magic') {
        attackStat = Math.max(0, Number(attackerStats?.magic) || 0);
        defenseStat = abyssAttack ? 0 : Math.max(0, Number(defenderStats?.resistance) || 0);
    } else {
        return 0;
    }

    const multiplier = 1 + (effectivePower * 0.1);
    const rawDamage = attackStat * multiplier;
    const reducedDamage = rawDamage * (100 / (100 + defenseStat));
    return Math.max(0, Math.floor(reducedDamage));
}

function buildSkillOptionDescription(attackerStats, defenderStats, skill, skillLevel = 1) {
    if (isEnergyConfermentSkill(skill)) {
        const bonus = getEnergyConfermentBonusPct(skill, skillLevel);
        const parts = ['BUFF'];
        if (bonus > 0) parts.push(`Magic +${bonus}% (5T)`);
        const mpCost = Math.max(0, Number(skill?.mp_cost) || 0);
        const spCost = Math.max(0, Number(skill?.sp_cost) || 0);
        if (mpCost > 0) parts.push(`MP ${mpCost}`);
        if (spCost > 0) parts.push(`SP ${spCost}`);
        const text = parts.join(' | ');
        return text.length <= 100 ? text : `${text.slice(0, 97)}...`;
    }

    const dmg = estimateSkillDamage(attackerStats, defenderStats, skill, skillLevel);
    const parts = [`~DMG ${dmg}`];
    const mpCost = Math.max(0, Number(skill?.mp_cost) || 0);
    const spCost = Math.max(0, Number(skill?.sp_cost) || 0);
    if (mpCost > 0) parts.push(`MP ${mpCost}`);
    if (spCost > 0) parts.push(`SP ${spCost}`);
    const text = parts.join(' | ');
    return text.length <= 100 ? text : `${text.slice(0, 97)}...`;
}

function getEnergyConfermentBonusPct(skill, skillLevel = 1) {
    if (!isEnergyConfermentSkill(skill)) return 0;
    const effectivePower = (Number(skill?.power) || 0) + ((Math.max(1, Number(skillLevel) || 1) - 1) * 0.1);
    return Math.max(12, Math.min(80, 18 + Math.floor(effectivePower * 2)));
}

function isEnergyConfermentSkill(skill) {
    const raw = String(skill?.name || '').toLowerCase().trim();
    if (!raw) return false;
    const normalized = raw
        .normalize('NFKD')
        .replace(/[^a-z0-9]/g, '');
    return normalized.includes('energyconferment')
        || (normalized.includes('energy') && normalized.includes('conferment'))
        || (normalized.includes('energy') && normalized.includes('confer'));
}

async function startArenaFightInChannel({
    client,
    channel,
    inviterId,
    opponentId,
    mode = 'normal',
    betAmount = 0,
    sourceText = ''
}) {
    const [inviterProfile, opponentProfile] = await Promise.all([
        Profiles.findOne({ where: { userId: inviterId } }),
        Profiles.findOne({ where: { userId: opponentId } })
    ]);
    if (!inviterProfile || !opponentProfile) return { ok: false, reasonText: 'missing profile' };

    const [inviterStats, opponentStats, inviterSkills, opponentSkills] = await Promise.all([
        calculatePlayerStats(inviterProfile),
        calculatePlayerStats(opponentProfile),
        fetchEquippedCombatSkills(inviterProfile.id),
        fetchEquippedCombatSkills(opponentProfile.id)
    ]);
    if (!inviterSkills.length || !opponentSkills.length) {
        return { ok: false, reasonText: 'one player has no equipped combat skills' };
    }

    await inviterProfile.update({
        combatState: {
            hp: inviterStats.hp,
            mp: inviterStats.mp,
            stamina: inviterStats.stamina,
            vitalStamina: inviterStats.vitalStamina
        }
    });
    await opponentProfile.update({
        combatState: {
            hp: opponentStats.hp,
            mp: opponentStats.mp,
            stamina: opponentStats.stamina,
            vitalStamina: opponentStats.vitalStamina
        }
    });

    const sent = await channel.send({ content: `${sourceText}: <@${inviterId}> vs <@${opponentId}>` });

    const fight = {
        playerA: inviterId,
        playerB: opponentId,
        turn: inviterId,
        state: 'inCombat',
        mode: mode === 'ranked' ? 'ranked' : 'normal',
        betAmount: Math.max(0, Number(betAmount) || 0),
        betPot: 0,
        messageId: sent.id,
        channelId: sent.channelId
    };
    activeFights.set(inviterId, fight);
    activeFights.set(opponentId, fight);
    scheduleTurnTimeout(fight, client);

    const [inviterUser, opponentUser] = await Promise.all([
        client.users.fetch(inviterId),
        client.users.fetch(opponentId)
    ]);

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`Arena: ${inviterUser.username} vs ${opponentUser.username}`)
        .setDescription(mode === 'ranked' ? 'Mode: Ranked' : 'Mode: Normal')
        .addFields(
            { name: inviterUser.username, value: buildStats(inviterStats), inline: true },
            { name: opponentUser.username, value: buildStats(opponentStats), inline: true }
        )
        .setFooter({ text: `It's ${inviterUser.username}'s turn.` });

    const inviterImage = resolveImage(inviterProfile);
    const opponentImage = resolveImage(opponentProfile);
    if (inviterImage) embed.setImage(`attachment://${inviterImage.name}`);
    if (opponentImage) embed.setThumbnail(`attachment://${opponentImage.name}`);

    const select = new StringSelectMenuBuilder()
        .setCustomId('pvp_attack')
        .setPlaceholder('Select a skill')
        .addOptions(
            inviterSkills.slice(0, 25).map((us) => ({
                label: us.Skill.name,
                value: us.Skill.id.toString(),
                description: buildSkillOptionDescription(inviterStats, opponentStats, us.Skill, us.level)
            }))
        );

    await sent.edit({
        content: sourceText || null,
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(select)],
        files: [
            ...(inviterImage ? [inviterImage] : []),
            ...(opponentImage ? [opponentImage] : [])
        ]
    });

    return { ok: true, messageId: sent.id };
}

const data = new SlashCommandBuilder()
    .setName('arena')
    .setDescription('Arena commands')
    .addSubcommand((sub) =>
        sub
            .setName('challenge')
            .setDescription('Send a fight request')
            .addUserOption((option) =>
                option
                    .setName('opponent')
                    .setDescription('Choose your opponent')
                    .setRequired(true)
            )
            .addIntegerOption((option) =>
                option
                    .setName('bet')
                    .setDescription(`Optional crystal bet (${PVP_BET_MIN}-${PVP_BET_MAX}, both players pay this amount)`)
                    .setRequired(false)
                    .setMinValue(PVP_BET_MIN)
                    .setMaxValue(PVP_BET_MAX)
            )
    )
    .addSubcommand((sub) =>
        sub
            .setName('ranked')
            .setDescription('Join ranked matchmaking queue')
            .addStringOption((option) =>
                option
                    .setName('action')
                    .setDescription('Join or leave queue')
                    .setRequired(false)
                    .addChoices(
                        { name: 'Join', value: 'join' },
                        { name: 'Leave', value: 'leave' }
                    )
            )
    )
    .addSubcommand((sub) =>
        sub
            .setName('rank')
            .setDescription('Show your ranked stats')
    )
    .addSubcommand((sub) =>
        sub
            .setName('top')
            .setDescription('Show ranked leaderboard')
            .addIntegerOption((option) =>
                option
                    .setName('limit')
                    .setDescription('How many players')
                    .setRequired(false)
                    .setMinValue(3)
                    .setMaxValue(20)
            )
    )
    .addSubcommand((sub) =>
        sub
            .setName('giveup')
            .setDescription('Give up the current fight')
    );

async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (subcommand === 'rank') {
        const [profile, seasonState] = await Promise.all([
            Profiles.findOne({ where: { userId } }),
            getRankedSeasonState(interaction.guildId)
        ]);
        if (!profile) {
            return interaction.reply({ content: 'You are not registered. Use /start first.', flags: MessageFlags.Ephemeral });
        }
        const rating = getRankedRating(profile);
        const wins = Math.max(0, Number(profile.rankedWins) || 0);
        const losses = Math.max(0, Number(profile.rankedLosses) || 0);
        const total = wins + losses;
        const winrate = total > 0 ? `${Math.round((wins / total) * 100)}%` : 'n/a';
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#290003')
                    .setTitle(`${profile.name} - Ranked`)
                    .setDescription(
                        `${buildSeasonLine(seasonState)}\n` +
                        `Rating: **${rating}** (${rankNameFromRating(rating)})\n` +
                        `Wins: **${wins}**\n` +
                        `Losses: **${losses}**\n` +
                        `Winrate: **${winrate}**`
                    )
            ],
            flags: MessageFlags.Ephemeral
        });
    }

    if (subcommand === 'top') {
        const seasonState = await getRankedSeasonState(interaction.guildId);
        const limit = interaction.options.getInteger('limit', false) || 10;
        const rows = await Profiles.findAll({
            where: { userId: { [Op.ne]: excludedUserId } },
            order: [['rankedRating', 'DESC'], ['rankedWins', 'DESC'], ['updatedAt', 'ASC']],
            limit
        });
        const lines = rows.length
            ? rows.map((p, idx) => {
                const rating = getRankedRating(p);
                const wins = Math.max(0, Number(p.rankedWins) || 0);
                const losses = Math.max(0, Number(p.rankedLosses) || 0);
                return `${idx + 1}. ${p.name} | ${rating} (${rankNameFromRating(rating)}) | W ${wins} / L ${losses}`;
            }).join('\n')
            : '- none';
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor('#290003')
                    .setTitle('Arena Ranked Leaderboard')
                    .setDescription(`${buildSeasonLine(seasonState)}\n\n${lines}`)
            ],
            flags: MessageFlags.Ephemeral
        });
    }

    if (subcommand === 'ranked') {
        if (!interaction.guildId) {
            return interaction.reply({ content: 'Ranked queue can only be used in a server.', flags: MessageFlags.Ephemeral });
        }

        const profile = await Profiles.findOne({ where: { userId } });
        if (!profile) {
            return interaction.reply({ content: 'You are not registered. Use /start first.', flags: MessageFlags.Ephemeral });
        }

        const myProgress = await FightProgress.findOne({ where: { profileId: profile.id } });
        const meBusy = !!profile.combatState || (myProgress && myProgress.currentMonsterHp !== null) || activeFights.has(userId);
        if (meBusy) {
            return interaction.reply({ content: 'You are already in another combat.', flags: MessageFlags.Ephemeral });
        }

        const action = interaction.options.getString('action', false) || 'join';
        const guildId = String(interaction.guildId);
        const seasonState = await getRankedSeasonState(guildId);
        if (String(seasonState.status) === 'ended') {
            return interaction.reply({
                content: `Ranked queue is currently closed.\n${buildSeasonLine(seasonState)}`,
                flags: MessageFlags.Ephemeral
            });
        }
        const queue = rankedQueueByGuild.get(guildId) || [];

        if (action === 'leave') {
            rankedQueueByGuild.set(guildId, queue.filter((entry) => entry.userId !== userId));
            return interaction.reply({ content: 'You left ranked queue.', flags: MessageFlags.Ephemeral });
        }

        const myRating = getRankedRating(profile);
        const noSelfQueue = queue.filter((entry) => entry.userId !== userId);
        let matchIndex = -1;
        for (let i = 0; i < noSelfQueue.length; i += 1) {
            const diff = Math.abs((Number(noSelfQueue[i].rating) || RANKED_BASE_RATING) - myRating);
            if (diff <= RANKED_QUEUE_WINDOW_RATING) {
                matchIndex = i;
                break;
            }
        }
        if (matchIndex === -1 && noSelfQueue.length > 0) matchIndex = 0;

        if (matchIndex === -1) {
            noSelfQueue.push({ userId, rating: myRating, profileId: profile.id, queuedAt: Date.now() });
            rankedQueueByGuild.set(guildId, noSelfQueue);
            return interaction.reply({
                content:
                    `Joined ranked queue. Rating: ${myRating} (${rankNameFromRating(myRating)}).\n` +
                    `${buildSeasonLine(seasonState)}`,
                flags: MessageFlags.Ephemeral
            });
        }

        const opponentEntry = noSelfQueue[matchIndex];
        rankedQueueByGuild.set(guildId, noSelfQueue.filter((_, idx) => idx !== matchIndex));
        const opponentUserId = String(opponentEntry.userId);

        const opponentProfile = await Profiles.findOne({ where: { userId: opponentUserId } });
        if (!opponentProfile || activeFights.has(opponentUserId)) {
            return interaction.reply({ content: 'Matched opponent is now busy. Try queue again.', flags: MessageFlags.Ephemeral });
        }
        const opponentProgress = await FightProgress.findOne({ where: { profileId: opponentProfile.id } });
        const opponentBusy = !!opponentProfile.combatState || (opponentProgress && opponentProgress.currentMonsterHp !== null);
        if (opponentBusy) {
            return interaction.reply({ content: 'Matched opponent is now busy. Try queue again.', flags: MessageFlags.Ephemeral });
        }

        const startOut = await startArenaFightInChannel({
            client: interaction.client,
            channel: interaction.channel,
            inviterId: userId,
            opponentId: opponentUserId,
            mode: 'ranked',
            betAmount: 0,
            sourceText: 'Ranked match found'
        });
        if (!startOut.ok) {
            return interaction.reply({ content: `Matchmaking failed: ${startOut.reasonText || 'unknown'}.`, flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({
            content: `Ranked match found: <@${userId}> vs <@${opponentUserId}>.\n${buildSeasonLine(seasonState)}`,
            flags: MessageFlags.Ephemeral
        });
    }

    const opponent = subcommand === 'challenge'
        ? interaction.options.getUser('opponent')
        : null;
    const rawBet = subcommand === 'challenge'
        ? interaction.options.getInteger('bet', false)
        : null;
    const betAmount = rawBet === null
        ? 0
        : Math.max(PVP_BET_MIN, Math.min(PVP_BET_MAX, Number(rawBet) || 0));

    if (subcommand === 'giveup') {
        const fight = activeFights.get(userId);

        if (!fight) {
            return interaction.reply({
                content: 'You are not in a fight!',
                flags: MessageFlags.Ephemeral
            });
        }

        clearFightTimeout(fight);
        const opponentId = fight.opponent || (fight.playerA === userId ? fight.playerB : fight.playerA);
        const betOut = await awardBetPotToWinner(fight, opponentId).catch(() => ({ awarded: false, pot: 0 }));
        const rankedOut = fight.mode === 'ranked'
            ? await applyRankedMatchResult(opponentId, userId).catch(() => ({ ok: false }))
            : null;

        activeFights.delete(userId);
        if (opponentId) activeFights.delete(opponentId);
        await clearArenaCombatState(opponentId ? [userId, opponentId] : [userId]);

        try {
            const message = await interaction.channel.messages.fetch(fight.messageId);
            await message.edit({
                content:
                    `${interaction.user.username} has given up the fight.` +
                    (rankedOut?.ok ? ` Ranked: <@${opponentId}> +${rankedOut.winnerDelta}, <@${userId}> ${rankedOut.loserDelta}.` : '') +
                    (betOut.awarded ? ` ${opponentId ? `<@${opponentId}>` : 'Opponent'} wins ${betOut.pot} crystals from the bet.` : ''),
                embeds: [],
                components: [],
                attachments: []
            });
        } catch (err) {
            console.error(err);
        }

        return interaction.reply({ content: 'You gave up.', flags: MessageFlags.Ephemeral });
    }

    const [profile, opponentProfile] = await Promise.all([
        Profiles.findOne({ where: { userId } }),
        Profiles.findOne({ where: { userId: opponent.id } })
    ]);

    if (!profile) {
        return interaction.reply({
            content: 'Impossible for an outsider to get in this world.',
            flags: MessageFlags.Ephemeral
        });
    }
    if (!opponentProfile) {
        return interaction.reply({
            content: 'This user does not have a profile.',
            flags: MessageFlags.Ephemeral
        });
    }

    const [myProgress, opponentProgress] = await Promise.all([
        FightProgress.findOne({ where: { profileId: profile.id } }),
        FightProgress.findOne({ where: { profileId: opponentProfile.id } })
    ]);

    const meBusy = !!profile.combatState || (myProgress && myProgress.currentMonsterHp !== null);
    const targetBusy = !!opponentProfile.combatState || (opponentProgress && opponentProgress.currentMonsterHp !== null);

    if (meBusy) {
        return interaction.reply({ content: 'You are already in another combat.', flags: MessageFlags.Ephemeral });
    }
    if (targetBusy) {
        return interaction.reply({ content: 'This user is already in another combat.', flags: MessageFlags.Ephemeral });
    }
    if (activeFights.has(userId)) {
        return interaction.reply({ content: 'You are already in a fight!', flags: MessageFlags.Ephemeral });
    }
    if (activeFights.has(opponent.id)) {
        return interaction.reply({ content: 'This user is already in a fight!', flags: MessageFlags.Ephemeral });
    }
    if (opponent.id === excludedUserId) {
        return interaction.reply({ content: 'Mother is too strong for you.', flags: MessageFlags.Ephemeral });
    }
    if (opponent.id === userId) {
        return interaction.reply({ content: "You can't challenge yourself!", flags: MessageFlags.Ephemeral });
    }
    if (betAmount > 0) {
        const myCrystals = Math.max(0, Number(profile.crystals) || 0);
        if (myCrystals < betAmount) {
            return interaction.reply({
                content: `You do not have enough crystals for this bet. Need ${betAmount}, you have ${myCrystals}.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`${interaction.user.username} challenges you!`)
        .setDescription(
            `${opponent.username}, do you accept?` +
            (betAmount > 0
                ? `\nThe player **${interaction.user.username}** wants to bet **${betAmount} crystals**.\nIf accepted: both players pay **${betAmount}**, winner gets **${betAmount * 2}**.`
                : '')
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`accept_${opponent.id}_${userId}_${betAmount}`)
            .setLabel('Accept')
            .setStyle('Success'),
        new ButtonBuilder()
            .setCustomId(`decline_${opponent.id}_${userId}_${betAmount}`)
            .setLabel('Decline')
            .setStyle('Danger')
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    const message = await interaction.fetchReply();

    const timeout = setTimeout(async () => {
        const fight = activeFights.get(userId);
        if (!fight || fight.state !== 'pending') return;
        activeFights.delete(userId);
        activeFights.delete(opponent.id);
        try {
            await message.edit({ content: 'The encounter never came.', embeds: [], components: [] });
        } catch (err) {
            console.error(err);
        }
    }, CHALLENGE_TIMEOUT_MS);

    activeFights.set(userId, {
        state: 'pending',
        initiatorId: userId,
        opponent: opponent.id,
        betAmount,
        betPot: 0,
        mode: 'normal',
        messageId: message.id,
        channelId: message.channelId,
        timeout
    });
    activeFights.set(opponent.id, {
        state: 'pending',
        initiatorId: userId,
        opponent: userId,
        betAmount,
        betPot: 0,
        mode: 'normal',
        messageId: message.id,
        channelId: message.channelId,
        timeout
    });
}

module.exports = {
    data,
    execute,
    activeFights,
    rankedQueueByGuild,
    clearFightTimeout,
    scheduleTurnTimeout,
    buildFightTimeoutEmbed,
    applyRankedMatchResult
};
