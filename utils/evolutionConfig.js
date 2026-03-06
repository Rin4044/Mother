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
    'zana horowa': ['arachne'],

    'human': ['trained_human'],
    'trained human': ['advanced_human'],
    'advanced human': ['high_human', 'blade_human', 'arcane_human', 'holy_human'],
    'high human': ['transcendent_human'],
    'blade human': ['warborn_human'],
    'warborn human': ['mythic_blademaster'],
    'arcane human': ['runic_human'],
    'runic human': ['astral_human', 'sacred_human'],
    'holy human': ['sacred_human'],
    'sacred human': ['divine_human', 'astral_human'],

    'young elf': ['adult_elf'],
    'adult elf': ['high_elf'],
    'high elf': ['moon_elf', 'sun_elf', 'spirit_elf', 'shadow_elf'],
    'moon elf': ['silver_moon_elf'],
    'silver moon elf': ['lunar_arch_elf'],
    'sun elf': ['radiant_sun_elf'],
    'radiant sun elf': ['solar_arch_elf'],
    'spirit elf': ['spiritbound_elf'],
    'spiritbound elf': ['astral_arch_elf'],
    'shadow elf': ['nightshade_elf'],
    'nightshade elf': ['void_elf'],

    'lesser demon': ['true_demon'],
    'true demon': ['greater_demon'],
    'greater demon': ['arch_demon', 'oni', 'succubus', 'vampire', 'fallen_demon'],
    'arch demon': ['demon_semi_divinity'],
    'demon semi divinity': ['demon_divinity'],
    'oni': ['calamity_oni'],
    'calamity oni': ['oni_tyrant'],
    'succubus': ['night_succubus'],
    'night succubus': ['queen_succubus'],
    'vampire': ['elder_vampire'],
    'elder vampire': ['progenitor_vampire'],
    'fallen demon': ['dread_fallen_demon'],
    'dread fallen demon': ['abyssal_fallen_demon', 'demon_divinity']
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
    arachne: { role: '1280561085476376658' },

    human: { role: '1479379168050417735' },
    trained_human: { role: '1479248880095727697' },
    advanced_human: { role: '1479249271382605824' },
    high_human: { role: '1479249274553499764' },
    transcendent_human: { role: '1479249277141123133' },
    blade_human: { role: '1479249278936416341' },
    warborn_human: { role: '1479249281138425909' },
    mythic_blademaster: { role: '1479249282719551761' },
    arcane_human: { role: '1479249284229759137' },
    runic_human: { role: '1479249285773262970' },
    astral_human: { role: '1479249286725111910' },
    holy_human: { role: '1479249288574799963' },
    sacred_human: { role: '1479249290009382964' },
    divine_human: { role: '1479249291569528921' },

    young_elf: { role: '1479249293079613594' },
    adult_elf: { role: '1479249294748942426' },
    high_elf: { role: '1479249296590377031' },
    moon_elf: { role: '1479249297793880306' },
    silver_moon_elf: { role: '1479249299601621043' },
    lunar_arch_elf: { role: '1479249301287866420' },
    sun_elf: { role: '1479249302785101856' },
    radiant_sun_elf: { role: '1479249304286920867' },
    solar_arch_elf: { role: '1479249316341219472' },
    spirit_elf: { role: '1479251336511099013' },
    spiritbound_elf: { role: '1479251339107369155' },
    astral_arch_elf: { role: '1479251340885491782' },
    shadow_elf: { role: '1479251342664011888' },
    nightshade_elf: { role: '1479251343976693883' },
    void_elf: { role: '1479251345319006228' },
    lesser_demon: { role: '1479251347395317892' },
    true_demon: { role: '1479251348615598212' },
    greater_demon: { role: '1479251349626556527' },
    arch_demon: { role: '1479251351547674654' },
    demon_semi_divinity: { role: '1479251352977670154' },
    demon_divinity: { role: '1479251984061038783' },
    oni: { role: '1479251986305257482' },
    calamity_oni: { role: '1479251988049821819' },
    oni_tyrant: { role: '1479251989673152512' },
    succubus: { role: '1479251990856077387' },
    night_succubus: { role: '1479251992164696335' },
    queen_succubus: { role: '1479251993599021178' },
    vampire: { role: '1479251995159433267' },
    elder_vampire: { role: '1479251996237234329' },
    progenitor_vampire: { role: '1479251998456156370' },
    fallen_demon: { role: '1479251999814844466' },
    dread_fallen_demon: { role: '1479252456658567399' },
    abyssal_fallen_demon: { role: '1479252457950544184' }
};

const MAX_LEVEL_BY_RACE = {
    'greater taratect': 30,
    'arch taratect': 50,
    'queen taratect': 50,
    'poison taratect': 30,
    'orthocadinaht': 50,
    'ede saine': 30,
    'zana horowa': 50,
    'arachne': 50,
    'advanced human': 30,
    'high human': 30,
    'warborn human': 30,
    'runic human': 30,
    'sacred human': 30,
    'transcendent human': 50,
    'mythic blademaster': 50,
    'astral human': 50,
    'divine human': 50,
    'high elf': 30,
    'silver moon elf': 30,
    'radiant sun elf': 30,
    'spiritbound elf': 30,
    'nightshade elf': 30,
    'lunar arch elf': 50,
    'solar arch elf': 50,
    'astral arch elf': 50,
    'void elf': 50,
    'greater demon': 30,
    'arch demon': 30,
    'calamity oni': 30,
    'night succubus': 30,
    'elder vampire': 30,
    'dread fallen demon': 30,
    'demon semi divinity': 50,
    'demon divinity': 50,
    'oni tyrant': 50,
    'queen succubus': 50,
    'progenitor vampire': 50,
    'abyssal fallen demon': 50,
    'god': 100
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
    },

    trained_human: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Sturdy', level: 2 }]
    },
    advanced_human: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Herculean Strength', level: 1 }]
    },
    high_human: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Sturdy', level: 4 }]
    },
    transcendent_human: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [
            { name: 'Herculean Strength', level: 5 },
            { name: 'Sturdy', level: 5 },
            { name: 'Magic Attack', level: 3 }
        ]
    },
    blade_human: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Cutting Enhancement', level: 2 }]
    },
    warborn_human: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Cutting Enhancement', level: 4 }
        ],
        grantedSkills: [
            { name: 'Cutting Enhancement', level: 4 },
            { name: 'Destruction Enhancement', level: 3 }
        ]
    },
    mythic_blademaster: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Cutting Enhancement', level: 7 },
            { name: 'Destruction Enhancement', level: 5 }
        ],
        grantedSkills: [
            { name: 'Cutting Enhancement', level: 7 },
            { name: 'Destruction Enhancement', level: 6 },
            { name: 'Herculean Strength', level: 5 }
        ]
    },
    arcane_human: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Magic Attack', level: 2 }]
    },
    runic_human: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Magic Attack', level: 5 }
        ],
        grantedSkills: [
            { name: 'Magic Attack', level: 5 },
            { name: 'MP Recovery Speed', level: 3 }
        ]
    },
    astral_human: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Magic Attack', level: 8 },
            { name: 'MP Recovery Speed', level: 6 }
        ],
        grantedSkills: [
            { name: 'Magic Attack', level: 8 },
            { name: 'MP Recovery Speed', level: 6 },
            { name: 'Energy Conferment', level: 3 }
        ]
    },
    holy_human: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Protection', level: 2 }]
    },
    sacred_human: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Protection', level: 4 },
            { name: 'Resistance', level: 3 }
        ],
        grantedSkills: [
            { name: 'Protection', level: 4 },
            { name: 'Resistance', level: 4 }
        ]
    },
    divine_human: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Protection', level: 7 },
            { name: 'Resistance', level: 7 },
            { name: 'Magic Attack', level: 5 }
        ],
        grantedSkills: [
            { name: 'Protection', level: 7 },
            { name: 'Resistance', level: 7 },
            { name: 'Magic Attack', level: 5 }
        ]
    },

    adult_elf: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Night Vision', level: 3 }]
    },
    high_elf: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Magic Attack', level: 3 }]
    },
    moon_elf: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Stealth', level: 3 }]
    },
    silver_moon_elf: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Stealth', level: 6 }
        ],
        grantedSkills: [
            { name: 'Stealth', level: 6 },
            { name: 'Dark Resistance', level: 5 }
        ]
    },
    lunar_arch_elf: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Stealth', level: 8 },
            { name: 'Dark Resistance', level: 8 },
            { name: 'Magic Attack', level: 6 }
        ],
        grantedSkills: [
            { name: 'Stealth', level: 8 },
            { name: 'Dark Resistance', level: 8 },
            { name: 'Magic Attack', level: 6 }
        ]
    },
    sun_elf: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Magic Attack', level: 4 }]
    },
    radiant_sun_elf: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Magic Attack', level: 7 },
            { name: 'Destruction Enhancement', level: 4 }
        ],
        grantedSkills: [
            { name: 'Magic Attack', level: 7 },
            { name: 'Destruction Enhancement', level: 5 }
        ]
    },
    solar_arch_elf: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Magic Attack', level: 9 },
            { name: 'Destruction Enhancement', level: 8 },
            { name: 'Energy Conferment', level: 3 }
        ],
        grantedSkills: [
            { name: 'Magic Attack', level: 9 },
            { name: 'Destruction Enhancement', level: 8 },
            { name: 'Energy Conferment', level: 4 }
        ]
    },
    spirit_elf: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'MP Recovery Speed', level: 3 }]
    },
    spiritbound_elf: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'MP Recovery Speed', level: 6 },
            { name: 'Resistance', level: 4 }
        ],
        grantedSkills: [
            { name: 'MP Recovery Speed', level: 6 },
            { name: 'Resistance', level: 5 }
        ]
    },
    astral_arch_elf: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'MP Recovery Speed', level: 8 },
            { name: 'Resistance', level: 8 },
            { name: 'Magic Attack', level: 8 }
        ],
        grantedSkills: [
            { name: 'MP Recovery Speed', level: 8 },
            { name: 'Resistance', level: 8 },
            { name: 'Magic Attack', level: 8 }
        ]
    },
    shadow_elf: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Stealth', level: 4 }]
    },
    nightshade_elf: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Stealth', level: 7 },
            { name: 'Poison Attack', level: 3 }
        ],
        grantedSkills: [
            { name: 'Stealth', level: 7 },
            { name: 'Poison Attack', level: 4 }
        ]
    },
    void_elf: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Stealth', level: 9 },
            { name: 'Poison Attack', level: 7 },
            { name: 'Magic Attack', level: 7 }
        ],
        grantedSkills: [
            { name: 'Stealth', level: 9 },
            { name: 'Poison Attack', level: 7 },
            { name: 'Magic Attack', level: 7 }
        ]
    },

    true_demon: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Destruction Enhancement', level: 2 }]
    },
    greater_demon: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Destruction Enhancement', level: 4 }]
    },
    arch_demon: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Heretic Magic', level: 2 }]
    },
    demon_semi_divinity: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Heretic Magic', level: 5 }
        ],
        grantedSkills: [
            { name: 'Heretic Magic', level: 5 },
            { name: 'Heretic Attack', level: 3 }
        ]
    },
    demon_divinity: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Heretic Magic', level: 8 },
            { name: 'Heretic Attack', level: 7 },
            { name: 'Magic Attack', level: 7 }
        ],
        grantedSkills: [
            { name: 'Heretic Magic', level: 8 },
            { name: 'Heretic Attack', level: 7 },
            { name: 'Magic Attack', level: 8 }
        ]
    },
    oni: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Herculean Strength', level: 3 }]
    },
    calamity_oni: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Herculean Strength', level: 6 },
            { name: 'Sturdy', level: 4 }
        ],
        grantedSkills: [
            { name: 'Herculean Strength', level: 6 },
            { name: 'Sturdy', level: 5 }
        ]
    },
    oni_tyrant: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Herculean Strength', level: 9 },
            { name: 'Sturdy', level: 8 },
            { name: 'Destruction Enhancement', level: 5 }
        ],
        grantedSkills: [
            { name: 'Herculean Strength', level: 9 },
            { name: 'Sturdy', level: 8 },
            { name: 'Destruction Enhancement', level: 6 }
        ]
    },
    succubus: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Mental Warfare', level: 3 }]
    },
    night_succubus: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Mental Warfare', level: 6 },
            { name: 'Heretic Magic', level: 3 }
        ],
        grantedSkills: [
            { name: 'Mental Warfare', level: 6 },
            { name: 'Heretic Magic', level: 4 }
        ]
    },
    queen_succubus: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Mental Warfare', level: 9 },
            { name: 'Heretic Magic', level: 7 },
            { name: 'Magic Attack', level: 6 }
        ],
        grantedSkills: [
            { name: 'Mental Warfare', level: 9 },
            { name: 'Heretic Magic', level: 7 },
            { name: 'Magic Attack', level: 7 }
        ]
    },
    vampire: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'HP Recovery Speed', level: 3 }]
    },
    elder_vampire: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'HP Recovery Speed', level: 6 },
            { name: 'Night Vision', level: 5 }
        ],
        grantedSkills: [
            { name: 'HP Recovery Speed', level: 6 },
            { name: 'Night Vision', level: 6 }
        ]
    },
    progenitor_vampire: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'HP Recovery Speed', level: 9 },
            { name: 'Night Vision', level: 9 },
            { name: 'Magic Attack', level: 5 }
        ],
        grantedSkills: [
            { name: 'HP Recovery Speed', level: 9 },
            { name: 'Night Vision', level: 9 },
            { name: 'Magic Attack', level: 6 }
        ]
    },
    fallen_demon: {
        requiredTitles: [],
        requiredSkills: [],
        grantedSkills: [{ name: 'Heretic Magic', level: 3 }]
    },
    dread_fallen_demon: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Heretic Magic', level: 6 },
            { name: 'Dark Resistance', level: 4 }
        ],
        grantedSkills: [
            { name: 'Heretic Magic', level: 6 },
            { name: 'Dark Resistance', level: 5 }
        ]
    },
    abyssal_fallen_demon: {
        requiredTitles: [],
        requiredSkills: [
            { name: 'Heretic Magic', level: 9 },
            { name: 'Dark Resistance', level: 8 },
            { name: 'Heretic Attack', level: 5 }
        ],
        grantedSkills: [
            { name: 'Heretic Magic', level: 9 },
            { name: 'Dark Resistance', level: 8 },
            { name: 'Heretic Attack', level: 6 }
        ]
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
