-- OEA HS Diploma Phase 2: credit source classification.
--
-- A self-attested credit is now one of three sources:
--   direct           -- earned through Optio uploads (learning logs + artifacts).
--                       The default; existing rows backfill here automatically.
--   transfer         -- Hearthwood-internal transfer credit. Renders as a NATIVE
--                       credit on the transcript (no note). Capped at 6 credits.
--   earned_elsewhere -- outside credit. Transcript note "Accepted transfer credit
--                       from previous school." Combined with transfer, capped at 18.
--
-- Caps are enforced in the route layer (backend/utils/oea_rules.py); this column
-- just records the classification. Additive nullable-with-default -> no rewrite.

ALTER TABLE oea_credits
  ADD COLUMN IF NOT EXISTS credit_source text NOT NULL DEFAULT 'direct'
    CHECK (credit_source IN ('direct','transfer','earned_elsewhere'));

CREATE INDEX IF NOT EXISTS idx_oea_credits_source
  ON oea_credits(student_id, credit_source);
