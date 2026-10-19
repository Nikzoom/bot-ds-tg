CREATE TABLE "VoicePenaltyConfig" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "firstRoleId" TEXT,
    "secondRoleId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VoicePenaltyConfig_pkey" PRIMARY KEY ("guildId")
);
