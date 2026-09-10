-- One school identity per org, not two.
--
-- Two accounts have been sending as "the school":
--
--   organizations.inbox_user_id  -- school_inbox_service, a platform user with
--                                   organization_id NULL. The School Inbox in
--                                   the SIS console lists threads for THIS one.
--   school-<org_id>@optio-internal-placeholder.local
--                                -- sis_service._org_messaging_sender, an
--                                   org_managed user with org_role org_admin.
--                                   The People page's "Message family" and
--                                   "Message student" buttons sent from THIS one.
--
-- Nothing reads the second. Every reply a parent wrote to a family message
-- landed in an account no page opens and nobody is notified about: the office
-- saw silence, the family saw no answer, and neither side had any way to tell.
--
-- This moves those threads onto inbox_user_id and neutralises the placeholder.
-- The service change (sis_service._school_sender) stops new ones being created.
--
-- Idempotent: re-running finds no placeholder still carrying an organization_id
-- and does nothing. Safe to run before or after the code deploy -- ahead of it,
-- new sends keep using the placeholder and a second run picks them up.
--
-- The placeholder users are NOT deleted. message_conversations and
-- direct_messages cascade on users.id, so a delete would erase the history this
-- migration exists to rescue if any rewrite were missed. They are stripped of
-- their org instead, which is what takes them out of every roster, count and
-- recipient list. backend/scripts/purge_org_messaging_accounts.py can remove
-- them later, once the counts below have been verified in production.

DO $$
DECLARE
  ph        record;
  conv      record;
  inbox_id  uuid;
  lo        uuid;
  hi        uuid;
  existing  uuid;
BEGIN
  FOR ph IN
    SELECT u.id            AS placeholder_id,
           o.id            AS org_id,
           o.name          AS org_name,
           o.inbox_user_id AS current_inbox_id
    FROM public.users u
    JOIN public.organizations o
      ON u.email = 'school-' || o.id || '@optio-internal-placeholder.local'
    WHERE u.organization_id IS NOT NULL
  LOOP
    inbox_id := ph.current_inbox_id;

    -- No school-inbox account yet: promote the placeholder into the role
    -- instead of merging, so its existing threads stay exactly where they are
    -- and simply become readable.
    IF inbox_id IS NULL THEN
      UPDATE public.organizations
         SET inbox_user_id = ph.placeholder_id
       WHERE id = ph.org_id
         AND inbox_user_id IS NULL;

      -- Re-read: a concurrent lazy create may have won the column.
      SELECT o.inbox_user_id INTO inbox_id
        FROM public.organizations o WHERE o.id = ph.org_id;
    END IF;

    IF inbox_id = ph.placeholder_id THEN
      -- Promoted. Reshape to the school-inbox account shape:
      -- organization_id NULL (never appears in a roster or a count),
      -- role 'observer' (the least-entangled valid role -- observers surface
      -- only through observer_student_links, which this account never has),
      -- email NULL (cannot collide, cannot be signed in to).
      UPDATE public.users
         SET organization_id = NULL,
             org_role        = NULL,
             org_roles       = NULL,
             role            = 'observer',
             email           = NULL,
             display_name    = COALESCE(NULLIF(display_name, ''), ph.org_name),
             first_name      = COALESCE(NULLIF(first_name, ''), ph.org_name),
             last_name       = ''
       WHERE id = ph.placeholder_id;

      CONTINUE;
    END IF;

    -- Both accounts exist: move the placeholder's threads onto the inbox one.
    FOR conv IN
      SELECT c.id,
             CASE WHEN c.participant_1_id = ph.placeholder_id
                  THEN c.participant_2_id ELSE c.participant_1_id END AS member_id
      FROM public.message_conversations c
      WHERE ph.placeholder_id IN (c.participant_1_id, c.participant_2_id)
    LOOP
      -- A conversation between the placeholder and the inbox account itself is
      -- nonsense (nobody could have created one), but repointing it would make
      -- both participants the same user. Skip rather than corrupt.
      CONTINUE WHEN conv.member_id = inbox_id;

      lo := LEAST(inbox_id, conv.member_id);
      hi := GREATEST(inbox_id, conv.member_id);

      SELECT id INTO existing
        FROM public.message_conversations
       WHERE participant_1_id = lo AND participant_2_id = hi
         AND id <> conv.id
       LIMIT 1;

      IF existing IS NOT NULL THEN
        -- The member already has a real thread with the school. Fold the
        -- placeholder's messages into it -- one conversation per pair is what
        -- unique_conversation_participants enforces, and it is also what the
        -- family should see: one thread with their school, not two.
        UPDATE public.direct_messages
           SET conversation_id = existing
         WHERE conversation_id = conv.id;
        DELETE FROM public.message_conversations WHERE id = conv.id;
      ELSE
        UPDATE public.message_conversations
           SET participant_1_id = lo,
               participant_2_id = hi,
               updated_at       = now()
         WHERE id = conv.id;
        existing := conv.id;
      END IF;

      -- Rewrite the messages themselves. sent_by_user_id stays NULL on these:
      -- the placeholder never recorded which staff member wrote them, and a
      -- guess would be worse than the honest blank the inbox renders as the
      -- school's own name.
      UPDATE public.direct_messages
         SET sender_id = inbox_id
       WHERE conversation_id = existing AND sender_id = ph.placeholder_id;
      UPDATE public.direct_messages
         SET recipient_id = inbox_id
       WHERE conversation_id = existing AND recipient_id = ph.placeholder_id;

      -- Rebuild the denormalised thread metadata from the messages now in it.
      -- Left alone, the folded thread keeps the surviving row's old preview and
      -- unread counts, and the office sees a thread whose last line is not its
      -- last message.
      UPDATE public.message_conversations c
         SET last_message_at      = m.last_at,
             last_message_preview = LEFT(COALESCE(m.last_body, ''), 100),
             unread_count_p1      = m.unread_p1,
             unread_count_p2      = m.unread_p2,
             updated_at           = now()
        FROM (
          SELECT MAX(created_at) AS last_at,
                 (SELECT message_content FROM public.direct_messages
                   WHERE conversation_id = existing
                   ORDER BY created_at DESC LIMIT 1) AS last_body,
                 COUNT(*) FILTER (
                   WHERE read_at IS NULL AND recipient_id = lo) AS unread_p1,
                 COUNT(*) FILTER (
                   WHERE read_at IS NULL AND recipient_id = hi) AS unread_p2
          FROM public.direct_messages
          WHERE conversation_id = existing
        ) m
       WHERE c.id = existing;
    END LOOP;

    -- Anything left pointing at the placeholder outside a conversation we
    -- walked (there should be none; belt and braces before it loses its org).
    UPDATE public.direct_messages SET sender_id    = inbox_id
      WHERE sender_id    = ph.placeholder_id;
    UPDATE public.direct_messages SET recipient_id = inbox_id
      WHERE recipient_id = ph.placeholder_id;

    -- Neutralise: out of every roster, count, recipient list and contact list.
    UPDATE public.users
       SET organization_id = NULL,
           org_role        = NULL,
           org_roles       = NULL,
           role            = 'observer',
           email           = NULL,
           display_name    = ph.org_name || ' (retired school account)'
     WHERE id = ph.placeholder_id;

  END LOOP;
END $$;

-- ── Verification (run these after applying; all four must hold) ──────────────
--
--   -- 1. No placeholder is parked inside an org any more.
--   SELECT count(*) FROM users
--    WHERE email LIKE 'school-%@optio-internal-placeholder.local'
--      AND organization_id IS NOT NULL;                      -- expect 0
--
--   -- 2. No thread still has a placeholder as a participant.
--   SELECT count(*) FROM message_conversations c
--     JOIN users u ON u.id IN (c.participant_1_id, c.participant_2_id)
--    WHERE u.display_name LIKE '%(retired school account)';  -- expect 0
--
--   -- 3. No message still points at one.
--   SELECT count(*) FROM direct_messages d
--     JOIN users u ON u.id IN (d.sender_id, d.recipient_id)
--    WHERE u.display_name LIKE '%(retired school account)';  -- expect 0
--
--   -- 4. Message count is conserved. Capture before, compare after.
--   SELECT count(*) FROM direct_messages;
--
-- And the functional proof, which is the one that matters: People -> a family
-- -> Message, reply as that parent from the learning app, and confirm the reply
-- appears in the SIS console under Messaging -> the school inbox.
