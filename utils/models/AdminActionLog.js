const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const AdminActionLog = sequelize.define('AdminActionLog', {
        guildId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        commandName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        actionGroup: {
            type: DataTypes.STRING,
            allowNull: false
        },
        actionName: {
            type: DataTypes.STRING,
            allowNull: false
        },
        executorUserId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        executorTag: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        targetUserId: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        targetLabel: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        reason: {
            type: DataTypes.TEXT,
            allowNull: true,
            defaultValue: null
        },
        changes: {
            type: DataTypes.TEXT,
            allowNull: true,
            defaultValue: null
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        }
    }, {
        timestamps: true,
        indexes: [
            { fields: ['guildId'] },
            { fields: ['executorUserId'] },
            { fields: ['targetUserId'] },
            { fields: ['commandName', 'actionGroup', 'actionName'] },
            { fields: ['createdAt'] }
        ]
    });

    return AdminActionLog;
};
