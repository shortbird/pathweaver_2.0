# Brevo Marketing Funnel — Plan & Build Checklist

**Created**: 2026-07-07 | **Owner**: Tanner | **Status**: Awaiting Brevo MCP token, then build

---

## 1. Where leads live today (audit, 2026-07-07)

| Pool | Table | Genuine leads | State |
|------|-------|--------------|-------|
| Free-class (ads → /classes modal) | `contact_submissions` (`contact_type='claim_free_class'`) | 8 distinct emails, latest today | All `status='new'`, zero converted to accounts |
| Demo requests | `contact_submissions` (`demo`) | 4 | All `new` |
| Family inquiries | `contact_submissions` (`families`) | 2 | All `new` |
| Sales | `contact_submissions` (`sales`) | 1 (April) | `new` |
| POE camp signups | `poe_signups` | 21 distinct **parent** emails | All 24 students are minors — market to parents only |
| April promo leads | `promo_interest` | 0 remaining | All 13 already created accounts — not leads anymore |

Notes:
- 16 of the 31 `contact_submissions` rows are internal test submissions (3 existing accounts, mostly superadmin). Exclude emails that match `users` when importing.
- Volume is ramping: 7 leads week of Jun 29, 3 more in the first 1.5 days of this week.
- **The broken link**: the confirmation email promises "I'll personally reply within 1 business day." No replies are being sent (every row is `status='new'`), and **zero lead emails have become accounts**. Capture works; follow-up doesn't exist. That's what this funnel fixes.

Export query for backfill (excludes test/internal emails):

```sql
SELECT DISTINCT ON (lower(email)) lower(email) AS email, contact_type, created_at::date AS lead_date
FROM contact_submissions cs
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(cs.email))
ORDER BY lower(email), created_at ASC;
-- POE parents:
SELECT DISTINCT lower(parent_email) AS email, 'poe_parent' AS lead_type, min(created_at)::date AS lead_date
FROM poe_signups WHERE parent_email IS NOT NULL GROUP BY 1;
```

---

## 2. The offer (from /classes landing page — copy must stay consistent)

- Real high school classes built around passion projects, student-voiced ("you")
- **First class free** — no credit card, no commitment; **$149/class after** (page updated from $50 on 2026-07-08); optional one-on-one teacher add-on
- Transcript issued through Optio Academy, WASC-accredited
- **App-first funnel**: primary CTA is the iOS/Android app (students can also create custom classes there); web is secondary
- Emails never mention the possibility of a school not accepting the transfer (page FAQ still has the Transfer Guarantee — deliberate, visitor-initiated context only)
- Signed **Dr. Bowman**
- Modal promise: *"We'll email you personally. No spam, no sharing your address."* → every funnel email must feel personal: plain style, live reply-to, modest cadence. No glossy blasts.

---

## 3. Funnel architecture

```
Ads → /classes → FreeClassModal → POST /api/contact → contact_submissions
                                        │
                                        ├─ (existing) SMTP confirmation "here's what's next"
                                        └─ (new) push contact to Brevo list "Free Class Leads"
                                                      │
                                        Brevo Automation: Free Class Nurture (6 emails / 14 days)
                                                      │
                （exit when CONVERTED=true）───────────┤
                                                      ▼
                        account created → Customers list → activation/first-class emails (phase 2)
                        no conversion   → monthly keep-warm newsletter
```

**Stages**
1. **Capture** (already live) — ad → landing page → email-only modal. PostHog `marketing_form_submitted` + Meta Pixel `Lead` already fire.
2. **Sync** — backfill existing leads once, then real-time push from the backend on every new submission (spec in §6).
3. **Nurture** — "Free Class Nurture" automation, 6 emails over 14 days (copy in `brevo_email_copy.md`). Email 1 doubles as the promised "personal reply," sent ~1 hour after signup.
4. **Convert** — goal action: create account + pick a class (reply-to-claim keeps ops manual for now, no code needed).
5. **Activate** (phase 2) — post-signup: started-no-tasks nudge, first-class-completed → $50 next-class email + referral ask.
6. **Keep warm** — monthly newsletter to all non-converted lists; quarterly re-permission pass.

**Segments / lists**
| Brevo list | Source | Sequence |
|------------|--------|----------|
| Free Class Leads | `claim_free_class` | 6-email nurture |
| Families | `families` | 3-email parent-voiced nurture (templates 8, 33, 34) — see §11 |
| General Interest Leads (#12) | `demo`, `general` (homepage "Get More Info" CTA) | 4-email parent-voiced nurture (templates 24–27) — see §10 |
| B2B Inquiries | `sales`, `academy` | No drip — Brevo CRM deal pipeline + personal template |
| POE Parents | `poe_signups.parent_email` | One post-camp email (fall classes) + newsletter |
| Customers | any registrant (lead or organic) | Suppressed from nurture |
| New Account Welcome (#13) | eligible self-registrations | 3-email welcome (templates 35–37) — see §11 |

> **Remap 2026-07-13**: `demo` was originally classed as B2B, but the actual homepage
> "Get More Info" submissions are almost all homeschool parents asking about their own
> kids (see §10 audit). `demo`/`general` now sync to #12; only `sales`/`academy` remain B2B.

**Contact attributes**: `LEAD_TYPE` (text), `LEAD_SOURCE` (text, e.g. `classes_lp`), `LEAD_DATE` (date), `CONVERTED` (boolean), `NOTES` (text), `ROLE` (text, set at registration: student/parent), `SIGNUP_DATE` (date, set at registration).

---

## 4. Brevo MCP setup (do once)

Official hosted server — no local install ([docs](https://developers.brevo.com/docs/mcp-protocol)).

1. In Brevo: **account dropdown → SMTP & API → API Keys** → generate a new key **with the MCP option checked**. Copy the token.
2. Register at user scope (done 2026-07-07; token lives in `~/.claude.json`, outside the repo):
   ```bash
   claude mcp add -s user --transport http brevo "https://mcp.brevo.com/v1/brevo/mcp" \
     --header "Authorization: Bearer <MCP token>"
   ```
   Note: the `${BREVO_MCP_TOKEN}`-in-`.mcp.json` pattern does not work for freshly added env vars — macOS VSCode snapshots the shell environment at app launch, so the expansion comes up empty until VSCode fully restarts. User scope with the literal token avoids that and skips the project-server approval prompt.
3. Restart Claude Code (extension only — no VSCode quit needed) so the tools load.
4. Also generate a **second, standard API key** named `backend-sync` — this one goes in `backend/.env` and Render env as `BREVO_API_KEY` for the Flask sync (§6). Never reuse the MCP token in the backend.

---

## 5. Brevo account build checklist (Claude does A–E via MCP; F–G are dashboard-only)

- [x] **A. Sender + domain auth** — sender `Optio <tanner@optioeducation.com>` (id 1) was already active. Domain `optioeducation.com` added to Brevo 2026-07-07 (provider: GoDaddy). **DNS records still pending** (add at DNS host, then re-verify in Brevo → Senders & Domains):
  | Type | Host | Value | Status |
  |------|------|-------|--------|
  | CNAME | `brevo1._domainkey` | `b1.optioeducation-com.dkim.brevo.com` | pending |
  | CNAME | `brevo2._domainkey` | `b2.optioeducation-com.dkim.brevo.com` | pending |
  | TXT | `@` | `brevo-code:a4bf8c62fc8ae0974176a3ae464d9994` | pending |
  | TXT | `_dmarc` | (existing record) | already valid |
- [x] **B. Footer** — templates carry "Optio · Unsubscribe" only; the account-profile address is Tanner's home address and is deliberately NOT rendered in emails (removed 2026-07-07). CAN-SPAM expects a physical postal address in commercial email — a PO box / virtual business address is the durable fix; re-add to footers once one exists.
- [x] **C. Attributes + lists** — attributes `LEAD_TYPE`, `LEAD_SOURCE`, `LEAD_DATE`, `CONVERTED`, `NOTES` created. Folder "Optio Marketing" (id 3); lists: Free Class Leads **#4**, Families **#5**, B2B Inquiries **#6**, POE Parents **#7**, Customers **#8**.
- [x] **D. Backfill import** — 35 contacts imported 2026-07-07 (8 free-class, 2 families, 5 B2B, 20 POE parents; internal/test emails excluded).
- [x] **E. Templates** — created (inactive, nothing sent): Nurture 1–6 = template ids **1–6**, Catch-up = **7**, Families welcome = **8**, POE parents = **9**.
- [ ] **F. Automation "Free Class Nurture"** (Brevo automation builder is UI-only): trigger = contact added to *Free Class Leads* (#4), existing list members excluded; send templates 1–6 with delays 1h / d2 / d4 / d7 / d10 / d14; exit rule = **contact is added to list *Customers* (#8)** (Brevo's exit rules are list/event-based, not attribute-based). Fallback if list-exit isn't offered: an If/Else condition step on `CONVERTED is true` before each send. The backend conversion hook therefore does all three: add to Customers, remove from Free Class Leads, set `CONVERTED=true`.
- [x] **G. Catch-up track for the 8 pre-automation free-class leads** — SENT 2026-07-07 18:42 MDT. They live in list **Catch-up Free Class Leads (Jul 2026) (#11)** and receive the nurture as scheduled campaigns (automations can't pick up pre-existing list members): catch-up (campaign 17, sent, 8 recipients), then N2–N6 (campaigns 18–22) queued for Jul 10 / 12 / 15 / 18 / 22 at 9am MDT. Conversions drop off automatically: `mark_converted` unlinks list #11, and scheduled campaigns resolve recipients at send time. To pull someone out manually, remove them from list #11. Still open: personal replies to the 4 demo leads (B2B template in the copy doc).

---

## 6. Ongoing sync (BUILT + tested end-to-end 2026-07-08)

`backend/services/brevo_service.py` (key via `Config.BREVO_API_KEY`; no-op with a warning when unset; every call fire-and-forget with 5s timeout):
- `sync_lead(email, contact_type, name)` — hooked in `routes/contact.py` after the DB insert. Maps contact_type → list (claim_free_class→#4 which **starts the nurture automation**, families/general→#5, demo/sales/academy→#6). Skips emails that already have accounts.
- `mark_converted(email)` — hooked in `routes/auth/registration.py` after account creation. Sets `CONVERTED=true`, moves the contact to *Customers* (#8) and off the lead lists; the automation's exit rule does the rest. 404 = wasn't a lead, normal.
- `sync_poe_parent(...)` — hooked in `routes/poe.py` after signup upsert; parent email only.

`BREVO_API_KEY` lives in `backend/.env` (local) and the prod backend Render env (set 2026-07-08). Verified locally: test lead → contact created in list #5 with attributes → mark_converted → moved to #8 with CONVERTED=true → test data deleted.

---

## 7. Guardrails (non-negotiable)

- **K-12 audience**: never sync these lists to ad platforms — no Brevo ads features, no lookalike audiences, no audience export. Email only. (Same policy that keeps PII out of the Meta Pixel.)
- **POE**: parent emails only; all 24 signups are minors. Never email the student addresses for marketing.
- **Keep the promise**: the modal says "no automated spam." Emails stay short, plain, personally signed, reply-to monitored, unsubscribe honest. If it wouldn't read as an email Tanner could have typed, rewrite it.
- **Copy rules**: "class" not "credit" in subjects/headlines ("credit" only where mechanically necessary, e.g. transcripts); never "earn a class"; company name is "Optio"; no emojis.
- Brevo free plan caps at 300 emails/day — fine at current volume; revisit if daily leads × 6 emails approaches the cap.

---

## 8. Docs articles for email links (live 2026-07-08, /docs is public, DB-driven)

Category: **High School Classes** (`/docs/high-school-classes`, position 4 on the docs landing page).

| Article URL (prepend https://www.optioeducation.com) | Suggested email |
|------------------------------------------------------|-----------------|
| `/docs/high-school-classes/how-high-school-classes-work` | Email 1, catch-up |
| `/docs/high-school-classes/creating-your-class` | Email 1, Email 6 |
| `/docs/high-school-classes/tasks-evidence-and-xp` | Email 2 |
| `/docs/high-school-classes/transcripts-and-accreditation` | Email 3 |
| `/docs/high-school-classes/teacher-review-and-earning-credit` | Email 4 |
| `/docs/high-school-classes/pricing-and-your-free-class` | Email 5 |
| `/docs/high-school-classes/for-parents-following-along` | Email 5, Families, POE |

Add UTMs when linking from emails. Articles are edited via the superadmin Docs admin (or ask Claude); content lives in `docs_articles`, not the repo.

## 9. Measurement

- UTM every link: `utm_source=brevo&utm_medium=email&utm_campaign=free_class_nurture&utm_content=e1…e6`.
- PostHog already captures `marketing_form_submitted` (lead) and registration; funnel = ad click → lead → account → class started → class completed.
- Brevo campaign stats (opens are unreliable post-Apple-MPP; judge by clicks and replies).
- Weekly review: leads in, catch-up/auto emails sent, replies, accounts created, classes claimed. `contact_submissions.status` should move `new → contacted → converted/closed` — update as part of the weekly pass so the table stays a truthful CRM.

## 10. General Interest Nurture (built 2026-07-13, awaiting automation activation)

Funnel for the homepage "Get More Info" CTA (contact types `demo`/`general`; confirmation email
subject "Thanks for Your Interest in Optio!"). Separate from the free-class and POE funnels.

**Audience audit (2026-07-13)**: 5 genuine `demo` leads, zero `general` (non-test). Four of five
read as homeschool/alt-ed parents (homeschooled daughter + microschool; HS student questions;
transferring credits / leaving traditional HS; community portfolio program), one org
(sailfuture.org). Hence parent-voiced nurture, not the B2B track they were originally mapped to.

**Built via MCP:**
- [x] List **General Interest Leads (#12)**, folder "Optio Marketing" (3)
- [x] Templates (inactive drafts, sender id 1, reply-to tanner@): **24** "The info you asked for" (~1h), **25** "They're probably already doing the work" (d3), **26** "Does it actually count?" (d6), **27** "Worth trying while it's free" (d10). Copy in `brevo_email_copy.md`; HTML in `brevo_email_html/24–27`.
- [x] Backend remap in `brevo_service.py`: `demo`/`general` → #12 (was B2B #6 / Families #5); `mark_converted` also unlinks #12. **Needs deploy to prod before new leads route to #12.**

**Dashboard-only (Tanner):**
- [ ] Automation "General Interest Nurture": trigger = contact added to list #12, exclude existing list members; send templates 24 (delay 1h) / 25 (day 3) / 26 (day 6) / 27 (day 10); exit rule = contact added to Customers (#8). Same pattern as Free Class Nurture.
- [ ] Decide on the 5 pre-automation demo leads sitting in B2B #6 (they will NOT be picked up by the automation, and two asked specific questions months ago). Recommended: short personal replies (Amber's lead is from 2026-07-13, so a normal reply is still timely), or a catch-up campaign to a "Catch-up General Interest" list mirroring the free-class approach. Move the parent-type leads out of #6 either way; sailfuture.org stays B2B.

**UTMs**: `utm_source=brevo&utm_medium=email&utm_campaign=general_interest_nurture&utm_content=e1…e4`.

## 11. Families Nurture + New Account Welcome (built 2026-07-14, awaiting automation activation)

### Families Nurture
Closes the capture-without-follow-up gap on `/for-families` (leads landed in list #5 with no
automation; template 8 sat inactive since 2026-07-07).

- [x] Templates (inactive drafts, sender 1, reply-to tanner@): **8** "Your questions about Optio, answered directly" (~1h, pre-existing), **33** "What Optio looks like day to day" (day 4), **34** "The first class is free" (day 8). Copy in `brevo_email_copy.md`; HTML in `brevo_email_html/08, 33, 34`.
- [ ] Automation "Families Nurture" (dashboard-only): trigger = contact added to list #5, exclude existing list members; send 8 (delay 1h) / 33 (day 4) / 34 (day 8); exit rule = contact added to Customers (#8).
- [ ] Decide on the 3 contacts already sitting in #5 (automations skip pre-existing members): short personal replies or a manual send of template 8.

**UTMs**: `utm_campaign=families_welcome&utm_content=e1…e3`.

### New Account Welcome
Onboarding funnel for organic registrations, which previously created no Brevo contact at all
(only ex-leads reached Brevo via `mark_converted`).

- [x] List **New Account Welcome (#13)**, folder "Optio Marketing" (3) — the automation trigger list. Deliberately separate from Customers (#8): `mark_converted` also adds ineligible registrants (org users, under-13) to #8 to exit their nurtures, and those must not get welcome emails.
- [x] Attributes `ROLE` (text), `SIGNUP_DATE` (date).
- [x] Backend `sync_new_account(email, first, last, role)` in `brevo_service.py`, hooked in `routes/auth/registration.py`. Eligibility gate: platform self-signups only (no `organization_id`), role `student`/`parent` (observers excluded), not `requires_parental_consent` (under-13). Eligible → Customers #8 + New Account Welcome #13 + unlink lead lists + `CONVERTED=true`, `ROLE`, `SIGNUP_DATE`; ineligible → `mark_converted` only. Preserves `LEAD_*` provenance on ex-leads. **Needs deploy to prod.**
- [x] Templates (inactive drafts, sender 1, reply-to tanner@): **35** "You're in. Here's how to start." (~1h), **36** "One task at a time" (day 3), **37** "The transcript part" (day 7). HTML in `brevo_email_html/35–37`.
- [ ] Automation "New Account Welcome" (dashboard-only): trigger = contact added to list #13, exclude existing list members; send 35 (delay 1h) / 36 (day 3) / 37 (day 7); no exit rule (it's onboarding, not conversion).
- [ ] No backfill: existing users are intentionally NOT imported into #13 (they'd get welcome emails meant for day-one accounts) or #8 (nothing sends there today; revisit if a customer newsletter needs suppression-by-list).

**UTMs**: `utm_campaign=new_account_welcome&utm_content=e1…e3`.

### Related cleanup (same change set)
Dead promo-capture code deleted: v1 `pages/HomePage.jsx` (old unrouted homepage), `pages/PromoStudentPage.jsx`, `components/landing/*`, backend `routes/promo.py` (`POST /api/promo/interest`). The `promo_interest` table keeps its historical rows. The `philosophy` contact type still stores to `contact_submissions` but doesn't sync to Brevo — accepted, low priority (no live page submits it heavily; revisit if `/philosophy` lead volume appears).
