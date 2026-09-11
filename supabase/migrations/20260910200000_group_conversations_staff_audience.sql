-- Staff group chats.
--
-- group_conversations.audience has been ('family','student') since the class
-- chats split in two on 2026-08-31: one chat per class for the guardians, one
-- for the students. The office now needs a third kind -- a thread with a chosen
-- set of teachers ("everyone teaching on Tuesday", "the three of you covering
-- Ada's block") -- and those are neither.
--
-- Without this the column default ('family') would file a staff group with the
-- parent chats: the CHECK would pass, nothing would error, and every query that
-- means "the parent chats of this class" would be looking at a row that is not
-- one. The partial unique index on (source_class_id, audience) is unaffected --
-- staff groups have no source_class_id.

ALTER TABLE public.group_conversations
  DROP CONSTRAINT IF EXISTS group_conversations_audience_check;

ALTER TABLE public.group_conversations
  ADD CONSTRAINT group_conversations_audience_check
  CHECK (audience IN ('family', 'student', 'staff'));

COMMENT ON COLUMN public.group_conversations.audience IS
  'Who the group is for: family (a class''s guardians), student (a class''s students), or staff (an office thread with chosen staff). Class chats are keyed by (source_class_id, audience); staff groups have no source_class_id.';
