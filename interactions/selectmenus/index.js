const { selectSkill } = require('./src/selectSkill.js');
const { handleSkillSelection } = require('../selectmenus/src/attackSkillPvP.js');
const { handleFightAttack } = require('../selectmenus/src/fightSelect.js');
const { handleRaidAttackSelect } = require('../selectmenus/src/raidSelect.js');
const DISCORD_UNKNOWN_INTERACTION = 10062;
const DISCORD_ALREADY_ACK = 40060;
const DISCORD_TRANSIENT_HTTP = new Set([502, 503, 504]);

function isIgnorableSelectError(error) {
    if (!error) return false;
    if (error.code === DISCORD_UNKNOWN_INTERACTION || error.code === DISCORD_ALREADY_ACK) return true;
    if (DISCORD_TRANSIENT_HTTP.has(Number(error.status))) return true;
    return false;
}

async function safeEphemeralReply(interaction, content) {
    if (interaction.replied || interaction.deferred) return;

    try {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch (error) {
        if (!isIgnorableSelectError(error)) {
            console.error('select fallback reply error:', error);
        }
    }
}

async function runSelectHandlerSafely(handler) {
    try {
        return await handler();
    } catch (error) {
        if (isIgnorableSelectError(error)) {
            return;
        }

        console.error('select menu handler error:', error);
        return;
    }
}

async function routeSelectMenu(interaction, client) {

    const id = interaction.customId;

    // ==============================
    // MY SKILLS → DETAIL VIEW
    // ==============================
    if (id.startsWith('skill_select|')) {
        return runSelectHandlerSafely(() => selectSkill(interaction, client));
    }

    // ==============================
    // PVP ATTACK
    // ==============================
    if (id.startsWith('pvp_attack')) {
        return runSelectHandlerSafely(() => handleSkillSelection(interaction, client));
    }

    // ==============================
    // PVE SPAWN ATTACK
    // ==============================
    if (id.startsWith('attack_') || id.startsWith('fight_select_')) {
        return runSelectHandlerSafely(() => handleFightAttack(interaction));
    }

    // ==============================
    // RAID ATTACK MENU
    // ==============================
    if (id.startsWith('raid_attack_select_')) {
        return runSelectHandlerSafely(() => handleRaidAttackSelect(interaction));
    }

    // ==============================
    // RACE TREE MENU
    // ==============================
    // Handled by the command-local collector in /race tree.
    if (id.startsWith('race_tree_select')) {
        return;
    }

    // ==============================
    // FALLBACK
    // ==============================
    console.log(`No select menu handler found for: ${id}`);
    return safeEphemeralReply(interaction, 'Interaction not found.');
}

module.exports = { routeSelectMenu };
