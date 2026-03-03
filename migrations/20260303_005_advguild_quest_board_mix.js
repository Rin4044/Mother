module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('AdventurerGuildConfigs');

        if (!table.questBoardMix) {
            await queryInterface.addColumn(
                'AdventurerGuildConfigs',
                'questBoardMix',
                {
                    type: Sequelize.JSON,
                    allowNull: false,
                    defaultValue: { generalCount: 2, specificCount: 3 }
                },
                { transaction }
            );
        }
    }
};
