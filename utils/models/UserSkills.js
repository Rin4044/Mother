// utils/models/UserSkills.js

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const UserSkills = sequelize.define('UserSkills', {

    profileId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'Profiles',
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

    level: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },

    xp: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    // Cooldown runtime tracking
    currentCooldown: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },

    equippedSlot: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    }

  }, {
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['profileId', 'skillId']
      }
    ]
  });

  return UserSkills;
};
