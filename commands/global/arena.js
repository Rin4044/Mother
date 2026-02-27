const { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Profiles, FightProgress } = require('../../database.js');
const { Op } = require('sequelize');

const excludedUserId = '1279115859335577763';
const activeFights = new Map();
const CHALLENGE_TIMEOUT_MS = 30_000;
const TURN_TIMEOUT_MS = Number(process.env.PVP_TURN_TIMEOUT_MS) > 0
    ? Number(process.env.PVP_TURN_TIMEOUT_MS)
    : 120_000;

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

        try {
            const channel = await client.channels.fetch(fight.channelId);
            if (!channel?.isTextBased?.()) return;

            const fightMessage = await channel.messages.fetch(fight.messageId);
            await fightMessage.edit({
                embeds: [buildFightTimeoutEmbed(timedOutUserId)],
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

const data = new SlashCommandBuilder()
    .setName('arena')
    .setDescription('Arena commands')
    .addSubcommand(sub =>
        sub
            .setName('challenge')
            .setDescription('Send a fight request')
            .addUserOption(option =>
                option
                    .setName('opponent')
                    .setDescription('Choose your opponent')
                    .setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub
            .setName('giveup')
            .setDescription('Give up the current fight')
    );

async function execute(interaction) {

    const subcommand = interaction.options.getSubcommand();
    const opponent = subcommand === 'challenge'
        ? interaction.options.getUser('opponent')
        : null;
    const userId = interaction.user.id;

    // ============================
    // GIVE UP
    // ============================

    if (subcommand === 'giveup') {

        const fight = activeFights.get(userId);

        if (!fight) {
            return interaction.reply({
                content: 'You are not in a fight!',
                flags: MessageFlags.Ephemeral
            });
        }

        clearFightTimeout(fight);

        const opponentId = fight.opponent
            || (fight.playerA === userId ? fight.playerB : fight.playerA);

        activeFights.delete(userId);
        if (opponentId) activeFights.delete(opponentId);
        await clearArenaCombatState(
            opponentId ? [userId, opponentId] : [userId]
        );

        try {
            const message = await interaction.channel.messages.fetch(fight.messageId);
            await message.edit({
                content: `${interaction.user.username} has given up the fight.`,
                embeds: [],
                components: [],
                attachments: []
            });
        } catch (err) {
            console.error(err);
        }

        return interaction.reply({ content: 'You gave up.', flags: MessageFlags.Ephemeral });
    }

    // ============================
    // CHALLENGE
    // ============================

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
        return interaction.reply({
            content: 'You are already in another combat.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (targetBusy) {
        return interaction.reply({
            content: 'This user is already in another combat.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (activeFights.has(userId)) {
        return interaction.reply({
            content: 'You are already in a fight!',
            flags: MessageFlags.Ephemeral
        });
    }

    if (activeFights.has(opponent.id)) {
        return interaction.reply({
            content: 'This user is already in a fight!',
            flags: MessageFlags.Ephemeral
        });
    }

    if (opponent.id === excludedUserId) {
        return interaction.reply({
            content: 'Mother is too strong for you.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (opponent.id === userId) {
        return interaction.reply({
            content: "You can't challenge yourself!",
            flags: MessageFlags.Ephemeral
        });
    }

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`${interaction.user.username} challenges you!`)
        .setDescription(`${opponent.username}, do you accept?`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`accept_${opponent.id}_${userId}`)
            .setLabel('Accept')
            .setStyle('Success'),
        new ButtonBuilder()
            .setCustomId(`decline_${opponent.id}_${userId}`)
            .setLabel('Decline')
            .setStyle('Danger')
    );

    await interaction.reply({
        embeds: [embed],
        components: [row]
    });
    const message = await interaction.fetchReply();

    const timeout = setTimeout(async () => {

        const fight = activeFights.get(userId);
        if (!fight || fight.state !== 'pending') return;

        activeFights.delete(userId);
        activeFights.delete(opponent.id);

        try {
            await message.edit({
                content: 'The encounter never came.',
                embeds: [],
                components: []
            });
        } catch (err) {
            console.error(err);
        }

    }, CHALLENGE_TIMEOUT_MS);

    activeFights.set(userId, {
        state: 'pending',
        initiatorId: userId,
        opponent: opponent.id,
        messageId: message.id,
        channelId: message.channelId,
        timeout
    });

    activeFights.set(opponent.id, {
        state: 'pending',
        initiatorId: userId,
        opponent: userId,
        messageId: message.id,
        channelId: message.channelId,
        timeout
    });
}

module.exports = {
    data,
    execute,
    activeFights,
    clearFightTimeout,
    scheduleTurnTimeout,
    buildFightTimeoutEmbed
};
