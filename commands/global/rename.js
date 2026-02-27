const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Profiles, InventoryItems, sequelize } = require('../../database');
const { normalizeItemKey } = require('../../utils/inventoryService');

const NAME_CHANGE_TICKET = 'Name Change Ticket';
const NAME_MIN = 3;
const NAME_MAX = 25;

const BANNED_WORDS = [
    'fuck', 'shit', 'bitch', 'asshole', 'nigger', 'nigga', 'puta', 'pute', 'encule', 'salope'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Use 1 Name Change Ticket to change your profile name.')
        .addStringOption((option) =>
            option
                .setName('name')
                .setDescription(`New name (${NAME_MIN}-${NAME_MAX} letters)`)
                .setRequired(true)
        ),

    async execute(interaction) {
        const profile = await Profiles.findOne({
            where: { userId: interaction.user.id }
        });

        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start.',
                flags: MessageFlags.Ephemeral
            });
        }

        const requestedName = interaction.options.getString('name', true).trim();
        const validationError = validateProfileName(requestedName);
        if (validationError) {
            return interaction.reply({
                content: validationError,
                flags: MessageFlags.Ephemeral
            });
        }

        const ticketKey = normalizeItemKey(NAME_CHANGE_TICKET);
        try {
            await sequelize.transaction(async (transaction) => {
                const ticket = await InventoryItems.findOne({
                    where: { profileId: profile.id, itemKey: ticketKey },
                    transaction
                });

                const availableTickets = Math.max(0, Number(ticket?.quantity) || 0);
                if (availableTickets < 1) {
                    throw new Error('MISSING_TICKET');
                }

                profile.name = requestedName;
                await profile.save({ transaction });

                const remaining = availableTickets - 1;
                if (remaining <= 0) {
                    await ticket.destroy({ transaction });
                } else {
                    ticket.quantity = remaining;
                    await ticket.save({ transaction });
                }
            });
        } catch (error) {
            if (error.message === 'MISSING_TICKET') {
                return interaction.reply({
                    content: `You need **${NAME_CHANGE_TICKET} x1** in your inventory.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            throw error;
        }

        return interaction.reply({
            content: `Your profile name is now **${requestedName}**. (1 ${NAME_CHANGE_TICKET} consumed)`,
            flags: MessageFlags.Ephemeral
        });
    }
};

function validateProfileName(name) {
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
        return `Name must be between ${NAME_MIN} and ${NAME_MAX} characters.`;
    }

    if (!/^[A-Za-z ]+$/.test(name)) {
        return 'Name can contain only letters and spaces (no numbers or special characters).';
    }

    if (/  +/.test(name)) {
        return 'Name cannot contain multiple consecutive spaces.';
    }

    const normalized = name.toLowerCase();
    for (const word of BANNED_WORDS) {
        if (normalized.includes(word)) {
            return 'Name contains forbidden words.';
        }
    }

    return null;
}
