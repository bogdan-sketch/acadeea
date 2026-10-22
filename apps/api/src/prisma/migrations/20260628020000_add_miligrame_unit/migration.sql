-- Add the milligram unit (mg) to the UnitType enum (Postgres 12+ allows ADD VALUE in a tx).
ALTER TYPE "UnitType" ADD VALUE IF NOT EXISTS 'MILIGRAME';
