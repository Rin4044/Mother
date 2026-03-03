module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const table = await queryInterface.describeTable('Monsters');

        if (!table.monsterType) {
            await queryInterface.addColumn(
                'Monsters',
                'monsterType',
                {
                    type: Sequelize.STRING,
                    allowNull: false,
                    defaultValue: 'monster'
                },
                { transaction }
            );
        }

        await queryInterface.sequelize.query(
            `UPDATE "Monsters" SET "monsterType" = 'monster' WHERE "monsterType" IS NULL`,
            { transaction }
        );
    }
};
