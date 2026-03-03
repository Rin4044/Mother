const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../database');
const {
    GUILD_MEMBER_CAP,
    GUILD_CREATE_COST_CRYSTALS,
    getGuildBonuses,
    getGuildRole,
    createGuildForProfile,
    joinGuildForProfile,
    leaveGuildForProfile,
    setOfficerByUserId,
    claimGuildMissionRewards,
    getGuildInfo,
    getGuildTop,
    getOwnerName
} = require('../../utils/playerGuildService');

function guildProgressLine(guild) {
    const xp = Math.max(0, Number(guild?.xp) || 0);
    const next = Math.max(0, Number(guild?.xpToNextLevel) || 0);
    return next > 0 ? `${xp}/${next}` : `${xp}/MAX`;
}

function formatGuildSummary(guild, ownerName) {
    const bonuses = getGuildBonuses(guild.level);
    const officers = Array.isArray(guild?.officerProfileIds) ? guild.officerProfileIds.length : 0;
    return (
        `Owner: **${ownerName}**\n` +
        `Level: **${guild.level}**\n` +
        `XP: **${guildProgressLine(guild)}**\n` +
        `Members: **${guild.membersCount}/${GUILD_MEMBER_CAP}**\n` +
        `Officers: **${officers}**\n` +
        `Bonus: **+${bonuses.xpBonusPct}% XP**, **+${bonuses.crystalBonusPct}% crystals**\n` +
        `Stats: Kills **${guild.totalKills}**, Quests **${guild.totalQuestClaims}**, Raids **${guild.totalRaidWins}**`
    );
}

function formatSingleMissionLine(mission, label) {
    if (!mission || !mission.objectiveType) return 'Mission: n/a';
    const progress = Math.max(0, Number(mission.progress) || 0);
    const target = Math.max(1, Number(mission.target) || 1);
    const resetAt = Math.max(0, Number(mission.resetAt) || 0);
    const status = mission.claimed
        ? 'Claimed'
        : (progress >= target ? 'Ready to claim' : 'In progress');
    return `${label}: ${mission.objectiveLabel} ${progress}/${target} | Reward ${mission.rewardCrystals} crystals + ${mission.rewardXp} XP | ${status}` +
        (resetAt ? ` | reset <t:${Math.floor(resetAt / 1000)}:R>` : '');
}

function formatMissionLine(guild) {
    const missionRoot = guild?.missionState && typeof guild.missionState === 'object'
        ? guild.missionState
        : {};
    const daily = formatSingleMissionLine(missionRoot.daily, 'Daily');
    const weekly = formatSingleMissionLine(missionRoot.weekly, 'Weekly');
    return `${daily}\n${weekly}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guild')
        .setDescription('Create or manage your player guild.')
        .addSubcommand((sub) =>
            sub
                .setName('create')
                .setDescription(`Create a guild (cost: ${GUILD_CREATE_COST_CRYSTALS} crystals).`)
                .addStringOption((o) =>
                    o.setName('name')
                        .setDescription('Guild name (3-24, letters/numbers/space/_/-)')
                        .setRequired(true)
                        .setMaxLength(24)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('join')
                .setDescription('Join an existing guild.')
                .addStringOption((o) =>
                    o.setName('name')
                        .setDescription('Guild name to join')
                        .setRequired(true)
                        .setMaxLength(24)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('leave')
                .setDescription('Leave your current guild.')
        )
        .addSubcommand((sub) =>
            sub
                .setName('info')
                .setDescription('Show guild details.')
                .addStringOption((o) =>
                    o.setName('name')
                        .setDescription('Guild name (optional, default: your guild)')
                        .setRequired(false)
                        .setMaxLength(24)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('top')
                .setDescription('Show server guild leaderboard.')
                .addIntegerOption((o) =>
                    o.setName('limit')
                        .setDescription('How many guilds')
                        .setRequired(false)
                        .setMinValue(3)
                        .setMaxValue(20)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('promote')
                .setDescription('Promote a guild member to officer (leader only).')
                .addUserOption((o) =>
                    o.setName('user')
                        .setDescription('Member to promote')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('demote')
                .setDescription('Demote an officer back to member (leader only).')
                .addUserOption((o) =>
                    o.setName('user')
                        .setDescription('Officer to demote')
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('mission')
                .setDescription('Show current daily and weekly guild missions.')
        )
        .addSubcommand((sub) =>
            sub
                .setName('claim')
                .setDescription('Claim current guild mission reward (leader/officer only).')
                .addStringOption((o) =>
                    o.setName('type')
                        .setDescription('Mission scope')
                        .setRequired(false)
                        .addChoices(
                            { name: 'All Ready', value: 'all' },
                            { name: 'Daily', value: 'daily' },
                            { name: 'Weekly', value: 'weekly' }
                        )
                )
        ),

    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({
                content: 'This command can only be used in a server.',
                flags: MessageFlags.Ephemeral
            });
        }

        const profile = await Profiles.findOne({ where: { userId: interaction.user.id } });
        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start first.',
                flags: MessageFlags.Ephemeral
            });
        }

        const sub = interaction.options.getSubcommand(true);

        if (sub === 'create') {
            const name = interaction.options.getString('name', true);
            const out = await createGuildForProfile(profile.id, interaction.guildId, name);
            if (!out.ok) {
                const msg = out.reason === 'INVALID_NAME'
                    ? 'Invalid guild name. Use 3-24 chars: letters, numbers, spaces, `_`, `-`.'
                    : out.reason === 'ALREADY_IN_GUILD'
                        ? 'You are already in a guild. Leave first.'
                        : out.reason === 'NOT_ENOUGH_CRYSTALS'
                            ? `Not enough crystals. Required: ${GUILD_CREATE_COST_CRYSTALS}, you have ${Math.max(0, Number(out.currentCrystals) || 0)}.`
                        : out.reason === 'NAME_TAKEN'
                            ? 'This guild name is already taken in this server.'
                            : 'Could not create guild.';
                return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
            }

            return interaction.reply({
                content: `Guild created: **${out.guild.name}** (Lv ${out.guild.level}). Cost paid: ${GUILD_CREATE_COST_CRYSTALS} crystals.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'join') {
            const name = interaction.options.getString('name', true);
            const out = await joinGuildForProfile(profile.id, interaction.guildId, name);
            if (!out.ok) {
                const msg = out.reason === 'INVALID_NAME'
                    ? 'Invalid guild name.'
                    : out.reason === 'ALREADY_IN_GUILD'
                        ? 'You are already in a guild. Leave first.'
                        : out.reason === 'NOT_FOUND'
                            ? 'Guild not found in this server.'
                            : out.reason === 'FULL'
                                ? `Guild is full (${GUILD_MEMBER_CAP}/${GUILD_MEMBER_CAP}).`
                                : 'Could not join guild.';
                return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
            }

            return interaction.reply({
                content: `Joined guild: **${out.guild.name}**.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'leave') {
            const out = await leaveGuildForProfile(profile.id);
            if (!out.ok) {
                const msg = out.reason === 'NOT_IN_GUILD'
                    ? 'You are not in a guild.'
                    : 'Could not leave guild.';
                return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({
                content: out.disbanded
                    ? `You left **${out.leftGuildName}**. The guild was disbanded (no members left).`
                    : `You left **${out.leftGuildName}**.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'info') {
            const name = interaction.options.getString('name', false);
            const guild = await getGuildInfo(interaction.guildId, name, profile.id);
            if (!guild) {
                return interaction.reply({
                    content: name ? 'Guild not found.' : 'You are not in a guild.',
                    flags: MessageFlags.Ephemeral
                });
            }
            const ownerName = await getOwnerName(guild.ownerProfileId);
            const role = getGuildRole(guild, profile.id);
            const embed = new EmbedBuilder()
                .setColor('#245c3a')
                .setTitle(`Guild - ${guild.name}`)
                .setDescription(`${formatGuildSummary(guild, ownerName)}\n${formatMissionLine(guild)}\nYour role: **${role}**`);
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === 'promote' || sub === 'demote') {
            const target = interaction.options.getUser('user', true);
            if (target.bot) {
                return interaction.reply({ content: 'Bots cannot be promoted/demoted.', flags: MessageFlags.Ephemeral });
            }
            const out = await setOfficerByUserId({
                discordGuildId: interaction.guildId,
                executorProfileId: profile.id,
                targetUserId: target.id,
                makeOfficer: sub === 'promote'
            });
            if (!out.ok) {
                const msg = out.reason === 'NOT_IN_GUILD'
                    ? 'You are not in a guild.'
                    : out.reason === 'GUILD_NOT_FOUND'
                        ? 'Guild not found.'
                        : out.reason === 'NOT_LEADER'
                            ? 'Only the guild leader can promote/demote officers.'
                            : out.reason === 'TARGET_NO_PROFILE'
                                ? 'Target user has no profile.'
                                : out.reason === 'TARGET_NOT_MEMBER'
                                    ? 'Target user is not in your guild.'
                                    : out.reason === 'TARGET_IS_LEADER'
                                        ? 'Leader role cannot be changed with this command.'
                                        : out.reason === 'ALREADY_OFFICER'
                                            ? 'Target is already an officer.'
                                            : out.reason === 'NOT_OFFICER'
                                                ? 'Target is not an officer.'
                                                : 'Could not update guild role.';
                return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({
                content: sub === 'promote'
                    ? `Promoted **${out.targetName}** to **Officer**.`
                    : `Demoted **${out.targetName}** to **Member**.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'mission') {
            const guild = await getGuildInfo(interaction.guildId, null, profile.id);
            if (!guild) {
                return interaction.reply({ content: 'You are not in a guild.', flags: MessageFlags.Ephemeral });
            }
            const ownerName = await getOwnerName(guild.ownerProfileId);
            const role = getGuildRole(guild, profile.id);
            const embed = new EmbedBuilder()
                .setColor('#245c3a')
                .setTitle(`Guild Mission - ${guild.name}`)
                .setDescription(
                    `Owner: **${ownerName}**\n` +
                    `${formatMissionLine(guild)}\n` +
                    `Your role: **${role}**\n` +
                    `Claim permission: **${(role === 'leader' || role === 'officer') ? 'Yes' : 'No'}**`
                );
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === 'claim') {
            const claimType = interaction.options.getString('type', false) || 'all';
            const out = await claimGuildMissionRewards(profile.id, interaction.guildId, claimType);
            if (!out.ok) {
                const msg = out.reason === 'NOT_IN_GUILD'
                    ? 'You are not in a guild.'
                    : out.reason === 'GUILD_NOT_FOUND'
                        ? 'Guild not found.'
                        : out.reason === 'NOT_ALLOWED'
                            ? 'Only leader/officers can claim guild mission rewards.'
                            : out.reason === 'NOT_READY'
                                ? 'Mission is not ready yet.'
                                : out.reason === 'ALREADY_CLAIMED'
                                    ? 'Mission reward was already claimed this week.'
                                    : 'Could not claim guild mission reward.';
                return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
            }

            return interaction.reply({
                content:
                    `Guild mission reward claimed (${(out.claimedCycles || []).join(', ') || claimType}) for **${out.memberCount}** member(s).\n` +
                    `Each member received: +${out.rewardCrystals} crystals, +${out.rewardXp} XP.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const limit = interaction.options.getInteger('limit', false) || 10;
        const rows = await getGuildTop(interaction.guildId, limit);
        const text = rows.length
            ? rows.map((g, i) => {
                const b = getGuildBonuses(g.level);
                return `${i + 1}. ${g.name} | Lv ${g.level} | Members ${g.membersCount} | Bonus +${b.xpBonusPct}% XP / +${b.crystalBonusPct}% crystals`;
            }).join('\n')
            : '- none';
        const embed = new EmbedBuilder()
            .setColor('#245c3a')
            .setTitle('Guild Leaderboard')
            .setDescription(text);
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
