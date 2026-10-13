-- A Compose send can be edited or deleted for everyone it reached.
--
-- iCreate, 2026-10-13: a coordinator meant a question for Marika and sent it,
-- inside the volunteer-hours announcement, to 334 people. Each copy was a
-- school-voiced DM, so the per-message Edit refused her (the school is the
-- sender) and Delete meant 334 clicks. The fix was hand-written SQL.
--
-- message_compose_service.edit_send / delete_send now rewrite every copy. These
-- columns let the Sent list say what happened to the send itself: edited_at is
-- the last edit, deleted_at hides the body and the Edit/Delete buttons.

ALTER TABLE public.message_sends
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.message_sends.edited_at IS
  'Last "Edit for everyone" from the Sent list. NULL = never edited.';
COMMENT ON COLUMN public.message_sends.deleted_at IS
  'When "Delete for everyone" removed every copy. NULL = live.';
