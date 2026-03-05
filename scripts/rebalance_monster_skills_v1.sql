BEGIN;

-- Rebalance pass: reduce extreme self-drain while preserving monster identity.

-- 39 Elroe Gastruch: Rot Attack (85) drains too hard for its stamina/vital at level 1.
DELETE FROM "MonsterSkills" WHERE "monsterId" = 39 AND "skillId" = 85;
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
VALUES (39, 413, 1)
ON CONFLICT ("monsterId", "skillId") DO UPDATE SET "level" = EXCLUDED."level";

-- 33 Queen Finjicote: keep Deadly Poison Attack, add cheaper Poison Sting for rotation.
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
VALUES (33, 5, 1)
ON CONFLICT ("monsterId", "skillId") DO UPDATE SET "level" = EXCLUDED."level";

-- 42 Elroe Daznatch: keep Poison Attack, add cheaper Poison Fang for rotation.
INSERT INTO "MonsterSkills" ("monsterId", "skillId", "level")
VALUES (42, 1, 1)
ON CONFLICT ("monsterId", "skillId") DO UPDATE SET "level" = EXCLUDED."level";

COMMIT;
