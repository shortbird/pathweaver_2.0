-- Private by default, with parents holding the controls
-- Date: 2026-08-01
--
-- The 2026-01-02 FERPA migration changed the DEFAULT for diplomas.is_public to
-- FALSE but deliberately left existing rows alone ("This only affects NEW
-- records. Existing public portfolios stay public."). Seven months later that
-- exception is the rule: of 730 diplomas, 721 are public and only 5 carry a
-- consent record. 524 of the public ones belong to a minor or to a student
-- whose age we do not know.
--
-- Those 716 rows are not consent. They are the residue of a public-by-default
-- product, and no parent ever agreed to any of them. This migration resets
-- them, adds the revocable transcript-sharing grant, and fixes the SQL-side
-- age check that treated an unknown birth date as evidence of adulthood.

BEGIN;

-- =============================================================================
-- PHASE 0: Stop minting public portfolios at signup
-- =============================================================================

-- This is why the January migration never actually took effect. It set the
-- column default to FALSE, but generate_portfolio_slug() -- a trigger on
-- users, firing AFTER INSERT OR UPDATE OF first_name/last_name/display_name --
-- inserts the diploma row with is_public hardcoded TRUE, so the default is
-- never consulted for a real signup:
--
--     INSERT INTO public.diplomas (user_id, portfolio_slug, is_public)
--     VALUES (NEW.id, final_slug, true)
--
-- Every account created since January got a public portfolio regardless. All
-- 11 diplomas created in the two days before this migration are public. Fixing
-- the trigger has to come before the backfill below, or new signups would
-- start re-filling the set we are about to clear.
--
-- The INSERT now omits is_public entirely and lets the column default stand.
-- The ON CONFLICT branch is unchanged and still only backfills a missing slug.

CREATE OR REPLACE FUNCTION generate_portfolio_slug()
RETURNS TRIGGER AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    IF NEW.first_name IS NOT NULL AND NEW.last_name IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(NEW.first_name || '-' || NEW.last_name, '[^a-zA-Z0-9-]', '-', 'g'));
    ELSIF NEW.display_name IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(NEW.display_name, '[^a-zA-Z0-9]', '-', 'g'));
    ELSIF NEW.email IS NOT NULL THEN
        base_slug := LOWER(REGEXP_REPLACE(SPLIT_PART(NEW.email, '@', 1), '[^a-zA-Z0-9]', '-', 'g'));
    ELSE
        base_slug := 'user-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;

    final_slug := base_slug;

    WHILE EXISTS(SELECT 1 FROM public.diplomas WHERE portfolio_slug = final_slug AND user_id != NEW.id) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;

    -- is_public intentionally omitted: the column default (FALSE) decides.
    INSERT INTO public.diplomas (user_id, portfolio_slug)
    VALUES (NEW.id, final_slug)
    ON CONFLICT (user_id)
    DO UPDATE SET portfolio_slug = EXCLUDED.portfolio_slug
    WHERE public.diplomas.portfolio_slug IS NULL;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_portfolio_slug() IS
  'Creates a portfolio slug on user insert/name change. Does NOT set '
  'is_public — a new portfolio is private until someone consents.';

-- =============================================================================
-- PHASE 1: Revocable transcript share links
-- =============================================================================

-- A transcript is the one thing a family genuinely needs to hand to someone
-- with no Optio account. Previously that need was met by leaving the endpoint
-- open to the entire internet. It is now met by a grant that a specific person
-- issued, that expires, and that can be revoked.

CREATE TABLE IF NOT EXISTS transcript_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_by UUID NOT NULL REFERENCES users(id),
  label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE transcript_share_tokens IS
  'Revocable, expiring grants to view one student transcript. Issued by the '
  'student''s parent or org approver; the token is the auth surface for '
  'recipients who have no Optio account.';
COMMENT ON COLUMN transcript_share_tokens.label IS
  'Who this link was issued to, e.g. "State University admissions" — so a '
  'parent reviewing the list knows what they are revoking.';
COMMENT ON COLUMN transcript_share_tokens.revoked_at IS
  'Set on revocation. Checked on every read, so revocation is immediate.';

CREATE INDEX IF NOT EXISTS idx_transcript_shares_token
  ON transcript_share_tokens(token);
CREATE INDEX IF NOT EXISTS idx_transcript_shares_user
  ON transcript_share_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_transcript_shares_live
  ON transcript_share_tokens(user_id) WHERE revoked_at IS NULL;

ALTER TABLE transcript_share_tokens ENABLE ROW LEVEL SECURITY;

-- Students see grants over their own transcript.
DROP POLICY IF EXISTS student_view_own_transcript_shares ON transcript_share_tokens;
CREATE POLICY student_view_own_transcript_shares
  ON transcript_share_tokens FOR SELECT
  USING (user_id = auth.uid());

-- Parents see grants over their children's transcripts.
DROP POLICY IF EXISTS parent_view_child_transcript_shares ON transcript_share_tokens;
CREATE POLICY parent_view_child_transcript_shares
  ON transcript_share_tokens FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users u
            WHERE u.id = transcript_share_tokens.user_id
              AND u.managed_by_parent_id = auth.uid())
    OR EXISTS (SELECT 1 FROM parent_student_links l
               WHERE l.student_user_id = transcript_share_tokens.user_id
                 AND l.parent_user_id = auth.uid()
                 AND l.status IN ('approved', 'active'))
  );

-- =============================================================================
-- PHASE 2: Unknown age means minor
-- =============================================================================

-- The original function returned FALSE when date_of_birth was NULL, reasoning
-- that such users "would have given consent at registration". But
-- date_of_birth is optional at registration, so this classified 267 students
-- of genuinely unknown age as adults entitled to publish their own records.
-- A missing birth date is missing information, and missing information about
-- a child must fail closed.

CREATE OR REPLACE FUNCTION is_minor(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_dependent BOOLEAN;
  v_dob DATE;
BEGIN
  SELECT is_dependent, date_of_birth::DATE INTO v_is_dependent, v_dob
  FROM users WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN TRUE;      -- unknown user -> treat as minor
  END IF;

  IF v_is_dependent = TRUE THEN
    RETURN TRUE;
  END IF;

  IF v_dob IS NULL THEN
    RETURN TRUE;      -- unknown age -> minor (was FALSE)
  END IF;

  RETURN DATE_PART('year', AGE(CURRENT_DATE, v_dob)) < 18;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_minor(UUID) IS
  'TRUE if under 18, is_dependent, or age unknown. Unknown age fails closed: '
  'a missing date of birth is not evidence of adulthood.';

-- get_parent_for_minor referenced parent_student_links.parent_id / .student_id,
-- but the columns are parent_user_id / student_user_id — so it silently
-- errored for every 13+ student with a linked parent. Corrected here.
CREATE OR REPLACE FUNCTION get_parent_for_minor(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_parent_id UUID;
BEGIN
  SELECT managed_by_parent_id INTO v_parent_id
  FROM users WHERE id = p_user_id AND managed_by_parent_id IS NOT NULL;

  IF v_parent_id IS NOT NULL THEN
    RETURN v_parent_id;
  END IF;

  SELECT parent_user_id INTO v_parent_id
  FROM parent_student_links
  WHERE student_user_id = p_user_id AND status IN ('approved', 'active')
  LIMIT 1;

  RETURN v_parent_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- PHASE 3: Retire the portfolios nobody consented to
-- =============================================================================

-- Preserve what we are about to change, so the notification job knows exactly
-- who to tell and so this is reversible if a family objects.
CREATE TABLE IF NOT EXISTS portfolio_visibility_reset_20260801 (
  user_id UUID PRIMARY KEY,
  portfolio_slug TEXT,
  was_public BOOLEAN NOT NULL,
  had_consent BOOLEAN NOT NULL,
  was_minor BOOLEAN NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMPTZ
);

COMMENT ON TABLE portfolio_visibility_reset_20260801 IS
  'Audit of the 2026-08-01 private-by-default reset. One row per portfolio '
  'switched from public to private. notified_at is stamped once the family '
  'has been told.';

-- This table holds per-student minor/consent flags, so it must never reach the
-- Data API. Without these two statements it does: 20260527_restore_default_data_
-- api_grants.sql grants anon ALL on every new public table, and RLS was the only
-- thing meant to hold it back. It shipped without RLS, and 718 rows were readable
-- (and TRUNCATE-able) with the public anon key until 2026-08-01 -- AUDIT.md C2.
-- Written only by the backend's service-role client, which bypasses RLS.
ALTER TABLE portfolio_visibility_reset_20260801 ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_visibility_reset_20260801 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON portfolio_visibility_reset_20260801 FROM anon, authenticated, PUBLIC;
GRANT  ALL ON portfolio_visibility_reset_20260801 TO service_role;

INSERT INTO portfolio_visibility_reset_20260801
  (user_id, portfolio_slug, was_public, had_consent, was_minor)
SELECT d.user_id,
       d.portfolio_slug,
       TRUE,
       COALESCE(d.public_consent_given, FALSE),
       is_minor(d.user_id)
FROM diplomas d
WHERE d.is_public = TRUE
  AND COALESCE(d.public_consent_given, FALSE) = FALSE
ON CONFLICT (user_id) DO NOTHING;

-- The reset itself. Consented portfolios (5 at time of writing) are left
-- alone: someone did affirmatively agree to those, and overriding a real
-- consent would be its own kind of disrespect.
UPDATE diplomas
SET is_public = FALSE,
    pending_parent_approval = FALSE
WHERE is_public = TRUE
  AND COALESCE(public_consent_given, FALSE) = FALSE;

-- Cancel visibility requests that are now moot.
UPDATE public_visibility_requests
SET status = 'denied',
    responded_at = NOW(),
    denial_reason = 'Superseded by the 2026-08-01 private-by-default reset'
WHERE status = 'pending';

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Public portfolios remaining (expect: only consented ones):
--   SELECT count(*) FROM diplomas WHERE is_public;
-- Every remaining public portfolio should have a consent record:
--   SELECT count(*) FROM diplomas WHERE is_public AND NOT COALESCE(public_consent_given, FALSE);
-- Families to notify:
--   SELECT count(*) FROM portfolio_visibility_reset_20260801 WHERE notified_at IS NULL;
