const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');

const { Monsters } = require('../../database.js');

const ITEMS_PER_PAGE = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('monsterindex')
        .setDescription('View existing monsters')
        .addIntegerOption(o =>
            o.setName('id')
                .setDescription('Monster ID')
                .setRequired(false)
        ),

    async execute(interaction) {

        const idInput = interaction.options.getInteger('id');

        // =====================================================
        // SINGLE MONSTER VIEW
        // =====================================================

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
                .setTitle(`👹 ${monster.name}`)
                .setDescription(
                    `HP: ${monster.hp}
MP: ${monster.mp}
Stamina: ${monster.stamina}
Vital Stamina: ${monster.vitalStamina}
Offense: ${monster.offense}
Defense: ${monster.defense}
Magic: ${monster.magic}
Resistance: ${monster.resistance}
Speed: ${monster.speed}`
                );

            return interaction.reply({ embeds: [embed] });
        }

        // =====================================================
        // PAGINATED LIST
        // =====================================================

        const monsters = await Monsters.findAll({
            order: [['id', 'ASC']]
        });

        if (!monsters.length) {
            return interaction.reply({
                content: 'No monsters found.',
                flags: MessageFlags.Ephemeral
            });
        }

        let page = 0;
        const totalPages = Math.ceil(monsters.length / ITEMS_PER_PAGE);
        const userId = interaction.user.id;

        const buildEmbed = () => {
            const start = page * ITEMS_PER_PAGE;
            const current = monsters.slice(start, start + ITEMS_PER_PAGE);

            const list = current
                .map(m => `**ID ${m.id}** • ${m.name}`)
                .join('\n');

            return new EmbedBuilder()
                .setColor('#290003')
                .setTitle('📖 Monster Index')
                .setDescription(list)
                .setFooter({
                    text: `Page ${page + 1} / ${totalPages}`
                });
        };

        const buildButtons = () => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`monster_prev_${userId}`)
                    .setLabel('⬅')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),

                new ButtonBuilder()
                    .setCustomId(`monster_next_${userId}`)
                    .setLabel('➡')
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

            // Security
            if (i.user.id !== userId) {
                return i.reply({
                    content: 'Not your menu.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await i.deferUpdate(); // Ack immediately

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