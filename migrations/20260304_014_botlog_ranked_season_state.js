module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('BotLogConfigs').catch(() => null);
        if (!table) return;

        if (!table.rankedSeasonState) {
            await queryInterface.addColumn(
                'BotLogConfigs',
                'rankedSeasonState',
                {
                    type: Sequelize.JSON,
                    allowNull: false,
                    defaultValue: {
                        seasonNumber: 0,
                        seasonName: 'Alpha and Beta',
                        status: 'preseason',
                        infinite: true,
                        startsAt: 0,
                        endsAt: 0,
                        updatedAt: 0,
                        updatedBy: null,
                        note: 'Season 0 (preseason).'
                    }
                },
                { transaction }
            );
        }
    }
};
