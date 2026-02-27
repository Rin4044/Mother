// utils/models/Profiles.js

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const Profiles = sequelize.define('Profiles', {

    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    userId: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'no name'
    },

    race: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'small lesser taratect'
    },

    level: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },

    xp: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    xpToNextLevel: {
      type: DataTypes.INTEGER,
      defaultValue: 100
    },

    skillPoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    crystals: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    xpBoostPercent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    xpBoostFightsRemaining: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    xpBoostExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },

    baseHp: { type: DataTypes.INTEGER, defaultValue: 26 },
    baseMp: { type: DataTypes.INTEGER, defaultValue: 26 },
    baseStamina: { type: DataTypes.INTEGER, defaultValue: 26 },
    baseVitalStamina: { type: DataTypes.INTEGER, defaultValue: 26 },

    baseOffense: { type: DataTypes.INTEGER, defaultValue: 8 },
    baseDefense: { type: DataTypes.INTEGER, defaultValue: 8 },
    baseMagic: { type: DataTypes.INTEGER, defaultValue: 8 },
    baseResistance: { type: DataTypes.INTEGER, defaultValue: 8 },
    baseSpeed: { type: DataTypes.INTEGER, defaultValue: 8 },

    remainingHp: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 26
    },

    remainingMp: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 26
    },

    remainingStamina: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 26
    },

    remainingVitalStamina: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 26
    },

    combatState: {
      type: DataTypes.JSON,
      defaultValue: null
    },

    rulerProgress: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {}
    }

  }, {
    timestamps: true
  });

  return Profiles;
};
