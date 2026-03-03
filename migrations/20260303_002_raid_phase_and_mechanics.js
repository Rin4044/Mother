module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('RaidInstances');

        if (!table.phase) {
            await queryInterface.addColumn(
                'RaidInstances',
                'phase',
                {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 1
                },
                { transaction }
            );
        }

        if (!table.bossMechanicState) {
            await queryInterface.addColumn(
                'RaidInstances',
                'bossMechanicState',
                {
                    type: Sequelize.JSON,
                    allowNull: false,
                    defaultValue: {}
                },
                { transaction }
            );
        }

        if (!table.raidLog) {
            await queryInterface.addColumn(
                'RaidInstances',
                'raidLog',
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

