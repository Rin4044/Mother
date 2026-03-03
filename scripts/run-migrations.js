const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const PG_PORT = Number(process.env.PG_LOCAL_PORT || 5432);
const PG_USER = process.env.PG_LOCAL_USER || 'postgres';
const PG_PASSWORD = process.env.PG_LOCAL_PASSWORD || 'mother_local_pg';
const PG_DB = process.env.PG_LOCAL_DB || 'mother';
const DATABASE_URL = process.env.DATABASE_URL
    || `postgres://${PG_USER}:${encodeURIComponent(PG_PASSWORD)}@127.0.0.1:${PG_PORT}/${PG_DB}`;

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false,
    dialectOptions: {
        ssl: process.env.DB_SSL === 'false'
            ? false
            : { require: true, rejectUnauthorized: false }
    }
});

const SequelizeMeta = sequelize.define('SequelizeMeta', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true
    }
}, {
    tableName: 'SequelizeMeta',
    timestamps: false
});

async function listMigrationFiles(migrationsDir) {
    if (!fs.existsSync(migrationsDir)) return [];
    return fs.readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.js'))
        .sort((a, b) => a.localeCompare(b));
}

async function main() {
    const migrationsDir = path.resolve(__dirname, '..', 'migrations');
    await sequelize.authenticate();
    await SequelizeMeta.sync();

    const executedRows = await SequelizeMeta.findAll({ attributes: ['name'] });
    const executed = new Set(executedRows.map((row) => String(row.name)));
    const files = await listMigrationFiles(migrationsDir);

    if (!files.length) {
        console.log('No migration files found.');
        await sequelize.close();
        return;
    }

    for (const file of files) {
        if (executed.has(file)) continue;
        const fullPath = path.join(migrationsDir, file);
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const migration = require(fullPath);
        if (!migration || typeof migration.up !== 'function') {
            throw new Error(`Invalid migration "${file}": missing up(queryInterface, Sequelize).`);
        }

        console.log(`Running migration: ${file}`);
        await sequelize.transaction(async (transaction) => {
            const queryInterface = sequelize.getQueryInterface();
            await migration.up(queryInterface, Sequelize, transaction);
            await SequelizeMeta.create({ name: file }, { transaction });
        });
        console.log(`Applied migration: ${file}`);
    }

    console.log('Migrations complete.');
    await sequelize.close();
}

main().catch(async (error) => {
    console.error('Migration runner failed:', error);
    await sequelize.close().catch(() => {});
    process.exit(1);
});

