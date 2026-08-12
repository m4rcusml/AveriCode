-- Make repository monitoring automatic and add a configurable workspace schedule.
CREATE TYPE "SyncSchedule" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

ALTER TABLE "Workspace"
ADD COLUMN "syncSchedule" "SyncSchedule" NOT NULL DEFAULT 'WEEKLY',
ADD COLUMN "lastScheduledSyncAt" TIMESTAMP(3);

UPDATE "Repository" SET "isActive" = true WHERE "isActive" = false;
ALTER TABLE "Repository" ALTER COLUMN "isActive" SET DEFAULT true;

WITH duplicate_running_syncs AS (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "repositoryId" ORDER BY "startedAt" DESC) AS row_number
  FROM "SyncRun"
  WHERE "status" = 'RUNNING' AND "repositoryId" IS NOT NULL
)
UPDATE "SyncRun"
SET "status" = 'FAILED',
    "finishedAt" = CURRENT_TIMESTAMP,
    "error" = 'Superseded while enforcing one running sync per repository.'
WHERE "id" IN (
  SELECT "id" FROM duplicate_running_syncs WHERE row_number > 1
);

-- Enforce the application rule that only one sync may run per repository.
CREATE UNIQUE INDEX "SyncRun_one_running_per_repository"
ON "SyncRun" ("repositoryId")
WHERE "status" = 'RUNNING' AND "repositoryId" IS NOT NULL;
