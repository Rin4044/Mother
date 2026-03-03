module.exports = {
    async up(queryInterface, Sequelize, transaction) {
        const tableName = 'PlayerGuilds';
        const existingTables = await queryInterface.showAllTables({ transaction });
        const hasTable = existingTables
            .map((t) => (typeof t === 'object' ? (t.tableName || t.name || '') : String(t)))
            .some((name) => String(name).toLowerCase() === tableName.toLowerCase());

        if (!hasTable) {
            await queryInterface.createTable(
                tableName,
                {
                    id: {
                        type: Sequelize.INTEGER,
                        primaryKey: true,
                        autoIncrement: true,
                        allowNull: false
                    },
                    discordGuildId: {
                        type: Sequelize.STRING,
                        allowNull: false
                    },
                    name: {
                        type: Sequelize.STRING,
                        allowNull: false
                    },
                    nameKey: {
                        type: Sequelize.STRING,
                        allowNull: false
                    },
                    ownerProfileId: {
                        type: Sequelize.INTEGER,
                        allowNull: false
                    },
                    level: {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        defaultValue: 1
                    },
                    xp: {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        defaultValue: 0
                    },
                    xpToNextLevel: {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        defaultValue: 500
                    },
                    lifetimeXp: {
                        type: Sequelize.BIGINT,
                        allowNull: false,
                        defaultValue: 0
                    },
                    membersCount: {
                        type: Sequelize.INTEGER,
                        allowNull: false,
                        defaultValue: 1
                    },
                    totalKills: {
                        type: Sequelize.BIGINT,
                        allowNull: false,
                        defaultValue: 0
                    },
                    totalQuestClaims: {
                        type: Sequelize.BIGINT,
                        allowNull: false,
                        defaultValue: 0
                    },
                    totalRaidWins: {
                        type: Sequelize.BIGINT,
                        allowNull: false,
                        defaultValue: 0
                    },
                    createdAt: {
                        type: Sequelize.DATE,
                        allowNull: false,
                        defaultValue: Sequelize.fn('NOW')
                    },
                    updatedAt: {
                        type: Sequelize.DATE,
                        allowNull: false,
                        defaultValue: Sequelize.fn('NOW')
                    }
                },
                { transaction }
            );

            await queryInterface.addIndex(tableName, ['discordGuildId'], { transaction });
            await queryInterface.addIndex(tableName, ['nameKey'], { transaction });
            await queryInterface.addIndex(tableName, ['ownerProfileId'], { transaction });
            await queryInterface.addIndex(tableName, ['level'], { transaction });
            await queryInterface.addConstraint(tableName, {
                type: 'unique',
                fields: ['discordGuildId', 'nameKey'],
                name: 'playerguilds_discordguildid_namekey_unique',
                transaction
            });
        }

        const profiles = await queryInterface.describeTable('Profiles');
        if (!profiles.playerGuildId) {
            await queryInterface.addColumn(
                'Profiles',
                'playerGuildId',
                {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    defaultValue: null
                },
                { transaction }
            );
            await queryInterface.addIndex('Profiles', ['playerGuildId'], { transaction });
        }

        if (!profiles.playerGuildJoinedAt) {
            await queryInterface.addColumn(
                'Profiles',
                'playerGuildJoinedAt',
                {
                    type: Sequelize.DATE,
                    allowNull: true,
                    defaultValue: null
                },
                { transaction }
            );
        }
    }
};

