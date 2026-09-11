-- Stories on www: one-click case studies from the credit review dashboard.
--
-- Four tables and one bucket. Every table is service-role only, on purpose:
-- the public endpoint (GET /api/public/stories) is the only reader of a story
-- and it projects an allowlist, so no anon policy exists on `stories` either.
-- A story row carries the student's id, the private evidence pointers and the
-- AI's working notes, none of which may reach a browser through the Data API.
--
-- `promotional_consents` is the record Terms v1.1 Section 9 promised: who gave
-- promotional consent, for which of the four itemized scopes, and when. One
-- active consent per student; revocation keeps the row and stamps revoked_at.

-- ── 1. promotional_consents ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.promotional_consents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Who consented. The student themselves only when they are an adult; the
  -- trigger below refuses a minor's self-consent the way the diplomas one does.
  granted_by_user_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Who typed it in. Usually the granter; a superadmin recording a signed form
  -- on the family's behalf is the other case, and then source_ref says which.
  recorded_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approver_kind       text NOT NULL
                      CHECK (approver_kind IN ('self_adult','parent','org_admin')),
  -- The four itemized permissions from the Terms. Each is its own decision.
  scope_work          boolean NOT NULL DEFAULT false,
  scope_first_name    boolean NOT NULL DEFAULT false,
  scope_image_voice   boolean NOT NULL DEFAULT false,
  scope_age           boolean NOT NULL DEFAULT false,
  source              text NOT NULL
                      CHECK (source IN ('academy_agreement','org_registration','parent_account','written')),
  source_ref          text,
  notes               text,
  granted_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz,
  revoked_by_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One live consent per student. A new grant after a revocation is a new row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_promotional_consents_active_student
  ON public.promotional_consents (student_user_id) WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trigger_promotional_consents_updated_at ON public.promotional_consents;
CREATE TRIGGER trigger_promotional_consents_updated_at
  BEFORE UPDATE ON public.promotional_consents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Copied from enforce_publication_consent_provenance (the diplomas trigger).
-- The application checks the same rules in consent_service.grant; this is the
-- copy that survives a bug there. Unknown age is a minor: is_minor_for_publication
-- returns true for a missing date of birth and for a missing user.
CREATE OR REPLACE FUNCTION public.enforce_promotional_consent_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.approver_kind = 'self_adult' then
    if new.granted_by_user_id <> new.student_user_id then
      raise exception
        'A self_adult promotional consent must be granted by the student (%), not by %.',
        new.student_user_id, new.granted_by_user_id
        using errcode = 'check_violation';
    end if;
    if public.is_minor_for_publication(new.student_user_id) then
      raise exception
        'Promotional consent for user % cannot be self-granted: the student is a '
        'minor (or has no date of birth on file, which is treated as a minor). '
        'A parent or an accountable adult must consent.', new.student_user_id
        using errcode = 'check_violation';
    end if;
  else
    if new.granted_by_user_id = new.student_user_id then
      raise exception
        'A % promotional consent must be granted by someone other than the student (%).',
        new.approver_kind, new.student_user_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$function$;

DROP TRIGGER IF EXISTS trg_promotional_consent_provenance ON public.promotional_consents;
CREATE TRIGGER trg_promotional_consent_provenance
  BEFORE INSERT OR UPDATE ON public.promotional_consents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_promotional_consent_provenance();

ALTER TABLE public.promotional_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to promotional consents" ON public.promotional_consents;
CREATE POLICY "Service role full access to promotional consents"
  ON public.promotional_consents FOR ALL TO public
  USING ((SELECT auth.role()) = 'service_role');

-- ── 2. stories ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stories (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text UNIQUE,
  status           text NOT NULL DEFAULT 'generating'
                   CHECK (status IN ('generating','review','published','unpublished','failed')),
  source_type      text NOT NULL
                   CHECK (source_type IN ('credit_submission','quest','learning_moment','manual')),
  -- quest_task_completions.id for a credit_submission, user_quests.id for a quest.
  -- No foreign key: the two source types point at different tables.
  source_id        uuid,
  student_user_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- NULL means the anonymized tier: no name, no age, no faces, no school.
  consent_id       uuid REFERENCES public.promotional_consents(id) ON DELETE SET NULL,
  tier             text NOT NULL DEFAULT 'anonymized'
                   CHECK (tier IN ('anonymized','named')),
  -- auto publishes without a human; review parks the draft for the editor.
  mode             text NOT NULL DEFAULT 'review'
                   CHECK (mode IN ('auto','review')),
  title            text,
  dek              text,
  body             jsonb,
  student_label    text,
  setting          text,
  grade_band       text,
  activity_slug    text,
  activity_label   text,
  -- Exactly Receipt.astro's props: activity, course, credit, icon.
  receipt          jsonb,
  subject          text,
  subject_split    jsonb,
  xp_awarded       integer,
  credit_fraction  numeric(4,2),
  hero_asset_id    uuid,
  og_image_url     text,
  author_name      text,
  author_title     text,
  -- The model's raw answer plus model, prompt_version, usage, drafted_at.
  ai_draft         jsonb,
  -- The AI safety pass: per-image verdicts, the text leak scan, model, checked_at.
  safety           jsonb,
  -- Why the story landed in review instead of publishing: [{code, field, message}].
  blockers         jsonb,
  -- What the drafter flagged for a human, sent in the publish email.
  concerns         jsonb,
  published_at     timestamptz,
  unpublished_at   timestamptz,
  error            text,
  -- Queue bookkeeping, same idea as credit_ai_reviews: the claim token stops
  -- the request thread and the cron sweep both generating one story.
  claim_token      uuid,
  started_at       timestamptz,
  attempts         integer NOT NULL DEFAULT 0,
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One story per source. A second click on the same submission gets the
-- existing story back (409), never a duplicate page.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stories_source
  ON public.stories (source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stories_published
  ON public.stories (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_stories_student
  ON public.stories (student_user_id);

DROP TRIGGER IF EXISTS trigger_stories_updated_at ON public.stories;
CREATE TRIGGER trigger_stories_updated_at
  BEFORE UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to stories" ON public.stories;
CREATE POLICY "Service role full access to stories"
  ON public.stories FOR ALL TO public
  USING ((SELECT auth.role()) = 'service_role');

-- ── 3. story_assets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.story_assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id           uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  source_block_id    text,
  source_item_index  integer,
  -- The canonical private URL of the original. Never leaves the admin API.
  source_ref         text NOT NULL,
  -- stories/<story_id>/<asset_id>.jpg in the public story-assets bucket, once copied.
  public_path        text,
  alt                text,
  caption            text,
  width              integer,
  height             integer,
  order_index        integer NOT NULL DEFAULT 0,
  -- faces, readable_text, identifying_detail, verdict (safe|excluded|uncertain),
  -- reason, checked_by.
  safety             jsonb,
  included           boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_assets_story
  ON public.story_assets (story_id, order_index);

DROP TRIGGER IF EXISTS trigger_story_assets_updated_at ON public.story_assets;
CREATE TRIGGER trigger_story_assets_updated_at
  BEFORE UPDATE ON public.story_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.story_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to story assets" ON public.story_assets;
CREATE POLICY "Service role full access to story assets"
  ON public.story_assets FOR ALL TO public
  USING ((SELECT auth.role()) = 'service_role');

-- ── 4. marketing_rebuilds ───────────────────────────────────────────────────
--
-- Every request to rebuild the static www site, and what happened to it. The
-- debounce lives here: a burst of publishes inside the interval fires the
-- deploy hook once and marks the rest coalesced.

CREATE TABLE IF NOT EXISTS public.marketing_rebuilds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reason        text NOT NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  fired_at      timestamptz,
  status        text NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested','fired','coalesced','skipped','failed')),
  response      text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_rebuilds_status
  ON public.marketing_rebuilds (status, requested_at);
CREATE INDEX IF NOT EXISTS idx_marketing_rebuilds_fired
  ON public.marketing_rebuilds (fired_at DESC) WHERE fired_at IS NOT NULL;

ALTER TABLE public.marketing_rebuilds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to marketing rebuilds" ON public.marketing_rebuilds;
CREATE POLICY "Service role full access to marketing rebuilds"
  ON public.marketing_rebuilds FOR ALL TO public
  USING ((SELECT auth.role()) = 'service_role');

-- ── 5. The public bucket ────────────────────────────────────────────────────
--
-- Its own bucket, not site-assets (which holds the logo and hero art). Public,
-- because the www site is static and its images are plain <img> tags. Images
-- only: a PDF with a student's name on it can never become public through
-- this path, whatever the application does. 5 MB is well above what
-- prepare_public_image emits (a 1600 px JPEG at quality 85).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'story-assets',
    'story-assets',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE public.promotional_consents IS
  'Itemized promotional-use consent (Terms Section 9): who gave it, for which scopes, and when.';
COMMENT ON TABLE public.stories IS
  'Case studies published to www.optioeducation.com/stories. Service-role only; the public endpoint projects an allowlist.';
COMMENT ON TABLE public.story_assets IS
  'Images considered for a story, with the AI safety verdict and the public copy path.';
COMMENT ON TABLE public.marketing_rebuilds IS
  'Requests to rebuild the static marketing site, debounced against the deploy hook.';
