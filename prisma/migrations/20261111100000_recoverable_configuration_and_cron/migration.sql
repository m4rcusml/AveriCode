ALTER TABLE "Repository" ADD COLUMN "configurationError" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "scheduledSyncStartedAt" TIMESTAMP(3);
ALTER TABLE "Workspace" ADD COLUMN "scheduledSyncLeaseAt" TIMESTAMP(3);
