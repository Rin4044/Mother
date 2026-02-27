const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RaidInstances = sequelize.define('RaidInstances', {
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
    createdBy: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'lobby'
    },
    raidTier: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    bossMonsterId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    bossName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    bossState: {
      type: DataTypes.JSON,
      allowNull: false
    },
    participants: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: []
    },
    participantStates: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {}
    },
    rewardXpBase: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 500
    },
    rewardCrystalsBase: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 50
    },
    endsAt: {
      type: DataTypes.BIGINT,
      allowNull: true,
      defaultValue: null
    }
  }, {
    timestamps: true
  });

  return RaidInstances;
};
