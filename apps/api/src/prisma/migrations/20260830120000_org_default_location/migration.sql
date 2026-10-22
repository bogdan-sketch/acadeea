-- Admin-configurable default production/reception location (ClickUp: loc implicit receptie).
ALTER TABLE "Organization" ADD COLUMN "defaultLocationId" UUID;
