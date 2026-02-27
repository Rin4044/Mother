const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Monsters, MonsterSkills, Skills, sequelize } = require('../../database.js');

module.exports = {

  data: new SlashCommandBuilder()
    .setName('addmonster')
    .setDescription('Create a new monster (Admin only)')
    .setDefaultMemberPermissions(0x8)
    .addStringOption(o => o.setName('name').setDescription('Monster name').setRequired(true))
    .addIntegerOption(o => o.setName('hp').setDescription('HP').setRequired(true))
    .addIntegerOption(o => o.setName('mp').setDescription('MP').setRequired(true))
    .addIntegerOption(o => o.setName('stamina').setDescription('Stamina').setRequired(true))
    .addIntegerOption(o => o.setName('vitalstamina').setDescription('Vital Stamina').setRequired(true))
    .addIntegerOption(o => o.setName('offense').setDescription('Offense').setRequired(true))
    .addIntegerOption(o => o.setName('defense').setDescription('Defense').setRequired(true))
    .addIntegerOption(o => o.setName('magic').setDescription('Magic').setRequired(true))
    .addIntegerOption(o => o.setName('resistance').setDescription('Resistance').setRequired(true))
    .addIntegerOption(o => o.setName('level').setDescription('Monster level').setRequired(true))
    .addIntegerOption(o => o.setName('speed').setDescription('Speed').setRequired(true))
    .addStringOption(o =>
      o.setName('skills')
        .setDescription('Skill IDs separated by comma (ex: 1,5,8)')
        .setRequired(true))
    .addStringOption(o =>
      o.setName('image')
        .setDescription('Image file name (ex: goblin.png)')
        .setRequired(true)),

  async execute(interaction) {

    const name = interaction.options.getString('name').trim();
    const hp = interaction.options.getInteger('hp');
    const mp = interaction.options.getInteger('mp');
    const stamina = interaction.options.getInteger('stamina');
    const vitalStamina = interaction.options.getInteger('vitalstamina');
    const offense = interaction.options.getInteger('offense');
    const defense = interaction.options.getInteger('defense');
    const magic = interaction.options.getInteger('magic');
    const resistance = interaction.options.getInteger('resistance');
    const level = interaction.options.getInteger('level');
    const speed = interaction.options.getInteger('speed');
    const image = interaction.options.getString('image').trim();
    const skillsInput = interaction.options.getString('skills');

    const transaction = await sequelize.transaction();

    try {

      // 🔹 Prevent duplicate monster name
      const existing = await Monsters.findOne({ where: { name } });
      if (existing) {
        await transaction.rollback();
        return interaction.reply({
          content: 'A monster with this name already exists.',
          flags: MessageFlags.Ephemeral
        });
      }

      // 🔹 Parse skill IDs
      const skillIds = skillsInput
        .split(',')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id));

      if (!skillIds.length) {
        await transaction.rollback();
        return interaction.reply({
          content: 'Invalid skill list.',
          flags: MessageFlags.Ephemeral
        });
      }

      // 🔹 Validate skills
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

      // 🔹 Create monster template
      const monster = await Monsters.create({
        name,
        hp,
        mp,
        stamina,
        vitalStamina,
        offense,
        defense,
        magic,
        resistance,
        speed,
        level,
        image
      }, { transaction });

      // 🔹 Link skills
      for (const skillId of skillIds) {
        await MonsterSkills.create({
          monsterId: monster.id,
          skillId
        }, { transaction });
      }

      await transaction.commit();

      return interaction.reply({
        content: `✅ Monster **${name}** created successfully (ID: ${monster.id})`
      });

    } catch (error) {

      await transaction.rollback();
      console.error(error);

      return interaction.reply({
        content: 'Error while creating monster.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};