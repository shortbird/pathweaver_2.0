-- Link a sent announcement back to the Community Hub board post that spawned it.
--
-- Posting on the board with "notify" writes TWO rows: the sis_announcements
-- board post and an announcements fan-out row (announcement_service.publish).
-- Nothing tied them together, so the family portal deduped them by matching
-- title + calendar day, and edits/deletes only ever reached one half:
--
--   * Editing the board post's title broke the dedupe key and families saw the
--     same notice twice (iCreate, 2026-08-27).
--   * Deleting the board post left the fan-out row alive, so a notice the admin
--     had taken down stayed on the parent dashboard forever ("Summit Program
--     Info", iCreate, 2026-08-28).
--
-- With the link the dedupe is by id, and edit/delete propagate to both halves.
-- ON DELETE SET NULL: the retraction is done in application code (it also has
-- to sweep the bell notifications), so the constraint must not race it.

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS source_announcement_id uuid
    REFERENCES public.sis_announcements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_announcements_source
  ON public.announcements(source_announcement_id)
  WHERE source_announcement_id IS NOT NULL;

COMMENT ON COLUMN public.announcements.source_announcement_id IS
  'The sis_announcements board post this send came from, when it was published '
  'via the Community Hub composer. NULL for sends from the SIS Messaging page.';
