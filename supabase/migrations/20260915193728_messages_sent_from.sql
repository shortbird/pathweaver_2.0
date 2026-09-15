-- Which surface a message was sent from (2026-09-16).
--
-- Every DM and group message now records the client that sent it: the mobile
-- app, the web app, the SIS console, or an email reply relayed into the
-- thread. Only a superadmin ever sees the value; messaging_extras_service
-- strips it from every other viewer's response, the same way it hides the
-- original text of a deleted message from everyone but a superadmin.
--
-- The vocabulary is the one bug_reports.source already uses for mobile and
-- web, so a support conversation can say "mobile" and mean one thing.
--
-- Nullable, no default: a row written before this column existed is unknown,
-- and pretending it was the web would be a lie in the one place this is read.
-- The backend stamps the value on insert from the request (utils/client_platform.py).

alter table public.direct_messages
  add column if not exists sent_from text
    check (sent_from in ('mobile', 'web', 'sis', 'email'));

alter table public.group_messages
  add column if not exists sent_from text
    check (sent_from in ('mobile', 'web', 'sis', 'email'));

comment on column public.direct_messages.sent_from is
  'Client that sent it: mobile (app), web (web app), sis (SIS console), email (relayed reply). Superadmin-only in the API; null before 2026-09-16.';

comment on column public.group_messages.sent_from is
  'Client that sent it: mobile (app), web (web app), sis (SIS console), email (relayed reply). Superadmin-only in the API; null before 2026-09-16.';
