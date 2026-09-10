-- CreateTable
CREATE TABLE "MentionMap" (
    "id" TEXT NOT NULL,
    "discordKey" TEXT NOT NULL,
    "telegramMention" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentionMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MentionMap_discordKey_key" ON "MentionMap"("discordKey");
