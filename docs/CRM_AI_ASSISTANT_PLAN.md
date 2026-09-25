# CRM AI assistant

Decided 2026-09-25 with Tanner. Builds on [CRM_REPLACEMENT_PLAN.md](CRM_REPLACEMENT_PLAN.md).

The goal is that no lead, family, partner or microschool client drops off
because nobody followed up. The CRM watches every conversation, remembers what
was promised, and each morning hands Tanner a short list of who to contact
today, with a draft ready for each.

## The hard rule

**The AI drafts. It never sends.** An email leaves only when Tanner clicks Send
in the web app. Concretely:

- The send route is `@require_superadmin` behind a cookie session and CSRF. No
  cron-secret path reaches it, and no service function sends as a side effect.
- Drafts have no "send later" or auto-send state. `crm_drafts.status` is
  `draft | sending | sent | discarded`, and only the send route writes `sending` or `sent`.
- The digest email links to the drafts; it does not contain a send action.
- A test asserts no cron route or job imports the send function.

## Contacts

A contact is an email address. Anything the CRM knows about a person keys on
the lowercased email, with `lead_id` / `user_id` resolved for links. The two
populations stay where they are:

| Who | Source |
|---|---|
| Leads | `crm_leads` |
| Families, partners, org staff | `users` (never `student` or `observer` rows, never anyone under 13) |
| Microschool clients (priority) | org admins of the orgs listed in `crm_settings.client_org_ids` |

Client orgs at launch: the SIS orgs (iCreate, Arete, Gryffin, Horizon) and the
web-platform orgs (Williamsburg, Treehouse, OnFire, Apogee, Disruption).
Hearthwood is not included. The list is a toggle in the console.

## Gmail

tanner@optioeducation.com connects once through an Internal Google OAuth app
(scopes `gmail.readonly`, `gmail.send`). The refresh token lives in
`crm_mail_accounts` (RLS on, no policies, grants revoked), Fernet-encrypted
under `ORG_SECRETS_ENCRYPTION_KEY` when that key is set.

- **Sync** (cron, every run): Gmail `history.list` from the stored
  `historyId`; first connect backfills 90 days. A message is stored in
  `crm_messages` only when a known contact is on it. Everything else is ignored
  and never written. A stale `historyId` resyncs the last 7 days.
- **Send**: the route above. Replies thread with `threadId`, `In-Reply-To` and
  `References`. The sent message lands in Tanner's Sent folder like any other.

## Phases

### Phase 1: foundation
- Migration: `crm_mail_accounts`, `crm_messages`, `crm_tasks`, `crm_drafts`,
  `crm_contact_profiles`, `crm_digests`.
- Gmail connect/disconnect/status, callback with single-use `state`.
- Gmail sync job and cron wiring.
- Email in the lead and person timelines.
- Compose and reply from a contact's file: a draft you edit, then Send.
- To-dos: add, complete, dismiss, with due dates, on each contact's file.
- Client-org toggle.

### Phase 2: the assistant
- **Extraction.** When a note, Google Doc or email arrives, Gemini reads the
  contact's recent history and returns structured facts (next steps with dates,
  decision-makers, timeline, objections, stage) plus suggested to-dos. Suggested
  to-dos show as "AI suggested" until confirmed.
- **Cadence.** Each contact has a tier: client (14 days), hot (3), warm (14),
  cold (45). The AI proposes the tier, Tanner can override it.
- **Reply pauses the funnel.** An inbound email from a lead in an active funnel
  exits the membership (`exit_reason = 'replied'`) and puts them in the digest.
- **Daily digest.** 7am Mountain. Ranked items, each with one reason line and a
  draft. Clients who are due for contact rank first, then overdue commitments,
  replies waiting on Tanner, engagement spikes, and cadence lapses. It is
  emailed and shown on a new **Today** tab. Each item can be sent (opens the
  draft), snoozed or dismissed.
- **Drafts.** Written from the full timeline and a short style guide in
  `crm_settings.writing_style`. Always editable, never sent automatically.

### Phase 3: signals
- **Engagement spikes.** Repeat opens or clicks from `crm_email_events` after a
  quiet stretch.
- **Meeting prep.** The calendar poll already sees bookings; the morning of a
  call, the digest carries a brief: who they are, last conversation, open
  promises, what to ask.
- **Won/lost reasons.** On conversion or going cold, the AI proposes a reason;
  a monthly roll-up shows patterns.
- **New-thread leads.** An inbound thread from an unknown address that reads
  like a prospect is suggested as a lead (suggested, not created).

## AI

All calls go through `BaseAIService` with `Config.GEMINI_MODEL`. Prompts get
only the contact's own history. Output is JSON validated before anything is
written.
