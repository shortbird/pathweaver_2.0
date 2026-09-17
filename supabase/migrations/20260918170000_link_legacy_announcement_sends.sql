-- Link the sends that predate announcements.source_announcement_id to the
-- board posts they came from.
--
-- A Community Hub post made with "also notify" writes a second row in
-- announcements (the send: recipients snapshot, notification, email). Since
-- 2026-08-27 that row carries the board post's id in source_announcement_id,
-- and the family feed uses it to show the notice once. Four iCreate sends
-- from before the column exist as pairs the feed could only match by title
-- and calendar day -- a heuristic both clients carried, and the phone still
-- got wrong on an edited title (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md,
-- D1). With the link in the data, no reader needs the heuristic (M1,
-- docs/sis/CONSOLIDATION_PLAN.md).
--
-- Only a send with exactly one same-title, same-day board post in its org is
-- linked; idempotent.

update public.announcements a
set source_announcement_id = m.board_id
from (
  select a.id as send_id, min(b.id::text)::uuid as board_id
  from public.announcements a
  join public.sis_announcements b
    on b.organization_id = a.organization_id
   and lower(trim(b.title)) = lower(trim(a.title))
   and (a.created_at at time zone 'UTC')::date = (b.created_at at time zone 'UTC')::date
  where a.source_announcement_id is null
  group by a.id
  having count(*) = 1
) m
where a.id = m.send_id
  and a.source_announcement_id is null;
