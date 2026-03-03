module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('AdventurerGuildConfigs');

        if (!table.questBoardState) {
            await queryInterface.addColumn(
                'AdventurerGuildConfigs',
                'questBoardState',
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
