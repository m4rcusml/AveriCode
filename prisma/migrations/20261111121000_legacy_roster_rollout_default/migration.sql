-- Old application instances can still insert automatic rows while deployment switches.
-- Current manual and GitHub writers always supply their source explicitly.
ALTER TABLE "RepositoryContributor" ALTER COLUMN "source" SET DEFAULT 'LEGACY';
