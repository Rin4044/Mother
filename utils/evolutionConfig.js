const EVOLUTION_TREE = {
    'small lesser taratect': ['lesser_taratect', 'small_taratect'],
    'small taratect': ['taratect', 'small_poison_taratect'],
    'lesser taratect': ['taratect'],
    'small poison taratect': ['poison_taratect', 'zoa_ele'],
    'taratect': ['greater_taratect', 'small_poison_taratect'],
    'greater taratect': ['arch_taratect'],
    'arch taratect': ['queen_taratect'],
    'poison taratect': ['orthocadinaht'],
    'zoa ele': ['ede_saine', 'greater_taratect', 'orthocadinaht'],
    'ede saine': ['zana_horowa', 'queen_taratect'],
    'zana horowa': ['arachne']
};

const RACE_CONFIG = {
    lesser_taratect: { role: '1279130394897154080' },
    small_taratect: { role: '1279130393488130131' },
    taratect: { role: '1279130391642636409' },
    small_poison_taratect: { role: '1279130390002667602' },
    greater_taratect: { role: '1279127193225658449' },
    arch_taratect: { role: '1279127295986237461' },
    queen_taratect: { role: '1280561084717207573' },
    poison_taratect: { role: '1279127140515708938' },
    orthocadinaht: { role: '1280561373280993360' },
    zoa_ele: { role: '1280561370038796360' },
    ede_saine: { role: '1280561080191549513' },
    zana_horowa: { role: '1280561086919217193' },
    arachne: { role: '1280561085476376658' }
};

const MAX_LEVEL_BY_RACE = {
    'greater taratect': 30,
    'arch taratect': 50,
    'queen taratect': 50,
    'poison taratect': 30,
    orthocadinaht: 50,
    'ede saine': 30,
    'zana horowa': 50,
    arachne: 50,
    god: 100
};

// Data-driven evolution gates/rewards. Keys are target race keys (underscore format).
const EVOLUTION_RULES = {
    lesser_taratect: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [
            { name: 'Poison Fang', level: 5 },
            { name: 'Spider Thread', level: 5 },
            { name: 'Night Vision', level: 10 },
            { name: 'Vision Expansion', level: 1 },
            { name: 'Poison Resistance', level: 5 }
        ]
    },
    small_taratect: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [
            { name: 'Rot Resistance', level: 1 },
            { name: 'Taboo', level: 1 },
            { name: 'Heretic Magic', level: 1 }
        ]
    },
    small_poison_taratect: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Poison Fang', level: 5 }
        ],
        grantedSkills: [
            { name: 'Poison Attack', level: 1 },
            { name: 'Poison Synthesis', level: 1 },
            { name: 'Poison Resistance', level: 1 },
            { name: 'Spider Thread', level: 1 },
            { name: 'Thread Control', level: 1 },
            { name: 'Heretic Magic', level: 1 },
            { name: 'Petrification Resistance', level: 1 },
            { name: 'Faint Resistance', level: 1 },
            { name: 'Heresy Resistance', level: 1 }
        ]
    },
    zoa_ele: {
        requiredTitles: ['Kin Eater'],
        requiredSkills: [
            { name: 'Poison Fang', level: 10 }
        ],
        grantedSkills: [
            { name: 'Rot Attack', level: 1 },
            { name: 'Deadly Poison Attack', level: 1 },
            { name: 'Utility Thread', level: 1 },
            { name: 'Thread Control', level: 1 },
            { name: 'Silence', level: 1 },
            { name: 'Stealth', level: 1 },
            { name: 'MP Recovery Speed', level: 1 },
            { name: 'Destruction Enhancement', level: 1 },
            { name: 'Cutting Enhancement', level: 1 },
            { name: 'Poison Enhancement', level: 1 },
            { name: 'Mental Warfare', level: 1 },
            { name: 'Energy Conferment', level: 1 },
            { name: 'Poison Synthesis', level: 1 },
            { name: 'Shadow Magic', level: 1 },
            { name: 'Poison Magic', level: 1 },
            { name: 'Destruction Resistance', level: 1 },
            { name: 'Dark Resistance', level: 1 },
            { name: 'Paralysis Resistance', level: 1 },
            { name: 'Faint Resistance', level: 1 },
            { name: 'Tactile Enhancement', level: 1 },
            { name: 'Herculean Strength', level: 1 },
            { name: 'Sturdy', level: 1 },
            { name: 'Protection', level: 1 },
            { name: 'Taboo', level: 1 },
            { name: 'Heretic Magic', level: 1 }
        ]
    },
    greater_taratect: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [
            { name: 'Deadly Poison Attack', level: 5 }
        ]
    },
    queen_taratect: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [
            { name: 'Magic Attack', level: 5 },
            { name: 'Deadly Poison Attack', level: 10 },
            { name: 'Enhanced Paralysis Attack', level: 10 },
            { name: 'Heretic Attack', level: 3 }
        ]
    },
    ede_saine: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Rot Attack', level: 10 }
        ],
        grantedSkills: [
            { name: 'Spider Thread', level: 5 },
            { name: 'Poison Fang', level: 5 },
            { name: 'Rot Attack', level: 5 },
            { name: 'Cutting Enhancement', level: 5 },
            { name: 'Stealth', level: 5 },
            { name: 'Silence', level: 5 },
            { name: 'Shadow Magic', level: 5 },
            { name: 'Poison Resistance', level: 5 }
        ]
    },
    zana_horowa: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Taboo', level: 10 }
        ],
        grantedSkills: [
            { name: 'Magic Attack', level: 1 },
            { name: 'Deadly Poison Attack', level: 7 },
            { name: 'Rot Attack', level: 5 },
            { name: 'Heretic Attack', level: 6 }
        ]
    },
    arachne: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Pride', level: 1 }
        ],
        grantedSkills: []
    },
    poison_taratect: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Poison Fang', level: 10 }
        ],
        grantedSkills: []
    },
    orthocadinaht: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Poison Attack', level: 5 }
        ],
        grantedSkills: []
    }
};

function formatRaceName(raceKey) {
    return raceKey
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function getMaxLevelForRace(race) {
    const cleanRace = race?.toLowerCase?.().trim?.() || '';
    return MAX_LEVEL_BY_RACE[cleanRace] || 10;
}

function getEvolutionRule(raceKey) {
    return EVOLUTION_RULES[raceKey] || {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: []
    };
}

module.exports = {
    EVOLUTION_TREE,
    RACE_CONFIG,
    MAX_LEVEL_BY_RACE,
    EVOLUTION_RULES,
    formatRaceName,
    getMaxLevelForRace,
    getEvolutionRule
};
