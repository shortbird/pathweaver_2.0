-- Move the People page's dead-letter threads into the School Inbox.
--
-- Two accounts spoke for the school. organizations.inbox_user_id backs the
-- School Inbox page (/inbox), which the front office reads and answers. The
-- other, school-{org_id}@optio-internal-placeholder.local, was created by
-- sis_service._org_messaging_sender and sent every "Message family" /
-- "Message student" from the People page. No page in the product ever listed
-- that account's threads, so a parent who replied to one of those messages
-- wrote into a conversation nobody could open. 15 threads and 29 messages at
-- iCreate were sitting there when this was found.
--
-- The code now sends as the inbox account. This moves the history to match, so
-- those parents' replies become readable instead of staying lost.
--
-- What it does, per placeholder account:
--   * Skips the org entirely if inbox_user_id is NULL (nothing to move it to).
--     Logged as a warning rather than guessed at.
--   * Re-points every direct_message the placeholder sent or received onto the
--     inbox account, and clears sent_by_user_id on the sends. sent_by is "which
--     colleague wrote this"; nobody recorded it at the time, and inventing one
--     is worse than the inbox showing the message with no name.
--   * Where the member ALREADY has an inbox thread, the placeholder thread's
--     messages move into it and the empty shell is deleted -- there is a unique
--     index on (participant_1_id, participant_2_id), so two threads for one pair
--     cannot coexist anyway. Otherwise the thread keeps its id and swaps the
--     participant.
--   * Re-sorts participant_1_id/participant_2_id: the whole DM stack assumes the
--     smaller UUID is participant_1 (DirectMessageService.get_or_create_
--     conversation), and unread_count_p1/p2 are read positionally.
--   * Recomputes last_message_at, last_message_preview and both unread counts
--     from the messages themselves, since a merge changes all four.
--   * Detaches the placeholder account from the org roster (organization_id
--     NULL, role observer, no org roles) -- the shape school_inbox_service uses
--     for its own account, and what lets the two email-based "skip the school
--     account" filters in list_org_staff and staff_training._guardians go away.
--     Without this the account would surface on the Staff page as a fake admin.
--
-- The placeholder USERS are left in place on purpose. Their rows still carry
-- the sender identity of already-delivered mail and notifications; deleting
-- them is a separate decision.
--
-- Idempotent: after one run nothing references a placeholder account, so the
-- loop finds no work.

DO $$
DECLARE
  ph            RECORD;
  convo         RECORD;
  member_id     uuid;
  target_id     uuid;
  keep_id       uuid;
  p1            uuid;
  p2            uuid;
  moved_threads int := 0;
  merged        int := 0;
  skipped_orgs  int := 0;
BEGIN
  FOR ph IN
    SELECT u.id AS placeholder_id, u.organization_id AS org_id, o.inbox_user_id
    FROM public.users u
    JOIN public.organizations o ON o.id = u.organization_id
    WHERE u.email LIKE 'school-%@optio-internal-placeholder.local'
      -- Already migrated: detaching from the org is the last thing done to a
      -- placeholder, so an org-less one has nothing left to move. Without this
      -- a second run reports it as "no inbox_user_id" and warns about an org it
      -- already finished.
      AND u.organization_id IS NOT NULL
  LOOP
    IF ph.inbox_user_id IS NULL THEN
      skipped_orgs := skipped_orgs + 1;
      RAISE WARNING 'school inbox move: org % has no inbox_user_id; leaving placeholder % alone',
        ph.org_id, ph.placeholder_id;
      CONTINUE;
    END IF;

    FOR convo IN
      SELECT c.id,
             CASE WHEN c.participant_1_id = ph.placeholder_id
                  THEN c.participant_2_id ELSE c.participant_1_id END AS other_id
      FROM public.message_conversations c
      WHERE c.participant_1_id = ph.placeholder_id
         OR c.participant_2_id = ph.placeholder_id
    LOOP
      member_id := convo.other_id;

      -- A thread between the placeholder and the inbox account itself would
      -- collapse to a self-conversation. Neither exists, but the delete is the
      -- only sane outcome if one ever did.
      IF member_id = ph.inbox_user_id THEN
        DELETE FROM public.direct_messages WHERE conversation_id = convo.id;
        DELETE FROM public.message_conversations WHERE id = convo.id;
        CONTINUE;
      END IF;

      p1 := LEAST(ph.inbox_user_id, member_id);
      p2 := GREATEST(ph.inbox_user_id, member_id);

      SELECT c.id INTO target_id
      FROM public.message_conversations c
      WHERE c.participant_1_id = p1 AND c.participant_2_id = p2 AND c.id <> convo.id
      LIMIT 1;

      IF target_id IS NOT NULL THEN
        UPDATE public.direct_messages SET conversation_id = target_id
        WHERE conversation_id = convo.id;
        UPDATE public.message_email_relays SET conversation_id = target_id
        WHERE conversation_id = convo.id;
        DELETE FROM public.message_conversations WHERE id = convo.id;
        keep_id := target_id;
        merged := merged + 1;
      ELSE
        UPDATE public.message_conversations
        SET participant_1_id = p1,
            participant_2_id = p2,
            updated_at = now()
        WHERE id = convo.id;
        keep_id := convo.id;
      END IF;

      UPDATE public.direct_messages
      SET sender_id = ph.inbox_user_id,
          sent_by_user_id = NULL
      WHERE conversation_id = keep_id AND sender_id = ph.placeholder_id;

      UPDATE public.direct_messages
      SET recipient_id = ph.inbox_user_id
      WHERE conversation_id = keep_id AND recipient_id = ph.placeholder_id;

      -- Recompute the denormalized thread header from the messages. A merged
      -- thread has a new newest message, and the unread counters are positional
      -- so a participant swap silently attaches them to the wrong person.
      UPDATE public.message_conversations c
      SET last_message_at = (
            SELECT max(d.created_at) FROM public.direct_messages d
            WHERE d.conversation_id = keep_id),
          last_message_preview = COALESCE((
            SELECT left(COALESCE(NULLIF(d.message_content, ''), 'Sent an attachment'), 100)
            FROM public.direct_messages d
            WHERE d.conversation_id = keep_id
            ORDER BY d.created_at DESC LIMIT 1), ''),
          -- No is_deleted filter: get_unread_count and get_user_conversations
          -- both recount this way, and a cache that disagrees with the badge is
          -- the drift this column already suffers from.
          unread_count_p1 = (
            SELECT count(*) FROM public.direct_messages d
            WHERE d.conversation_id = keep_id AND d.read_at IS NULL
              AND d.recipient_id = c.participant_1_id),
          unread_count_p2 = (
            SELECT count(*) FROM public.direct_messages d
            WHERE d.conversation_id = keep_id AND d.read_at IS NULL
              AND d.recipient_id = c.participant_2_id),
          updated_at = now()
      WHERE c.id = keep_id;

      moved_threads := moved_threads + 1;
    END LOOP;

    -- Stop the placeholder pretending to be an org admin on the Staff page.
    -- role/org_role/organization_id move together: org_managed_requires_org
    -- demands an org_role AND an organization_id, direct_role_no_org_role
    -- demands org_role be NULL for anything else.
    UPDATE public.users
    SET organization_id = NULL,
        role = 'observer',
        org_role = NULL,
        org_roles = NULL
    WHERE id = ph.placeholder_id
      AND organization_id IS NOT NULL;
  END LOOP;

  RAISE NOTICE 'school inbox move: % thread(s) moved (% merged into an existing inbox thread), % org(s) skipped for a NULL inbox_user_id',
    moved_threads, merged, skipped_orgs;
END $$;
