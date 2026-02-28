const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Profiles } = require('./database.js');

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

client.login(token);
