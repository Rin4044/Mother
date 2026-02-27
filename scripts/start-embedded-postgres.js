const path = require('path');
const fs = require('fs');
const EmbeddedPostgresModule = require('embedded-postgres');

const EmbeddedPostgres = EmbeddedPostgresModule.default || EmbeddedPostgresModule;

const PG_PORT = Number(process.env.PG_LOCAL_PORT || 5432);
const PG_USER = process.env.PG_LOCAL_USER || 'postgres';
const PG_PASSWORD = process.env.PG_LOCAL_PASSWORD || 'mother_local_pg';
const EMBEDDED_DB_DIR = path.resolve(__dirname, '..', '.embedded-postgres');

async function main() {
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
    console.log(`Embedded Postgres running on 127.0.0.1:${PG_PORT}`);

    const stop = async () => {
        try {
            await pg.stop();
        } catch (_) {
            // ignore
        }
        process.exit(0);
    };

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}

main().catch((err) => {
    console.error('Failed to start embedded postgres:', err?.message || err);
    process.exit(1);
});
