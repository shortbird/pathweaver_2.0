-- Video evidence in stories.
--
-- Why: a story whose only evidence is a video had nothing to show. The
-- pipeline collected inline images only, so a student who filmed the work
-- (a performance, a load test, a match) got a page with words and no
-- evidence at all. story_assets now records what kind of media each row is,
-- the MIME type the bytes sniffed as, and the duration when it is known. The
-- public bucket accepts the three browser-playable video types, at the same
-- 50 MB ceiling MAX_VIDEO_SIZE puts on an evidence upload.
--
-- A video is copied to the public bucket as-is: there is no ffmpeg in
-- production to strip metadata, so the safety pass refuses any file that
-- carries a location atom instead. See services/stories/safety.py.
--
-- No RLS change. story_assets already has RLS enabled, with the service-role
-- policy from 20260911180000_promotional_consents_and_stories.sql, and this
-- file creates no table.

ALTER TABLE public.story_assets
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'image';
ALTER TABLE public.story_assets
  ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE public.story_assets
  ADD COLUMN IF NOT EXISTS duration_seconds numeric;

ALTER TABLE public.story_assets DROP CONSTRAINT IF EXISTS story_assets_kind_check;
ALTER TABLE public.story_assets
  ADD CONSTRAINT story_assets_kind_check CHECK (kind IN ('image', 'video'));

UPDATE storage.buckets
   SET file_size_limit = 52428800,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp',
                                  'video/mp4', 'video/quicktime', 'video/webm']
 WHERE id = 'story-assets';

COMMENT ON COLUMN public.story_assets.kind IS
  'image | video. Decides how the asset is copied to the public bucket and rendered.';
COMMENT ON COLUMN public.story_assets.mime_type IS
  'What the original bytes sniffed as. Videos are published with this content type; images are always re-encoded to JPEG.';
COMMENT ON COLUMN public.story_assets.duration_seconds IS
  'Video length when known. Null for images.';
COMMENT ON TABLE public.story_assets IS
  'Images and videos considered for a story, with the AI safety verdict and the public copy path.';
