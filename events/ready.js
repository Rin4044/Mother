const { ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');

const { deployCommands } = require('../functions');
const { SpawnChannels, SpawnConfig, Monsters, SpawnInstances } = require('../database');
const { rollRarity } = require('../utils/raritySystem');

module.exports = {
    name: 'ready',
    once: true,

    async execute(client) {
        console.log(`-> Bot started as ${client.user.tag}`);

        await deployCommands(client);

        const loadedCommands = await client.application.commands.fetch();
        console.log(`-> Loaded commands: ${loadedCommands.size}`);

        client.user.setPresence({
            status: 'online',
            activities: [{
                name: 'Lurking in the Abyss',
                type: ActivityType.Playing
            }]
        });

        setInterval(async () => {
            const channels = await SpawnChannels.findAll();
            const now = Date.now();

            for (const channel of channels) {
                const config = await SpawnConfig.findOne({
                    where: { guildId: channel.guildId }
                });

                if (!config || !config.enabled) continue;

                const expiredInstances = await SpawnInstances.findAll({
                    where: {
                        spawnChannelId: channel.id,
                        despawnAt: { [Op.lte]: now }
                    }
                });

                if (expiredInstances.length) {
                    const discordChannel = await client.channels.fetch(channel.channelId).catch(() => null);

                    for (const instance of expiredInstances) {
                        if (discordChannel) {
                            if (instance.spawnMessageId) {
                                try {
                                    const spawnMessage = await discordChannel.messages.fetch(instance.spawnMessageId);
                                    await spawnMessage.edit({
                                        content: `\u26A0 ${instance.monster.name} has disappeared.`,
                                        components: []
                                    });
                                } catch (error) {
                                    console.log('Failed to edit expired spawn message:', error.message);
                                }
                            }

                            await discordChannel.send(
                                `\u26A0 **${instance.monster.name} disappeared...**`
                            );
                        }

                        await instance.destroy();
                    }
                }

                if (!channel.nextSpawnAt || now >= channel.nextSpawnAt) {
                    await spawnMonster(client, channel, config);
                }
            }
        }, 30000);

        console.log('-> Monster spawn scheduler started.');
    }
};

async function spawnMonster(client, channel, config) {
    const allowedIds = normalizeIntegerArray(channel.monsterIds);
    const levelPool = normalizeIntegerArray(channel.levels);

    let monsters = [];

    if (allowedIds.length) {
        monsters = await Monsters.findAll({
            where: { id: { [Op.in]: allowedIds } }
        });
    } else if (levelPool.length) {
        // Legacy fallback: old channels configured by level.
        const randomLevel =
            levelPool[Math.floor(Math.random() * levelPool.length)];

        monsters = await Monsters.findAll({
            where: { level: randomLevel }
        });
    }

    if (!monsters.length) return;

    const monster =
        monsters[Math.floor(Math.random() * monsters.length)];

    const rarity = rollRarity();

    const scaledMonster = {
        id: monster.id,
        name: monster.name,
        image: monster.image,
        level: monster.level,
        rarity: rarity.name,
        hp: Math.floor(monster.hp * rarity.multiplier),
        maxHp: Math.floor(monster.hp * rarity.multiplier),
        mp: Math.floor(monster.mp * rarity.multiplier),
        maxMp: Math.floor(monster.mp * rarity.multiplier),
        stamina: Math.floor(monster.stamina * rarity.multiplier),
        maxStamina: Math.floor(monster.stamina * rarity.multiplier),
        vitalStamina: Math.floor(monster.vitalStamina * rarity.multiplier),
        maxVitalStamina: Math.floor(monster.vitalStamina * rarity.multiplier),
        offense: Math.floor(monster.offense * rarity.multiplier),
        defense: Math.floor(monster.defense * rarity.multiplier),
        magic: Math.floor(monster.magic * rarity.multiplier),
        resistance: Math.floor(monster.resistance * rarity.multiplier),
        speed: Math.floor(monster.speed * rarity.multiplier),
        xpMultiplier: rarity.xp
    };

    const spawnInstance = await SpawnInstances.create({
        spawnChannelId: channel.id,
        guildId: channel.guildId,
        channelId: channel.channelId,
        monster: scaledMonster,
        occupiedBy: null,
        despawnAt: Date.now() + (3 * 60 * 1000)
    });

    const base = channel.baseTimer ?? config.baseTimer;
    const variance = channel.variance ?? config.variance;

    const randomTime =
        Math.floor(Math.random() * ((base + variance) - (base - variance)))
        + (base - variance);

    channel.nextSpawnAt = Date.now() + (randomTime * 1000);

    await channel.save();

    const discordChannel = await client.channels.fetch(channel.channelId);
    if (!discordChannel) return;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`spawn_fight_instance_${spawnInstance.id}`)
            .setLabel('Fight')
            .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
        .setColor('#290003')
        .setTitle(scaledMonster.name)
        .setDescription(
            `Rarity: **${scaledMonster.rarity}**\n` +
            `Level: **${scaledMonster.level}**`
        );

    const imageAttachment = resolveMonsterImageAttachment(monster.image);
    if (imageAttachment) {
        embed.setImage(`attachment://${imageAttachment.name}`);
    }

    const spawnMessage = await discordChannel.send({
        content: `\uD83D\uDD25 A ${scaledMonster.rarity} Level ${scaledMonster.level} ${scaledMonster.name} has appeared!`,
        embeds: [embed],
        components: [row],
        files: imageAttachment ? [imageAttachment] : []
    });

    spawnInstance.spawnMessageId = spawnMessage.id;
    await spawnInstance.save();

    if (scaledMonster.rarity === 'Boss') {
        await discordChannel.send(
            '\uD83D\uDC51 **A BOSS HAS EMERGED! PREPARE YOURSELVES!**'
        );
    }
}

function resolveMonsterImageAttachment(imageName) {
    if (!imageName) return null;

    const imagePath = path.resolve('utils', 'images', imageName);
    if (!fs.existsSync(imagePath)) return null;

    return new AttachmentBuilder(imagePath, { name: imageName });
}

function normalizeIntegerArray(value) {
    let parsed = value;

    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            parsed = parsed
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);
        }
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0);
}
