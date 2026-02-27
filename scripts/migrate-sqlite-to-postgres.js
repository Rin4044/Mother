const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const EmbeddedPostgresModule = require('embedded-postgres');

const EmbeddedPostgres = EmbeddedPostgresModule.default || EmbeddedPostgresModule;

const SQLITE_PATH = path.resolve(__dirname, '..', 'database.sqlite');
const BACKUP_DIR = path.resolve(__dirname, '..', 'backups');
const EMBEDDED_DB_DIR = path.resolve(__dirname, '..', '.embedded-postgres');
const PG_PORT = Number(process.env.PG_LOCAL_PORT || 5432);
const PG_USER = process.env.PG_LOCAL_USER || 'postgres';
const PG_PASSWORD = process.env.PG_LOCAL_PASSWORD || 'mother_local_pg';
const PG_DB = process.env.PG_LOCAL_DB || 'mother';
const SKIP_EMBEDDED_BOOT = String(process.env.SKIP_EMBEDDED_BOOT || '').toLowerCase() === 'true';

function initModels(sequelize) {
    const Profiles = require('../utils/models/Profiles')(sequelize);
    const Skills = require('../utils/models/Skills')(sequelize);
    const UserSkills = require('../utils/models/UserSkills')(sequelize);
    const Titles = require('../utils/models/Titles')(sequelize);
    const TitleSkills = require('../utils/models/TitleSkills')(sequelize);
    const UserTitles = require('../utils/models/UserTitles')(sequelize);
    const Monsters = require('../utils/models/Monsters')(sequelize);
    const MonsterSkills = require('../utils/models/MonsterSkills')(sequelize);
    const FightProgress = require('../utils/models/FightProgress')(sequelize);
    const SpawnConfig = require('../utils/models/SpawnConfig')(sequelize);
    const SpawnChannels = require('../utils/models/SpawnChannels')(sequelize);
    const SpawnInstances = require('../utils/models/SpawnInstances')(sequelize);
    const TutorialProgress = require('../utils/models/TutorialProgress')(sequelize);
    const RaidInstances = require('../utils/models/RaidInstances')(sequelize);
    const InventoryItems = require('../utils/models/InventoryItems')(sequelize);

    Profiles.hasMany(UserSkills, { foreignKey: 'profileId', onDelete: 'CASCADE' });
    UserSkills.belongsTo(Profiles, { foreignKey: 'profileId' });
    Skills.hasMany(UserSkills, { foreignKey: 'skillId', onDelete: 'CASCADE' });
    UserSkills.belongsTo(Skills, { foreignKey: 'skillId' });
    Titles.belongsToMany(Skills, { through: TitleSkills, foreignKey: 'titleId' });
    Skills.belongsToMany(Titles, { through: TitleSkills, foreignKey: 'skillId' });
    Profiles.hasMany(UserTitles, { foreignKey: 'profileId', onDelete: 'CASCADE' });
    UserTitles.belongsTo(Profiles, { foreignKey: 'profileId' });
    Titles.hasMany(UserTitles, { foreignKey: 'titleId', onDelete: 'CASCADE' });
    UserTitles.belongsTo(Titles, { foreignKey: 'titleId' });
    Monsters.belongsToMany(Skills, { through: MonsterSkills, foreignKey: 'monsterId' });
    Skills.belongsToMany(Monsters, { through: MonsterSkills, foreignKey: 'skillId' });
    MonsterSkills.belongsTo(Skills, { foreignKey: 'skillId' });
    MonsterSkills.belongsTo(Monsters, { foreignKey: 'monsterId' });
    Profiles.hasOne(FightProgress, { foreignKey: 'profileId', onDelete: 'CASCADE' });
    FightProgress.belongsTo(Profiles, { foreignKey: 'profileId' });
    SpawnConfig.hasMany(SpawnChannels, { foreignKey: 'guildId', sourceKey: 'guildId', onDelete: 'CASCADE' });
    SpawnChannels.belongsTo(SpawnConfig, { foreignKey: 'guildId', targetKey: 'guildId' });
    SpawnChannels.hasMany(SpawnInstances, { foreignKey: 'spawnChannelId', onDelete: 'CASCADE' });
    SpawnInstances.belongsTo(SpawnChannels, { foreignKey: 'spawnChannelId' });
    Profiles.hasOne(TutorialProgress, { foreignKey: 'profileId', onDelete: 'CASCADE' });
    TutorialProgress.belongsTo(Profiles, { foreignKey: 'profileId' });
    Profiles.hasMany(InventoryItems, { foreignKey: 'profileId', onDelete: 'CASCADE' });
    InventoryItems.belongsTo(Profiles, { foreignKey: 'profileId' });

    return {
        Profiles,
        Skills,
        UserSkills,
        Titles,
        TitleSkills,
        UserTitles,
        Monsters,
        MonsterSkills,
        FightProgress,
        SpawnConfig,
        SpawnChannels,
        SpawnInstances,
        TutorialProgress,
        RaidInstances,
        InventoryItems
    };
}

function getTableName(model) {
    const table = model.getTableName();
    if (typeof table === 'string') return table;
    return table.tableName;
}

async function ensureBackup() {
    if (!fs.existsSync(SQLITE_PATH)) {
        throw new Error(`SQLite file not found: ${SQLITE_PATH}`);
    }
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `database-${stamp}.sqlite`);
    fs.copyFileSync(SQLITE_PATH, backupPath);
    return backupPath;
}

async function copyTable(sourceModel, targetModel) {
    const rows = await sourceModel.findAll({ raw: true });
    if (!rows.length) return 0;
    await targetModel.bulkCreate(rows, { validate: false, hooks: false, logging: false });
    return rows.length;
}

async function resetSequenceForId(targetSequelize, model) {
    if (!model.rawAttributes?.id) return;
    const table = getTableName(model);
    const qTable = `"${table}"`;
    await targetSequelize.query(
        `SELECT setval(pg_get_serial_sequence('${qTable}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM ${qTable};`
    );
}

async function migrate() {
    const backupPath = await ensureBackup();
    console.log(`SQLite backup created: ${backupPath}`);

    if (!SKIP_EMBEDDED_BOOT) {
        const pg = new EmbeddedPostgres({
            databaseDir: EMBEDDED_DB_DIR,
            user: PG_USER,
            password: PG_PASSWORD,
            port: PG_PORT,
            persistent: true,
            initdbFlags: ['--encoding=UTF8', '--locale=C'],
            onError: (msg) => console.error(String(msg || ''))
        });

        await pg.initialise();
        await pg.start();
        try {
            await pg.createDatabase(PG_DB);
        } catch (_) {
            // already exists
        }
    }

    const sourceSequelize = new Sequelize({
        dialect: 'sqlite',
        storage: SQLITE_PATH,
        logging: false
    });
    const targetSequelize = new Sequelize(`postgres://${PG_USER}:${encodeURIComponent(PG_PASSWORD)}@127.0.0.1:${PG_PORT}/${PG_DB}`, {
        dialect: 'postgres',
        logging: false
    });

    const source = initModels(sourceSequelize);
    const target = initModels(targetSequelize);

    await sourceSequelize.authenticate();
    await targetSequelize.authenticate();
    await targetSequelize.sync();

    const ordered = [
        'Profiles',
        'Skills',
        'Titles',
        'Monsters',
        'SpawnConfig',
        'SpawnChannels',
        'SpawnInstances',
        'FightProgress',
        'UserSkills',
        'UserTitles',
        'TitleSkills',
        'MonsterSkills',
        'TutorialProgress',
        'RaidInstances',
        'InventoryItems'
    ];

    const targetTables = ordered.map((key) => `"${getTableName(target[key])}"`).join(', ');
    await targetSequelize.query('SET session_replication_role = replica;');
    await targetSequelize.query(`TRUNCATE TABLE ${targetTables} RESTART IDENTITY CASCADE;`);

    const copied = [];
    for (const key of ordered) {
        const count = await copyTable(source[key], target[key]);
        copied.push({ key, count });
        console.log(`${key}: ${count}`);
    }

    for (const key of ordered) {
        await resetSequenceForId(targetSequelize, target[key]);
    }
    await targetSequelize.query('SET session_replication_role = origin;');

    console.log('\nVerification (source -> target):');
    for (const key of ordered) {
        const [sCount, tCount] = await Promise.all([
            source[key].count(),
            target[key].count()
        ]);
        console.log(`${key}: ${sCount} -> ${tCount}`);
    }

    await sourceSequelize.close();
    await targetSequelize.close();

    const envPath = path.resolve(__dirname, '..', '.env');
    const dbUrl = `postgres://${PG_USER}:${encodeURIComponent(PG_PASSWORD)}@127.0.0.1:${PG_PORT}/${PG_DB}`;
    const envLines = [
        `DATABASE_URL=${dbUrl}`,
        'DB_SSL=false',
        'USE_EMBEDDED_POSTGRES=true'
    ];

    const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const merged = existing
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((line) => !line.startsWith('DATABASE_URL=') && !line.startsWith('DB_SSL=') && !line.startsWith('USE_EMBEDDED_POSTGRES='));
    fs.writeFileSync(envPath, [...merged, ...envLines].join('\n') + '\n', 'utf8');

    console.log('\nMigration complete.');
    console.log(`Embedded Postgres dir: ${EMBEDDED_DB_DIR}`);
    console.log(`Connection URL: ${dbUrl}`);
    console.log('Updated .env with DATABASE_URL, DB_SSL=false, USE_EMBEDDED_POSTGRES=true');
    console.log('Keep Postgres running with: npm run db:start');
    console.log('Run bot with: npm run bot:start');
}

migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
});
