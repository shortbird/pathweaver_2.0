-- Empty conversations stop pretending to be threads.
--
-- get_or_create_conversation stamped last_message_at = now() when it created a
-- row, and it was called on READ -- so merely opening someone's contact card
-- wrote a conversation that every client then read as live traffic. The web
-- list treats any row with a last_message_at as an active thread and sorts by
-- it, so a conversation nobody had written in surfaced at the TOP of Messages
-- with a fresh timestamp and an italic "Start a conversation".
--
-- Reported 2026-09-03: an admin saw what looked like a new message from a
-- parent who had only opened the Optio Support contact and never sent anything.
-- 137 of the 230 rows in production were these phantoms.
--
-- The service no longer creates a row on read, and stamps NULL when it does
-- create one (direct_message_service.py). This clears the rows already written.
-- Only conversations with no messages at all are touched; a thread whose
-- messages were all soft-deleted deliberately keeps its slot in the list
-- (messaging_extras_service._recompute_conversation_preview).

UPDATE message_conversations c
SET last_message_at = NULL
WHERE c.last_message_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM direct_messages m WHERE m.conversation_id = c.id
  );
