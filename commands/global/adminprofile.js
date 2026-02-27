const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Profiles, UserSkills, UserTitles, Skills, Titles, sequelize } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('adminprofile')
        .setDescription('Assign a predefined profile')
        .setDefaultMemberPermissions(0x8)
        .addUserOption(o =>
            o.setName('user')
                .setDescription('Target user')
                .setRequired(true))
        .addStringOption(o =>
            o.setName('character')
                .setDescription('Predefined character')
                .setRequired(true)
                .addChoices(
                    { name: 'Shiraori', value: 'shiraori' },
                    { name: 'Sariel', value: 'sariel' },
                    { name: 'Meido', value: 'meido' },
                    { name: 'Güliedistodiez', value: 'guliedistodiez' },
                    { name: 'D', value: 'd' }
                )),

    async execute(interaction) {

        const transaction = await sequelize.transaction();

        try {

            const user = interaction.options.getUser('user');
            const character = interaction.options.getString('character');

            const existing = await Profiles.findOne({ where: { userId: user.id } });

            if (existing)
                return interaction.reply({
                    content: 'User already has a profile.',
                    flags: MessageFlags.Ephemeral
                });

            const templates = {
                shiraori: {
                    name: 'Shiraori',
                    race: 'god',
                    level: 100,
                    skills: [33,34,35,36],
                    titles: [1,2,3]
                },
                guliedistodiez: {
                    name: 'Güliedistodiez',
                    race: 'god',
                    level: 100,
                    skills: [33,34,35,36,77],
                    titles: [1,2,3]
                },
                // autres...
            };

            const selected = templates[character];

            if (!selected)
                return interaction.reply({ content: 'Invalid character.', flags: MessageFlags.Ephemeral });

            const profile = await Profiles.create({
                userId: user.id,
                name: selected.name,
                race: selected.race,
                level: selected.level,
                xp: 0
            }, { transaction });

            // ===== SKILLS =====

            for (const skillId of selected.skills) {

                const skill = await Skills.findByPk(skillId);

                if (!skill)
                    throw new Error(`Skill ${skillId} not found`);

                await UserSkills.create({
                    profileId: profile.id,
                    skillId: skill.id,
                    level: 10,
                    xp: 0
                }, { transaction });
            }

            // ===== TITLES =====

            for (const titleId of selected.titles) {

                const title = await Titles.findByPk(titleId);

                if (!title)
                    throw new Error(`Title ${titleId} not found`);

                await UserTitles.create({
                    profileId: profile.id,
                    titleId: title.id
                }, { transaction });
            }

            await transaction.commit();

            return interaction.reply(
                `✅ ${selected.name} profile assigned to ${user.username}.`
            );

        } catch (error) {

            await transaction.rollback();
            console.error(error);

            return interaction.reply({
                content: 'Error while creating admin profile.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};