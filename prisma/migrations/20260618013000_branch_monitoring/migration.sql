-- Add branch monitoring configuration.
CREATE TABLE "RepositoryBranch" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepositoryBranch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RepositoryBranch_repositoryId_idx" ON "RepositoryBranch"("repositoryId");
CREATE UNIQUE INDEX "RepositoryBranch_repositoryId_name_key" ON "RepositoryBranch"("repositoryId", "name");

ALTER TABLE "RepositoryBranch" ADD CONSTRAINT "RepositoryBranch_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Store the branch where the last activity commit was observed.
ALTER TABLE "CommitActivitySnapshot" ADD COLUMN "lastCommitBranch" TEXT;
