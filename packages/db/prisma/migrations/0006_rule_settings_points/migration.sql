-- AlterTable
ALTER TABLE "Rule" ADD COLUMN "cooldownSeconds" INTEGER;
ALTER TABLE "Rule" ADD COLUMN "fireOnce" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Rule" ADD COLUMN "lastFiredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PointLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointLog_userId_createdAt_idx" ON "PointLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PointLog" ADD CONSTRAINT "PointLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
