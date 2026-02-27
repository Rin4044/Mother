const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const SpawnChannels = sequelize.define('SpawnChannels', {

    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    guildId: {
      type: DataTypes.STRING,
      allowNull: false
    },

    channelId: {
      type: DataTypes.STRING,
      allowNull: false
    },

    levels: {
      type: DataTypes.JSON,
      allowNull: false
    },

    monsterIds: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
    },

    baseTimer: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },

    variance: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },

    xpMultiplier: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: null
    },

    nextSpawnAt: {
      type: DataTypes.BIGINT,
      defaultValue: null
    },

    activeMonster: {
      type: DataTypes.JSON,
      defaultValue: null
    },

    occupiedBy: {
      type: DataTypes.INTEGER,
      defaultValue: null
    },

    despawnAt: {
      type: DataTypes.BIGINT,
      defaultValue: null
    },

    combatMessageId: {
        type: DataTypes.STRING,
        allowNull: true
    }

  }, {
    timestamps: true
  });

  return SpawnChannels;
};
