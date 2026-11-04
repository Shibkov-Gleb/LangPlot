-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "demoKey" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Исследователь',
    "nativeLanguage" TEXT NOT NULL DEFAULT 'ru',
    "sound" BOOLEAN NOT NULL DEFAULT true,
    "subtitles" BOOLEAN NOT NULL DEFAULT true,
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'en',
    "level" TEXT NOT NULL DEFAULT 'A1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playthrough" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playthrough_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayEvent" (
    "id" TEXT NOT NULL,
    "playthroughId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatExchange" (
    "id" TEXT NOT NULL,
    "playthroughId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "reply" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatExchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "observations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "successes" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "stage" TEXT NOT NULL DEFAULT 'brief',
    "output" JSONB,
    "report" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_demoKey_key" ON "User"("demoKey");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentVersion_packageId_version_key" ON "ContentVersion"("packageId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Playthrough_userId_contentVersionId_key" ON "Playthrough"("userId", "contentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayEvent_playthroughId_requestId_key" ON "PlayEvent"("playthroughId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatExchange_playthroughId_requestId_key" ON "ChatExchange"("playthroughId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningAttempt_sourceId_key" ON "LearningAttempt"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillState_userId_language_skillId_key" ON "SkillState"("userId", "language", "skillId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playthrough" ADD CONSTRAINT "Playthrough_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playthrough" ADD CONSTRAINT "Playthrough_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayEvent" ADD CONSTRAINT "PlayEvent_playthroughId_fkey" FOREIGN KEY ("playthroughId") REFERENCES "Playthrough"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatExchange" ADD CONSTRAINT "ChatExchange_playthroughId_fkey" FOREIGN KEY ("playthroughId") REFERENCES "Playthrough"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningAttempt" ADD CONSTRAINT "LearningAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillState" ADD CONSTRAINT "SkillState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioJob" ADD CONSTRAINT "StudioJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
