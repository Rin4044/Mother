// utils/models/FightProgress.js

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const FightProgress = sequelize.define('FightProgress', {

    profileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: 'Profiles',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },

    // ========================
    // PROGRESSION
    // ========================

    tier: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },

    stage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },

    wins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    // ========================
    // FIGHT STATE
    // ========================

    monsterQueue: {
      type: DataTypes.JSON,
      allowNull: true
    },

    currentMonsterHp: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    skillXpSummary: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
    },

    playerEffects: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
    },

    monsterEffects: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: null
    },

    isInCombat: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },

    lastFightAt: {
      type: DataTypes.DATE,
      allowNull: true
    }

  }, {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['profileId']
      },
      {
        fields: ['tier']
      }
    ]
  });

  return FightProgress;
};
