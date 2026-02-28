const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Profiles } = require('./database.js');
const { updateAllGuildStatuses, sendCrashReport } = require('./utils/botLogService');

let token = process.env.DISCORD_TOKEN || null;
if (!token) {
    try {
        token = require('./config.json').token;
    } catch (_) {
        token = null;
    }
}

if (!token) {
    throw new Error('Missing bot token. Set DISCORD_TOKEN in environment.');
}

const webPort = Number(process.env.PORT);
if (Number.isInteger(webPort) && webPort > 0) {
    const healthServer = http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('ok');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Mother bot is running');
    });

    healthServer.listen(webPort, '0.0.0.0', () => {
        console.log(`Health server listening on port ${webPort}`);
    });
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

const disconnectRestartMs = Number(process.env.DISCORD_DISCONNECT_RESTART_MS || 180000);
let disconnectRestartTimer = null;
let fatalExitInProgress = false;

function clearDisconnectRestartTimer() {
    if (disconnectRestartTimer) {
        clearTimeout(disconnectRestartTimer);
        disconnectRestartTimer = null;
    }
}

function scheduleDisconnectRestart(reason) {
    if (!Number.isInteger(disconnectRestartMs) || disconnectRestartMs <= 0) {
        return;
    }
    if (disconnectRestartTimer) {
        return;
    }

    console.warn(`Disconnect watchdog armed (${Math.round(disconnectRestartMs / 1000)}s): ${reason}`);
    disconnectRestartTimer = setTimeout(() => {
        const watchdogError = new Error('Discord disconnect watchdog timeout');
        handleFatalExit('disconnect_watchdog_timeout', watchdogError);
    }, disconnectRestartMs);
}

function normalizeError(value) {
    if (value instanceof Error) {
        return value;
    }
    if (typeof value === 'string') {
        return new Error(value);
    }
    if (value === null || value === undefined) {
        return new Error(String(value));
    }
    try {
        return new Error(JSON.stringify(value));
    } catch {
        return new Error(String(value));
    }
}

async function handleFatalExit(context, rawError) {
    if (fatalExitInProgress) {
        return;
    }
    fatalExitInProgress = true;

    const error = normalizeError(rawError);
    console.error(`Fatal error (${context}):`, error);

    try {
        await sendCrashReport(client, error, context);
    } catch (reportError) {
        console.error('Failed to send crash report:', reportError);
    }

    try {
        await updateAllGuildStatuses(client, 'restarting', `Fatal error: ${context}`);
    } catch (statusError) {
        console.error('Failed to update status to restarting:', statusError);
    }

    setTimeout(() => process.exit(1), 500).unref();
}

process.on('unhandledRejection', (reason) => {
    const error = normalizeError(reason);
    console.error('Unhandled promise rejection:', error);
    sendCrashReport(client, error, 'unhandledRejection').catch((reportError) => {
        console.error('Failed to send unhandled rejection report:', reportError);
    });
});

process.on('uncaughtException', (error) => {
    handleFatalExit('uncaughtException', error);
});

client.on('error', (error) => {
    console.error('Discord client error:', error);
});

client.on('shardError', (error, shardId) => {
    console.error(`Discord shard ${shardId} error:`, error);
});

client.on('shardDisconnect', (event, shardId) => {
    console.warn(`Discord shard ${shardId} disconnected (code: ${event?.code ?? 'unknown'})`);
    updateAllGuildStatuses(client, 'offline', `Shard ${shardId} disconnected (code: ${event?.code ?? 'unknown'})`).catch(() => {});
    scheduleDisconnectRestart(`shard ${shardId} disconnected`);
});

client.on('shardReconnecting', (shardId) => {
    console.warn(`Discord shard ${shardId} reconnecting...`);
    updateAllGuildStatuses(client, 'restarting', `Shard ${shardId} reconnecting`).catch(() => {});
});

client.on('shardResume', (replayedEvents, shardId) => {
    console.log(`Discord shard ${shardId} resumed (${replayedEvents} replayed events).`);
    clearDisconnectRestartTimer();
    updateAllGuildStatuses(client, 'online', `Shard ${shardId} resumed (${replayedEvents} replayed events)`).catch(() => {});
});

client.on('ready', () => {
    clearDisconnectRestartTimer();
    updateAllGuildStatuses(client, 'online', 'Bot is fully connected.').catch(() => {});
});

process.on('SIGINT', () => {
    updateAllGuildStatuses(client, 'offline', 'Process received SIGINT.').finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
    updateAllGuildStatuses(client, 'offline', 'Process received SIGTERM.').finally(() => process.exit(0));
});

const cooldowns = new Map();

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands/global');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if (command.data && command.data.name) {
        client.commands.set(command.data.name, command);
    } else {
        console.warn(`Command ${file} is missing a valid data.name property`);
    }
}

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const userId = message.author.id;
    const profile = await Profiles.findOne({ where: { userId } });
    if (!profile) return;

    const now = Date.now();
    const cooldown = cooldowns.get(userId) || 0;

    if (now - cooldown < 2000) {
        return;
    }

    cooldowns.set(userId, now);

    // Title auto-acquisition is disabled for now.
    // acquisition_skill_* fields are not unlock requirements.
});

const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Error executing command:', error);
        try {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: 'There was an error while executing this command.'
                });
            } else if (interaction.replied) {
                await interaction.followUp({
                    content: 'There was an error while executing this command.',
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    content: 'There was an error while executing this command.',
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (replyError) {
            console.error('Failed to send interaction error response:', replyError);
        }
    }
});

client.login(token).catch((error) => {
    handleFatalExit('login_failure', error);
});
