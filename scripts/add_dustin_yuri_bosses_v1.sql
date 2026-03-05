BEGIN;

INSERT INTO "Monsters" (
  name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier"
)
SELECT * FROM (
  VALUES
    ('Dustin LXI', 11, 'human', 2600, 3800, 2000, 1900, 1700, 2100, 3600, 3500, 1800, NULL, 1.0),
    ('Yuri Ullen', 10, 'human', 2200, 3200, 1900, 1800, 1500, 1700, 3000, 2800, 1700, NULL, 1.0)
) AS v(name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier")
WHERE NOT EXISTS (
  SELECT 1 FROM "Monsters" m WHERE LOWER(m.name) = LOWER(v.name)
);

WITH target AS (
  SELECT id, name FROM "Monsters" WHERE name IN ('Dustin LXI','Yuri Ullen')
), pairs AS (
  SELECT t.id AS "monsterId", s.id AS "skillId", 1 AS level
  FROM target t
  JOIN "Skills" s ON (
    (t.name = 'Dustin LXI' AND s.id IN (411,24,176,73)) OR
    (t.name = 'Yuri Ullen' AND s.id IN (411,24,176,13))
  )
)
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
SELECT "monsterId", "skillId", level FROM pairs
ON CONFLICT ("monsterId", "skillId") DO UPDATE
SET "level" = EXCLUDED."level";

COMMIT;
