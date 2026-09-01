-- Two chats per class instead of one chat plus a discussion board.
--
-- The class Messages tab now carries a parent chat (the existing adults-only
-- group, 2026-08-22) AND a student chat (teachers + enrolled students), and the
-- Discussion board is retired. `audience` tells the two groups of one class
-- apart; every existing class group is the adults' chat, so the default
-- backfills them as 'family'.
--
-- class_discussion_posts is deliberately left in place: it holds real
-- student-authored posts (~80 live rows as of 2026-08-31). Only the feature's
-- routes and UI are removed.

ALTER TABLE public.group_conversations
  ADD COLUMN audience text NOT NULL DEFAULT 'family'
  CONSTRAINT group_conversations_audience_check CHECK (audience IN ('family', 'student'));

-- One active group per (class, audience) — the sync's idempotency key.
CREATE UNIQUE INDEX uq_group_conversations_class_audience
  ON public.group_conversations (source_class_id, audience)
  WHERE source_class_id IS NOT NULL AND is_active = true;
