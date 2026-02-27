const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Titles, Skills, TitleSkills, sequelize } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('addtitle')
        .setDescription('Add a new title')
        .setDefaultMemberPermissions(0x8)
        .addStringOption(o => o.setName('name').setDescription('Title name').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Description'))
        .addIntegerOption(o => o.setName('acquisition_skill_1').setDescription('Required skill 1 ID'))
        .addIntegerOption(o => o.setName('acquisition_skill_1_lvl').setDescription('Required skill 1 level'))
        .addIntegerOption(o => o.setName('acquisition_skill_2').setDescription('Required skill 2 ID'))
        .addIntegerOption(o => o.setName('acquisition_skill_2_lvl').setDescription('Required skill 2 level'))
        .addIntegerOption(o => o.setName('hp').setDescription('HP bonus'))
        .addIntegerOption(o => o.setName('mp').setDescription('MP bonus'))
        .addIntegerOption(o => o.setName('stamina').setDescription('Stamina bonus'))
        .addIntegerOption(o => o.setName('vital_stamina').setDescription('Vital stamina bonus'))
        .addIntegerOption(o => o.setName('offense').setDescription('Offense bonus'))
        .addIntegerOption(o => o.setName('defense').setDescription('Defense bonus'))
        .addIntegerOption(o => o.setName('magic').setDescription('Magic bonus'))
        .addIntegerOption(o => o.setName('resistance').setDescription('Resistance bonus'))
        .addIntegerOption(o => o.setName('speed').setDescription('Speed bonus'))
        .addStringOption(o => o.setName('skills').setDescription('Comma separated skill IDs')),

    async execute(interaction) {

        const transaction = await sequelize.transaction();

        try {

            const name = interaction.options.getString('name').trim();
            const description = interaction.options.getString('description') || '';

            const acquisitionSkill1 = interaction.options.getInteger('acquisition_skill_1');
            const acquisitionSkill1Lvl = interaction.options.getInteger('acquisition_skill_1_lvl');
            const acquisitionSkill2 = interaction.options.getInteger('acquisition_skill_2');
            const acquisitionSkill2Lvl = interaction.options.getInteger('acquisition_skill_2_lvl');

            const hp = interaction.options.getInteger('hp') ?? 0;
            const mp = interaction.options.getInteger('mp') ?? 0;
            const stamina = interaction.options.getInteger('stamina') ?? 0;
            const vitalStamina = interaction.options.getInteger('vital_stamina') ?? 0;
            const offense = interaction.options.getInteger('offense') ?? 0;
            const defense = interaction.options.getInteger('defense') ?? 0;
            const magic = interaction.options.getInteger('magic') ?? 0;
            const resistance = interaction.options.getInteger('resistance') ?? 0;
            const speed = interaction.options.getInteger('speed') ?? 0;

            const skillsString = interaction.options.getString('skills');

            // ==========================
            // VALIDATION
            // ==========================

            const existing = await Titles.findOne({ where: { name } });
            if (existing)
                return interaction.reply({ content: 'A title with this name already exists.', flags: MessageFlags.Ephemeral });

            if ((acquisitionSkill1 && !acquisitionSkill1Lvl) ||
                (acquisitionSkill1Lvl && !acquisitionSkill1))
                return interaction.reply({ content: 'Skill 1 and its level must both be provided.', flags: MessageFlags.Ephemeral });

            if ((acquisitionSkill2 && !acquisitionSkill2Lvl) ||
                (acquisitionSkill2Lvl && !acquisitionSkill2))
                return interaction.reply({ content: 'Skill 2 and its level must both be provided.', flags: MessageFlags.Ephemeral });

            if (acquisitionSkill1) {
                const skill = await Skills.findByPk(acquisitionSkill1);
                if (!skill)
                    return interaction.reply({ content: 'Acquisition skill 1 does not exist.', flags: MessageFlags.Ephemeral });
            }

            if (acquisitionSkill2) {
                const skill = await Skills.findByPk(acquisitionSkill2);
                if (!skill)
                    return interaction.reply({ content: 'Acquisition skill 2 does not exist.', flags: MessageFlags.Ephemeral });
            }

            // ==========================
            // CREATE TITLE
            // ==========================

            const title = await Titles.create({
                name,
                description,
                hp,
                mp,
                stamina,
                vital_stamina: vitalStamina,
                offense,
                defense,
                magic,
                resistance,
                speed,
                acquisition_skill_1: acquisitionSkill1 ?? null,
                acquisition_skill_2: acquisitionSkill2 ?? null,
                acquisition_skill_1_lvl: acquisitionSkill1Lvl ?? null,
                acquisition_skill_2_lvl: acquisitionSkill2Lvl ?? null
            }, { transaction });

            // ==========================
            // LINK SKILLS
            // ==========================

            if (skillsString) {

                const skillIds = skillsString
                    .split(',')
                    .map(s => parseInt(s.trim()))
                    .filter(s => !isNaN(s));

                const foundSkills = await Skills.findAll({
                    where: { id: skillIds }
                });

                if (foundSkills.length !== skillIds.length) {
                    const foundIds = foundSkills.map(s => s.id);
                    const invalid = skillIds.filter(id => !foundIds.includes(id));

                    await transaction.rollback();

                    return interaction.reply({
                        content: `Invalid skill IDs: ${invalid.join(', ')}`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                for (const skillId of skillIds) {
                    await TitleSkills.create({
                        titleId: title.id,
                        skillId
                    }, { transaction });
                }
            }

            await transaction.commit();

            return interaction.reply(
                `✅ Title **${title.name}** created successfully.`
            );

        } catch (error) {

            await transaction.rollback();
            console.error(error);

            return interaction.reply({
                content: 'Error while creating title.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};