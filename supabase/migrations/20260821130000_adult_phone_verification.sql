-- SMS phone verification for an org's adults.
--
-- iCreate's ask (2026-08-21): every adult account -- teachers, campus
-- coordinators, org admins, parents -- must have a verified phone number on
-- file, and until they verify one they get one screen and nothing else. Same
-- shape as the paperwork hold (20260818): the rule is enforced in middleware
-- (backend/middleware/phone_verification_gate.py) and the web app mirrors it.
--
-- Two pieces of state:
--
--   users.phone_verified_at
--       When this person proved they hold the number in users.phone_number,
--       by typing back a code we texted to it. NULL means never verified,
--       which for an adult in an org with the flag below means held.
--
--   phone_verification_codes
--       The codes in flight. A row is one sent SMS: the hashed code, the
--       phone it went to, how many wrong guesses it has absorbed, and when it
--       stops being usable. Codes are stored hashed (sha256 with a per-row
--       salt) because this table must never be worth stealing.
--
-- The requirement itself is an org feature flag --
-- feature_flags.sis_settings.require_adult_phone_verification -- not a
-- hardcoded org id, so any school can opt in and switching it off is one
-- UPDATE, not a deploy.
--
-- Deliberately NOT set here. Turning the flag on IS the go-live switch, and
-- it must happen only after SMS delivery to US phones is confirmed working:
-- with the flag on and no deliverable SMS, every adult in the org is locked
-- behind a screen whose codes cannot arrive. When delivery is verified:
--
--   UPDATE public.organizations
--   SET feature_flags = jsonb_set(feature_flags,
--       '{sis_settings,require_adult_phone_verification}', 'true'::jsonb, true)
--   WHERE slug = 'icreate';

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

COMMENT ON COLUMN public.users.phone_verified_at IS
    'When the user verified phone_number via SMS code. NULL = never verified. '
    'Gates org adults when the org sets '
    'feature_flags.sis_settings.require_adult_phone_verification '
    '(backend/middleware/phone_verification_gate.py).';

CREATE TABLE IF NOT EXISTS public.phone_verification_codes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    phone       text NOT NULL,
    code_hash   text NOT NULL,
    salt        text NOT NULL,
    attempts    integer NOT NULL DEFAULT 0,
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.phone_verification_codes IS
    'One row per verification SMS sent. Backend-only (service role); '
    'codes stored hashed. See services/phone_verification_service.py.';

-- The service looks up "this user''s latest live code" and counts recent sends
-- for rate limiting; both are this index.
CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_user_created
    ON public.phone_verification_codes (user_id, created_at DESC);

-- Backend-only table: RLS on, no policies. The Data API default grants exist
-- (20260527) but every path through them is denied; only service role reads.
ALTER TABLE public.phone_verification_codes ENABLE ROW LEVEL SECURITY;
