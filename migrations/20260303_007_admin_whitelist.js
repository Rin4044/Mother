module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('BotLogConfigs');
        if (!table.adminWhitelistUserIds) {
            await queryInterface.addColumn(
                'BotLogConfigs',
                'adminWhitelistUserIds',
                {
                    type: Sequelize.JSON,
                    allowNull: false,
                    defaultValue: []
                },
                { transaction }
            );
        }
    }
};
