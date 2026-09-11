-- One pair, one row, one order.
--
-- message_conversations has UNIQUE (participant_1_id, participant_2_id) and
-- nothing else. That constraint treats (a,b) and (b,a) as different pairs, so
-- the same two people can hold two threads and the unique index is satisfied
-- by both.
--
-- Every lookup in this codebase assumes they cannot. The pattern is always
-- "sort the two ids, then read the row at (lo, hi)" --
-- direct_message_service.get_or_create_conversation does exactly that before
-- inserting, and so does
-- 20260910190000_merge_org_messaging_sender_into_school_inbox. A row stored in
-- the reverse order is invisible to that lookup, which does not read as a bug:
-- it reads as "no thread yet". The caller then creates or repoints a second
-- one, and the member ends up with two threads against the same person, each
-- holding half the history.
--
-- WHERE A REVERSE ROW COMES FROM. Not from the application: both insert sites
-- sort first (direct_message_service.py, scripts/seed_opened_demo.py). It comes
-- from the Data API. The INSERT policy on this table is
--
--     WITH CHECK (participant_1_id = auth.uid())
--
-- which requires the *caller* to be participant 1 regardless of how the two
-- ids compare -- so any row written through PostgREST rather than through Flask
-- is reverse-ordered whenever the caller's id sorts second, which is half the
-- time. Nothing in web/ or mobile/ inserts conversations that way today; rows
-- predating the sort in get_or_create_conversation can still exist.
--
-- This normalises what is there and then makes the class unrepresentable.
--
-- Idempotent: a second run finds no unsorted row and does nothing, and the
-- constraint is added only if it is absent.
--
-- Ordering note: the sort is on the uuid type, which Postgres compares as 16
-- raw bytes. Python's `user_id < target_id` in get_or_create_conversation
-- compares the canonical lowercase hex strings, and for that spelling the two
-- orderings agree -- '0'-'9' precede 'a'-'f' in ASCII exactly as their nibbles
-- do, and the dashes sit at fixed positions. The agreement is why the CHECK
-- below does not reject rows the service writes.

DO $$
DECLARE
  rev      record;
  keeper   uuid;
  lo       uuid;
  hi       uuid;
  n_self   integer;
  swapped  integer := 0;
  folded   integer := 0;
BEGIN
  -- A conversation whose two participants are the SAME user violates the
  -- constraint below just as a reverse row does, and it is deliberately not
  -- repaired here. A reverse row is a bookkeeping mistake with an obvious
  -- correct form; a self-row is somebody's data, and this migration cannot
  -- tell a corrupt row from a thread a user made as a scratchpad through the
  -- Data API. Deleting on a guess is the one outcome that cannot be undone,
  -- so it stops and says so instead. Production held 0 of these when this was
  -- written, so in practice this never fires.
  SELECT count(*) INTO n_self
    FROM public.message_conversations
   WHERE participant_1_id = participant_2_id;

  IF n_self > 0 THEN
    RAISE EXCEPTION
      'message_conversations holds % row(s) whose two participants are the same '
      'user, which CHECK (participant_1_id < participant_2_id) forbids. Decide '
      'what each one is before re-running: '
      'SELECT id, participant_1_id FROM message_conversations '
      'WHERE participant_1_id = participant_2_id;', n_self;
  END IF;

  FOR rev IN
    SELECT id, participant_1_id AS p1, participant_2_id AS p2
      FROM public.message_conversations
     WHERE participant_1_id > participant_2_id
     ORDER BY id
  LOOP
    lo := rev.p2;
    hi := rev.p1;

    -- Is the same pair already stored the right way round?
    SELECT id INTO keeper
      FROM public.message_conversations
     WHERE participant_1_id = lo AND participant_2_id = hi
       AND id <> rev.id
     LIMIT 1;

    IF keeper IS NULL THEN
      -- No collision: turn the row around in place.
      --
      -- unread_count_p1/p2 are POSITIONAL -- they mean "unread by whoever
      -- participant_1_id is" -- so they have to travel with the swap. Every
      -- SET expression in one UPDATE reads the pre-update row, so the two
      -- counts genuinely exchange rather than both taking the same value.
      --
      -- last_message_at and last_message_preview are not positional and stay
      -- as they are. So does created_at: turning a row around is not a new
      -- conversation.
      UPDATE public.message_conversations
         SET participant_1_id = lo,
             participant_2_id = hi,
             unread_count_p1  = unread_count_p2,
             unread_count_p2  = unread_count_p1,
             updated_at       = now()
       WHERE id = rev.id;

      swapped := swapped + 1;
    ELSE
      -- Both orders exist, which is the two-threads-one-pair case this
      -- migration is named for. Fold the reverse row into the sorted one and
      -- rebuild the metadata, the same shape
      -- 20260910190000_merge_org_messaging_sender_into_school_inbox uses.
      --
      -- The sorted row is the keeper because every reader already finds it;
      -- folding the other way would move the thread out from under anyone
      -- holding its id.
      UPDATE public.direct_messages
         SET conversation_id = keeper
       WHERE conversation_id = rev.id;

      DELETE FROM public.message_conversations WHERE id = rev.id;

      -- Rebuild from the messages now in the keeper. Left alone it keeps its
      -- own old preview and counts, and the thread's last line is not its last
      -- message.
      UPDATE public.message_conversations c
         SET last_message_at      = m.last_at,
             last_message_preview = LEFT(COALESCE(m.last_body, ''), 100),
             unread_count_p1      = m.unread_p1,
             unread_count_p2      = m.unread_p2,
             updated_at           = now()
        FROM (
          SELECT MAX(created_at) AS last_at,
                 (SELECT message_content FROM public.direct_messages
                   WHERE conversation_id = keeper
                   ORDER BY created_at DESC LIMIT 1) AS last_body,
                 COUNT(*) FILTER (
                   WHERE read_at IS NULL AND recipient_id = lo) AS unread_p1,
                 COUNT(*) FILTER (
                   WHERE read_at IS NULL AND recipient_id = hi) AS unread_p2
          FROM public.direct_messages
          WHERE conversation_id = keeper
        ) m
       WHERE c.id = keeper;

      folded := folded + 1;
    END IF;
  END LOOP;

  IF swapped > 0 OR folded > 0 THEN
    RAISE NOTICE 'message_conversations: % row(s) turned around, % folded into '
                 'an existing thread.', swapped, folded;
  END IF;
END $$;

-- Make the class unrepresentable. Strict `<` also forbids the self-row the
-- block above refuses to guess about, so both shapes are closed at once.
--
-- Validated immediately rather than NOT VALID: the table is small (259 rows in
-- production), everything above has just been normalised, and a constraint that
-- is never validated is a comment with extra steps.
--
-- This does narrow the Data API INSERT policy in practice. A PostgREST insert
-- still has to satisfy `participant_1_id = auth.uid()`, and now also has to
-- have the caller sort first, so half of them will fail. That path has no
-- caller in web/ or mobile/ -- conversations are created by Flask on the
-- service-role client -- and a policy that can only write a row every reader
-- is blind to was not usable to begin with.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.message_conversations'::regclass
       AND conname  = 'message_conversations_participants_sorted'
  ) THEN
    ALTER TABLE public.message_conversations
      ADD CONSTRAINT message_conversations_participants_sorted
      CHECK (participant_1_id < participant_2_id);
  END IF;
END $$;

-- ── Verification (run these after applying; all four must hold) ──────────────
--
--   -- 1. No conversation is stored in the reverse order.
--   SELECT count(*) FROM message_conversations
--    WHERE participant_1_id > participant_2_id;              -- expect 0
--
--   -- 2. No conversation has the same user on both sides.
--   SELECT count(*) FROM message_conversations
--    WHERE participant_1_id = participant_2_id;              -- expect 0
--
--   -- 3. The constraint is present and validated.
--   SELECT conname, convalidated FROM pg_constraint
--    WHERE conrelid = 'public.message_conversations'::regclass
--      AND conname  = 'message_conversations_participants_sorted';
--                                              -- expect 1 row, convalidated t
--
--   -- 4. Message count is conserved -- folding moves messages between
--   --    conversations and must never drop one. Capture before, compare after.
--   SELECT count(*) FROM direct_messages;
--
--   -- And the shape that says the fold worked rather than merely ran: no
--   -- message points at a conversation that no longer exists.
--   SELECT count(*) FROM direct_messages d
--    WHERE d.conversation_id IS NOT NULL
--      AND NOT EXISTS (SELECT 1 FROM message_conversations c
--                       WHERE c.id = d.conversation_id);     -- expect 0
