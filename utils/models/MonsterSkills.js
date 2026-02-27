// utils/models/MonsterSkills.js

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const MonsterSkills = sequelize.define('MonsterSkills', {

    monsterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'Monsters',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },

    skillId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'Skills',
        key: 'id'
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    },

    // Future-proof : override values if needed
    level: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    }

  }, {
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['monsterId', 'skillId']
      }
    ]
  });

  return MonsterSkills;
};