ALTER TABLE "GitHubInstallation" ADD COLUMN "suspendedAt" TIMESTAMP(3);

CREATE TABLE "RepositoryUpdate" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authorUsername" TEXT,
    "authorAvatarUrl" TEXT,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "branch" TEXT NOT NULL,
    CONSTRAINT "RepositoryUpdate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RepositoryUpdate_repositoryId_sha_key" ON "RepositoryUpdate"("repositoryId", "sha");
CREATE INDEX "RepositoryUpdate_repositoryId_committedAt_idx" ON "RepositoryUpdate"("repositoryId", "committedAt");
ALTER TABLE "RepositoryUpdate" ADD CONSTRAINT "RepositoryUpdate_repositoryId_fkey"
    FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
