const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { token, clientId } = require('./config.json');
const { Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

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