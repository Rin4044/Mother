// utils/models/TitleSkills.js

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const TitleSkills = sequelize.define('TitleSkills', {

    titleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'Titles',
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

  }, {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['titleId', 'skillId']
      }
    ]
  });

  return TitleSkills;
};
