module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const tableName = 'AdminActionLogs';
        const existingTables = await queryInterface.showAllTables({ transaction });
        const hasTable = existingTables
            .map((t) => (typeof t === 'object' ? (t.tableName || t.name || '') : String(t)))
            .some((name) => String(name).toLowerCase() === tableName.toLowerCase());

        if (hasTable) return;

        await queryInterface.createTable(
            tableName,
            {
                id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                guildId: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                commandName: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                actionGroup: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                actionName: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                executorUserId: {
                    type: Sequelize.STRING,
                    allowNull: false
                },
                executorTag: {
                    type: Sequelize.STRING,
                    allowNull: true,
                    defaultValue: null
                },
                targetUserId: {
                    type: Sequelize.STRING,
                    allowNull: true,
                    defaultValue: null
                },
                targetLabel: {
                    type: Sequelize.STRING,
                    allowNull: true,
                    defaultValue: null
                },
                reason: {
                    type: Sequelize.TEXT,
                    allowNull: true,
                    defaultValue: null
                },
                changes: {
                    type: Sequelize.TEXT,
                    allowNull: true,
                    defaultValue: null
                },
                metadata: {
                    type: Sequelize.JSON,
                    allowNull: false,
                    defaultValue: {}
                },
                createdAt: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.fn('NOW')
                },
                updatedAt: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.fn('NOW')
                }
            },
            { transaction }
        );

        await queryInterface.addIndex(tableName, ['guildId'], { transaction });
        await queryInterface.addIndex(tableName, ['executorUserId'], { transaction });
        await queryInterface.addIndex(tableName, ['targetUserId'], { transaction });
        await queryInterface.addIndex(tableName, ['createdAt'], { transaction });
    }
};
