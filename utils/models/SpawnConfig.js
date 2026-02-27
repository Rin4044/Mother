const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

  const SpawnConfig = sequelize.define('SpawnConfig', {

    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    baseTimer: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 300
    },

    variance: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60
    },

    enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
}

  }, {
    timestamps: true
  });

  return SpawnConfig;
};