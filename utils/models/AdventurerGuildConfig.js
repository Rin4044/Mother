const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const AdventurerGuildConfig = sequelize.define('AdventurerGuildConfig', {
        guildId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        panelChannelId: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        panelMessageId: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        questRefreshSeconds: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 3600
        },
        buybackState: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        },
        questBoardState: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        },
        questBoardMix: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: { generalCount: 2, specificCount: 3 }
        }
    }, {
        timestamps: true
    });

    return AdventurerGuildConfig;
};
