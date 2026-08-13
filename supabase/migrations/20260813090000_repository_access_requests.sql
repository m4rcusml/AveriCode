CREATE TYPE "RepositoryAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED');
CREATE TYPE "RepositoryAccessRequestItemStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "RepositoryAccessRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" "GitHubAccountType" NOT NULL,
    "repositorySelection" "RepositorySelection" NOT NULL,
    "status" "RepositoryAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RepositoryAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RepositoryAccessRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "githubRepoId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL DEFAULT false,
    "defaultBranch" TEXT,
    "status" "RepositoryAccessRequestItemStatus" NOT NULL DEFAULT 'PENDING',
    "repositoryId" TEXT,
    "pendingKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RepositoryAccessRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RepositoryAccessRequest_workspaceId_status_createdAt_idx" ON "RepositoryAccessRequest"("workspaceId", "status", "createdAt");
CREATE INDEX "RepositoryAccessRequest_requesterId_createdAt_idx" ON "RepositoryAccessRequest"("requesterId", "createdAt");
CREATE UNIQUE INDEX "RepositoryAccessRequestItem_pendingKey_key" ON "RepositoryAccessRequestItem"("pendingKey");
CREATE UNIQUE INDEX "RepositoryAccessRequestItem_requestId_githubRepoId_key" ON "RepositoryAccessRequestItem"("requestId", "githubRepoId");
CREATE INDEX "RepositoryAccessRequestItem_requestId_status_idx" ON "RepositoryAccessRequestItem"("requestId", "status");
CREATE INDEX "RepositoryAccessRequestItem_githubRepoId_idx" ON "RepositoryAccessRequestItem"("githubRepoId");

ALTER TABLE "RepositoryAccessRequest" ADD CONSTRAINT "RepositoryAccessRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepositoryAccessRequest" ADD CONSTRAINT "RepositoryAccessRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepositoryAccessRequest" ADD CONSTRAINT "RepositoryAccessRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RepositoryAccessRequestItem" ADD CONSTRAINT "RepositoryAccessRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RepositoryAccessRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepositoryAccessRequestItem" ADD CONSTRAINT "RepositoryAccessRequestItem_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE SET NULL ON UPDATE CASCADE;
