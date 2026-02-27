const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const EmbeddedPostgresModule = require('embedded-postgres');

const EmbeddedPostgres = EmbeddedPostgresModule.default || EmbeddedPostgresModule;

const PG_PORT = Number(process.env.PG_LOCAL_PORT || 5432);
const PG_USER = process.env.PG_LOCAL_USER || 'postgres';
const PG_PASSWORD = process.env.PG_LOCAL_PASSWORD || 'mother_local_pg';
const PG_DB = process.env.PG_LOCAL_DB || 'mother';
const EMBEDDED_DB_DIR = path.resolve(__dirname, '..', '.embedded-postgres');
const DATABASE_URL = process.env.DATABASE_URL || `postgres://${PG_USER}:${encodeURIComponent(PG_PASSWORD)}@127.0.0.1:${PG_PORT}/${PG_DB}`;

async function canConnect(connectionString) {
    const client = new Client({ connectionString, ssl: false });
    try {
        await client.connect();
        await client.query('SELECT 1');
        return true;
    } catch {
        return false;
    } finally {
        await client.end().catch(() => {});
    }
}

async function main() {
    // Fast path: if DB is already up, do not touch embedded startup.
    let isUp = await canConnect(DATABASE_URL);
    if (!isUp) {
        const pg = new EmbeddedPostgres({
            databaseDir: EMBEDDED_DB_DIR,
            user: PG_USER,
            password: PG_PASSWORD,
            port: PG_PORT,
            persistent: true,
            initdbFlags: ['--encoding=UTF8', '--locale=C'],
            onError: (msg) => console.error(String(msg || ''))
        });

        const pgVersionPath = path.join(EMBEDDED_DB_DIR, 'PG_VERSION');
        if (!fs.existsSync(pgVersionPath)) {
            try {
                await pg.initialise();
            } catch (error) {
                const message = String(error?.message || error || '');
                if (!message.toLowerCase().includes('data directory might already exist')) {
                    throw error;
                }
            }
        }

        try {
            await pg.start();
        } catch (error) {
            const message = String(error?.message || error || '');
            const lower = message.toLowerCase();
            const alreadyRunning =
                lower.includes('postmaster.pid') ||
                lower.includes('another postmaster');
            if (!alreadyRunning) {
                throw error;
            }
        }
        try {
            await pg.createDatabase(PG_DB);
        } catch (_) {
            // already exists
        }
        isUp = await canConnect(DATABASE_URL);
        if (!isUp) {
            throw new Error('Postgres is not reachable after startup attempt.');
        }
    }

    process.env.DATABASE_URL = DATABASE_URL;
    process.env.DB_SSL = process.env.DB_SSL || 'false';

    require('../index.js');
}

main().catch((err) => {
    console.error('Failed to start bot with embedded postgres:', err?.message || err);
    process.exit(1);
});
