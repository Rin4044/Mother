BEGIN;

INSERT INTO "Monsters" (
  name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier"
)
SELECT * FROM (
  VALUES
    ('Hugo Baint von Renxandt', 9, 'human', 1400, 1600, 1200, 1200, 980, 900, 1500, 1400, 1050, NULL, 1.0),
    ('Ronandt Orozoi', 10, 'human', 1800, 2600, 1400, 1400, 900, 950, 2400, 2200, 980, NULL, 1.0),
    ('Aurell Staddt', 8, 'human', 1200, 1800, 1100, 1100, 820, 780, 1600, 1500, 900, NULL, 1.0),
    ('Buirimus', 9, 'human', 1600, 2100, 1500, 1500, 1100, 1000, 1700, 1500, 950, NULL, 1.0),
    ('Nyudoz', 10, 'human', 2100, 1300, 2300, 2200, 2100, 1800, 1000, 1200, 1700, NULL, 1.0),
    ('Tiva Vicow', 8, 'human', 1500, 900, 1700, 1650, 1450, 1300, 800, 900, 1200, NULL, 1.0)
) AS v(name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier")
WHERE NOT EXISTS (
  SELECT 1 FROM "Monsters" m WHERE LOWER(m.name) = LOWER(v.name)
);

WITH target AS (
  SELECT id, name FROM "Monsters"
  WHERE name IN ('Hugo Baint von Renxandt','Ronandt Orozoi','Aurell Staddt','Buirimus','Nyudoz','Tiva Vicow')
), pairs AS (
  SELECT t.id AS "monsterId", s.id AS "skillId", 1 AS level
  FROM target t
  JOIN "Skills" s ON (
    (t.name = 'Hugo Baint von Renxandt' AND s.id IN (411,18,25)) OR
    (t.name = 'Ronandt Orozoi' AND s.id IN (411,18,19,172,169)) OR
    (t.name = 'Aurell Staddt' AND s.id IN (411,24,176)) OR
    (t.name = 'Buirimus' AND s.id IN (411,20,22)) OR
    (t.name = 'Nyudoz' AND s.id IN (413,17,23)) OR
    (t.name = 'Tiva Vicow' AND s.id IN (413,23,17))
  )
)
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
SELECT "monsterId", "skillId", level FROM pairs
ON CONFLICT ("monsterId", "skillId") DO UPDATE SET "level" = EXCLUDED."level";

COMMIT;
