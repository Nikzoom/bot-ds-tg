CREATE TABLE "VoicePairWindow" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "firstUserId" TEXT NOT NULL,
    "secondUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "penalizedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "VoicePairWindow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VoicePairWindow_guildId_active_idx" ON "VoicePairWindow"("guildId", "active");

CREATE TABLE "RoleSuspension" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoleSuspension_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoleSuspension_guildId_userId_roleId_key" ON "RoleSuspension"("guildId", "userId", "roleId");
CREATE INDEX "RoleSuspension_expiresAt_idx" ON "RoleSuspension"("expiresAt");
