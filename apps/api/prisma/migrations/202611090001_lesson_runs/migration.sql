ALTER TABLE "Playthrough" ADD COLUMN "runNumber" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "Playthrough_userId_contentVersionId_key";
CREATE UNIQUE INDEX "Playthrough_userId_contentVersionId_runNumber_key" ON "Playthrough"("userId","contentVersionId","runNumber");
ALTER TABLE "SkillState" ADD COLUMN "reviewDueAt" TIMESTAMP(3), ADD COLUMN "reviewStage" INTEGER NOT NULL DEFAULT 0;
