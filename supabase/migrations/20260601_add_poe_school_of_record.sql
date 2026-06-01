-- POE pilot — capture where each participant's credit should be transferred.
--
-- At registration the participant tells us either (a) the school of record Optio
-- should transfer the 0.5 fine arts credit to, or (b) that they're homeschool /
-- not currently enrolled, in which case Optio issues a standalone accredited
-- transcript record instead. Stored on the participation row (POE-specific intake).

ALTER TABLE poe_participants
  ADD COLUMN IF NOT EXISTS is_homeschool         boolean,
  ADD COLUMN IF NOT EXISTS school_name           text,
  ADD COLUMN IF NOT EXISTS school_city           text,
  ADD COLUMN IF NOT EXISTS school_state          text,
  ADD COLUMN IF NOT EXISTS school_contact_email  text;
