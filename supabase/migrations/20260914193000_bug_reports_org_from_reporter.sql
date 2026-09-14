-- The reporter's org, for the tickets filed before the tracker stamped it.
--
-- 20260914170000 lifted organization_id out of extra.organization_id, which
-- only the old web FAB ever wrote. The mobile shake sheet never sent an org,
-- so every mobile report from an org member -- 18 rows from 8 reporters,
-- iCreate and Optio Academy -- showed "No org" in /admin/tickets the moment
-- it opened (Lynette Evans, an iCreate parent, was the one noticed).
--
-- The route now stamps organization_id from the reporter's user row at
-- create time. This does the same for the rows that predate it. users keeps
-- no history, so a row gets the org the reporter is in now, not the one they
-- were in when they filed; for every row today those are the same org.

update public.bug_reports b
   set organization_id = u.organization_id
  from public.users u
 where u.id = b.user_id
   and b.organization_id is null
   and u.organization_id is not null;
