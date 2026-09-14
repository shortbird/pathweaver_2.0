-- bug_reports becomes the platform's ticket tracker.
--
-- Until 2026-09-14 Optio's own reports lived in two places: the mobile app's
-- shake-to-report rows here, and everything school staff filed through the
-- Perch widget on the web (perch.shortbird.dev, a separate app with its own
-- database). Detaching from Perch means one table has to be able to hold what
-- Perch held -- a title, a type, a priority, which org it came from, and where
-- it came from -- and be readable by superadmin in the admin console and by
-- Claude Code over the Supabase MCP.
--
-- Extending the table rather than adding a second one: the mobile sender is
-- already pointed here and 357 rows of history sit here. Two ticket piles is
-- the thing being fixed.
--
-- Every new column has a default, so the mobile POST (message + steps +
-- diagnostics) keeps working unchanged; the route derives title and type
-- from what it is given.

alter table public.bug_reports
  add column if not exists title text,
  add column if not exists type text not null default 'bug',
  add column if not exists priority text not null default 'normal',
  add column if not exists source text not null default 'mobile',
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists resolution text,
  add column if not exists updated_at timestamptz not null default now();

-- Every row so far came from the mobile shake sheet or the old beta FAB on the
-- web (platform 'web' / 'web-sis'). Say which, so the new source column is true
-- for history as well as for what arrives next.
update public.bug_reports set source = 'web' where platform in ('web', 'web-sis') and source = 'mobile';

-- The old web FAB recorded its intent in extra.report_type (bug / idea /
-- confusion) and the org in extra.organization_id. Lift both into columns.
update public.bug_reports
   set type = case extra->>'report_type'
                when 'idea' then 'feature'
                when 'confusion' then 'question'
                else 'bug' end
 where extra ? 'report_type' and type = 'bug';

update public.bug_reports b
   set organization_id = (b.extra->>'organization_id')::uuid
 where b.organization_id is null
   and b.extra->>'organization_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and exists (select 1 from public.organizations o where o.id = (b.extra->>'organization_id')::uuid);

-- A title for every existing row: the first line of the message, trimmed.
update public.bug_reports
   set title = coalesce(
         nullif(left(trim(regexp_replace(split_part(trim(message), E'\n', 1), '^\[[^\]]*\]\s*', '')), 120), ''),
         nullif(left(trim(message), 120), ''),
         'Untitled report')
 where title is null;

alter table public.bug_reports
  alter column title set not null;

alter table public.bug_reports
  drop constraint if exists bug_reports_status_check,
  drop constraint if exists bug_reports_type_check,
  drop constraint if exists bug_reports_priority_check,
  drop constraint if exists bug_reports_source_check;

alter table public.bug_reports
  add constraint bug_reports_status_check
    check (status in ('new', 'triaged', 'fixing', 'resolved', 'wont_fix')),
  add constraint bug_reports_type_check
    check (type in ('bug', 'feature', 'question', 'tweak')),
  add constraint bug_reports_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add constraint bug_reports_source_check
    check (source in ('mobile', 'web', 'perch', 'hq'));

-- The same trigger function every other updated_at column in this schema uses.
drop trigger if exists update_bug_reports_updated_at on public.bug_reports;
create trigger update_bug_reports_updated_at
  before update on public.bug_reports
  for each row execute function public.update_updated_at_column();

create index if not exists idx_bug_reports_org_created
  on public.bug_reports (organization_id, created_at desc);

comment on table public.bug_reports is
  'Platform ticket tracker: bugs, feature requests and questions from staff (web reporter), '
  'students and families (mobile shake sheet), and the tickets imported from Perch on 2026-09-14. '
  'Superadmin reads it in /admin/tickets; Claude Code reads and resolves rows over the Supabase MCP. '
  'RLS is deny-all on purpose: only the Flask backend (service role) touches it.';
comment on column public.bug_reports.source is
  'mobile = shake sheet, web = the in-app reporter on the web platform / SIS console, perch = imported from Perch, hq = filed by hand.';
comment on column public.bug_reports.resolution is
  'What was done, written when the ticket is resolved or declined. The reporter never sees it; it is for whoever reads the ticket next.';
