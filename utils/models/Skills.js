// utils/models/Skills.js

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const Skills = sequelize.define('Skills', {

    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false
    },

    // ========================
    // SKILL TREE
    // ========================

    parent: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Skills',
        key: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    },

    tier: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },

    // ========================
    // CLASSIFICATION
    // ========================

    type: {
      type: DataTypes.STRING,
      allowNull: false
    },

    effect_type_main: {
      type: DataTypes.STRING,
      allowNull: true
    },

    effect_type_specific: {
      type: DataTypes.STRING,
      allowNull: true
    },

    // ========================
    // COMBAT VALUES
    // ========================

    power: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    cooldown: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    sp_cost: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    mp_cost: {
      type: DataTypes.INTEGER,
      allowNull: true
    },

    skill_points_cost: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    // ========================
    // DESCRIPTION
    // ========================

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }

  }, {
    timestamps: true
  });

  return Skills;
};
