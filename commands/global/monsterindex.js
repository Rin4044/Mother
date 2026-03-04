const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');

const { Monsters } = require('../../database.js');
const { resolveMonsterImage } = require('../../utils/resolveMonsterImage');

const ITEMS_PER_PAGE = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('monsterindex')
        .setDescription('View existing monsters')
        .addIntegerOption(o =>
            o.setName('id')
                .setDescription('Monster ID')
                .setRequired(false)
        )
        .addStringOption(o =>
            o.setName('search')
                .setDescription('Search by name (partial match)')
                .setRequired(false)
                .setMaxLength(30)
        ),

    async execute(interaction) {
        const idInput = interaction.options.getInteger('id');
        const searchInput = (interaction.options.getString('search') || '').trim();
        const normalizedSearch = searchInput.toLowerCase();

        if (idInput) {
            const monster = await Monsters.findByPk(idInput);

            if (!monster) {
                return interaction.reply({
                    content: 'Monster not found.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#290003')
                .setTitle(`Monster: ${monster.name}`)
                .setDescription(
                    `HP: ${monster.hp}\n` +
                    `MP: ${monster.mp}\n` +
                    `Stamina: ${monster.stamina}\n` +
                    `Vital Stamina: ${monster.vitalStamina}\n` +
                    `Offense: ${monster.offense}\n` +
                    `Defense: ${monster.defense}\n` +
                    `Magic: ${monster.magic}\n` +
                    `Resistance: ${monster.resistance}\n` +
                    `Speed: ${monster.speed}`
                );

            const imageAttachment = resolveMonsterImage(monster.image || monster.name);
            if (imageAttachment) {
                embed.setImage(`attachment://${imageAttachment.name}`);
            }

            return interaction.reply({
                embeds: [embed],
                files: imageAttachment ? [imageAttachment] : []
            });
        }

        const monsters = await Monsters.findAll({
            order: [['id', 'ASC']]
        });

        const filteredMonsters = normalizedSearch
            ? monsters.filter(monster => {
                const name = String(monster.name || '').toLowerCase();
                const id = String(monster.id || '');
                return name.includes(normalizedSearch) || id.includes(normalizedSearch);
            })
            : monsters;

        if (!filteredMonsters.length) {
            return interaction.reply({
                content: normalizedSearch ? `No monsters found for "${searchInput}".` : 'No monsters found.',
                flags: MessageFlags.Ephemeral
            });
        }

        let page = 0;
        const totalPages = Math.ceil(filteredMonsters.length / ITEMS_PER_PAGE);
        const userId = interaction.user.id;

        const buildEmbed = () => {
            const start = page * ITEMS_PER_PAGE;
            const current = filteredMonsters.slice(start, start + ITEMS_PER_PAGE);

            const list = current
                .map(monster => `**ID ${monster.id}** - ${monster.name}`)
                .join('\n');

            const embed = new EmbedBuilder()
                .setColor('#290003')
                .setTitle('Monster Index')
                .setDescription(list)
                .setFooter({
                    text: `Page ${page + 1} / ${totalPages}`
                });

            if (normalizedSearch) {
                embed.addFields({
                    name: 'Search',
                    value: `\`${searchInput}\``,
                    inline: false
                });
            }

            return embed;
        };

        const buildButtons = () => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`monster_prev_${userId}`)
                    .setLabel('Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),

                new ButtonBuilder()
                    .setCustomId(`monster_next_${userId}`)
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= totalPages - 1)
            );
        };

        await interaction.reply({
            embeds: [buildEmbed()],
            components: [buildButtons()]
        });

        const message = await interaction.fetchReply();

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.user.id !== userId) {
                return i.reply({
                    content: 'Not your menu.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await i.deferUpdate();

            if (i.customId.startsWith('monster_prev') && page > 0) {
                page--;
            }

            if (i.customId.startsWith('monster_next') && page < totalPages - 1) {
                page++;
            }

            await message.edit({
                embeds: [buildEmbed()],
                components: [buildButtons()]
            });
        });

        collector.on('end', async () => {
            await message.edit({ components: [] }).catch(() => {});
        });
    }
};
