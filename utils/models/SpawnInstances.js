const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SpawnInstances = sequelize.define('SpawnInstances', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    spawnChannelId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    guildId: {
      type: DataTypes.STRING,
      allowNull: false
    },

    channelId: {
      type: DataTypes.STRING,
      allowNull: false
    },

    monster: {
      type: DataTypes.JSON,
      allowNull: false
    },

    occupiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    },

    despawnAt: {
      type: DataTypes.BIGINT,
      allowNull: false
    },

    spawnMessageId: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    }
  }, {
    timestamps: true
  });

  return SpawnInstances;
};
