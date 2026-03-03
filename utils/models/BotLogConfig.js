const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const BotLogConfig = sequelize.define('BotLogConfig', {
        guildId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        statusChannelId: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        statusMessageId: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        crashChannelId: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        adminLogChannelId: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        adminWhitelistUserIds: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
        },
        adminSanctionState: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: { users: {} }
        },
        adminSecurityState: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {
                panicMode: false,
                panicUpdatedAt: 0,
                panicUpdatedBy: null,
                panicReason: null
            }
        }
    }, {
        timestamps: true
    });

    return BotLogConfig;
};
