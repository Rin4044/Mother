// utils/models/Monsters.js

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

    const Monsters = sequelize.define('Monsters', {

        name: {
            type: DataTypes.STRING,
            allowNull: false
        },

        level: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        // ========================
        // BASE STATS (TEMPLATE)
        // ========================

        hp: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        mp: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        stamina: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        vitalStamina: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        offense: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        defense: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        magic: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        resistance: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        speed: {
            type: DataTypes.INTEGER,
            allowNull: false
        },

        image: {
            type: DataTypes.STRING,
            allowNull: true
        },

        scalingMultiplier: {
            type: DataTypes.FLOAT,
            defaultValue: 1.0
        }

    }, {
        timestamps: false
    });

    return Monsters;
};