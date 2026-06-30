-- OEA HS Diploma Phase 2: per-student transfer-credit cap overrides.
--
-- A Hearthwood admin can raise an individual student's transfer / non-direct
-- ceilings above the program defaults (6 transfer, 18 combined non-direct).
-- NULL means "use the program default" (from feature_flags.oea_settings, falling
-- back to the code default in backend/utils/oea_rules.py). Set on the enrollment
-- so it travels with the student's diploma record.

ALTER TABLE oea_enrollments
  ADD COLUMN IF NOT EXISTS max_transfer_credits  numeric,
  ADD COLUMN IF NOT EXISTS max_nondirect_credits numeric;
