const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const PlayerGuild = sequelize.define('PlayerGuild', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        discordGuildId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        nameKey: {
            type: DataTypes.STRING,
            allowNull: false
        },
        ownerProfileId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        level: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        xp: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        xpToNextLevel: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 500
        },
        lifetimeXp: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        membersCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        totalKills: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        totalQuestClaims: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        totalRaidWins: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        officerProfileIds: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
        },
        missionState: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        }
    }, {
        timestamps: true
    });

    return PlayerGuild;
};
