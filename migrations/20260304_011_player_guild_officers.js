module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('PlayerGuilds').catch(() => null);
        if (!table) return;

        if (!table.officerProfileIds) {
            await queryInterface.addColumn(
                'PlayerGuilds',
                'officerProfileIds',
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

