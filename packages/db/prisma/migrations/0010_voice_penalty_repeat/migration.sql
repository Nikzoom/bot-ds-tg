ALTER TABLE "VoicePenaltyConfig"
ADD COLUMN "repeatExtraMinutes" INTEGER NOT NULL DEFAULT 20;

ALTER TABLE "VoicePairWindow"
ADD COLUMN "repeatCount" INTEGER NOT NULL DEFAULT 0;

-- Preserve the elapsed time of pairs already being tracked when the ID stops
-- including the channel. Inactive history keeps its original IDs.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "guildId", "firstUserId", "secondUserId"
    ORDER BY "startedAt" DESC, "id"
  ) AS position
  FROM "VoicePairWindow"
  WHERE "active" = true
)
UPDATE "VoicePairWindow" AS vp
SET "active" = false
FROM ranked
WHERE vp."id" = ranked."id" AND ranked.position > 1;

UPDATE "VoicePairWindow"
SET "id" = "guildId" || ':' || "firstUserId" || ':' || "secondUserId",
    "repeatCount" = CASE WHEN "penalizedAt" IS NULL THEN 0 ELSE 1 END,
    "startedAt" = COALESCE("penalizedAt", "startedAt")
WHERE "active" = true;
