const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Profiles } = require('../../database');
const {
    TUTORIAL_STEPS,
    progressTutorial,
    buildTutorialStepText
} = require('../../utils/tutorialService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tuto')
        .setDescription('Open the tutorial panel and claim progression rewards.'),

    async execute(interaction) {
        const profile = await Profiles.findOne({
            where: { userId: interaction.user.id }
        });

        if (!profile) {
            return interaction.reply({
                content: 'Use /start first to create your profile.',
                flags: MessageFlags.Ephemeral
            });
        }

        const result = await progressTutorial(profile.id, null);
        if (!result) {
            return interaction.reply({
                content: 'Unable to load tutorial progress.',
                flags: MessageFlags.Ephemeral
            });
        }

        const { tutorial, rewards, nextStep } = result;
        const embed = new EmbedBuilder()
            .setColor('#290003')
            .setTitle('Tutorial Panel')
            .setDescription(
                `Current Step: ${tutorial.finished ? 'Completed' : `${tutorial.current_step}/${TUTORIAL_STEPS.length}`}\n` +
                `Crystals: ${result.profile.crystals || 0}`
            );

        if (rewards.length) {
            embed.addFields({
                name: 'New Rewards',
                value: rewards.map((r) => `Step ${r.stepId}: +${r.crystals} crystals`).join('\n')
            });
        }

        if (nextStep) {
            embed.addFields(
                { name: `Quest ${nextStep.id}: ${nextStep.title}`, value: nextStep.description },
                { name: 'Checklist', value: buildTutorialStepText(nextStep, tutorial.actions || {}) },
                { name: 'Reward', value: `${nextStep.reward} crystals` }
            );
        } else {
            embed.addFields({
                name: 'Tutorial Complete',
                value: 'You finished all tutorial quests. More content can be added later.'
            });
        }

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
