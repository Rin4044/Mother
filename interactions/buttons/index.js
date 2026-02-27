const { handleEvolution } = require('../buttons/src/evolutionButtons.js');
const { handleArena } = require('../buttons/src/arenaButtons.js');
const { handleshop } = require('../buttons/src/skillShopButtons.js');
const { skillPanelHandle } = require('../buttons/src/skillsPanelButtons.js');
const { handleFightStart } = require('../buttons/src/fightButtons.js');
const { titlePanelHandle } = require('../buttons/src/titlePanelButtons.js');
const DISCORD_UNKNOWN_INTERACTION = 10062;
const DISCORD_ALREADY_ACK = 40060;

async function safeEphemeralReply(interaction, content) {
    if (interaction.replied || interaction.deferred) return;

    try {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
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
    // FALLBACK
    // ==============================
    console.log(`No handler found for button: ${id}`);
    return safeEphemeralReply(interaction, 'Interaction not found.');
}

module.exports = { routeButton };
