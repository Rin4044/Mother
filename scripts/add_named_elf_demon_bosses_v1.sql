BEGIN;

INSERT INTO "Monsters" (
  name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier"
)
SELECT * FROM (
  VALUES
    ('Potimas Harrifenas', 11, 'elf', 2600, 3400, 1800, 1800, 1700, 1800, 3600, 3400, 1900, NULL, 1.0),
    ('Ariel', 12, 'demon', 5200, 4800, 5200, 5100, 4700, 4600, 4200, 4300, 3900, NULL, 1.0),

    ('Agner Ricep', 10, 'demon', 2600, 1700, 2800, 2700, 2600, 2400, 1700, 1800, 2100, NULL, 1.0),
    ('Sanatoria Pilevy', 10, 'demon', 2200, 3000, 2100, 2000, 1700, 1700, 3000, 2900, 2200, NULL, 1.0),
    ('Kogou', 10, 'demon', 3000, 1500, 3200, 3100, 2900, 2600, 1500, 1700, 1700, NULL, 1.0),
    ('Darad', 10, 'demon', 2700, 1900, 2800, 2700, 2600, 2300, 1900, 2000, 2200, NULL, 1.0),
    ('Bloe Phthalo', 10, 'demon', 2500, 1600, 2700, 2600, 2550, 2200, 1600, 1750, 2300, NULL, 1.0),
    ('Merazophis', 10, 'demon', 2900, 2600, 2500, 2450, 2300, 2200, 2600, 2500, 2200, NULL, 1.0)
) AS v(name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier")
WHERE NOT EXISTS (
  SELECT 1 FROM "Monsters" m WHERE LOWER(m.name) = LOWER(v.name)
);

WITH target AS (
  SELECT id, name FROM "Monsters"
  WHERE name IN ('Potimas Harrifenas','Ariel','Agner Ricep','Sanatoria Pilevy','Kogou','Darad','Bloe Phthalo','Merazophis')
), pairs AS (
  SELECT t.id AS "monsterId", s.id AS "skillId", 1 AS level
  FROM target t
  JOIN "Skills" s ON (
    (t.name = 'Potimas Harrifenas' AND s.id IN (411,19,172,24)) OR
    (t.name = 'Ariel' AND s.id IN (411,25,32,408,73)) OR

    (t.name = 'Agner Ricep' AND s.id IN (413,17,23)) OR
    (t.name = 'Sanatoria Pilevy' AND s.id IN (411,25,32)) OR
    (t.name = 'Kogou' AND s.id IN (413,17,18)) OR
    (t.name = 'Darad' AND s.id IN (413,17,19)) OR
    (t.name = 'Bloe Phthalo' AND s.id IN (413,18,17)) OR
    (t.name = 'Merazophis' AND s.id IN (411,25,24))
  )
)
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
SELECT "monsterId", "skillId", level FROM pairs
ON CONFLICT ("monsterId", "skillId") DO UPDATE
SET "level" = EXCLUDED."level";

COMMIT;
