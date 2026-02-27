const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { 
    UserTitles, 
    Titles, 
    Profiles, 
    UserSkills, 
    TitleSkills, 
    Skills,
    sequelize
} = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('givetitle')
        .setDescription('Give a title to a user.')
        .setDefaultMemberPermissions(0x8)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('User to receive the title')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('titleid')
                .setDescription('ID of the title')
                .setRequired(true)),

    async execute(interaction) {

        const targetUser = interaction.options.getUser('target');
        const titleId = interaction.options.getInteger('titleid');

        const transaction = await sequelize.transaction();

        try {

            const profile = await Profiles.findOne({
                where: { userId: targetUser.id },
                transaction
            });

            if (!profile) {
                await transaction.rollback();
                return interaction.reply({
                    content: `Profile for ${targetUser.username} does not exist.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const title = await Titles.findByPk(titleId, { transaction });

            if (!title) {
                await transaction.rollback();
                return interaction.reply({
                    content: `Title ID ${titleId} does not exist.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const alreadyHas = await UserTitles.findOne({
                where: {
                    profileId: profile.id,
                    titleId
                },
                transaction
            });

            if (alreadyHas) {
                await transaction.rollback();
                return interaction.reply({
                    content: `${targetUser.username} already has the title "${title.name}".`,
                    flags: MessageFlags.Ephemeral
                });
            }

            // Assign title
            await UserTitles.create({
                profileId: profile.id,
                titleId
            }, { transaction });

            // Fetch title skills
            const titleSkills = await TitleSkills.findAll({
                where: { titleId },
                transaction
            });

            for (const ts of titleSkills) {

                const skill = await Skills.findByPk(ts.skillId, { transaction });

                if (!skill) continue;

                const existingSkill = await UserSkills.findOne({
                    where: {
                        profileId: profile.id,
                        skillId: skill.id
                    },
                    transaction
                });

                if (existingSkill) {

                    await existingSkill.update({
                        level: existingSkill.level + 1
                    }, { transaction });

                } else {

                    await UserSkills.create({
                        profileId: profile.id,
                        skillId: skill.id,
                        name: skill.name,
                        type: skill.type,
                        effect_type_main: skill.effect_type_main,
                        effect_type_specific: skill.effect_type_specific,
                        description: skill.description,
                        sp_cost: skill.sp_cost,
                        mp_cost: skill.mp_cost,
                        cooldown: skill.cooldown,
                        power: skill.power,
                        level: 1,
                        xp: 0
                    }, { transaction });

                }
            }

            await transaction.commit();

            return interaction.reply({
                content: `✅ Title **${title.name}** has been given to ${targetUser.username}.`
            });

        } catch (error) {

            await transaction.rollback();
            console.error(error);

            return interaction.reply({
                content: 'An error occurred while giving the title.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};