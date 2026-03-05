BEGIN;

-- Replace temporary Hit skill (id=80) for selected monsters with wiki-based mapping.
WITH desired ("monsterId", "skillId", "level") AS (
    VALUES
        (20, 413, 1),
        (21, 17, 1),
        (21, 18, 1),
        (22, 413, 1),
        (23, 412, 1),
        (24, 1, 1),
        (24, 6, 1),
        (25, 189, 1),
        (25, 14, 1),
        (25, 172, 1),
        (26, 413, 1),
        (27, 413, 1),
        (28, 5, 1),
        (29, 5, 1),
        (30, 408, 1),
        (30, 411, 1),
        (31, 5, 1),
        (32, 1, 1),
        (33, 408, 1),
        (34, 1, 1),
        (35, 413, 1),
        (36, 413, 1),
        (37, 14, 1),
        (39, 85, 1),
        (40, 1, 1),
        (41, 1, 1),
        (42, 81, 1)
)
DELETE FROM "MonsterSkills" ms
WHERE ms."skillId" = 80
  AND ms."monsterId" IN (SELECT DISTINCT "monsterId" FROM desired);

WITH desired ("monsterId", "skillId", "level") AS (
    VALUES
        (20, 413, 1),
        (21, 17, 1),
        (21, 18, 1),
        (22, 413, 1),
        (23, 412, 1),
        (24, 1, 1),
        (24, 6, 1),
        (25, 189, 1),
        (25, 14, 1),
        (25, 172, 1),
        (26, 413, 1),
        (27, 413, 1),
        (28, 5, 1),
        (29, 5, 1),
        (30, 408, 1),
        (30, 411, 1),
        (31, 5, 1),
        (32, 1, 1),
        (33, 408, 1),
        (34, 1, 1),
        (35, 413, 1),
        (36, 413, 1),
        (37, 14, 1),
        (39, 85, 1),
        (40, 1, 1),
        (41, 1, 1),
        (42, 81, 1)
)
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
SELECT d."monsterId", d."skillId", d."level"
FROM desired d
JOIN "Monsters" m ON m.id = d."monsterId"
JOIN "Skills" s ON s.id = d."skillId"
ON CONFLICT ("monsterId", "skillId") DO UPDATE
SET "level" = EXCLUDED."level";

COMMIT;
