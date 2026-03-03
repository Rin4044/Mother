module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('BotLogConfigs');
        if (!table.adminSecurityState) {
            await queryInterface.addColumn(
                'BotLogConfigs',
                'adminSecurityState',
                {
                    type: Sequelize.JSON,
                    allowNull: false,
                    defaultValue: {
                        panicMode: false,
                        panicUpdatedAt: 0,
                        panicUpdatedBy: null,
                        panicReason: null
                    }
                },
                { transaction }
            );
        }
    }
};
