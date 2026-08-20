# Custom Lead-Nurture CRM (replace Brevo, send via SendGrid)

## Status (2026-08-20)

- **PR1 — DONE and LIVE.** The contact_type CHECK constraint was widened on the prod DB
  via MCP (verified with an insert round-trip; test row cleaned up). Migration file:
  supabase/migrations/20260820120000_contact_type_allow_course_purchase.sql. Catalog
  course-interest leads are no longer being lost.
- **PR2 — ON MAIN (owner's call, 2026-08-20).** SendGrid swap in email_service
  (_send_via_sendgrid transport keeping the internal payload shape, new
  categories/headers/custom_args kwargs, send_crm_email, Config keys, conftest
  outbound-email guard repointed, ENV_KEYS_REFERENCE updated, new
  tests/test_email_sendgrid_payload.py). Scoped email suites pass 44/44; the full
  backend suite runs in CI on this push — the prod deploy only fires if it's green.
  **⚠ From the moment this deploys, ALL outbound email fail-logs until
  SENDGRID_API_KEY is set on the Render backend services (prod + dev).** Setting the
  key (SendGrid → Settings → API Keys, Mail Send permission) restores sending; domain
  auth should follow immediately for deliverability.
- **PR3–PR7 — not started.**
- **User prerequisites still open**: SendGrid account (Essentials) + domain auth CNAMEs
  at GoDaddy; postal address for the CAN-SPAM footer; GCP service account + calendar
  share for the booking poll.

## Context

Optio uses Brevo for automated lead-nurture email. The automations can only be edited in
Brevo's dashboard — Claude Code can't manage them, the user pays for unused features, and
control is coarse. We replace it with an in-house CRM: leads from marketing-page forms,
DB-backed funnels and email content, a superadmin console showing the full funnel and each
lead's progress, conversion triggers (account signup, class start, video-chat booking) that
auto-exit leads, and SendGrid as the delivery pipe for ALL platform email.

User decisions (2026-08-20): SendGrid for everything (drop Brevo entirely) · DB-backed
content · migrate Brevo nurture content AND in-flight contacts with funnel position ·
video-chat trigger via Google Calendar polling · fix the live course_purchase bug.

## Key codebase facts (from 3-agent audit, spot-verified)

- Brevo is the sole sender. One choke point: `_send_via_brevo` in
  [email_service.py:274](backend/services/email_service.py) (~40 transactional senders,
  bool-return, never raises). Marketing list sync: `backend/services/brevo_service.py`
  (sync_lead / sync_poe_parent / sync_new_account / sync_course_student / mark_converted;
  9 hardcoded list IDs; `_is_under_13` COPPA gate fails closed).
- All marketing forms POST `/api/contact` ([contact.py](backend/routes/contact.py), 5/hr/IP)
  → insert `contact_submissions` (status='new', never updated, no UI reads it) → if no
  users row: `sync_lead()` → type-specific confirmation email carrying `brevo_funnel=`
  for the [COPY] banner. POE: `/api/public/poe/enroll` → `poe_signups` → sync_poe_parent.
- 🔴 LIVE BUG: contact.py accepts `course_purchase` but the DB CHECK constraint omits it —
  every catalog/course interest submission 500s and is lost (0 rows in prod).
- Conversion signals today = account creation only, at 3 inline fire-and-forget sites:
  registration.py:464-470, google_oauth.py:63-97+:582 (Apple shares the same
  accept-tos path), organization_management.py:1665. No event bus (webhook_service.py is
  broken — constructor TypeError — do not build on it).
- "Start a class" hooks (new): quest/enrollment.py after enroll_user() ~:571 (self-serve
  free class, quest_type='class') and course_enrollment_service.py ~:129-131 (covers all
  6 enrollment call sites).
- "Schedule a video chat" is unobservable: two hardcoded calendar.app.google links in
  email copy; bookings land only in Tanner's personal Google Calendar.
- Cron: Render service runs `backend/jobs/cron_dispatch.py` every 10 min → POSTs internal
  endpoints with X-Cron-Secret (utils/cron_auth.is_valid_cron_secret). Add jobs there.
- No email tracking, no unsubscribe (crm_generic.html's `{% if unsubscribe_url %}` is never
  fed), no List-Unsubscribe header, no postal address → CAN-SPAM gap to fix.
- Nurture HTML lives in docs/marketing/brevo_email_html/ (23 files) + brevo_email_copy.md;
  templates are inline-styled HTML fragments (TipTap would shred them — verified);
  they reference img.mailinblue.com images that die when Brevo closes.
- Brevo cannot export per-contact automation position via API — approximate from
  LEAD_DATE, biased to skip (never double-send).
- Admin house patterns: superadmin tab = entry in `superadminTabs` + lazy Route in
  [AdminPage.jsx](frontend/src/pages/AdminPage.jsx); list views clone AdminUsers.jsx
  (debounce/filters/server pagination/plain axios, no react-query); guards:
  tests/unit/test_no_duplicate_routes.py + backend/tests/test_client_api_paths_exist.py
  (every frontend '/api/...' literal must be a real Flask rule).

## Design

### Data model — 2 migrations in supabase/migrations/

**Migration 1 (ships alone, urgent):** widen `contact_submissions_contact_type_check` to
include `course_purchase`.

**Migration 2 — crm tables** (all: RLS enabled, zero policies = service-role only; admin
client with `# admin client justified:` comments; count via count='exact' /
fetch_all_rows per house rule 10):

- `crm_funnels`: id, key (unique: free_class_nurture, families_nurture,
  general_interest_nurture, new_account_welcome, course_student_onboarding), name,
  description, status (active|paused|archived, default paused), funnel_type
  (nurture|onboarding — nurture exits on conversion, onboarding doesn't),
  entry_types text[] (contact_types feeding this funnel; service enforces one funnel per
  type, 409 on conflict), timestamps.
- `crm_funnel_steps`: id, funnel_id, step_order, name, subject, html_body, text_body
  (null → derived at send), delay_hours (FROM ENTRY), is_active, updated_at/by.
  UNIQUE(funnel_id, step_order). **Email content lives here — no separate templates
  table** (one row = one email in one funnel; kills the template-vs-copy divergence that
  plagued Brevo).
- `crm_leads`: id, email unique CHECK lower, first/last/phone, lead_type, lead_source,
  status (active|converted|unsubscribed|suppressed), converted_at, conversion_event,
  user_id null FK, unsubscribe_token uuid unique default, notes, timestamps.
- `crm_funnel_memberships`: id, lead_id, funnel_id, entered_at, status
  (active|completed|exited), exit_reason, exited_at, last_step_sent int, last_sent_at.
  **UNIQUE INDEX ON (lead_id) WHERE status='active'** = the one-funnel-per-lead rule.
- `crm_sends`: id, membership_id, lead_id, funnel_id, step_id, email, subject, status
  (sending|sent|failed), provider_message_id, error, created_at, sent_at.
  **UNIQUE(membership_id, step_id)** = idempotency claim.
- `crm_email_events`: sg_event_id unique (webhook dedupe), send_id, lead_id, email,
  event_type (delivered|open|click|bounce|dropped|spamreport|unsubscribe), payload jsonb,
  occurred_at.
- `crm_suppressions`: email unique lower, reason (unsubscribe|hard_bounce|spam_report|
  manual), source, created_at. Marketing sends only — transactional mail never gated.
- `crm_events`: lead timeline (lead_id, event_type, detail jsonb, created_at).
- `crm_calendar_bookings`: gcal_event_id + attendee_email UNIQUE (poll idempotency),
  event_start, matched_lead_id.
- `crm_settings`: key/value jsonb — send_window ({tz: America/Denver, 9→19}),
  postal_address, calendar_sync_token, sweep_batch_cap (50).

### Funnel engine (backend/services/)

New: `crm_service.py` (module-level functions mirroring brevo_service's surface so call
sites stay one-liners: sync_lead, sync_poe_parent, sync_new_account, sync_course_student,
mark_converted, record_class_start; same return-value contract feeding the [COPY]
banner), `crm_funnel_engine.py` (sweep), `crm_calendar_service.py`; repositories
`crm_lead_repository.py` / `crm_funnel_repository.py` / `crm_send_repository.py`
(BaseRepository subclasses, exemplar bounty_repository.py).

sync_lead semantics (parity with today + funnel plan §10): claim_free_class→
free_class_nurture; families→families_nurture; demo/general/course_purchase→
general_interest_nurture; sales/academy/philosophy→lead row only (B2B stays personal).
Upsert lead by lowercased email; write crm_events. Skip entry if suppressed, converted/
unsubscribed, active membership exists (first funnel wins; unique index backstops races),
or lead ever completed this same funnel. Re-entry into a *different* funnel allowed.
COPPA `_is_under_13` copied verbatim (fails closed) gating sync_course_student.

Sweep — `POST /api/crm/internal/funnel-sweep`, dispatched EVERY cron run (10 min), auth
X-Cron-Secret or superadmin (copy the dual gate from sis/attendance.py:119-138):
1. Outside send window (9:00–19:00 America/Denver) → no-op. (This is the 3am answer.)
2. Due = lowest active step with step_order > last_step_sent AND entered_at+delay_hours
   ≤ now AND (last_sent_at null or >20h ago) — throttle drains outage backlogs 1/day.
3. Pre-send: lead active, not suppressed; safety net — if a users row now exists for the
   email, exit as converted_signup (catches any missed hook).
4. Claim: insert crm_sends(status='sending'); unique violation → skip. Stale 'sending'
   >1h → 'failed', never retried (at-most-once for marketing mail).
5. Render Jinja (first_name, unsubscribe_url) + marketing footer (unsubscribe link +
   postal address); send via email_service.send_crm_email(); update send row/membership;
   last step ⇒ completed. Cap 50 sends/run.

mark_converted: lead→converted, exits active *nurture* membership with reason, writes
event. Onboarding memberships unaffected. Manual move (admin): set membership funnel +
last_step_sent = target-1, entered_at preserved; already-past delays drain via throttle.

Calendar poll — `POST /api/crm/internal/calendar-poll`, hourly slot in cron_dispatch:
GCP service account (calendar shared "See all event details" with SA email), key
base64-JSON in Config.GOOGLE_CALENDAR_SA_KEY_B64 + GOOGLE_CALENDAR_ID; events.list with
stored syncToken (410 → full resync, timeMin now-7d) via plain requests + google-auth.
Match attendee emails (lowercased) to crm_leads → insert crm_calendar_bookings →
mark_converted(video_chat_scheduled). Cancelled bookings keep the conversion (intent was
proven). Existing calendar.app.google links untouched. **Dev-verify early that
appointment-schedule bookings expose the booker as attendee to the SA; fallback = owner
OAuth refresh token.**

### SendGrid cutover (email_service.py)

- Replace `_send_via_brevo` with `_send_via_sendgrid(payload) -> Optional[str]`
  (POST https://api.sendgrid.com/v3/mail/send, Bearer Config.SENDGRID_API_KEY, 202 =
  success, return X-Message-Id). Payload mapping in send_email: sender→from,
  to/cc/bcc→personalizations[0], text-content-BEFORE-html (SendGrid rejects otherwise),
  replyTo→reply_to, attachments→{filename, content, type, disposition} (pass mimetype
  through). New optional kwargs: categories (default ['transactional']), headers,
  custom_args. All ~40 senders unchanged.
- New `send_crm_email(...) -> Optional[str]`: forces support_copy=False, sets
  List-Unsubscribe + List-Unsubscribe-Post one-click headers, categories
  ['crm', funnel_key], custom_args {send_id, lead_id}.
- Rename `brevo_funnel=` kwarg → `crm_funnel=` (send_email, send_templated_email,
  _funnel_banner at :71-96/:110/:130-136) + the 4 passing call sites; names now come from
  crm_funnels.name. Atomic in one PR or the banner lies.
- Config keys (Config class only, house rule 9): SENDGRID_API_KEY,
  SENDGRID_WEBHOOK_PUBLIC_KEY, GOOGLE_CALENDAR_SA_KEY_B64, GOOGLE_CALENDAR_ID. Update
  ENV_KEYS_REFERENCE.md. (test_secret_exposure_guard already covers SENDGRID_API_KEY.)
- Event webhook `POST /api/crm/internal/sendgrid-events`: verify Ed25519 signature
  (reject unsigned), dedupe on sg_event_id, insert crm_email_events (correlate via
  custom_args.send_id); bounce/dropped/spamreport/unsubscribe → upsert crm_suppressions +
  exit membership + set lead status.
- Unsubscribe: GET /api/crm/unsubscribe?token= (minimal HTML confirm) + POST (RFC 8058
  one-click) → suppress + exit + status.

### Trigger wiring

Repoint 5 sites (import swap, gates preserved verbatim): contact.py:101, poe.py:219,
registration.py:464-470, google_oauth.py:63-97/:582 (rename helper _sync_oauth_signup_
to_crm), organization_management.py:1665. Add 2 class-start hooks (try/except
one-liners): quest/enrollment.py ~:578 when quest_type=='class' →
crm_service.record_class_start(user_id); course_enrollment_service.py ~:131 on
enrolled/reactivated.

### Admin console (frontend/src/pages/admin/crm/)

Mount: AdminPage.jsx — `{path:'crm', label:'CRM'}` first in superadminTabs + lazy
CrmConsole + `<Route path="crm/*">`. Superadmin gating free from App.jsx:663; active-tab
highlight free from the startsWith check (AdminPage.jsx:115).

Routes (nested paths for deep-linking): `/admin/crm/funnels` (overview),
`/funnels/new`, `/funnels/:funnelId` (editor), `/funnels/:funnelId/steps/:stepId`
(step/email editor), `/leads` (filters in query string), `/leads/:leadId`,
`/suppressions`. Tabs: Funnels | Leads | Suppressions.

Files: CrmConsole.jsx (GlassTabBar shell + Routes), crmApi.js (ALL endpoint literals in
one module), crmConstants.js, FunnelOverview.jsx + FunnelPipelineCard.jsx,
FunnelEditor.jsx, StepEditor.jsx, HtmlEmailEditor.jsx, LeadsList.jsx, LeadDetail.jsx,
LeadTimeline.jsx, MoveLeadModal.jsx, SuppressionList.jsx, __tests__/.

Screens:
1. **Funnel Overview** — one GET /overview: 4 summary tiles (active leads, sends 7d,
   conversions 30d, suppressed) + per-funnel pipeline cards: horizontal step strip
   (active-at-step count, sent/opened/clicked beneath — render "—" when tracking absent,
   drop-off connectors), exit tallies; every element click-through to filtered lead list.
   Pause/Resume via useConfirm. No chart lib.
2. **Leads** — AdminUsers.jsx clone: 500ms debounce, filters (funnel/step/status/source),
   server pagination 25/page, row → detail page. Detail: LeadTimeline (entry, sends with
   open/click/bounce states, conversion events, notes, status changes) + state card
   (step "3 of 6", next_send_at) + actions (Mark converted / Remove / Move via modal /
   Suppress / Add note) — all POSTs with `{}` bodies (CSRF rule).
3. **Funnel editor** — name/status/entry-type checkbox grid (409 + "steal" confirm on
   conflict), ordered step list (name, delay-hours "after entry", up/down reorder,
   add/remove), warning banner when leads are mid-funnel (removed steps: leads advance
   to next remaining — falls out of last_step_sent semantics).
4. **Step editor** ("easily edit emails") — raw-HTML monospace textarea + sandboxed
   iframe preview (srcDoc + sandbox=""; NOT TipTap — verified it would strip the inline
   styles of migrated Brevo HTML), variable chips ({{first_name}}, {{unsubscribe_url}};
   insert-at-cursor per MarkdownEditor.jsx:21-38), sample-value substitution in preview,
   "Send test to me" (accepts unsaved draft content; recipient = requesting superadmin
   only).
5. **Suppressions** — table + add/remove.

State: plain useState + shared axios api via crmApi.js thin functions (admin convention;
no react-query). Errors: toast; destructive: useConfirm.

### API contract (canonical — backend registers every path before/with UI merge)

Admin (require_superadmin from utils.auth.decorators; Blueprint 'admin_crm', url_prefix
/api/admin/crm; mutations audit-logged via admin_audit_service.log_action):
```
GET    /overview
GET    /funnels                      POST /funnels
GET    /funnels/<funnel_id>          PUT /funnels/<funnel_id>   DELETE (409 if active members)
POST   /funnels/<funnel_id>/status   {status: active|paused}
POST   /funnels/<funnel_id>/steps    (create step w/ content)
POST   /funnels/<funnel_id>/steps/reorder  {step_ids: [...]}
PUT    /steps/<step_id>              (subject/html/delay/name/is_active)
DELETE /steps/<step_id>              (409 if crm_sends reference → use is_active=false)
POST   /steps/<step_id>/test-send    {subject?, html_body?} (draft override allowed)
GET    /leads                        (search/funnel_id/step_id/status/source/sort/page)
POST   /leads                        (manual add)
GET    /leads/<lead_id>              (lead + full timeline)
POST   /leads/<lead_id>/convert | /exit | /move {funnel_id, step_order} | /notes {body}
GET    /suppressions                 POST /suppressions          DELETE /suppressions/<id>
POST   /sweep/run                    (manual sweep trigger)
```
Public/internal (Blueprint 'crm', url_prefix /api/crm): GET+POST /unsubscribe,
POST /internal/funnel-sweep, POST /internal/calendar-poll, POST /internal/sendgrid-events.

### Migration from Brevo

- `backend/scripts/seed_crm_funnels.py` — idempotent (upsert funnel.key + step_order);
  reads docs/marketing/brevo_email_html/*.html + hardcoded manifest from
  brevo_email_copy.md: free_class_nurture (01-06 + 49 as step 3b; 1h/48/96/120/168/240/
  336h), families_nurture (08/33/34; 1h/96/192h), general_interest_nurture (24-27;
  1h/48/96/144h), new_account_welcome (35-37; onboarding), course_student_onboarding
  (45-48; onboarding). Normalize `{{ unsubscribe }}` → `{{unsubscribe_url}}`. Rehost
  img.mailinblue.com images (frontend public assets) + rewrite URLs. Seed all paused.
- `backend/scripts/export_brevo_contacts.py` — paginated pull of lists 4-14 with
  attributes (LEAD_TYPE/LEAD_DATE/CONVERTED/names) + list membership → archived JSON.
- `backend/scripts/import_brevo_contacts.py` — position approximated:
  steps_elapsed = count(delay_hours < now − LEAD_DATE); entered_at = LEAD_DATE;
  last_step_sent = steps_elapsed (skips, never doubles). Mapping: #4+#11→
  free_class_nurture, #5→families, #12→general_interest, #6/#7→lead only,
  #8/CONVERTED→status converted (suppression memory), #13/#14→completed unless recent.

## Implementation order (develop-first; each verified locally before push)

- **PR1** — contact_submissions CHECK migration. Tiny, urgent, independent → prod fast.
- **PR2** — SendGrid transactional swap (_send_via_sendgrid, payload mapping, new kwargs,
  send_crm_email, Config keys, tests). No caller-visible change. Soak on dev.
- **PR3** — CRM core: migration 2, repositories, crm_service, crm_funnel_engine,
  routes/crm.py + routes/admin/crm.py + registration in routes/__init__.py, cron entries,
  seed script, unsubscribe, SendGrid webhook, backend tests.
- **PR4** — trigger repoint (5 sites) + brevo_funnel→crm_funnel rename + 2 class-start
  hooks + calendar service/poll + google-auth dep. PR3+PR4 reach prod as one push.
- **PR5** — admin console UI (build order: shell → step editor slice → funnel editor →
  overview → leads → suppressions; vitest per slice).
- **PR6** — export/import scripts + cutover execution.
- **PR7** — Brevo removal after 2-week soak: delete brevo_service.py, BREVO_* config,
  stale comments (class_credit_pdf_service.py:44, key_rotation.py:100), retire/rewrite
  brevo tests, cancel account (export archived first).

### Cutover runbook
1. Prereqs done (below) → 2. PR1 live → 3. PR2 dev-verified → main → 4. PR3+PR4 → main
(funnels paused; new leads land in crm_leads; Brevo gets nothing new) → 5. same day:
export → import → spot-check via Supabase MCP → 6. deactivate Brevo automations
(fence #1; fence #2 = imported last_step_sent skips received emails) → 7. activate
funnels via admin API; watch first sweeps (cron logs, crm_sends, [COPY] banners,
SendGrid Activity) → 8. T+2wk clean: PR7.

## Prerequisites (user tasks, before cutover)

1. **SendGrid account, Essentials plan** (free tier = 100/day, insufficient) + domain
   authentication for optioeducation.com (3 CNAMEs at GoDaddy) + link branding verified.
2. **Postal address for CAN-SPAM footer** (PO box / virtual address) → crm_settings.
   Nurture funnels must not activate without it.
3. **GCP service account** (Calendar API enabled) + share tannerbowman@gmail.com's
   calendar with the SA email ("See all event details").

## Verification

- Backend: new tests test_email_sendgrid_payload, test_crm_service (lowercasing,
  first-funnel-wins, no-repeat, re-entry, COPPA fails-closed ports), test_crm_funnel_
  engine (due math, 20h throttle, window no-op, claim uniqueness, stale-sending,
  users-row safety net), test_crm_unsubscribe, test_sendgrid_webhook (signature, dedupe,
  suppression), test_crm_calendar_poll (idempotency, 410 resync), test_crm_admin_routes
  (gate, 409s), test_email_crm_funnel_banner (rewrite). Existing guards
  (no_duplicate_routes, client_api_paths_exist, secret_exposure) must pass unmodified.
- Frontend: vitest per screen (vi.mock crmApi + toast; pin `{}`-body CSRF rule in
  LeadDetail action tests). Full suite once before merge (95% pass, 53% coverage floor).
- Local at localhost:3000: submit each of the 4 forms incl. /catalog (proves PR1) →
  lead+membership rows; manual sweep in/out of window; step test-send; register with a
  lead email → nurture exits + welcome enters; unsubscribe end-to-end; free-class enroll
  fires record_class_start; calendar poll against a real test booking (verifies the SA
  attendee-visibility assumption).

## Risks / accepted trade-offs

- At-most-once marketing sends (crash between claim and send drops that step). Accepted.
- Brevo position import approximates; may skip ≤1 email per in-flight lead. Accepted.
- Apple relay emails won't match lead emails; caught only by users-row safety net.
  Pre-existing gap.
- SA visibility of appointment-schedule attendees must be dev-verified (fallback: owner
  OAuth refresh token).
- New SendGrid account = cold sending reputation; expect a warm-up period.
- sales/academy/philosophy leads enter no funnel (B2B stays personal) — matches today;
  revisit later if wanted.
- iCreate registrations still bypass sync hooks (pre-existing, unchanged).
