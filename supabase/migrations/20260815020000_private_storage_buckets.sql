-- Take child, family and staff media out of public storage.
--
-- What was wrong
-- --------------
-- Nine buckets were flagged `public = true`, which in Supabase means every
-- object in them is served by the storage API with no authentication at all,
-- from a URL that never expires:
--
--   user-uploads     child avatars, learning-moment photos
--   user-photos      SIS student and staff photos
--   family-images    household photos
--   staff-photos     staff headshots
--   org-documents    organization paperwork
--   curriculum       org curriculum material
--   class-images     class photos, i.e. photographs of children
--   community-images SIS lost & found photos, taken inside the school
--   identity-documents  parent government ID + signed consent forms
--
-- Nothing in the product ever needed that. A public portfolio is a real,
-- opt-in feature, but it is served by the backend, which can mint a signed URL
-- per render (backend/utils/storage_urls.py, TTL from
-- Config.STORAGE_SIGNED_URL_TTL). Making a portfolio private, meanwhile, did
-- NOT take the files down: the object stayed world-readable, so anyone holding
-- a URL from when it was public kept their copy of a minor's work forever.
--
-- WHY quest-evidence IS NOT HERE
-- ------------------------------
-- It was, until 2026-08-15. It moved to
-- 20260815070000_private_quest_evidence_bucket.sql because it is NOT ready:
-- roughly nine route modules still read `quest_task_completions.evidence_url`
-- and `evidence_document_blocks.content.url` straight out of the database and
-- return them unsigned (routes/quest/detail.py, routes/parent/evidence_view.py,
-- routes/parent/quests_view.py, routes/parent/learning_moments.py,
-- routes/advisor/learning_moments.py, routes/helper_evidence.py,
-- routes/evidence_documents.py, routes/admin/student_task_management.py).
-- Flipping that bucket today blanks the evidence on a student's own quest page.
--
-- These two migrations are split rather than combined precisely so that this
-- one can ship on its own merit. Nine buckets are genuinely ready; bundling
-- them with a tenth that is not would mean either holding all ten back or
-- shipping a breakage. See the sibling file for the remaining work.
--
-- A note on where buckets come from here
-- --------------------------------------
-- These buckets are NOT declared in migrations. They are created lazily, at
-- runtime, by whichever request happens to be the first to upload into them
-- (see routes/sis/__init__.py, services/file_upload_service.py,
-- routes/parental_consent/documents.py). That is how they became public in the
-- first place: one call site passed `options={'public': True}` and that decided
-- it for everybody, permanently and invisibly. The application code now pins
-- `public: False` at every creation site, and utils/storage_urls.py keeps a
-- PRIVATE_MEDIA_BUCKETS list that file_upload_service enforces regardless of
-- what a caller asks for. This migration fixes the buckets that already exist.
--
-- Because of that, the UPDATE below is deliberately written to touch only rows
-- that are already there: creating the buckets from SQL would give them
-- different ownership and options than the runtime path expects.
--
-- Applying this
-- -------------
-- Flipping a bucket to private breaks every existing /object/public/ URL for
-- it immediately. The read paths that serve these nine buckets have all been
-- converted to sign at render time; backend/tests/test_private_storage_urls.py
-- pins that (TestAvatarReadPathsSign, TestListPathsSignInOneBatch) and fails if
-- one regresses.

BEGIN;

-- ── 1. The buckets themselves ────────────────────────────────────────────────

UPDATE storage.buckets
   SET public = false
 WHERE id IN (
    'user-uploads',
    'user-photos',
    'family-images',
    'staff-photos',
    'org-documents',
    'curriculum',
    'class-images',
    -- Not yet created in production (no Lost & Found photo has ever been
    -- uploaded), so this is a no-op today. Listed anyway so that if some
    -- environment already made it public, this closes it.
    'community-images',
    'identity-documents'  -- new home for parent government ID + consent forms
 );

-- Create the identity bucket if the application has not lazily created it yet.
-- This one IS declared here, unlike its siblings: it holds government ID scans,
-- and it must not be possible for the first upload to land in a bucket whose
-- privacy depends on a code path having been deployed.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'identity-documents',
    'identity-documents',
    false,
    15728640,  -- 15MB, same cap as the SIS secure-document store
    ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ── 2. RLS on storage.objects ────────────────────────────────────────────────
--
-- The backend reaches Storage with the service-role key, which bypasses RLS
-- entirely — it needs no policy and gets none. What matters here is that the
-- `anon` and `authenticated` roles get NOTHING on these buckets: every read is
-- a signed URL minted by the backend after it has checked who is asking.
--
-- Signed URLs are validated by the storage API against the object's JWT, not
-- by RLS, so they keep working with no policy at all. That is the whole point:
-- authorization moves from "the bucket is open" to "the backend decided you
-- may see this, for the next hour".

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop any permissive policy a previous ad-hoc change may have left behind.
-- Named explicitly rather than swept, so this migration cannot quietly remove
-- a policy some other bucket depends on.
DROP POLICY IF EXISTS "Public read access for private media buckets" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public read quest-evidence" ON storage.objects;
DROP POLICY IF EXISTS "Public read user-uploads" ON storage.objects;

-- Belt and braces: an explicit deny for the anonymous role on these buckets, so
-- that a future blanket "allow authenticated read on storage.objects" policy
-- cannot silently re-open them. RESTRICTIVE policies AND together with the
-- permissive ones, so this cannot be overridden by adding another policy.
--
-- `quest-evidence` IS in this list even though its bucket stays public for now.
-- That is deliberate and is not a contradiction: while `public = true`, the
-- storage API serves /object/public/ without consulting RLS at all, so this
-- line changes nothing today. It is here so that the moment the sibling
-- migration flips the bucket, the deny is already in place rather than being a
-- second thing someone has to remember.
DROP POLICY IF EXISTS "private_media_no_anon_direct_read" ON storage.objects;
CREATE POLICY "private_media_no_anon_direct_read"
    AS RESTRICTIVE
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (
        bucket_id NOT IN (
            'quest-evidence',
            'user-uploads',
            'user-photos',
            'family-images',
            'staff-photos',
            'org-documents',
            'curriculum',
            'class-images',
            'community-images',
            'identity-documents'
        )
    );

COMMIT;
