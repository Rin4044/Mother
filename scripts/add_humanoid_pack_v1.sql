BEGIN;

INSERT INTO "Monsters" (
  name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier"
)
SELECT * FROM (
  VALUES
    ('Human Adventurer', 4, 'human', 260, 180, 240, 230, 210, 190, 170, 165, 185, NULL, 1.0),
    ('Human Knight', 5, 'human', 340, 140, 320, 300, 280, 290, 120, 170, 150, NULL, 1.0),

    ('Elf Scout', 5, 'elf', 280, 220, 260, 245, 230, 200, 210, 195, 260, NULL, 1.0),
    ('Elf Mage', 6, 'elf', 260, 420, 220, 210, 180, 170, 360, 330, 240, NULL, 1.0),

    ('Demon Soldier', 6, 'demon', 520, 260, 480, 460, 430, 380, 250, 240, 320, NULL, 1.0),
    ('Demon Mage', 7, 'demon', 420, 620, 320, 300, 260, 240, 560, 520, 300, NULL, 1.0),
    ('Oni', 8, 'demon', 780, 520, 760, 740, 690, 620, 480, 450, 560, NULL, 1.0)
) AS v(name, level, "monsterType", hp, mp, stamina, "vitalStamina", offense, defense, magic, resistance, speed, image, "scalingMultiplier")
WHERE NOT EXISTS (
  SELECT 1 FROM "Monsters" m WHERE LOWER(m.name) = LOWER(v.name)
);

WITH target AS (
  SELECT id, name
  FROM "Monsters"
  WHERE name IN ('Human Adventurer','Human Knight','Elf Scout','Elf Mage','Demon Soldier','Demon Mage','Oni')
), pairs AS (
  SELECT t.id AS "monsterId", s.id AS "skillId", 1 AS level
  FROM target t
  JOIN "Skills" s ON (
    (t.name = 'Human Adventurer' AND s.id IN (413, 17)) OR
    (t.name = 'Human Knight' AND s.id IN (413, 23)) OR

    (t.name = 'Elf Scout' AND s.id IN (413, 22)) OR
    (t.name = 'Elf Mage' AND s.id IN (411, 176, 24)) OR

    (t.name = 'Demon Soldier' AND s.id IN (413, 25)) OR
    (t.name = 'Demon Mage' AND s.id IN (411, 32, 25)) OR
    (t.name = 'Oni' AND s.id IN (17, 18, 19, 413))
  )
)
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
SELECT "monsterId", "skillId", level FROM pairs
ON CONFLICT ("monsterId", "skillId") DO UPDATE
SET "level" = EXCLUDED."level";

COMMIT;
