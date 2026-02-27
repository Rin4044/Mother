const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');

const { Profiles, UserSkills, Skills } = require('../../database.js');
const { getSkillXpProgress } = require('../../utils/skillProgression');
const { progressTutorial } = require('../../utils/tutorialService');

const SKILLS_PER_PAGE = 10;
const DISCORD_UNKNOWN_INTERACTION = 10062;

module.exports = {

    data: new SlashCommandBuilder()
        .setName('myskills')
        .setDescription('Displays your skills.'),

    async execute(interaction) {

        const userId = interaction.user.id;

        const profile = await Profiles.findOne({ where: { userId } });

        if (!profile) {
            return interaction.reply({
                content: 'You are not registered. Use /start.',
                flags: MessageFlags.Ephemeral
            });
        }

        const userSkills = await UserSkills.findAll({
            where: { profileId: profile.id },
            include: { model: Skills, as: 'Skill' }
        });

        if (!userSkills.length) {
            return interaction.reply({
                content: 'You have no skills.',
                flags: MessageFlags.Ephemeral
            });
        }

        userSkills.sort((a, b) => {
            if (a.Skill.tier !== b.Skill.tier) {
                return a.Skill.tier - b.Skill.tier;
            }
            return a.Skill.name.localeCompare(b.Skill.name);
        });

        let page = 0;
        const totalPages = Math.ceil(userSkills.length / SKILLS_PER_PAGE);

        const generateEmbed = () => {
            const start = page * SKILLS_PER_PAGE;
            const current = userSkills.slice(start, start + SKILLS_PER_PAGE);

            const list = current.map((us) => {
                const xpState = getSkillXpProgress(us.level, us.xp, us.Skill?.tier, us.Skill?.name);
                const xpText = xpState.isCapped
                    ? 'MAX'
                    : `${xpState.xp}/${xpState.xpNeeded}`;
                const equipTag = us.equippedSlot ? ` [S${us.equippedSlot}]` : '';
                return `- **${us.Skill.name}** [ID ${us.Skill.id}]${equipTag} (Lvl ${xpState.level}/${xpState.cap}, XP ${xpText})`;
            }).join('\n');

            return new EmbedBuilder()
                .setColor('#1f1f23')
                .setTitle(`${profile.name}'s Skills`)
                .setDescription(list)
                .setFooter({ text: `Page ${page + 1}/${totalPages}` });
        };

        const generateComponents = () => {
            const start = page * SKILLS_PER_PAGE;
            const current = userSkills.slice(start, start + SKILLS_PER_PAGE);

            const select = new StringSelectMenuBuilder()
                .setCustomId(`skill_select|${userId}|${page}`)
                .setPlaceholder('View skill details')
                .addOptions(
                    current.map((us) => {
                        const xpState = getSkillXpProgress(us.level, us.xp, us.Skill?.tier, us.Skill?.name);
                        return {
                            label: us.Skill.name,
                            description: `Level ${xpState.level}/${xpState.cap}`,
                            value: `${us.Skill.id}`
                        };
                    })
                );

            const row1 = new ActionRowBuilder().addComponents(select);

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`skill_prev|${userId}`)
                    .setLabel('<-')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),

                new ButtonBuilder()
                    .setCustomId(`skill_next|${userId}`)
                    .setLabel('->')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages - 1)
            );

            return [row1, row2];
        };

        await interaction.reply({
            embeds: [generateEmbed()],
            components: generateComponents()
        });
        const message = await interaction.fetchReply();

        await progressTutorial(profile.id, 'used_myskills');

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) {
                try {
                    if (!i.deferred && !i.replied) {
                        await i.reply({
                            content: 'Not your menu.',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } catch (error) {
                    if (error?.code !== DISCORD_UNKNOWN_INTERACTION) {
                        console.error('myskills unauthorized reply error:', error);
                    }
                }
                return;
            }

            if (i.customId.startsWith('skill_select|')) {
                return;
            }

            if (i.customId.startsWith('skill_prev') && page > 0) page--;
            if (i.customId.startsWith('skill_next') && page < totalPages - 1) page++;

            try {
                await i.deferUpdate();
                await message.edit({
                    embeds: [generateEmbed()],
                    components: generateComponents()
                });
            } catch (error) {
                if (error?.code !== DISCORD_UNKNOWN_INTERACTION) {
                    console.error('myskills button update error:', error);
                }
            }
        });

        collector.on('end', async () => {
            await message.edit({ components: [] }).catch(() => { });
        });
    }
};
