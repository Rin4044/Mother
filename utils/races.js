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
        base: { hp: 76, mp: 52, stamina: 74, vitalStamina: 74, offense: 34, defense: 30, magic: 22, resistance: 24, speed: 30 },
        growth: { hp: 8, mp: 6, stamina: 8, vitalStamina: 8, offense: 5, defense: 5, magic: 4, resistance: 4, speed: 5 },
        scalingMultiplier: 1.1
    },
    "advanced human": {
        base: { hp: 240, mp: 180, stamina: 230, vitalStamina: 230, offense: 120, defense: 110, magic: 90, resistance: 100, speed: 115 },
        growth: { hp: 16, mp: 13, stamina: 15, vitalStamina: 15, offense: 11, defense: 10, magic: 9, resistance: 10, speed: 11 },
        scalingMultiplier: 1.4
    },
    "high human": {
        base: { hp: 1050, mp: 900, stamina: 980, vitalStamina: 980, offense: 840, defense: 820, magic: 740, resistance: 780, speed: 820 },
        growth: { hp: 30, mp: 25, stamina: 28, vitalStamina: 28, offense: 24, defense: 23, magic: 22, resistance: 22, speed: 24 },
        scalingMultiplier: 2
    },
    "transcendent human": {
        base: { hp: 4200, mp: 4500, stamina: 3800, vitalStamina: 3800, offense: 4700, defense: 4300, magic: 5200, resistance: 5000, speed: 4500 },
        growth: { hp: 78, mp: 86, stamina: 72, vitalStamina: 72, offense: 84, defense: 76, magic: 92, resistance: 88, speed: 82 },
        scalingMultiplier: 3.1
    },
    "blade human": {
        base: { hp: 270, mp: 130, stamina: 250, vitalStamina: 250, offense: 155, defense: 120, magic: 60, resistance: 80, speed: 145 },
        growth: { hp: 17, mp: 10, stamina: 16, vitalStamina: 16, offense: 13, defense: 10, magic: 6, resistance: 8, speed: 12 },
        scalingMultiplier: 1.45
    },
    "warborn human": {
        base: { hp: 1500, mp: 700, stamina: 1400, vitalStamina: 1400, offense: 1450, defense: 1120, magic: 520, resistance: 860, speed: 1250 },
        growth: { hp: 36, mp: 20, stamina: 34, vitalStamina: 34, offense: 35, defense: 28, magic: 16, resistance: 22, speed: 31 },
        scalingMultiplier: 2.15
    },
    "mythic blademaster": {
        base: { hp: 5600, mp: 1600, stamina: 5200, vitalStamina: 5200, offense: 7000, defense: 4800, magic: 1700, resistance: 3800, speed: 6500 },
        growth: { hp: 96, mp: 36, stamina: 90, vitalStamina: 90, offense: 122, defense: 82, magic: 40, resistance: 68, speed: 114 },
        scalingMultiplier: 3.4
    },
    "arcane human": {
        base: { hp: 220, mp: 300, stamina: 210, vitalStamina: 210, offense: 85, defense: 95, magic: 170, resistance: 150, speed: 105 },
        growth: { hp: 14, mp: 19, stamina: 13, vitalStamina: 13, offense: 9, defense: 9, magic: 14, resistance: 12, speed: 10 },
        scalingMultiplier: 1.45
    },
    "runic human": {
        base: { hp: 900, mp: 1700, stamina: 820, vitalStamina: 820, offense: 620, defense: 760, magic: 1820, resistance: 1700, speed: 940 },
        growth: { hp: 24, mp: 38, stamina: 22, vitalStamina: 22, offense: 18, defense: 21, magic: 40, resistance: 36, speed: 24 },
        scalingMultiplier: 2.2
    },
    "astral human": {
        base: { hp: 2800, mp: 7600, stamina: 2500, vitalStamina: 2500, offense: 2200, defense: 2700, magic: 8200, resistance: 7700, speed: 3200 },
        growth: { hp: 56, mp: 134, stamina: 50, vitalStamina: 50, offense: 44, defense: 56, magic: 146, resistance: 138, speed: 66 },
        scalingMultiplier: 3.35
    },
    "holy human": {
        base: { hp: 230, mp: 210, stamina: 220, vitalStamina: 220, offense: 90, defense: 130, magic: 115, resistance: 150, speed: 90 },
        growth: { hp: 16, mp: 15, stamina: 15, vitalStamina: 15, offense: 10, defense: 13, magic: 12, resistance: 14, speed: 9 },
        scalingMultiplier: 1.45
    },
    "sacred human": {
        base: { hp: 1200, mp: 1200, stamina: 1120, vitalStamina: 1120, offense: 820, defense: 1300, magic: 1120, resistance: 1450, speed: 900 },
        growth: { hp: 33, mp: 33, stamina: 31, vitalStamina: 31, offense: 24, defense: 36, magic: 31, resistance: 38, speed: 25 },
        scalingMultiplier: 2.15
    },
    "divine human": {
        base: { hp: 4600, mp: 6400, stamina: 4200, vitalStamina: 4200, offense: 4200, defense: 5600, magic: 7000, resistance: 7400, speed: 4400 },
        growth: { hp: 82, mp: 118, stamina: 74, vitalStamina: 74, offense: 78, defense: 96, magic: 126, resistance: 132, speed: 80 },
        scalingMultiplier: 3.3
    },

    "young elf": {
        base: { hp: 34, mp: 42, stamina: 32, vitalStamina: 32, offense: 12, defense: 10, magic: 20, resistance: 18, speed: 19 },
        growth: { hp: 5, mp: 6, stamina: 5, vitalStamina: 5, offense: 3, defense: 3, magic: 5, resistance: 4, speed: 5 },
        scalingMultiplier: 1
    },
    "adult elf": {
        base: { hp: 62, mp: 82, stamina: 58, vitalStamina: 58, offense: 24, defense: 20, magic: 44, resistance: 40, speed: 38 },
        growth: { hp: 7, mp: 9, stamina: 7, vitalStamina: 7, offense: 4, defense: 4, magic: 7, resistance: 6, speed: 6 },
        scalingMultiplier: 1.1
    },
    "high elf": {
        base: { hp: 180, mp: 260, stamina: 170, vitalStamina: 170, offense: 82, defense: 72, magic: 170, resistance: 150, speed: 130 },
        growth: { hp: 13, mp: 17, stamina: 12, vitalStamina: 12, offense: 8, defense: 7, magic: 13, resistance: 11, speed: 10 },
        scalingMultiplier: 1.35
    },
    "moon elf": {
        base: { hp: 220, mp: 300, stamina: 205, vitalStamina: 205, offense: 95, defense: 88, magic: 200, resistance: 190, speed: 180 },
        growth: { hp: 14, mp: 19, stamina: 13, vitalStamina: 13, offense: 9, defense: 8, magic: 15, resistance: 14, speed: 14 },
        scalingMultiplier: 1.45
    },
    "silver moon elf": {
        base: { hp: 920, mp: 1700, stamina: 840, vitalStamina: 840, offense: 600, defense: 720, magic: 1800, resistance: 1760, speed: 1520 },
        growth: { hp: 24, mp: 40, stamina: 22, vitalStamina: 22, offense: 18, defense: 20, magic: 41, resistance: 39, speed: 34 },
        scalingMultiplier: 2.2
    },
    "lunar arch elf": {
        base: { hp: 2600, mp: 7600, stamina: 2400, vitalStamina: 2400, offense: 1900, defense: 2500, magic: 8600, resistance: 8400, speed: 5200 },
        growth: { hp: 52, mp: 138, stamina: 48, vitalStamina: 48, offense: 40, defense: 50, magic: 154, resistance: 150, speed: 108 },
        scalingMultiplier: 3.4
    },
    "sun elf": {
        base: { hp: 210, mp: 310, stamina: 190, vitalStamina: 190, offense: 105, defense: 80, magic: 220, resistance: 170, speed: 150 },
        growth: { hp: 13, mp: 19, stamina: 12, vitalStamina: 12, offense: 10, defense: 8, magic: 16, resistance: 13, speed: 12 },
        scalingMultiplier: 1.45
    },
    "radiant sun elf": {
        base: { hp: 860, mp: 1760, stamina: 780, vitalStamina: 780, offense: 680, defense: 620, magic: 1920, resistance: 1600, speed: 1340 },
        growth: { hp: 22, mp: 40, stamina: 20, vitalStamina: 20, offense: 20, defense: 18, magic: 43, resistance: 36, speed: 30 },
        scalingMultiplier: 2.2
    },
    "solar arch elf": {
        base: { hp: 2500, mp: 7900, stamina: 2300, vitalStamina: 2300, offense: 2800, defense: 2100, magic: 9000, resistance: 8000, speed: 4700 },
        growth: { hp: 50, mp: 142, stamina: 46, vitalStamina: 46, offense: 58, defense: 44, magic: 158, resistance: 144, speed: 98 },
        scalingMultiplier: 3.4
    },
    "spirit elf": {
        base: { hp: 165, mp: 270, stamina: 155, vitalStamina: 155, offense: 62, defense: 74, magic: 198, resistance: 184, speed: 122 },
        growth: { hp: 14, mp: 24, stamina: 13, vitalStamina: 13, offense: 10, defense: 10, magic: 22, resistance: 20, speed: 13 },
        scalingMultiplier: 1.45
    },
    "spiritbound elf": {
        base: { hp: 700, mp: 1580, stamina: 650, vitalStamina: 650, offense: 480, defense: 640, magic: 1760, resistance: 1710, speed: 1050 },
        growth: { hp: 24, mp: 50, stamina: 22, vitalStamina: 22, offense: 19, defense: 24, magic: 55, resistance: 52, speed: 34 },
        scalingMultiplier: 2.2
    },
    "astral arch elf": {
        base: { hp: 2050, mp: 7600, stamina: 1880, vitalStamina: 1880, offense: 1450, defense: 2550, magic: 8600, resistance: 8300, speed: 3750 },
        growth: { hp: 58, mp: 172, stamina: 52, vitalStamina: 52, offense: 46, defense: 74, magic: 192, resistance: 188, speed: 112 },
        scalingMultiplier: 3.45
    },
    "shadow elf": {
        base: { hp: 190, mp: 260, stamina: 175, vitalStamina: 175, offense: 120, defense: 78, magic: 170, resistance: 140, speed: 210 },
        growth: { hp: 12, mp: 16, stamina: 11, vitalStamina: 11, offense: 11, defense: 7, magic: 12, resistance: 10, speed: 17 },
        scalingMultiplier: 1.45
    },
    "nightshade elf": {
        base: { hp: 780, mp: 1460, stamina: 720, vitalStamina: 720, offense: 980, defense: 620, magic: 1580, resistance: 1420, speed: 1860 },
        growth: { hp: 20, mp: 34, stamina: 18, vitalStamina: 18, offense: 26, defense: 17, magic: 34, resistance: 31, speed: 40 },
        scalingMultiplier: 2.2
    },
    "void elf": {
        base: { hp: 2200, mp: 7200, stamina: 2000, vitalStamina: 2000, offense: 3200, defense: 1900, magic: 8200, resistance: 7600, speed: 6400 },
        growth: { hp: 44, mp: 130, stamina: 40, vitalStamina: 40, offense: 66, defense: 40, magic: 146, resistance: 138, speed: 128 },
        scalingMultiplier: 3.4
    },

    "lesser demon": {
        base: { hp: 62, mp: 46, stamina: 60, vitalStamina: 60, offense: 30, defense: 24, magic: 24, resistance: 22, speed: 22 },
        growth: { hp: 8, mp: 6, stamina: 8, vitalStamina: 8, offense: 6, defense: 5, magic: 5, resistance: 5, speed: 5 },
        scalingMultiplier: 1.1
    },
    "true demon": {
        base: { hp: 150, mp: 120, stamina: 145, vitalStamina: 145, offense: 88, defense: 72, magic: 80, resistance: 76, speed: 70 },
        growth: { hp: 13, mp: 11, stamina: 13, vitalStamina: 13, offense: 10, defense: 9, magic: 9, resistance: 9, speed: 9 },
        scalingMultiplier: 1.35
    },
    "greater demon": {
        base: { hp: 1100, mp: 980, stamina: 1040, vitalStamina: 1040, offense: 900, defense: 820, magic: 860, resistance: 850, speed: 800 },
        growth: { hp: 31, mp: 28, stamina: 30, vitalStamina: 30, offense: 28, defense: 25, magic: 25, resistance: 25, speed: 24 },
        scalingMultiplier: 2
    },
    "arch demon": {
        base: { hp: 900, mp: 1200, stamina: 820, vitalStamina: 820, offense: 700, defense: 650, magic: 1220, resistance: 1180, speed: 700 },
        growth: { hp: 26, mp: 36, stamina: 24, vitalStamina: 24, offense: 22, defense: 20, magic: 37, resistance: 36, speed: 22 },
        scalingMultiplier: 2.05
    },
    "demon semi divinity": {
        base: { hp: 2300, mp: 3100, stamina: 2100, vitalStamina: 2100, offense: 1900, defense: 1800, magic: 3400, resistance: 3300, speed: 1900 },
        growth: { hp: 52, mp: 74, stamina: 48, vitalStamina: 48, offense: 46, defense: 42, magic: 82, resistance: 80, speed: 44 },
        scalingMultiplier: 2.7
    },
    "demon divinity": {
        base: { hp: 9800, mp: 12200, stamina: 8800, vitalStamina: 8800, offense: 10200, defense: 9200, magic: 13600, resistance: 13100, speed: 9400 },
        growth: { hp: 132, mp: 176, stamina: 118, vitalStamina: 118, offense: 138, defense: 126, magic: 194, resistance: 186, speed: 132 },
        scalingMultiplier: 4
    },
    "oni": {
        base: { hp: 1250, mp: 600, stamina: 1200, vitalStamina: 1200, offense: 1120, defense: 980, magic: 480, resistance: 700, speed: 860 },
        growth: { hp: 35, mp: 18, stamina: 34, vitalStamina: 34, offense: 33, defense: 29, magic: 14, resistance: 20, speed: 24 },
        scalingMultiplier: 2.1
    },
    "calamity oni": {
        base: { hp: 2800, mp: 900, stamina: 2700, vitalStamina: 2700, offense: 2950, defense: 2420, magic: 700, resistance: 1600, speed: 1900 },
        growth: { hp: 58, mp: 22, stamina: 56, vitalStamina: 56, offense: 62, defense: 50, magic: 18, resistance: 34, speed: 38 },
        scalingMultiplier: 2.7
    },
    "oni tyrant": {
        base: { hp: 10200, mp: 1800, stamina: 9800, vitalStamina: 9800, offense: 12400, defense: 9200, magic: 1600, resistance: 6200, speed: 8600 },
        growth: { hp: 138, mp: 36, stamina: 132, vitalStamina: 132, offense: 186, defense: 134, magic: 30, resistance: 94, speed: 128 },
        scalingMultiplier: 3.9
    },
    "succubus": {
        base: { hp: 980, mp: 1300, stamina: 900, vitalStamina: 900, offense: 720, defense: 660, magic: 1380, resistance: 1210, speed: 1180 },
        growth: { hp: 26, mp: 34, stamina: 24, vitalStamina: 24, offense: 21, defense: 19, magic: 36, resistance: 32, speed: 30 },
        scalingMultiplier: 2.1
    },
    "night succubus": {
        base: { hp: 2200, mp: 3200, stamina: 2000, vitalStamina: 2000, offense: 1600, defense: 1500, magic: 3500, resistance: 3200, speed: 2800 },
        growth: { hp: 46, mp: 62, stamina: 42, vitalStamina: 42, offense: 34, defense: 32, magic: 70, resistance: 64, speed: 58 },
        scalingMultiplier: 2.65
    },
    "queen succubus": {
        base: { hp: 6800, mp: 10800, stamina: 6200, vitalStamina: 6200, offense: 5200, defense: 4800, magic: 12200, resistance: 11200, speed: 8600 },
        growth: { hp: 94, mp: 168, stamina: 86, vitalStamina: 86, offense: 74, defense: 68, magic: 182, resistance: 170, speed: 126 },
        scalingMultiplier: 3.75
    },
    "vampire": {
        base: { hp: 1150, mp: 1100, stamina: 1050, vitalStamina: 1050, offense: 940, defense: 860, magic: 1020, resistance: 980, speed: 920 },
        growth: { hp: 30, mp: 29, stamina: 28, vitalStamina: 28, offense: 27, defense: 24, magic: 27, resistance: 27, speed: 25 },
        scalingMultiplier: 2.1
    },
    "elder vampire": {
        base: { hp: 2500, mp: 2500, stamina: 2300, vitalStamina: 2300, offense: 2200, defense: 1950, magic: 2500, resistance: 2380, speed: 2100 },
        growth: { hp: 50, mp: 50, stamina: 46, vitalStamina: 46, offense: 46, defense: 40, magic: 50, resistance: 48, speed: 43 },
        scalingMultiplier: 2.7
    },
    "progenitor vampire": {
        base: { hp: 7600, mp: 9200, stamina: 7000, vitalStamina: 7000, offense: 7400, defense: 6600, magic: 9800, resistance: 9400, speed: 7600 },
        growth: { hp: 104, mp: 142, stamina: 94, vitalStamina: 94, offense: 102, defense: 90, magic: 150, resistance: 146, speed: 108 },
        scalingMultiplier: 3.8
    },
    "fallen demon": {
        base: { hp: 1000, mp: 1260, stamina: 920, vitalStamina: 920, offense: 760, defense: 720, magic: 1420, resistance: 1300, speed: 860 },
        growth: { hp: 27, mp: 33, stamina: 25, vitalStamina: 25, offense: 22, defense: 21, magic: 37, resistance: 35, speed: 22 },
        scalingMultiplier: 2.1
    },
    "dread fallen demon": {
        base: { hp: 2300, mp: 3400, stamina: 2100, vitalStamina: 2100, offense: 1700, defense: 1680, magic: 3800, resistance: 3500, speed: 2000 },
        growth: { hp: 47, mp: 66, stamina: 43, vitalStamina: 43, offense: 35, defense: 34, magic: 76, resistance: 70, speed: 41 },
        scalingMultiplier: 2.65
    },
    "abyssal fallen demon": {
        base: { hp: 7000, mp: 11400, stamina: 6500, vitalStamina: 6500, offense: 5600, defense: 5200, magic: 12800, resistance: 12100, speed: 6700 },
        growth: { hp: 96, mp: 172, stamina: 88, vitalStamina: 88, offense: 78, defense: 74, magic: 190, resistance: 182, speed: 92 },
        scalingMultiplier: 3.8
    },

    "god": {
        base: { hp: 50000, mp: 70000, stamina: 45000, vitalStamina: 45000, offense: 60000, defense: 55000, magic: 75000, resistance: 70000, speed: 50000 },
        growth: { hp: 275, mp: 352, stamina: 242, vitalStamina: 242, offense: 330, defense: 308, magic: 396, resistance: 374, speed: 264 },
        scalingMultiplier: 8
    }

};

module.exports = { RACES };
