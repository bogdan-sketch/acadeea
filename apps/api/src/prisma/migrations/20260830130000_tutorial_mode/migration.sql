-- Admin-only tutorial mode toggle (coachmarks + help center).
ALTER TABLE "Organization" ADD COLUMN "tutorialModeEnabled" BOOLEAN NOT NULL DEFAULT false;
