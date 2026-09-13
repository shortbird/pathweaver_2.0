-- A poster frame for a story's video hero.
--
-- Why: a story whose hero is a video had no still to show. The card on
-- /stories, the Open Graph image, and the VideoObject.thumbnailUrl that
-- Google requires all want a still, and iOS Safari paints a <video> black
-- until the visitor presses play unless it has a poster. The publish step
-- now extracts one frame from a video the safety pass already inspected
-- across every frame (services/stories/safety.py) and stores it in the
-- public bucket beside the video; this column is where the row records it.
-- Null for images, documents, and videos ffmpeg could not read.
--
-- No RLS change. story_assets already has RLS enabled, with the service-role
-- policy from 20260911180000_promotional_consents_and_stories.sql, and this
-- file creates no table. The bucket already accepts image/jpeg.

ALTER TABLE public.story_assets
  ADD COLUMN IF NOT EXISTS poster_path text;

COMMENT ON COLUMN public.story_assets.poster_path IS
  'Public-bucket path of the still frame extracted from a video at publish time. Null for images, documents, and videos ffmpeg could not read.';
