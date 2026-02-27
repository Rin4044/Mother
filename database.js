const { Sequelize } = require('sequelize');

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. This project is now Postgres-only.');
}

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false,
    dialectOptions: {
        ssl: process.env.DB_SSL === 'false'
            ? false
            : { require: true, rejectUnauthorized: false }
    }
});

const Profiles = require('./utils/models/Profiles')(sequelize);
const Skills = require('./utils/models/Skills')(sequelize);
const UserSkills = require('./utils/models/UserSkills')(sequelize);
const Titles = require('./utils/models/Titles')(sequelize);
const TitleSkills = require('./utils/models/TitleSkills')(sequelize);
const UserTitles = require('./utils/models/UserTitles')(sequelize);
const Monsters = require('./utils/models/Monsters')(sequelize);
const MonsterSkills = require('./utils/models/MonsterSkills')(sequelize);
const FightProgress = require('./utils/models/FightProgress')(sequelize);
const SpawnConfig = require('./utils/models/SpawnConfig')(sequelize);
const SpawnChannels = require('./utils/models/SpawnChannels')(sequelize);
const SpawnInstances = require('./utils/models/SpawnInstances')(sequelize);
const TutorialProgress = require('./utils/models/TutorialProgress')(sequelize);
const RaidInstances = require('./utils/models/RaidInstances')(sequelize);
const InventoryItems = require('./utils/models/InventoryItems')(sequelize);

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

SpawnConfig.hasMany(SpawnChannels, {
    foreignKey: 'guildId',
    sourceKey: 'guildId',
    onDelete: 'CASCADE'
});
SpawnChannels.belongsTo(SpawnConfig, {
    foreignKey: 'guildId',
    targetKey: 'guildId'
});
SpawnChannels.hasMany(SpawnInstances, {
    foreignKey: 'spawnChannelId',
    onDelete: 'CASCADE'
});
SpawnInstances.belongsTo(SpawnChannels, {
    foreignKey: 'spawnChannelId'
});

Profiles.hasOne(TutorialProgress, { foreignKey: 'profileId', onDelete: 'CASCADE' });
TutorialProgress.belongsTo(Profiles, { foreignKey: 'profileId' });

Profiles.hasMany(InventoryItems, { foreignKey: 'profileId', onDelete: 'CASCADE' });
InventoryItems.belongsTo(Profiles, { foreignKey: 'profileId' });

async function initDatabase() {
    try {
        await sequelize.authenticate();
        console.log('Database connection established.');
        await sequelize.sync();
        await ensureSpawnChannelsColumns();
        await ensureUserSkillsColumns();
        await ensureProfilesColumns();
        await ensureFightProgressColumns();
        await ensureSkillClassifications();
        await ensureRulerTitleBalance();
        console.log('Database synced.');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

async function ensureSpawnChannelsColumns() {
    const queryInterface = sequelize.getQueryInterface();
    const tableDefinition = await queryInterface.describeTable('SpawnChannels');

    if (!tableDefinition.monsterIds) {
        await queryInterface.addColumn('SpawnChannels', 'monsterIds', {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: null
        });
    }

    if (!tableDefinition.baseTimer) {
        await queryInterface.addColumn('SpawnChannels', 'baseTimer', {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null
        });
    }

    if (!tableDefinition.variance) {
        await queryInterface.addColumn('SpawnChannels', 'variance', {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null
        });
    }

    if (!tableDefinition.xpMultiplier) {
        await queryInterface.addColumn('SpawnChannels', 'xpMultiplier', {
            type: Sequelize.FLOAT,
            allowNull: true,
            defaultValue: null
        });
    }
}

async function ensureUserSkillsColumns() {
    const queryInterface = sequelize.getQueryInterface();
    const tableDefinition = await queryInterface.describeTable('UserSkills');

    if (!tableDefinition.equippedSlot) {
        await queryInterface.addColumn('UserSkills', 'equippedSlot', {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null
        });
    }
}

async function ensureProfilesColumns() {
    const queryInterface = sequelize.getQueryInterface();
    const tableDefinition = await queryInterface.describeTable('Profiles');

    if (!tableDefinition.remainingHp) {
        await queryInterface.addColumn('Profiles', 'remainingHp', {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null
        });
    }

    if (!tableDefinition.remainingMp) {
        await queryInterface.addColumn('Profiles', 'remainingMp', {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null
        });
    }

    if (!tableDefinition.remainingStamina) {
        await queryInterface.addColumn('Profiles', 'remainingStamina', {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null
        });
    }

    if (!tableDefinition.remainingVitalStamina) {
        await queryInterface.addColumn('Profiles', 'remainingVitalStamina', {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: null
        });
    }

    if (!tableDefinition.xpBoostPercent) {
        await queryInterface.addColumn('Profiles', 'xpBoostPercent', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        });
    }

    if (!tableDefinition.xpBoostFightsRemaining) {
        await queryInterface.addColumn('Profiles', 'xpBoostFightsRemaining', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0
        });
    }

    if (!tableDefinition.xpBoostExpiresAt) {
        await queryInterface.addColumn('Profiles', 'xpBoostExpiresAt', {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null
        });
    }

    if (!tableDefinition.rulerProgress) {
        await queryInterface.addColumn('Profiles', 'rulerProgress', {
            type: Sequelize.JSON,
            allowNull: false,
            defaultValue: {}
        });
    }
}

async function ensureFightProgressColumns() {
    const queryInterface = sequelize.getQueryInterface();
    const tableDefinition = await queryInterface.describeTable('FightProgresses');

    if (!tableDefinition.skillXpSummary) {
        await queryInterface.addColumn('FightProgresses', 'skillXpSummary', {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: null
        });
    }

    if (!tableDefinition.playerEffects) {
        await queryInterface.addColumn('FightProgresses', 'playerEffects', {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: null
        });
    }

    if (!tableDefinition.monsterEffects) {
        await queryInterface.addColumn('FightProgresses', 'monsterEffects', {
            type: Sequelize.JSON,
            allowNull: true,
            defaultValue: null
        });
    }
}

async function ensureSkillClassifications() {
    // Deadly Poison Attack is an offensive skill and must be handled as a combat attack.
    await Skills.update(
        { effect_type_main: 'Physical' },
        {
            where: {
                name: 'Deadly Poison Attack',
                effect_type_main: 'Debuff'
            }
        }
    );
}

async function ensureRulerTitleBalance() {
    const RULER_TITLE_STATS = {
        'Ruler Of Pride': { hp: 0, mp: 90, stamina: 0, vital_stamina: 0, offense: 40, defense: 0, magic: 95, resistance: 80, speed: 35 },
        'Ruler Of Sloth': { hp: 70, mp: 0, stamina: 70, vital_stamina: 60, offense: 0, defense: 45, magic: 0, resistance: 50, speed: 0 },
        'Ruler Of Gluttony': { hp: 65, mp: 55, stamina: 65, vital_stamina: 50, offense: 45, defense: 0, magic: 0, resistance: 40, speed: 0 },
        'Ruler Of Wrath': { hp: 0, mp: 0, stamina: 45, vital_stamina: 0, offense: 95, defense: 0, magic: 0, resistance: 35, speed: 70 },
        'Ruler Of Greed': { hp: 55, mp: 0, stamina: 0, vital_stamina: 0, offense: 80, defense: 50, magic: 0, resistance: 45, speed: 30 },
        'Ruler Of Lust': { hp: 0, mp: 0, stamina: 60, vital_stamina: 50, offense: 0, defense: 0, magic: 50, resistance: 35, speed: 75 },
        'Ruler Of Envy': { hp: 60, mp: 0, stamina: 0, vital_stamina: 0, offense: 35, defense: 80, magic: 0, resistance: 90, speed: 0 },
        'Ruler Of Mercy': { hp: 55, mp: 55, stamina: 0, vital_stamina: 0, offense: 0, defense: 35, magic: 50, resistance: 45, speed: 0 },
        'Ruler Of Temperance': { hp: 0, mp: 70, stamina: 0, vital_stamina: 0, offense: 0, defense: 60, magic: 40, resistance: 70, speed: 0 },
        'Ruler Of Diligence': { hp: 55, mp: 0, stamina: 0, vital_stamina: 0, offense: 40, defense: 70, magic: 0, resistance: 70, speed: 35 },
        'Ruler Of Humility': { hp: 0, mp: 0, stamina: 0, vital_stamina: 0, offense: 0, defense: 40, magic: 55, resistance: 70, speed: 70 },
        'Ruler Of Chastity': { hp: 40, mp: 0, stamina: 0, vital_stamina: 0, offense: 0, defense: 75, magic: 0, resistance: 75, speed: 55 },
        'Ruler Of Wisdom': { hp: 0, mp: 95, stamina: 0, vital_stamina: 0, offense: 0, defense: 35, magic: 95, resistance: 80, speed: 0 }
    };

    for (const [name, stats] of Object.entries(RULER_TITLE_STATS)) {
        await Titles.update(stats, { where: { name } });
    }
}

initDatabase();

module.exports = {
    sequelize,
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
