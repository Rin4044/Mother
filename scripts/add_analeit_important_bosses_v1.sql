BEGIN;

INSERT INTO "Monsters" (
  name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier"
)
SELECT * FROM (
  VALUES
    ('Meiges', 10, 'human', 2800, 2400, 2600, 2500, 2300, 2400, 2200, 2300, 1700, NULL, 1.0),
    ('Cylis Analeit', 10, 'human', 2600, 2600, 2400, 2350, 2200, 2100, 2500, 2400, 1750, NULL, 1.0),
    ('Julius Zagan Analeit', 11, 'human', 3300, 3000, 3200, 3100, 3000, 2800, 2900, 2800, 2300, NULL, 1.0),
    ('Schlain Zagan Analeit', 11, 'human', 3200, 3400, 3000, 2900, 2600, 2500, 3300, 3200, 2400, NULL, 1.0),
    ('Hyrince', 10, 'human', 3000, 2200, 3300, 3200, 2900, 3000, 2100, 2200, 2200, NULL, 1.0),
    ('Feirune', 10, 'wyrm', 3600, 3200, 3500, 3400, 3200, 3000, 3000, 2900, 2600, NULL, 1.0)
) AS v(name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier")
WHERE NOT EXISTS (
  SELECT 1 FROM "Monsters" m WHERE LOWER(m.name) = LOWER(v.name)
);

WITH target AS (
  SELECT id, name FROM "Monsters" WHERE name IN ('Meiges','Cylis Analeit','Julius Zagan Analeit','Schlain Zagan Analeit','Hyrince','Feirune')
), pairs AS (
  SELECT t.id AS "monsterId", s.id AS "skillId", 1 AS level
  FROM target t
  JOIN "Skills" s ON (
    (t.name = 'Meiges' AND s.id IN (411,24,176)) OR
    (t.name = 'Cylis Analeit' AND s.id IN (411,24,176,19)) OR
    (t.name = 'Julius Zagan Analeit' AND s.id IN (413,24,176,17)) OR
    (t.name = 'Schlain Zagan Analeit' AND s.id IN (411,24,176,17)) OR
    (t.name = 'Hyrince' AND s.id IN (413,23,17)) OR
    (t.name = 'Feirune' AND s.id IN (24,176,411,22,169))
  )
)
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
SELECT "monsterId", "skillId", level FROM pairs
ON CONFLICT ("monsterId", "skillId") DO UPDATE
SET "level" = EXCLUDED."level";

COMMIT;
