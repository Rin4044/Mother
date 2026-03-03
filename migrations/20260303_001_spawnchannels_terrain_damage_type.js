module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('SpawnChannels');
        if (!table.terrainDamageType) {
            await queryInterface.addColumn(
                'SpawnChannels',
                'terrainDamageType',
                {
                    type: Sequelize.STRING,
                    allowNull: true,
                    defaultValue: null
                },
                { transaction }
            );
        }
    }
};

