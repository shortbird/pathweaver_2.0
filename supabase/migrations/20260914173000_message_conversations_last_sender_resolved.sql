-- Who spoke last, and "we are done here" -- stored on the thread.
--
-- The SIS inbox sorts threads into "Needs a reply" and "Answered" by who sent
-- the last message. Until now that was worked out at read time by matching
-- direct_messages.created_at against message_conversations.last_message_at,
-- and the two are written by two different now() calls about 90 ms apart
-- (send_message stamps the row, _update_conversation_metadata stamps the
-- thread). On 2026-09-14, 12 of iCreate's 32 school threads missed the match,
-- 9 of them threads the school had already answered, and every miss read as
-- "needs a reply". The office's queue said 22; it was 7. (Perch 7ee545c4.)
--
-- last_message_sender_id is that answer, written once on send and never
-- re-derived. Backfilled below from the latest non-deleted message per thread.
--
-- resolved_at_p1 / resolved_at_p2 are one participant saying "this thread is
-- handled" without sending a message -- the parent who asked in the admin's
-- personal inbox and was answered from the school's (Perch 5c858931). Per side
-- like unread_count_p1/p2, because the two ends of a thread are two people
-- with two queues. A thread is resolved while resolved_at >= last_message_at;
-- the next message from the other side reopens it by moving last_message_at
-- past it, so nothing has to remember to clear the flag.

ALTER TABLE public.message_conversations
    ADD COLUMN IF NOT EXISTS last_message_sender_id uuid,
    ADD COLUMN IF NOT EXISTS resolved_at_p1 timestamptz,
    ADD COLUMN IF NOT EXISTS resolved_at_p2 timestamptz;

UPDATE public.message_conversations c
   SET last_message_sender_id = m.sender_id
  FROM (
        SELECT DISTINCT ON (conversation_id) conversation_id, sender_id
          FROM public.direct_messages
         WHERE COALESCE(is_deleted, false) = false
         ORDER BY conversation_id, created_at DESC
       ) m
 WHERE m.conversation_id = c.id
   AND c.last_message_sender_id IS NULL;
