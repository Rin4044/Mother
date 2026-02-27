// models/UserTitles.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('UserTitles', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false,
        },
        profileId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Profiles',
                key: 'id'
            }
        },
        titleId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'Titles',
                key: 'id'
            }
        }
    },
    );
};
