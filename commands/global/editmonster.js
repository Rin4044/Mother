const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Monsters } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('editmonster')
        .setDescription('Edit an existing monster (Admin only)')
        .setDefaultMemberPermissions(0x8)

        .addIntegerOption(o =>
            o.setName('id')
                .setDescription('Monster ID')
                .setRequired(true)
        )

        .addIntegerOption(o => o.setName('hp').setDescription('New HP'))
        .addIntegerOption(o => o.setName('mp').setDescription('New MP'))
        .addIntegerOption(o => o.setName('stamina').setDescription('New Stamina'))
        .addIntegerOption(o => o.setName('vitalstamina').setDescription('New Vital Stamina'))
        .addIntegerOption(o => o.setName('offense').setDescription('New Offense'))
        .addIntegerOption(o => o.setName('defense').setDescription('New Defense'))
        .addIntegerOption(o => o.setName('magic').setDescription('New Magic'))
        .addIntegerOption(o => o.setName('resistance').setDescription('New Resistance'))
        .addIntegerOption(o => o.setName('speed').setDescription('New Speed'))
        .addIntegerOption(o => o.setName('level').setDescription('New Level'))
        .addStringOption(o => o.setName('image').setDescription('New image filename')),

    async execute(interaction) {

        const id = interaction.options.getInteger('id');

        const monster = await Monsters.findByPk(id);

        if (!monster) {
            return interaction.reply({
                content: 'Monster not found.',
                flags: MessageFlags.Ephemeral
            });
        }

        const fieldMap = {
            hp: 'hp',
            mp: 'mp',
            stamina: 'stamina',
            vitalstamina: 'vitalStamina',
            offense: 'offense',
            defense: 'defense',
            magic: 'magic',
            resistance: 'resistance',
            speed: 'speed',
            level: 'level'
        };

        const updates = {};

        for (const optionName in fieldMap) {

            const value = interaction.options.getInteger(optionName);

            if (value !== null) {

                if (value < 0) {
                    return interaction.reply({
                        content: `${optionName} cannot be negative.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const dbField = fieldMap[optionName];
                updates[dbField] = value;

                // Sync remaining stats if main stats changed
                if (dbField === 'hp') updates.remainingHp = value;
                if (dbField === 'mp') updates.remainingMp = value;
                if (dbField === 'stamina') updates.remainingStamina = value;
                if (dbField === 'vitalStamina') updates.remainingVitalStamina = value;
            }
        }

        const imageValue = interaction.options.getString('image');
        if (imageValue !== null) {
            updates.image = imageValue;
        }

        if (Object.keys(updates).length === 0) {
            return interaction.reply({
                content: 'No changes provided.',
                flags: MessageFlags.Ephemeral
            });
        }

        await monster.update(updates);

        const embed = new EmbedBuilder()
            .setColor('#290003')
            .setTitle(`✏️ Monster Updated: ${monster.name}`)
            .setDescription(
                Object.entries(updates)
                    .map(([key, value]) => `**${key}** → ${value}`)
                    .join('\n')
            );

        return interaction.reply({ embeds: [embed] });
    }
};