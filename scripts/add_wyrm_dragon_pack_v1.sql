BEGIN;

-- Reclassify existing fire wyrm line.
UPDATE "Monsters"
SET "monsterType" = 'wyrm'
WHERE name IN ('Elroe Gunerush', 'Elroe Guneseven', 'Elroe Gunerave', 'Elroe Gunesohka');

-- Add new wyrm/dragon entries from wiki-inspired roster if missing.
INSERT INTO "Monsters" (
  name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier"
)
SELECT * FROM (
  VALUES
    ('Fenerush', 3, 'wyrm', 120, 86, 132, 132, 89, 88, 63, 65, 94, NULL, 1.0),
    ('Peirens', 7, 'wyrm', 972, 810, 899, 871, 918, 888, 867, 567, 901, NULL, 1.0),
    ('Earth Dragon Araba', 9, 'dragon', 3067, 2902, 2943, 2945, 2956, 2955, 2877, 2901, 2954, NULL, 1.0)
) AS v(name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier")
WHERE NOT EXISTS (
  SELECT 1 FROM "Monsters" m WHERE LOWER(m.name) = LOWER(v.name)
);

-- Assign combat skills (Physical/Magic only so AI can use them).
WITH target AS (
  SELECT id, name FROM "Monsters" WHERE name IN ('Fenerush', 'Peirens', 'Earth Dragon Araba')
), pairs AS (
  SELECT t.id AS "monsterId", s.id AS "skillId", 1 AS level
  FROM target t
  JOIN "Skills" s ON (
    (t.name = 'Fenerush' AND s.id IN (23, 413)) OR
    (t.name = 'Peirens' AND s.id IN (22, 169)) OR
    (t.name = 'Earth Dragon Araba' AND s.id IN (17, 23, 172, 411))
  )
)
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
SELECT "monsterId", "skillId", level FROM pairs
ON CONFLICT ("monsterId", "skillId") DO UPDATE SET "level" = EXCLUDED."level";

COMMIT;
