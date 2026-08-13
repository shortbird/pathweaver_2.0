-- Enrollment waitlist: staff-managed queue (iCreate, 2026-07-25)
--
-- Two problems this fixes.
--
-- 1. The sibling-priority cutoff never landed on iCreate. 20260718's UPDATE only
--    stamped orgs that ALREADY had enrollment_age_gates configured; iCreate set
--    its 5-9 gate after that migration ran, so it kept a NULL stamp. With no
--    stamp the ordering code falls back to "priority from the epoch", which
--    applied sibling priority RETROACTIVELY to the live queue — the exact thing
--    the cutoff exists to prevent. Families who registered first (Candland, Jul
--    21) were pushed behind families who registered later but had an older
--    non-waitlisted sibling (Pogue Jul 22, Swingle Jul 24). Stamping now puts
--    every existing row back in the frozen prefix, restoring registration order,
--    and limits sibling priority to families who register from here on.
--
-- 2. Staff had no way to curate the queue. Some families signed up on the old
--    Google form and were never in Optio at all, and there was no way to correct
--    an order once it was wrong. Two new columns make the queue staff-managed:
--
--    queued_at   - when the family actually got in line, which is NOT always when
--                  the row was created. A Google-form family added by hand today
--                  gets their real sign-up date and slots into the right place on
--                  its own. Defaults to created_at for every existing row.
--    manual_rank - an explicit staff-set order within an age band. Rows with a
--                  rank sort first, by rank; unranked rows follow in the normal
--                  computed order, so a new registrant queues behind the students
--                  staff have already placed.
--
--    added_by/source record who hand-added a student and distinguish those rows
--    from ones created by the registration funnel.

-- 1. The missed priority cutoff ----------------------------------------------
-- Same shape as 20260718's stamp (idempotent, never overwrites), re-run to catch
-- orgs that configured their age gates after that migration.
UPDATE organizations
SET feature_flags = jsonb_set(
      feature_flags,
      '{sis_settings,enrollment_waitlist_priority_since}',
      to_jsonb(now())
    )
WHERE feature_flags -> 'sis_settings' -> 'enrollment_age_gates' IS NOT NULL
  AND (feature_flags -> 'sis_settings' ->> 'enrollment_waitlist_priority_since') IS NULL;

-- 2. Staff-managed queue ------------------------------------------------------
ALTER TABLE sis_enrollment_waitlist
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_rank integer,
  ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'registration';

-- Existing rows got in line when they were created.
UPDATE sis_enrollment_waitlist SET queued_at = created_at WHERE queued_at IS NULL;

ALTER TABLE sis_enrollment_waitlist
  ALTER COLUMN queued_at SET DEFAULT now();
ALTER TABLE sis_enrollment_waitlist
  ALTER COLUMN queued_at SET NOT NULL;

ALTER TABLE sis_enrollment_waitlist
  DROP CONSTRAINT IF EXISTS sis_enrollment_waitlist_source_check;
ALTER TABLE sis_enrollment_waitlist
  ADD CONSTRAINT sis_enrollment_waitlist_source_check
  CHECK (source IN ('registration', 'manual'));

-- The queue is always read per org + band, in queue order.
CREATE INDEX IF NOT EXISTS sis_enrollment_waitlist_queue_idx
  ON sis_enrollment_waitlist (organization_id, band_min_age, band_max_age, manual_rank, queued_at)
  WHERE status = 'waiting';
