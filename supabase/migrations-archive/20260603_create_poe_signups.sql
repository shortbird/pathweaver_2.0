-- POE (Pipe Organ Encounter) 2026 pilot — interest-list signups.
--
-- The public /poe page is an INTEREST CAPTURE form, not a sign-up/account flow.
-- Families who want fine-arts credit for their POE submit their contact info and
-- which camp they're attending; they receive a confirmation email and Optio
-- follows up to onboard them into a real account closer to camp. No auth user,
-- journal topic, or legal consent is created at this stage (consent is collected
-- later, at actual account creation).
--
-- This replaces the old account-creating /api/public/poe/enroll behavior. The
-- poe_participants table (which requires a real users.id) is unchanged and stays
-- for actual participants once they're onboarded.
--
-- Backend reads/writes via the admin client (Optio uses a custom JWT, not
-- Supabase auth.uid()), so RLS is enabled with no public policies: that denies
-- direct Data API / anon access while the admin client bypasses RLS. Default
-- data-API grants are handled by 20260527_restore_default_data_api_grants.sql.

CREATE TABLE IF NOT EXISTS poe_signups (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poe_cohort_id         uuid NOT NULL REFERENCES poe_cohorts(id) ON DELETE CASCADE,

  -- Participant contact info.
  first_name            text NOT NULL,
  last_name             text NOT NULL,
  email                 text NOT NULL,
  date_of_birth         date,
  is_minor              boolean,                   -- under 18 at signup (drives parent contact)

  -- Parent/guardian contact (captured for minors so Optio can follow up).
  parent_first_name     text,
  parent_last_name      text,
  parent_email          text,

  -- Credit destination — where the 0.5 fine arts credit should land.
  is_homeschool         boolean,
  school_name           text,
  school_city           text,
  school_state          text,
  school_contact_email  text,

  confirmation_sent_at  timestamptz,               -- when the confirmation email went out
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One signup per email per camp; re-submitting updates the existing row.
-- Email is always stored lowercased by the route, so a plain (not functional)
-- unique index is correct and lets the upsert's ON CONFLICT (poe_cohort_id, email)
-- be inferred.
CREATE UNIQUE INDEX IF NOT EXISTS idx_poe_signups_cohort_email
  ON poe_signups (poe_cohort_id, email);

CREATE INDEX IF NOT EXISTS idx_poe_signups_cohort ON poe_signups (poe_cohort_id);

ALTER TABLE poe_signups ENABLE ROW LEVEL SECURITY;
