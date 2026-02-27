const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let token = process.env.DISCORD_TOKEN || null;
let clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID || null;

if (!token || !clientId) {
    try {
        const localConfig = require('./config.json');
        token = token || localConfig.token;
        clientId = clientId || localConfig.clientId;
    } catch (_) {
        // ignore local config fallback errors on hosted envs
    }
}

if (!token) {
    throw new Error('Missing DISCORD_TOKEN for command deployment.');
}
if (!clientId) {
    throw new Error('Missing DISCORD_CLIENT_ID for command deployment.');
}

const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands(client) {
    const commands = [];
    client.commands = new Collection();

    const commandsPath = path.join(__dirname, 'commands', 'global');
    const commandFiles = fs
        .readdirSync(commandsPath)
        .filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if (!command.data || !command.execute) {
            console.warn(`⚠️ Skipping invalid command file: ${file}`);
            continue;
        }

        commands.push(command.data.toJSON());
        client.commands.set(command.data.name, command);
    }

    try {
        console.log(`➔ Deploying ${commands.length} global commands...`);

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        console.log('✅ Successfully registered application commands.');
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
}

module.exports = { deployCommands };
