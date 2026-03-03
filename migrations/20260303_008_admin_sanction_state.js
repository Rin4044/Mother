module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('BotLogConfigs');
        if (!table.adminSanctionState) {
            await queryInterface.addColumn(
                'BotLogConfigs',
                'adminSanctionState',
                {
                    type: Sequelize.JSON,
                    allowNull: false,
                    defaultValue: { users: {} }
                },
                { transaction }
            );
        }
    }
};
