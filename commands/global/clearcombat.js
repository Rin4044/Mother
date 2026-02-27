const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Op } = require('sequelize');
const { Profiles, FightProgress, SpawnInstances } = require('../../database.js');
const { activeFights, clearFightTimeout } = require('./arena.js');
const { calculatePlayerStats } = require('../../utils/playerStats');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearcombat')
        .setDescription('Clear only the current combat state for a user.')
        .setDefaultMemberPermissions(0x8)
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('User to unstuck')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const target = interaction.options.getUser('target');
        const profile = await Profiles.findOne({ where: { userId: target.id } });

        if (!profile) {
            return interaction.editReply({
                content: `${target.username} has no profile.`
            });
        }

        const resetStats = await calculatePlayerStats(profile);

        // Clear profile combat state and runtime resources only.
        await profile.update({
            combatState: null,
            remainingHp: resetStats?.hp ?? profile.baseHp ?? 26,
            remainingMp: resetStats?.mp ?? profile.baseMp ?? 26,
            remainingStamina: resetStats?.stamina ?? profile.baseStamina ?? 26,
            remainingVitalStamina: resetStats?.vitalStamina ?? profile.baseVitalStamina ?? 26
        });

        // Clear tower-fight lock (not progression itself).
        await FightProgress.update(
            {
                currentMonsterHp: null,
                isInCombat: false
            },
            { where: { profileId: profile.id } }
        );

        // Release any wandering spawn lock held by this player.
        await SpawnInstances.update(
            { occupiedBy: null },
            { where: { occupiedBy: profile.id } }
        );

        // Clear any arena fight entry involving this user.
        const relatedFights = new Set();
        for (const fight of activeFights.values()) {
            if (!fight) continue;
            if (fight.playerA === target.id || fight.playerB === target.id || fight.initiatorId === target.id || fight.opponent === target.id) {
                relatedFights.add(fight);
            }
        }

        for (const fight of relatedFights) {
            clearFightTimeout(fight);
            if (fight.playerA) activeFights.delete(fight.playerA);
            if (fight.playerB) activeFights.delete(fight.playerB);
            if (fight.initiatorId) activeFights.delete(fight.initiatorId);
            if (fight.opponent) activeFights.delete(fight.opponent);
        }

        return interaction.editReply({
            content: `Combat state cleared for **${target.username}** (tower/spawn/pvp).`
        });
    }
};
