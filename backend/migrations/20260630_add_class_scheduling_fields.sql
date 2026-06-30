-- Add scheduling / catalog fields to org_classes for the iCreate SIS "Add Class" form
-- Migration: 20260630_add_class_scheduling_fields.sql
-- Description: Classes gain meeting days, start time, duration, capacity, optional
--              supply fee, image, and an age range. Existing columns (name,
--              description, xp_threshold, status) are unchanged.

ALTER TABLE org_classes
    ADD COLUMN IF NOT EXISTS days_of_week     text[]        NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS start_time       time,
    ADD COLUMN IF NOT EXISTS duration_minutes integer,
    ADD COLUMN IF NOT EXISTS max_students     integer,
    ADD COLUMN IF NOT EXISTS supply_fee       numeric(10,2),
    ADD COLUMN IF NOT EXISTS image_url        text,
    ADD COLUMN IF NOT EXISTS age_min          integer,
    ADD COLUMN IF NOT EXISTS age_max          integer;

-- Guard rails (idempotent: only add a constraint if it isn't already there)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_classes_duration_positive') THEN
        ALTER TABLE org_classes ADD CONSTRAINT chk_org_classes_duration_positive
            CHECK (duration_minutes IS NULL OR duration_minutes > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_classes_max_students_positive') THEN
        ALTER TABLE org_classes ADD CONSTRAINT chk_org_classes_max_students_positive
            CHECK (max_students IS NULL OR max_students > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_classes_supply_fee_nonneg') THEN
        ALTER TABLE org_classes ADD CONSTRAINT chk_org_classes_supply_fee_nonneg
            CHECK (supply_fee IS NULL OR supply_fee >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_classes_age_range') THEN
        ALTER TABLE org_classes ADD CONSTRAINT chk_org_classes_age_range
            CHECK (age_min IS NULL OR age_max IS NULL OR age_min <= age_max);
    END IF;

    -- Day codes are lowercase 3-letter abbreviations; the form only offers mon-fri
    -- but we allow the full week so the schema isn't the thing that blocks weekends later.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_org_classes_days_of_week') THEN
        ALTER TABLE org_classes ADD CONSTRAINT chk_org_classes_days_of_week
            CHECK (days_of_week <@ ARRAY['mon','tue','wed','thu','fri','sat','sun']::text[]);
    END IF;
END $$;

COMMENT ON COLUMN org_classes.days_of_week     IS 'Weekdays the class meets, e.g. {mon,wed,fri}. Form offers mon-fri.';
COMMENT ON COLUMN org_classes.start_time       IS 'Wall-clock start time of each meeting (no timezone).';
COMMENT ON COLUMN org_classes.duration_minutes IS 'Length of each meeting in minutes; end time is derived.';
COMMENT ON COLUMN org_classes.max_students     IS 'Seat capacity; enrollment beyond this is waitlisted.';
COMMENT ON COLUMN org_classes.supply_fee       IS 'Optional per-class supply fee (USD). Stored/displayed only; not charged.';
COMMENT ON COLUMN org_classes.image_url        IS 'Public URL of the class image (class-images bucket).';
COMMENT ON COLUMN org_classes.age_min          IS 'Lower bound of the recommended age range (inclusive).';
COMMENT ON COLUMN org_classes.age_max          IS 'Upper bound of the recommended age range (inclusive).';
