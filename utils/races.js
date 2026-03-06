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

    "human": {
        base: { hp: 42, mp: 34, stamina: 40, vitalStamina: 40, offense: 18, defense: 16, magic: 14, resistance: 14, speed: 17 },
        growth: { hp: 6, mp: 5, stamina: 6, vitalStamina: 6, offense: 4, defense: 4, magic: 3, resistance: 3, speed: 4 },
        scalingMultiplier: 1
    },
    "trained human": {
        base: { hp: 84, mp: 58, stamina: 80, vitalStamina: 80, offense: 36, defense: 32, magic: 24, resistance: 24, speed: 32 },
        growth: { hp: 8, mp: 6, stamina: 8, vitalStamina: 8, offense: 5, defense: 5, magic: 4, resistance: 4, speed: 5 },
        scalingMultiplier: 1.12
    },
    "advanced human": {
        base: { hp: 280, mp: 200, stamina: 260, vitalStamina: 260, offense: 130, defense: 120, magic: 96, resistance: 104, speed: 120 },
        growth: { hp: 17, mp: 13, stamina: 16, vitalStamina: 16, offense: 12, defense: 11, magic: 9, resistance: 10, speed: 11 },
        scalingMultiplier: 1.45
    },
    "high human": {
        base: { hp: 760, mp: 620, stamina: 700, vitalStamina: 700, offense: 620, defense: 600, magic: 520, resistance: 560, speed: 590 },
        growth: { hp: 26, mp: 22, stamina: 24, vitalStamina: 24, offense: 21, defense: 20, magic: 18, resistance: 19, speed: 20 },
        scalingMultiplier: 1.9
    },
    "transcendent human": {
        base: { hp: 9800, mp: 9400, stamina: 8600, vitalStamina: 8600, offense: 10200, defense: 9600, magic: 11200, resistance: 10800, speed: 9800 },
        growth: { hp: 132, mp: 128, stamina: 118, vitalStamina: 118, offense: 138, defense: 130, magic: 150, resistance: 144, speed: 134 },
        scalingMultiplier: 3.95
    },
    "blade human": {
        base: { hp: 820, mp: 420, stamina: 760, vitalStamina: 760, offense: 760, defense: 620, magic: 300, resistance: 420, speed: 700 },
        growth: { hp: 27, mp: 16, stamina: 25, vitalStamina: 25, offense: 26, defense: 20, magic: 12, resistance: 15, speed: 23 },
        scalingMultiplier: 1.95
    },
    "warborn human": {
        base: { hp: 3200, mp: 1300, stamina: 3000, vitalStamina: 3000, offense: 3500, defense: 2600, magic: 900, resistance: 1700, speed: 3000 },
        growth: { hp: 64, mp: 30, stamina: 60, vitalStamina: 60, offense: 70, defense: 52, magic: 20, resistance: 34, speed: 60 },
        scalingMultiplier: 2.85
    },
    "mythic blademaster": {
        base: { hp: 11200, mp: 3000, stamina: 10400, vitalStamina: 10400, offense: 12800, defense: 9000, magic: 3200, resistance: 7600, speed: 11800 },
        growth: { hp: 154, mp: 52, stamina: 144, vitalStamina: 144, offense: 186, defense: 130, magic: 56, resistance: 104, speed: 172 },
        scalingMultiplier: 4.05
    },
    "arcane human": {
        base: { hp: 720, mp: 980, stamina: 660, vitalStamina: 660, offense: 420, defense: 500, magic: 980, resistance: 900, speed: 560 },
        growth: { hp: 24, mp: 30, stamina: 22, vitalStamina: 22, offense: 16, defense: 18, magic: 30, resistance: 28, speed: 17 },
        scalingMultiplier: 1.95
    },
    "runic human": {
        base: { hp: 3000, mp: 4200, stamina: 2700, vitalStamina: 2700, offense: 2100, defense: 2600, magic: 4600, resistance: 4300, speed: 2600 },
        growth: { hp: 58, mp: 78, stamina: 52, vitalStamina: 52, offense: 42, defense: 50, magic: 84, resistance: 78, speed: 50 },
        scalingMultiplier: 2.85
    },
    "astral human": {
        base: { hp: 9200, mp: 13200, stamina: 8400, vitalStamina: 8400, offense: 7600, defense: 9400, magic: 14800, resistance: 13800, speed: 9000 },
        growth: { hp: 128, mp: 188, stamina: 116, vitalStamina: 116, offense: 108, defense: 132, magic: 210, resistance: 196, speed: 128 },
        scalingMultiplier: 4.02
    },
    "holy human": {
        base: { hp: 780, mp: 700, stamina: 720, vitalStamina: 720, offense: 420, defense: 700, magic: 620, resistance: 760, speed: 500 },
        growth: { hp: 25, mp: 24, stamina: 23, vitalStamina: 23, offense: 15, defense: 24, magic: 20, resistance: 26, speed: 16 },
        scalingMultiplier: 1.95
    },
    "sacred human": {
        base: { hp: 3400, mp: 3600, stamina: 3100, vitalStamina: 3100, offense: 2400, defense: 4200, magic: 3900, resistance: 4500, speed: 2500 },
        growth: { hp: 66, mp: 70, stamina: 60, vitalStamina: 60, offense: 44, defense: 72, magic: 68, resistance: 76, speed: 44 },
        scalingMultiplier: 2.9
    },
    "divine human": {
        base: { hp: 10800, mp: 12500, stamina: 9800, vitalStamina: 9800, offense: 9800, defense: 11200, magic: 13200, resistance: 13800, speed: 9600 },
        growth: { hp: 146, mp: 172, stamina: 132, vitalStamina: 132, offense: 132, defense: 152, magic: 182, resistance: 190, speed: 128 },
        scalingMultiplier: 4.1
    },

    "young elf": {
        base: { hp: 34, mp: 42, stamina: 32, vitalStamina: 32, offense: 12, defense: 10, magic: 20, resistance: 18, speed: 19 },
        growth: { hp: 5, mp: 6, stamina: 5, vitalStamina: 5, offense: 3, defense: 3, magic: 5, resistance: 4, speed: 5 },
        scalingMultiplier: 1
    },
    "adult elf": {
        base: { hp: 66, mp: 86, stamina: 62, vitalStamina: 62, offense: 25, defense: 21, magic: 46, resistance: 42, speed: 40 },
        growth: { hp: 7, mp: 9, stamina: 7, vitalStamina: 7, offense: 4, defense: 4, magic: 7, resistance: 6, speed: 6 },
        scalingMultiplier: 1.12
    },
    "high elf": {
        base: { hp: 210, mp: 300, stamina: 190, vitalStamina: 190, offense: 92, defense: 80, magic: 190, resistance: 170, speed: 146 },
        growth: { hp: 14, mp: 18, stamina: 13, vitalStamina: 13, offense: 9, defense: 8, magic: 14, resistance: 12, speed: 11 },
        scalingMultiplier: 1.42
    },
    "moon elf": {
        base: { hp: 300, mp: 420, stamina: 270, vitalStamina: 270, offense: 120, defense: 106, magic: 280, resistance: 260, speed: 240 },
        growth: { hp: 16, mp: 22, stamina: 14, vitalStamina: 14, offense: 10, defense: 9, magic: 18, resistance: 16, speed: 16 },
        scalingMultiplier: 1.7
    },
    "silver moon elf": {
        base: { hp: 2800, mp: 4200, stamina: 2500, vitalStamina: 2500, offense: 1900, defense: 2400, magic: 4300, resistance: 4100, speed: 3600 },
        growth: { hp: 54, mp: 76, stamina: 48, vitalStamina: 48, offense: 38, defense: 46, magic: 80, resistance: 76, speed: 66 },
        scalingMultiplier: 2.85
    },
    "lunar arch elf": {
        base: { hp: 9800, mp: 14200, stamina: 8600, vitalStamina: 8600, offense: 8600, defense: 9800, magic: 15600, resistance: 15000, speed: 12500 },
        growth: { hp: 136, mp: 204, stamina: 122, vitalStamina: 122, offense: 122, defense: 138, magic: 220, resistance: 212, speed: 176 },
        scalingMultiplier: 4.12
    },
    "sun elf": {
        base: { hp: 290, mp: 450, stamina: 255, vitalStamina: 255, offense: 132, defense: 98, magic: 320, resistance: 250, speed: 220 },
        growth: { hp: 16, mp: 23, stamina: 14, vitalStamina: 14, offense: 11, defense: 9, magic: 20, resistance: 16, speed: 14 },
        scalingMultiplier: 1.7
    },
    "radiant sun elf": {
        base: { hp: 3000, mp: 4600, stamina: 2600, vitalStamina: 2600, offense: 3600, defense: 2200, magic: 5200, resistance: 4600, speed: 3400 },
        growth: { hp: 56, mp: 82, stamina: 50, vitalStamina: 50, offense: 66, defense: 40, magic: 94, resistance: 84, speed: 62 },
        scalingMultiplier: 2.85
    },
    "solar arch elf": {
        base: { hp: 10200, mp: 14600, stamina: 9000, vitalStamina: 9000, offense: 11200, defense: 8400, magic: 16200, resistance: 14600, speed: 11800 },
        growth: { hp: 142, mp: 210, stamina: 128, vitalStamina: 128, offense: 164, defense: 120, magic: 228, resistance: 208, speed: 168 },
        scalingMultiplier: 4.12
    },
    "spirit elf": {
        base: { hp: 270, mp: 460, stamina: 240, vitalStamina: 240, offense: 105, defense: 125, magic: 320, resistance: 300, speed: 200 },
        growth: { hp: 17, mp: 26, stamina: 15, vitalStamina: 15, offense: 11, defense: 12, magic: 24, resistance: 23, speed: 15 },
        scalingMultiplier: 1.72
    },
    "spiritbound elf": {
        base: { hp: 3100, mp: 5200, stamina: 2700, vitalStamina: 2700, offense: 2200, defense: 3800, magic: 5600, resistance: 5500, speed: 3000 },
        growth: { hp: 60, mp: 92, stamina: 52, vitalStamina: 52, offense: 40, defense: 64, magic: 102, resistance: 100, speed: 56 },
        scalingMultiplier: 2.9
    },
    "astral arch elf": {
        base: { hp: 9000, mp: 15000, stamina: 7800, vitalStamina: 7800, offense: 7800, defense: 9200, magic: 16800, resistance: 16200, speed: 11200 },
        growth: { hp: 138, mp: 216, stamina: 122, vitalStamina: 122, offense: 116, defense: 136, magic: 236, resistance: 228, speed: 164 },
        scalingMultiplier: 4.15
    },
    "shadow elf": {
        base: { hp: 280, mp: 360, stamina: 250, vitalStamina: 250, offense: 170, defense: 105, magic: 260, resistance: 220, speed: 330 },
        growth: { hp: 15, mp: 20, stamina: 14, vitalStamina: 14, offense: 14, defense: 9, magic: 16, resistance: 13, speed: 24 },
        scalingMultiplier: 1.72
    },
    "nightshade elf": {
        base: { hp: 2900, mp: 3800, stamina: 2500, vitalStamina: 2500, offense: 4100, defense: 2400, magic: 4400, resistance: 3800, speed: 5600 },
        growth: { hp: 54, mp: 68, stamina: 48, vitalStamina: 48, offense: 76, defense: 44, magic: 80, resistance: 70, speed: 102 },
        scalingMultiplier: 2.9
    },
    "void elf": {
        base: { hp: 9800, mp: 13200, stamina: 8600, vitalStamina: 8600, offense: 12800, defense: 7600, magic: 14800, resistance: 13400, speed: 16800 },
        growth: { hp: 132, mp: 196, stamina: 118, vitalStamina: 118, offense: 186, defense: 112, magic: 210, resistance: 190, speed: 246 },
        scalingMultiplier: 4.12
    },

    "lesser demon": {
        base: { hp: 72, mp: 52, stamina: 68, vitalStamina: 68, offense: 34, defense: 27, magic: 28, resistance: 24, speed: 24 },
        growth: { hp: 9, mp: 7, stamina: 9, vitalStamina: 9, offense: 6, defense: 5, magic: 5, resistance: 5, speed: 5 },
        scalingMultiplier: 1.12
    },
    "true demon": {
        base: { hp: 180, mp: 140, stamina: 170, vitalStamina: 170, offense: 102, defense: 82, magic: 92, resistance: 84, speed: 78 },
        growth: { hp: 14, mp: 12, stamina: 14, vitalStamina: 14, offense: 11, defense: 10, magic: 10, resistance: 9, speed: 10 },
        scalingMultiplier: 1.42
    },
    "greater demon": {
        base: { hp: 1300, mp: 1100, stamina: 1220, vitalStamina: 1220, offense: 1040, defense: 940, magic: 960, resistance: 930, speed: 920 },
        growth: { hp: 34, mp: 30, stamina: 32, vitalStamina: 32, offense: 30, defense: 27, magic: 27, resistance: 26, speed: 27 },
        scalingMultiplier: 2.05
    },
    "arch demon": {
        base: { hp: 1400, mp: 1800, stamina: 1260, vitalStamina: 1260, offense: 980, defense: 920, magic: 1820, resistance: 1700, speed: 980 },
        growth: { hp: 34, mp: 42, stamina: 30, vitalStamina: 30, offense: 25, defense: 24, magic: 42, resistance: 38, speed: 24 },
        scalingMultiplier: 2.2
    },
    "demon semi divinity": {
        base: { hp: 5200, mp: 6200, stamina: 4600, vitalStamina: 4600, offense: 4800, defense: 4300, magic: 7000, resistance: 6600, speed: 4700 },
        growth: { hp: 82, mp: 96, stamina: 74, vitalStamina: 74, offense: 78, defense: 70, magic: 108, resistance: 102, speed: 74 },
        scalingMultiplier: 3.25
    },
    "demon divinity": {
        base: { hp: 12500, mp: 13600, stamina: 11000, vitalStamina: 11000, offense: 13800, defense: 11800, magic: 14200, resistance: 13600, speed: 12200 },
        growth: { hp: 172, mp: 188, stamina: 152, vitalStamina: 152, offense: 190, defense: 164, magic: 196, resistance: 188, speed: 168 },
        scalingMultiplier: 4.2
    },
    "oni": {
        base: { hp: 1600, mp: 760, stamina: 1500, vitalStamina: 1500, offense: 1420, defense: 1180, magic: 620, resistance: 860, speed: 1080 },
        growth: { hp: 42, mp: 22, stamina: 40, vitalStamina: 40, offense: 40, defense: 32, magic: 16, resistance: 22, speed: 30 },
        scalingMultiplier: 2.3
    },
    "calamity oni": {
        base: { hp: 4600, mp: 1400, stamina: 4300, vitalStamina: 4300, offense: 5200, defense: 3900, magic: 1100, resistance: 2500, speed: 3600 },
        growth: { hp: 88, mp: 30, stamina: 82, vitalStamina: 82, offense: 104, defense: 76, magic: 22, resistance: 50, speed: 70 },
        scalingMultiplier: 3.2
    },
    "oni tyrant": {
        base: { hp: 13800, mp: 3000, stamina: 13000, vitalStamina: 13000, offense: 16500, defense: 11800, magic: 2600, resistance: 8400, speed: 12800 },
        growth: { hp: 194, mp: 48, stamina: 182, vitalStamina: 182, offense: 248, defense: 174, magic: 40, resistance: 116, speed: 190 },
        scalingMultiplier: 4.05
    },
    "succubus": {
        base: { hp: 1500, mp: 1900, stamina: 1320, vitalStamina: 1320, offense: 1020, defense: 930, magic: 2100, resistance: 1820, speed: 1650 },
        growth: { hp: 34, mp: 42, stamina: 30, vitalStamina: 30, offense: 24, defense: 22, magic: 48, resistance: 42, speed: 38 },
        scalingMultiplier: 2.3
    },
    "night succubus": {
        base: { hp: 4200, mp: 5600, stamina: 3600, vitalStamina: 3600, offense: 2900, defense: 2700, magic: 6200, resistance: 5600, speed: 4800 },
        growth: { hp: 72, mp: 96, stamina: 64, vitalStamina: 64, offense: 52, defense: 50, magic: 112, resistance: 102, speed: 88 },
        scalingMultiplier: 3.2
    },
    "queen succubus": {
        base: { hp: 11800, mp: 15600, stamina: 10400, vitalStamina: 10400, offense: 8600, defense: 8000, magic: 17200, resistance: 16000, speed: 12600 },
        growth: { hp: 160, mp: 224, stamina: 144, vitalStamina: 144, offense: 122, defense: 116, magic: 246, resistance: 232, speed: 180 },
        scalingMultiplier: 4.15
    },
    "vampire": {
        base: { hp: 1600, mp: 1500, stamina: 1450, vitalStamina: 1450, offense: 1300, defense: 1160, magic: 1400, resistance: 1320, speed: 1240 },
        growth: { hp: 36, mp: 34, stamina: 33, vitalStamina: 33, offense: 32, defense: 28, magic: 30, resistance: 30, speed: 28 },
        scalingMultiplier: 2.3
    },
    "elder vampire": {
        base: { hp: 4500, mp: 4200, stamina: 4000, vitalStamina: 4000, offense: 4200, defense: 3600, magic: 4400, resistance: 4200, speed: 3900 },
        growth: { hp: 76, mp: 72, stamina: 68, vitalStamina: 68, offense: 72, defense: 62, magic: 74, resistance: 70, speed: 64 },
        scalingMultiplier: 3.2
    },
    "progenitor vampire": {
        base: { hp: 12000, mp: 13000, stamina: 10800, vitalStamina: 10800, offense: 12200, defense: 10800, magic: 13600, resistance: 13000, speed: 11800 },
        growth: { hp: 168, mp: 178, stamina: 150, vitalStamina: 150, offense: 172, defense: 152, magic: 186, resistance: 180, speed: 164 },
        scalingMultiplier: 4.12
    },
    "fallen demon": {
        base: { hp: 1450, mp: 1900, stamina: 1300, vitalStamina: 1300, offense: 1000, defense: 960, magic: 2200, resistance: 2000, speed: 1120 },
        growth: { hp: 33, mp: 44, stamina: 30, vitalStamina: 30, offense: 24, defense: 24, magic: 50, resistance: 46, speed: 28 },
        scalingMultiplier: 2.3
    },
    "dread fallen demon": {
        base: { hp: 4200, mp: 6000, stamina: 3700, vitalStamina: 3700, offense: 3000, defense: 2900, magic: 6800, resistance: 6200, speed: 3600 },
        growth: { hp: 74, mp: 104, stamina: 66, vitalStamina: 66, offense: 54, defense: 52, magic: 122, resistance: 112, speed: 64 },
        scalingMultiplier: 3.2
    },
    "abyssal fallen demon": {
        base: { hp: 11600, mp: 16400, stamina: 10400, vitalStamina: 10400, offense: 9000, defense: 8600, magic: 17800, resistance: 17000, speed: 9400 },
        growth: { hp: 156, mp: 232, stamina: 140, vitalStamina: 140, offense: 124, defense: 120, magic: 256, resistance: 246, speed: 136 },
        scalingMultiplier: 4.15
    },

    "god": {
        base: { hp: 50000, mp: 70000, stamina: 45000, vitalStamina: 45000, offense: 60000, defense: 55000, magic: 75000, resistance: 70000, speed: 50000 },
        growth: { hp: 275, mp: 352, stamina: 242, vitalStamina: 242, offense: 330, defense: 308, magic: 396, resistance: 374, speed: 264 },
        scalingMultiplier: 8
    }

};

module.exports = { RACES };
