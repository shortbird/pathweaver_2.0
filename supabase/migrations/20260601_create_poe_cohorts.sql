-- POE (Pipe Organ Encounter) 2026 pilot — cohort model + journal-topic participation.
--
-- The AGO/CoPOE pilot lets teen POE participants document their camp learning in
-- Optio and earn 0.5 fine arts credit via Optio's accredited review. Participants
-- do NOT enroll in a course/quest. Instead each gets a "Pipe Organ Encounter"
-- journal topic (interest_tracks row) and submits learning evidence to it during
-- camp; Optio reviews that body of work afterward. Each of the four 2026 camps is
-- a poe_cohorts row, surfaced at the public page /poe/:slug.
--
-- Backend reads/writes via the admin client (Optio uses a custom JWT, not
-- Supabase auth.uid()), so RLS is enabled with no public policies: that denies
-- direct Data API / anon access while the admin client bypasses RLS. The public
-- /api/public/poe/:slug endpoint reads through the admin client, mirroring
-- routes/public.py. Default data-API grants are handled by
-- 20260527_restore_default_data_api_grants.sql.

-- 1. Cohorts — one row per 2026 POE camp.
CREATE TABLE IF NOT EXISTS poe_cohorts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE,         -- URL key for /poe/:slug
  display_name      text NOT NULL,                -- e.g. "POE 1"
  site_city         text,                         -- host city/site
  summary           text,                         -- short per-camp blurb for the public page
  start_date        date,                         -- camp dates (TBD at pilot kickoff)
  end_date          date,
  point_of_contact  text,                         -- host-site contact (internal logistics)
  is_active         boolean NOT NULL DEFAULT true, -- gates the public page / enrollment
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE poe_cohorts ENABLE ROW LEVEL SECURITY;

-- 2. Participation — one row per enrolled participant, tying them to a camp and to
--    the journal topic they document into. track_id is the interest_tracks row
--    auto-created at enrollment ("Pipe Organ Encounter"); review and the post-pilot
--    report walk cohort -> participant -> track -> learning_events.
CREATE TABLE IF NOT EXISTS poe_participants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  poe_cohort_id  uuid NOT NULL REFERENCES poe_cohorts(id) ON DELETE CASCADE,
  track_id       uuid REFERENCES interest_tracks(id) ON DELETE SET NULL,
  enrolled_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, poe_cohort_id)
);

CREATE INDEX IF NOT EXISTS idx_poe_participants_cohort ON poe_participants(poe_cohort_id);

ALTER TABLE poe_participants ENABLE ROW LEVEL SECURITY;

-- 3. Consent e-signature support on the existing parental_consent_log.
--    The POE flow captures consent inline (typed name + checkbox) rather than the
--    email-link round-trip, so we record how consent was given and what the
--    signer typed. consent_method defaults to 'email_link' to describe existing rows.
ALTER TABLE parental_consent_log
  ADD COLUMN IF NOT EXISTS consent_method text NOT NULL DEFAULT 'email_link'
    CHECK (consent_method IN ('email_link', 'esignature', 'admin_assisted')),
  ADD COLUMN IF NOT EXISTS signature_name text,
  ADD COLUMN IF NOT EXISTS consent_statement_version text;

-- 4. Seed the four 2026 cohorts with placeholder names + cities. Real site names,
--    dates, and contacts are filled in before the AGO announcement email.
INSERT INTO poe_cohorts (slug, display_name, site_city, summary) VALUES
  ('poe-1-2026', 'POE 1', 'Asheville, NC',   'Pipe Organ Encounter 2026 — site 1.'),
  ('poe-2-2026', 'POE 2', 'Spokane, WA',     'Pipe Organ Encounter 2026 — site 2.'),
  ('poe-3-2026', 'POE 3', 'Burlington, VT',  'Pipe Organ Encounter 2026 — site 3.'),
  ('poe-4-2026', 'POE 4', 'Galena, IL',      'Pipe Organ Encounter 2026 — site 4.')
ON CONFLICT (slug) DO NOTHING;
