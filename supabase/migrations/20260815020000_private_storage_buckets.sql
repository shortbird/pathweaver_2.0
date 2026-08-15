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

-- ── 2. RLS on storage.objects: nothing to do here, and nothing we CAN do ─────
--
-- An earlier draft of this migration enabled RLS on storage.objects and added a
-- RESTRICTIVE deny for anon/authenticated across these buckets. Both halves were
-- wrong, and the failure was instructive rather than cosmetic:
--
--   1. It is not permitted. storage.objects and storage.buckets are owned by
--      `supabase_storage_admin`, not by the migration role, so ALTER TABLE and
--      CREATE POLICY both fail with "must be owner of table objects" -- and
--      because the whole migration runs in one transaction, that took the bucket
--      flip down with it. A privacy fix that cannot apply protects nobody.
--
--   2. It was redundant. Verified against production 2026-08-15: RLS is ALREADY
--      enabled on both storage.objects and storage.buckets, and the only three
--      policies on objects concern `site-assets` writes (insert/update/delete).
--      There is no permissive SELECT policy at all, so `anon` and `authenticated`
--      already get nothing through RLS. The table is fail-closed today.
--
-- So the bucket flip below is the whole fix, and it is sufficient. Once a bucket
-- has public = false, the storage API stops serving /object/public/ for it
-- entirely; reads must present a signed URL, which is validated against the
-- object's JWT rather than through RLS. Authorization moves from "the bucket is
-- open" to "the backend decided you may see this, for the next hour".
--
-- If the extra RESTRICTIVE deny is ever wanted as defence against someone later
-- adding a broad "allow authenticated read" policy, it has to be created through
-- the Supabase dashboard's storage policy editor, which runs as the storage
-- admin. It cannot live in this file.

COMMIT;
