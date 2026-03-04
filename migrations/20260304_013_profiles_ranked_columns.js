module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('Profiles').catch(() => null);
        if (!table) return;

        if (!table.rankedRating) {
            await queryInterface.addColumn(
                'Profiles',
                'rankedRating',
                {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 1000
                },
                { transaction }
            );
            await queryInterface.addIndex('Profiles', ['rankedRating'], { transaction });
        }

        if (!table.rankedWins) {
            await queryInterface.addColumn(
                'Profiles',
                'rankedWins',
                {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 0
                },
                { transaction }
            );
        }

        if (!table.rankedLosses) {
            await queryInterface.addColumn(
                'Profiles',
                'rankedLosses',
                {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                    defaultValue: 0
                },
                { transaction }
            );
        }
    }
};

