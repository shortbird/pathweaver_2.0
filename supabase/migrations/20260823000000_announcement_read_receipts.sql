-- Read receipts + nudges for family messages (announcements).
--
-- The Messaging page shows what was sent but not whether anyone saw it. Three
-- pieces make "12 of 40 read - remind the rest" possible:
--
--   announcement_recipients  Snapshot of who a send was aimed at, written at
--                            publish time. Recipient resolution is dynamic
--                            (parents come via their children), so without a
--                            snapshot "who was this sent to" cannot be answered
--                            later, and a nudge would re-resolve to a different
--                            set than the original send.
--   announcement_reads       Already existed (028_create_announcement_reads /
--                            baseline) with zero code references; the mark-read
--                            endpoint now writes it.
--   announcements.last_nudged_at  Rate-limits reminders to one per 24h.
--
-- announcement_read_stats aggregates both per announcement so the staff list
-- gets its counts in one query instead of two per row. recipient_count is NULL
-- (not 0) for messages sent before the snapshot existed - the UI shows those as
-- "no data" rather than "nobody was sent this".

CREATE TABLE IF NOT EXISTS public.announcement_recipients (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

-- Deny-all RLS: reads and writes go through the Flask backend on the service
-- role, the same as announcement_reads and the SIS tables.
ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS last_nudged_at timestamptz;

-- security_invoker so the view never becomes a side door around the base
-- tables' RLS; the backend reads it on the service role, which bypasses RLS.
CREATE OR REPLACE VIEW public.announcement_read_stats
WITH (security_invoker = true) AS
SELECT
  a.id AS announcement_id,
  NULLIF((SELECT count(*) FROM public.announcement_recipients r
          WHERE r.announcement_id = a.id), 0) AS recipient_count,
  (SELECT count(*) FROM public.announcement_reads rd
   WHERE rd.announcement_id = a.id) AS read_count
FROM public.announcements a;

COMMENT ON TABLE public.announcement_recipients IS
  'Who an announcement was sent to, snapshotted at publish time. Read stats '
  'and nudges diff this against announcement_reads.';
COMMENT ON VIEW public.announcement_read_stats IS
  'Per-announcement recipient/read counts for the staff Messaging list. '
  'recipient_count is NULL for sends that predate the snapshot.';

-- Default Data API grants land automatically (20260527); pull the client-facing
-- ones back since this data is backend-only.
REVOKE ALL ON public.announcement_recipients FROM anon, authenticated;
REVOKE ALL ON public.announcement_read_stats FROM anon, authenticated;
