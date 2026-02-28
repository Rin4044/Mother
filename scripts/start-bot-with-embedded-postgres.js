const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
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
const BOT_ENTRY = path.resolve(__dirname, '..', 'index.js');
const RESTART_BASE_DELAY_MS = 2000;
const RESTART_MAX_DELAY_MS = 30000;
const RAPID_CRASH_WINDOW_MS = 10000;

let shuttingDown = false;
let botChild = null;
let restartDelayMs = RESTART_BASE_DELAY_MS;

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

function scheduleRestart() {
    if (shuttingDown) {
        return;
    }

    const delay = restartDelayMs;
    restartDelayMs = Math.min(restartDelayMs * 2, RESTART_MAX_DELAY_MS);

    console.warn(`Bot crashed. Restart in ${Math.round(delay / 1000)}s...`);
    setTimeout(() => {
        if (!shuttingDown) {
            startBotProcess();
        }
    }, delay);
}

function startBotProcess() {
    if (shuttingDown) {
        return;
    }

    const startedAt = Date.now();
    botChild = spawn(process.execPath, [BOT_ENTRY], {
        cwd: path.resolve(__dirname, '..'),
        env: process.env,
        stdio: 'inherit'
    });

    botChild.on('error', (error) => {
        console.error('Failed to start bot process:', error);
        scheduleRestart();
    });

    botChild.on('exit', (code, signal) => {
        const uptimeMs = Date.now() - startedAt;
        const normalExit = code === 0;

        botChild = null;

        if (shuttingDown) {
            return;
        }

        if (uptimeMs > RAPID_CRASH_WINDOW_MS) {
            restartDelayMs = RESTART_BASE_DELAY_MS;
        }

        if (normalExit) {
            console.warn('Bot exited with code 0. Restarting...');
        } else {
            console.error(`Bot exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`);
        }

        scheduleRestart();
    });
}

function shutdown(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    console.log(`Received ${signal}. Stopping supervisor...`);

    if (botChild && !botChild.killed) {
        botChild.kill(signal);
    }

    setTimeout(() => process.exit(0), 250).unref();
}

async function ensureDatabase() {
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
}

async function main() {
    await ensureDatabase();

    process.env.DATABASE_URL = DATABASE_URL;
    process.env.DB_SSL = process.env.DB_SSL || 'false';

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    startBotProcess();
}

main().catch((err) => {
    console.error('Failed to start bot with embedded postgres:', err?.message || err);
    process.exit(1);
});
