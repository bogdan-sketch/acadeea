-- Colour per category KIND (super-category). Sub-categories inherit it.
CREATE TABLE IF NOT EXISTS "CategoryKindColor" (
  "kind"  TEXT NOT NULL,
  "color" TEXT NOT NULL,
  CONSTRAINT "CategoryKindColor_pkey" PRIMARY KEY ("kind")
);

INSERT INTO "CategoryKindColor" ("kind", "color") VALUES
  ('MATERIE_PRIMA', '#43A047'),
  ('SEMIPREPARAT',  '#1E88E5'),
  ('PRODUS_FINIT',  '#D4527B')
ON CONFLICT ("kind") DO NOTHING;
