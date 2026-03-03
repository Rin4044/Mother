module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('PlayerGuilds').catch(() => null);
        if (!table) return;

        if (!table.missionState) {
            await queryInterface.addColumn(
                'PlayerGuilds',
                'missionState',
                {
                    type: Sequelize.JSON,
                    allowNull: false,
                    defaultValue: {}
                },
                { transaction }
            );
        }
    }
};

