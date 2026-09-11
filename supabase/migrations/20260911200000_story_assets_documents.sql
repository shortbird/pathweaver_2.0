-- PDF evidence in stories.
--
-- Why: a student who wrote the work up as a PDF (a lab report, a business
-- plan, a programme) had nothing on the page but a caption saying a file
-- existed. story_assets now records kind = 'document' for a PDF the safety
-- pass cleared, and the public bucket accepts application/pdf so the file
-- itself can be opened from the story.
--
-- What this changes about the guarantee. Until now the bucket's MIME list
-- meant that a PDF could not become public whatever the application did: an
-- upload of one was refused at the storage layer. With application/pdf on
-- the list, THE BUCKET NO LONGER GUARANTEES THAT A PDF CANNOT BECOME PUBLIC.
-- A PDF is copied byte for byte (there is nothing in production to redact
-- one), so the safety pass -- the model reading every page for names, faces
-- and addresses, plus the scrubber's leak scan over the extracted text and
-- the PDF metadata (services/stories/safety.py, _check_document) -- and the
-- superadmin in the editor now carry that responsibility. A PDF reaches the
-- bucket only through services/stories/assets.copy_to_public, only for a row
-- marked included, and only after that pass said safe.
--
-- Quotes and links are not assets and need no column: they live on the
-- story body's evidence items with their own included flag and verdict.
--
-- No RLS change. story_assets already has RLS enabled, with the service-role
-- policy from 20260911180000_promotional_consents_and_stories.sql, and this
-- file creates no table.

ALTER TABLE public.story_assets DROP CONSTRAINT IF EXISTS story_assets_kind_check;
ALTER TABLE public.story_assets
  ADD CONSTRAINT story_assets_kind_check CHECK (kind IN ('image', 'video', 'document'));

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp',
                                  'video/mp4', 'video/quicktime', 'video/webm',
                                  'application/pdf']
 WHERE id = 'story-assets';

COMMENT ON COLUMN public.story_assets.kind IS
  'image | video | document. Decides how the asset is copied to the public bucket and rendered. A document is a PDF, published as-is after the safety pass.';
COMMENT ON TABLE public.story_assets IS
  'Images, videos and PDFs considered for a story, with the AI safety verdict and the public copy path.';
