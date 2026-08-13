-- Reconcile iCreate SIS class fields onto the existing SIS model.
-- Migration: 20260630_reconcile_icreate_class_fields.sql
--
-- Context: the abandoned `sis-class-management` branch added a flat scheduling
-- model to org_classes (days_of_week/start_time/duration_minutes/max_students/
-- age_min/age_max) plus a parallel `class_attendance` table. The SIS platform
-- already covers all of that on a richer model: class_meetings (per-meeting day +
-- start/end), org_classes.capacity, min_age/max_age, and the sis_attendance table.
--
-- This migration keeps ONLY the two genuinely-new catalog fields (image_url,
-- supply_fee) and removes the redundant columns + the dead parallel table. It is
-- idempotent: safe whether or not the branch's migrations were ever applied.

-- 1. Keep the two net-new catalog fields (idempotent; already present in prod).
ALTER TABLE org_classes
    ADD COLUMN IF NOT EXISTS image_url  text,
    ADD COLUMN IF NOT EXISTS supply_fee numeric(10,2);

COMMENT ON COLUMN org_classes.image_url  IS 'Public URL of the class image (class-images bucket).';
COMMENT ON COLUMN org_classes.supply_fee IS 'Optional per-class supply fee (USD). Stored/displayed only; not charged.';

-- supply_fee guard rail (idempotent).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_classes_supply_fee_nonneg') THEN
        ALTER TABLE org_classes ADD CONSTRAINT chk_org_classes_supply_fee_nonneg
            CHECK (supply_fee IS NULL OR supply_fee >= 0);
    END IF;
END $$;

-- 2. Drop the redundant scheduling columns + their guard-rail constraints. The
--    SIS class_meetings / capacity / min_age|max_age model supersedes these.
ALTER TABLE org_classes DROP CONSTRAINT IF EXISTS chk_org_classes_duration_positive;
ALTER TABLE org_classes DROP CONSTRAINT IF EXISTS chk_org_classes_max_students_positive;
ALTER TABLE org_classes DROP CONSTRAINT IF EXISTS chk_org_classes_age_range;
ALTER TABLE org_classes DROP CONSTRAINT IF EXISTS chk_org_classes_days_of_week;

ALTER TABLE org_classes
    DROP COLUMN IF EXISTS days_of_week,
    DROP COLUMN IF EXISTS start_time,
    DROP COLUMN IF EXISTS duration_minutes,
    DROP COLUMN IF EXISTS max_students,
    DROP COLUMN IF EXISTS age_min,
    DROP COLUMN IF EXISTS age_max;

-- 3. Drop the parallel attendance table. SIS uses sis_attendance instead.
DROP TABLE IF EXISTS class_attendance;
