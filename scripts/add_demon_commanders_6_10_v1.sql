BEGIN;

INSERT INTO "Monsters" (
  name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier"
)
SELECT * FROM (
  VALUES
    ('Huey', 10, 'demon', 2400, 1800, 2500, 2400, 2300, 2100, 1700, 1750, 2100, NULL, 1.0),
    ('Wrath', 11, 'demon', 3600, 2200, 3600, 3500, 3400, 2900, 2200, 2300, 3000, NULL, 1.0),
    ('Kuro', 12, 'demon', 5200, 5200, 5000, 5000, 4800, 4700, 5000, 4900, 4600, NULL, 1.0),
    ('Shiro', 12, 'demon', 4800, 5600, 4300, 4200, 3900, 3800, 5600, 5400, 4800, NULL, 1.0)
) AS v(name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier")
WHERE NOT EXISTS (
  SELECT 1 FROM "Monsters" m WHERE LOWER(m.name) = LOWER(v.name)
);

WITH target AS (
  SELECT id, name FROM "Monsters" WHERE name IN ('Huey','Wrath','Kuro','Shiro')
), pairs AS (
  SELECT t.id AS "monsterId", s.id AS "skillId", 1 AS level
  FROM target t
  JOIN "Skills" s ON (
    (t.name = 'Huey' AND s.id IN (413,17,19)) OR
    (t.name = 'Wrath' AND s.id IN (413,17,18,19,73)) OR
    (t.name = 'Kuro' AND s.id IN (411,25,32,73,17)) OR
    (t.name = 'Shiro' AND s.id IN (411,25,18,19,73,408))
  )
)
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
SELECT "monsterId", "skillId", level FROM pairs
ON CONFLICT ("monsterId", "skillId") DO UPDATE
SET "level" = EXCLUDED."level";

COMMIT;
