-- Tutorial mode became a per-user client-local preference instead of an
-- org-wide admin flag (see the api/web commit right after this one) — the
-- column was added and dropped within the same unreleased batch, no data.
ALTER TABLE "Organization" DROP COLUMN "tutorialModeEnabled";
