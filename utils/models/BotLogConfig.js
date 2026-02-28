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
        }
    }, {
        timestamps: true
    });

    return BotLogConfig;
};
