const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Titles, Skills, TitleSkills, sequelize } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('edittitle')
        .setDescription('Edit an existing title (Admin only)')
        .setDefaultMemberPermissions(0x8)
        .addIntegerOption(o => o.setName('id').setDescription('Title ID').setRequired(true))
        .addStringOption(o => o.setName('new_name').setDescription('New name'))
        .addStringOption(o => o.setName('description').setDescription('New description'))
        .addIntegerOption(o => o.setName('hp').setDescription('HP bonus'))
        .addIntegerOption(o => o.setName('mp').setDescription('MP bonus'))
        .addIntegerOption(o => o.setName('stamina').setDescription('Stamina bonus'))
        .addIntegerOption(o => o.setName('vital_stamina').setDescription('Vital stamina bonus'))
        .addIntegerOption(o => o.setName('offense').setDescription('Offense bonus'))
        .addIntegerOption(o => o.setName('defense').setDescription('Defense bonus'))
        .addIntegerOption(o => o.setName('magic').setDescription('Magic bonus'))
        .addIntegerOption(o => o.setName('resistance').setDescription('Resistance bonus'))
        .addIntegerOption(o => o.setName('speed').setDescription('Speed bonus'))
        .addIntegerOption(o => o.setName('acquisition_skill_1').setDescription('Required skill 1 ID'))
        .addIntegerOption(o => o.setName('acquisition_skill_2').setDescription('Required skill 2 ID'))
        .addIntegerOption(o => o.setName('acquisition_skill_1_lvl').setDescription('Required skill 1 level'))
        .addIntegerOption(o => o.setName('acquisition_skill_2_lvl').setDescription('Required skill 2 level'))
        .addStringOption(o => o.setName('skills').setDescription('Comma separated skill IDs')),

    async execute(interaction) {

        const id = interaction.options.getInteger('id');
        const skillsString = interaction.options.getString('skills');

        const title = await Titles.findByPk(id);

        if (!title) {
            return interaction.reply({
                content: `Title ID ${id} not found.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const transaction = await sequelize.transaction();

        try {

            const updates = {};

            // STRING FIELDS
            const newName = interaction.options.getString('new_name');
            const description = interaction.options.getString('description');

            if (newName !== null) updates.name = newName;
            if (description !== null) updates.description = description;

            // NUMERIC BONUS FIELDS
            const bonusFields = [
                'hp', 'mp', 'stamina', 'vital_stamina',
                'offense', 'defense', 'magic',
                'resistance', 'speed'
            ];

            for (const field of bonusFields) {
                const value = interaction.options.getInteger(field);
                if (value !== null) {
                    if (value < 0) {
                        await transaction.rollback();
                        return interaction.reply({
                            content: `${field} cannot be negative.`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    updates[field] = value;
                }
            }

            // ACQUISITION VALIDATION
            const acq1 = interaction.options.getInteger('acquisition_skill_1');
            const acq2 = interaction.options.getInteger('acquisition_skill_2');
            const acq1Lvl = interaction.options.getInteger('acquisition_skill_1_lvl');
            const acq2Lvl = interaction.options.getInteger('acquisition_skill_2_lvl');

            if (acq1 !== null) {
                const skillExists = await Skills.findByPk(acq1);
                if (!skillExists) {
                    await transaction.rollback();
                    return interaction.reply({
                        content: `Skill ID ${acq1} does not exist.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                updates.acquisition_skill_1 = acq1;
            }

            if (acq2 !== null) {
                const skillExists = await Skills.findByPk(acq2);
                if (!skillExists) {
                    await transaction.rollback();
                    return interaction.reply({
                        content: `Skill ID ${acq2} does not exist.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                updates.acquisition_skill_2 = acq2;
            }

            if (acq1Lvl !== null) updates.acquisition_skill_1_lvl = acq1Lvl;
            if (acq2Lvl !== null) updates.acquisition_skill_2_lvl = acq2Lvl;

            await title.update(updates, { transaction });

            // =============================
            // UPDATE TITLE SKILLS
            // =============================

            if (skillsString !== null) {

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

                await TitleSkills.destroy({
                    where: { titleId: title.id },
                    transaction
                });

                for (const skillId of skillIds) {
                    await TitleSkills.create({
                        titleId: title.id,
                        skillId
                    }, { transaction });
                }
            }

            await transaction.commit();

            return interaction.reply(
                `✅ Title **${title.name}** updated successfully.`
            );

        } catch (error) {

            await transaction.rollback();
            console.error(error);

            return interaction.reply({
                content: "Error while editing title.",
                flags: MessageFlags.Ephemeral
            });
        }
    }
};