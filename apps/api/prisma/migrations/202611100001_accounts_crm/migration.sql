CREATE TYPE "AccountRole" AS ENUM ('USER', 'SUBSCRIBER', 'ADMIN', 'SUPERADMIN');
CREATE TYPE "ContactStage" AS ENUM ('NEW', 'CONTACTED', 'FOLLOW_UP', 'RESOLVED');
ALTER TABLE "User" ADD COLUMN "email" TEXT, ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "role" "AccountRole" NOT NULL DEFAULT 'USER', ADD COLUMN "subscribedAt" TIMESTAMP(3),
  ADD COLUMN "lastLoginAt" TIMESTAMP(3), ADD COLUMN "contactStage" "ContactStage" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "followUpAt" DATE;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "single_superadmin" ON "User"("role") WHERE "role"='SUPERADMIN';
CREATE INDEX "User_role_createdAt_idx" ON "User"("role","createdAt");
CREATE INDEX "User_followUpAt_idx" ON "User"("followUpAt");
CREATE TABLE "OwnerInvite" ("id" TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "CrmEvent" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "authorId" TEXT NOT NULL REFERENCES "User"("id") ON UPDATE CASCADE, "text" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "CrmEvent_userId_createdAt_idx" ON "CrmEvent"("userId","createdAt");
DELETE FROM "Session" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "demoKey" IS NOT NULL);
