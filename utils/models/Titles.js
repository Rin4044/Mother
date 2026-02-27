const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('Title', {
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        acquisition_skill_1: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        acquisition_skill_2: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        acquisition_skill_1_lvl: {
            type: DataTypes.INTEGER,
            defaultValue: 1,
        },
        acquisition_skill_2_lvl: {
            type: DataTypes.INTEGER,
            defaultValue: 1,
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        hp: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        mp: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        stamina: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        vital_stamina: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        offense: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        defense: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        magic: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        resistance: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        speed: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        }
    });
};