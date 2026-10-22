-- Custom task names + per-task visibility (admins / manage Task always see everything).
CREATE TYPE "TaskVisibility" AS ENUM ('ASSIGNED', 'EVERYONE', 'SELECTED');

ALTER TABLE "Task"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "visibility" "TaskVisibility" NOT NULL DEFAULT 'ASSIGNED',
  ADD COLUMN "visibleToIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
