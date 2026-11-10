CREATE TABLE "ReportSetup" ("id" TEXT PRIMARY KEY, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO "ReportSetup" ("id") VALUES ('visits');
CREATE TABLE "ProductVisit" ("id" TEXT PRIMARY KEY,"variant" TEXT NOT NULL,"source" TEXT NOT NULL,"firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"excluded" BOOLEAN NOT NULL DEFAULT false,"userId" TEXT UNIQUE REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "ProductVisit_firstAt_variant_source_idx" ON "ProductVisit"("firstAt","variant","source");
CREATE TABLE "GuestActivity" ("visitId" TEXT REFERENCES "ProductVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE,"day" TEXT NOT NULL,"firstAt" TIMESTAMP(3) NOT NULL,PRIMARY KEY("visitId","day"));
CREATE TABLE "FirstPayment" ("userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,"confirmationId" TEXT UNIQUE NOT NULL,"paidAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "ContactExport" ("id" TEXT PRIMARY KEY,"authorId" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"rows" INTEGER NOT NULL);
ALTER TABLE "User" ADD COLUMN "excludedFromAnalytics" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlayEvent" ADD COLUMN "fromScene" TEXT, ADD COLUMN "toScene" TEXT, ADD COLUMN "correct" BOOLEAN, ADD COLUMN "terminal" BOOLEAN NOT NULL DEFAULT false;
WITH history AS (
 SELECT e.id,e."input"->>'choiceId' AS choice,e.result#>>'{play,state,sceneId}' AS target,
 coalesce(lag(e.result#>>'{play,state,sceneId}') OVER(PARTITION BY p.id ORDER BY (e.result#>>'{play,revision}')::integer),v.data->>'entrySceneId') AS origin,v.data
 FROM "PlayEvent" e JOIN "Playthrough" p ON p.id=e."playthroughId" JOIN "ContentVersion" v ON v.id=p."contentVersionId" WHERE v.status<>'technical'
)
UPDATE "PlayEvent" e SET "fromScene"=h.origin,"toScene"=h.target,
 terminal=EXISTS(SELECT 1 FROM jsonb_array_elements(h.data->'scenes') s WHERE s->>'id'=h.target AND s->>'terminal'='true'),
 correct=(SELECT (s#>>'{exercise,correct}')=h.choice FROM jsonb_array_elements(h.data->'scenes') s WHERE s->>'id'=h.origin)
FROM history h WHERE e.id=h.id;
