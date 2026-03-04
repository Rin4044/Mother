const { handleEvolution } = require('../buttons/src/evolutionButtons.js');
const { handleArena } = require('../buttons/src/arenaButtons.js');
const { handleshop } = require('../buttons/src/skillShopButtons.js');
const { skillPanelHandle } = require('../buttons/src/skillsPanelButtons.js');
const { handleFightStart } = require('../buttons/src/fightButtons.js');
const { titlePanelHandle } = require('../buttons/src/titlePanelButtons.js');
const { handleAdventurerGuildButton } = require('../buttons/src/adventurerGuildButtons.js');
const { handleRaidLobbyButton } = require('../buttons/src/raidButtons.js');
const { handleSynthesisButton } = require('../buttons/src/synthesisButtons.js');
const adminCommand = require('../../commands/global/admin.js');
const questboardCommand = require('../../commands/global/questboard.js');
const questCommand = require('../../commands/global/quest.js');
const achievementsCommand = require('../../commands/global/achievements.js');
const EPHEMERAL_FLAG = 1 << 6;
const DISCORD_UNKNOWN_INTERACTION = 10062;
const DISCORD_ALREADY_ACK = 40060;

async function safeEphemeralReply(interaction, content) {
    if (interaction.replied || interaction.deferred) return;

    try {
        await interaction.reply({ content, flags: EPHEMERAL_FLAG });
    } catch (error) {
        if (error?.code !== DISCORD_UNKNOWN_INTERACTION && error?.code !== DISCORD_ALREADY_ACK) {
            console.error('button fallback reply error:', error);
        }
    }
}

async function routeButton(interaction, client) {

    const id = interaction.customId;

    // ==============================
    // MYSKILLS PAGINATION
    // ==============================
    // Handled by the command-local collector in /myskills.
    // Ignore here so we don't consume the interaction first.
    if (id.startsWith('skill_prev|') || id.startsWith('skill_next|')) {
        return;
    }
    if (id.startsWith('monster_prev_') || id.startsWith('monster_next_')) {
        return;
    }

    // ==============================
    // ARENA
    // ==============================
    if (id.startsWith('accept_') || id.startsWith('decline_')) {
        return handleArena(interaction, client);
    }

    // ==============================
    // EVOLUTION
    // ==============================
    if (id.startsWith('evo_')) {
        return handleEvolution(interaction);
    }

    // ==============================
    // SKILL SHOP
    // ==============================
    if (id.startsWith('shop_')) {
        return handleshop(interaction);
    }

    // ==============================
    // SKILL PANEL
    // ==============================
    if (id.startsWith('panel_')) {
        return skillPanelHandle(interaction);
    }

    // ==============================
    // TITLE PANEL
    // ==============================
    if (id.startsWith('titlepanel_')) {
        return titlePanelHandle(interaction);
    }

    // ==============================
    // FIGHT START (PvE)
    // ==============================
    if (id.startsWith('fight_start')) {
        return handleFightStart(interaction);
    }

    // ==============================
    // ADVENTURER GUILD COUNTER
    // ==============================
    if (id.startsWith('advguild_')) {
        return handleAdventurerGuildButton(interaction);
    }

    // ==============================
    // RAID LOBBY BUTTONS
    // ==============================
    if (id.startsWith('raid_lobby_')) {
        return handleRaidLobbyButton(interaction);
    }

    // ==============================
    // SYNTHESIS BUTTONS
    // ==============================
    if (id.startsWith('synthesis_btn_')) {
        return handleSynthesisButton(interaction);
    }

    // ==============================
    // QUEST PANEL BUTTONS
    // ==============================
    if (id.startsWith('quest_')) {
        return questCommand.handleQuestButton(interaction);
    }

    // ==============================
    // ACHIEVEMENTS PANEL BUTTONS
    // ==============================
    if (id.startsWith('achievements_')) {
        return achievementsCommand.handleAchievementButton(interaction);
    }

    // ==============================
    // ADMIN CONFIRM/CANCEL BUTTONS
    // ==============================
    if (id.startsWith('admin_confirm_') || id.startsWith('admin_cancel_') || id === 'admin_ranked_toggle_infinite') {
        return adminCommand.handleAdminActionButton(interaction);
    }

    // ==============================
    // QUESTBOARD ADMIN CONFIRM/CANCEL
    // ==============================
    if (id.startsWith('questboard_admin_confirm_') || id.startsWith('questboard_admin_cancel_')) {
        return questboardCommand.handleQuestboardAdminButton(interaction);
    }

    // ==============================
    // FALLBACK
    // ==============================
    console.log(`No handler found for button: ${id}`);
    return safeEphemeralReply(interaction, 'Interaction not found.');
}

module.exports = { routeButton };
