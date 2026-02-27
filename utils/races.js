const RACES = {

    "small lesser taratect": {
        base: { hp: 26, mp: 26, stamina: 26, vitalStamina: 26, offense: 8, defense: 8, magic: 8, resistance: 8, speed: 8 },
        growth: { hp: 4, mp: 4, stamina: 4, vitalStamina: 4, offense: 3, defense: 3, magic: 3, resistance: 3, speed: 3 },
        scalingMultiplier: 1
    },

    "small taratect": {
        base: { hp: 36, mp: 36, stamina: 36, vitalStamina: 36, offense: 18, defense: 18, magic: 18, resistance: 18, speed: 18 },
        growth: { hp: 7, mp: 7, stamina: 7, vitalStamina: 7, offense: 4, defense: 4, magic: 4, resistance: 4, speed: 4 },
        scalingMultiplier: 1
    },

    "lesser taratect": {
        base: { hp: 85, mp: 36, stamina: 85, vitalStamina: 85, offense: 42, defense: 42, magic: 18, resistance: 18, speed: 42 },
        growth: { hp: 8, mp: 5, stamina: 8, vitalStamina: 8, offense: 5, defense: 5, magic: 3, resistance: 3, speed: 5 },
        scalingMultiplier: 1.2
    },

    "small poison taratect": {
        base: { hp: 56, mp: 56, stamina: 56, vitalStamina: 56, offense: 38, defense: 38, magic: 27, resistance: 27, speed: 38 },
        growth: { hp: 8, mp: 8, stamina: 8, vitalStamina: 8, offense: 5, defense: 5, magic: 5, resistance: 4, speed: 5 },
        scalingMultiplier: 1.1
    },

    "taratect": {
        base: { hp: 200, mp: 120, stamina: 200, vitalStamina: 200, offense: 100, defense: 90, magic: 60, resistance: 60, speed: 90 },
        growth: { hp: 16, mp: 11, stamina: 16, vitalStamina: 16, offense: 11, defense: 10, magic: 7, resistance: 7, speed: 10 },
        scalingMultiplier: 1.3
    },

    "poison taratect": {
        base: { hp: 220, mp: 180, stamina: 210, vitalStamina: 210, offense: 120, defense: 90, magic: 150, resistance: 140, speed: 110 },
        growth: { hp: 19, mp: 16, stamina: 18, vitalStamina: 18, offense: 12, defense: 10, magic: 16, resistance: 14, speed: 11 },
        scalingMultiplier: 1.35
    },

    "greater taratect": {
        base: { hp: 2845, mp: 2101, stamina: 2839, vitalStamina: 2839, offense: 2766, defense: 2710, magic: 2099, resistance: 2102, speed: 2744 },
        growth: { hp: 38, mp: 25, stamina: 38, vitalStamina: 38, offense: 30, defense: 30, magic: 23, resistance: 23, speed: 30 },
        scalingMultiplier: 2
    },

    "arch taratect": {
        base: { hp: 2912, mp: 2167, stamina: 2901, vitalStamina: 2901, offense: 2811, defense: 2808, magic: 2187, resistance: 2199, speed: 2851 },
        growth: { hp: 56, mp: 36, stamina: 56, vitalStamina: 56, offense: 46, defense: 44, magic: 35, resistance: 35, speed: 45 },
        scalingMultiplier: 2.2
    },

    "queen taratect": {
        base: { hp: 8971, mp: 8012, stamina: 8467, vitalStamina: 8467, offense: 8846, defense: 8839, magic: 7992, resistance: 7991, speed: 8810 },
        growth: { hp: 75, mp: 63, stamina: 75, vitalStamina: 75, offense: 69, defense: 69, magic: 56, resistance: 56, speed: 69 },
        scalingMultiplier: 3
    },

    "orthocadinaht": {
        base: { hp: 2400, mp: 2600, stamina: 2200, vitalStamina: 2200, offense: 2000, defense: 2100, magic: 2900, resistance: 2800, speed: 2300 },
        growth: { hp: 52, mp: 56, stamina: 50, vitalStamina: 50, offense: 42, defense: 42, magic: 58, resistance: 56, speed: 44 },
        scalingMultiplier: 2.1
    },

    "zoa ele": {
        base: { hp: 200, mp: 200, stamina: 200, vitalStamina: 200, offense: 100, defense: 100, magic: 100, resistance: 100, speed: 100 },
        growth: { hp: 16, mp: 16, stamina: 16, vitalStamina: 16, offense: 12, defense: 12, magic: 12, resistance: 12, speed: 12 },
        scalingMultiplier: 1.5
    },

    "ede saine": {
        base: { hp: 800, mp: 800, stamina: 800, vitalStamina: 800, offense: 400, defense: 400, magic: 400, resistance: 400, speed: 400 },
        growth: { hp: 27, mp: 27, stamina: 27, vitalStamina: 27, offense: 21, defense: 21, magic: 21, resistance: 21, speed: 21 },
        scalingMultiplier: 2.5
    },

    "zana horowa": {
        base: { hp: 2800, mp: 3000, stamina: 2600, vitalStamina: 2600, offense: 2400, defense: 2300, magic: 3100, resistance: 3000, speed: 2600 },
        growth: { hp: 70, mp: 78, stamina: 68, vitalStamina: 68, offense: 62, defense: 58, magic: 82, resistance: 76, speed: 64 },
        scalingMultiplier: 2.4
    },

    "arachne": {
        base: { hp: 12000, mp: 15000, stamina: 10000, vitalStamina: 10000, offense: 13000, defense: 11000, magic: 16000, resistance: 15000, speed: 12000 },
        growth: { hp: 150, mp: 185, stamina: 132, vitalStamina: 132, offense: 168, defense: 146, magic: 205, resistance: 188, speed: 156 },
        scalingMultiplier: 4
    },

    "god": {
        base: { hp: 50000, mp: 70000, stamina: 45000, vitalStamina: 45000, offense: 60000, defense: 55000, magic: 75000, resistance: 70000, speed: 50000 },
        growth: { hp: 275, mp: 352, stamina: 242, vitalStamina: 242, offense: 330, defense: 308, magic: 396, resistance: 374, speed: 264 },
        scalingMultiplier: 8
    }

};

module.exports = { RACES };
