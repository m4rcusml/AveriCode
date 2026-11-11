CREATE TYPE "RepositoryContributorSource" AS ENUM ('GITHUB', 'MANUAL', 'LEGACY');

-- Old rows do not distinguish access imports from manual additions. Reconcile only
-- after a successful historical GitHub contributor lookup; retain all rows/history.
ALTER TABLE "RepositoryContributor"
ADD COLUMN "source" "RepositoryContributorSource" NOT NULL DEFAULT 'LEGACY';

-- New explicit configuration is manual. GitHub ingestion sets GITHUB explicitly.
ALTER TABLE "RepositoryContributor" ALTER COLUMN "source" SET DEFAULT 'MANUAL';
