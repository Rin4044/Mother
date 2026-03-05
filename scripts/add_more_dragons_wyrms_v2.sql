BEGIN;

-- Additional dragon/wyrm roster from wiki list.
INSERT INTO "Monsters" (
  name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier"
)
SELECT * FROM (
  VALUES
    ('Suiten', 5, 'wyrm', 450, 220, 390, 380, 220, 260, 240, 230, 180, NULL, 1.0),
    ('Fenesist', 4, 'wyrm', 260, 140, 240, 250, 190, 200, 150, 160, 170, NULL, 1.0),
    ('Fenegrad', 5, 'wyrm', 1107, 565, 1282, 1244, 880, 760, 520, 500, 640, NULL, 1.0),

    ('Fire Dragon Rend', 10, 'dragon', 3701, 3122, 3698, 3665, 3281, 3009, 2601, 2645, 3175, NULL, 1.0),
    ('Earth Dragon Kagna', 9, 'dragon', 4198, 3654, 2798, 3112, 3989, 4333, 1837, 4005, 1225, NULL, 1.0),
    ('Earth Dragon Gehre', 9, 'dragon', 3556, 2991, 4067, 3562, 3433, 3874, 1343, 3396, 4122, NULL, 1.0),
    ('Earth Dragon Fuit', 8, 'dragon', 2965, 2912, 2943, 2944, 2938, 2941, 2899, 2907, 3000, NULL, 1.0),
    ('Earth Dragon Ekisa', 8, 'dragon', 2808, 1312, 3655, 3645, 2498, 2455, 1298, 2452, 3600, NULL, 1.0),
    ('Earth Dragon Gakia', 9, 'dragon', 3300, 2700, 3500, 3450, 3200, 3300, 2000, 3100, 3400, NULL, 1.0),

    ('Ice Dragon Nia', 10, 'dragon', 18761, 19755, 11046, 10944, 11036, 20461, 19892, 20137, 10958, NULL, 1.0),
    ('Wind Dragon Hyuvan', 10, 'dragon', 12545, 15494, 32588, 31102, 15176, 12490, 15055, 12027, 32776, NULL, 1.0),
    ('Dark Dragon Reise', 10, 'dragon', 11411, 11408, 11399, 11398, 11394, 11386, 11401, 11397, 11242, NULL, 1.0),
    ('Light Dragon Byaku', 10, 'dragon', 9800, 10200, 9600, 9500, 9200, 9100, 10500, 10300, 9400, NULL, 1.0)
) AS v(name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier")
WHERE NOT EXISTS (
  SELECT 1 FROM "Monsters" m WHERE LOWER(m.name) = LOWER(v.name)
);

-- Combat skills (AI only uses Physical/Magic effectively).
WITH target AS (
  SELECT id, name FROM "Monsters"
  WHERE name IN (
    'Suiten','Fenesist','Fenegrad',
    'Fire Dragon Rend','Earth Dragon Kagna','Earth Dragon Gehre','Earth Dragon Fuit','Earth Dragon Ekisa','Earth Dragon Gakia',
    'Ice Dragon Nia','Wind Dragon Hyuvan','Dark Dragon Reise','Light Dragon Byaku'
  )
), pairs AS (
  SELECT t.id AS "monsterId", s.id AS "skillId", 1 AS level
  FROM target t
  JOIN "Skills" s ON (
    (t.name = 'Suiten' AND s.id IN (20,163,408)) OR
    (t.name = 'Fenesist' AND s.id IN (23,172)) OR
    (t.name = 'Fenegrad' AND s.id IN (23,172,413)) OR

    (t.name = 'Fire Dragon Rend' AND s.id IN (18,157,411)) OR
    (t.name IN ('Earth Dragon Kagna','Earth Dragon Gehre','Earth Dragon Fuit','Earth Dragon Ekisa','Earth Dragon Gakia') AND s.id IN (23,172,411)) OR

    (t.name = 'Ice Dragon Nia' AND s.id IN (21,166,411)) OR
    (t.name = 'Wind Dragon Hyuvan' AND s.id IN (22,169,411)) OR
    (t.name = 'Dark Dragon Reise' AND s.id IN (25,32,411)) OR
    (t.name = 'Light Dragon Byaku' AND s.id IN (24,176,411))
  )
)
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
SELECT "monsterId", "skillId", level FROM pairs
ON CONFLICT ("monsterId", "skillId") DO UPDATE
SET "level" = EXCLUDED."level";

COMMIT;
