# The Treehouse — Testing Guide

**Servers are running locally:**
- Web (v1): http://localhost:3000
- Backend API: http://localhost:5001

**Test data created in production DB (Phase 0):**
| Thing | Value |
|-------|-------|
| Org | "The Treehouse", slug `treehouse`, id `b657016b-876f-4146-98e0-92988008a803` |
| Facilitator | Jennie Jones — `thetreehouse.alc@gmail.com` (now org_admin + advisor) |
| Test student | "Robin" (dependent of Jennie), enrolled in "Space Explorer (5-7)" with 2 tasks |
| Cohorts | "Littles (5-7)", "Bigs (8-13)" |
| Quests | Jennie's 16 quests re-homed under the org; the 9 "Path/badge" quests are public-in-org |
| Kiosk demo token | `thk_treehouse_demo_2026` |

> Note on logins: org members keep normal email/password login. You (superadmin,
> tannerbowman@gmail.com) can **masquerade** as Jennie from Admin → Users to see her
> facilitator view, since you don't have her password.

---

## 1. The kiosk (easiest way to see the student experience)

This needs no password — it's the shared-device flow.

1. Open http://localhost:3000/treehouse-kiosk
2. Enter the device code: **`thk_treehouse_demo_2026`** → "Set up device"
3. You'll see a photo grid with **Robin**. Tap Robin.
4. You're now logged in as Robin and land on the **young-learner home**:
   - Greeting + the "Keep going" card (Robin's next task: *Visit the Drawing Area*)
   - Four big buttons: My Quests / Find a Quest / Showcase / School Jobs
   - **I Need Help** and **I'm Proud of This!** buttons
5. Tap **I'm Proud of This!** → toast confirms; this notifies Jennie (verify in step 3 below).
6. Tap **Find a Quest** → visual category browse (Creative Expression, STEM, Wellness,
   Communication, Civics) populated from Jennie's quests, with age chips.

To exit Robin: log out, or open the kiosk page and "Forget this device".

## 2. Student home / browse (also reachable as any Treehouse student)

The `/treehouse` tab appears in the sidebar for Treehouse members. As Robin (via kiosk)
the sidebar shows **The Treehouse**. `/treehouse/browse` is the category browse.

## 3. Facilitator dashboard

Masquerade as **Jennie** (Admin → Users → find `thetreehouse.alc@gmail.com` → Masquerade),
or visit `/treehouse/facilitator` directly as superadmin.

- **The Treehouse** tab appears in the sidebar → "Open Facilitator Dashboard".
- **Signals tab**: shows Robin's "I'm proud" signal (and any "help" signals). Click **Done** to resolve.
- **Pins tab**: completed Treehouse quests appear as "ready to create"; select + **Mark created**.
- **Showcase tab**: create a showcase event with **title / theme / date / suggested project ideas**
  (one idea per line). Each event row has a **"View roster"** button (right side) that expands to
  show the presenter count, a category breakdown, and each student + project title. A sample event
  **"Summer Showcase"** already exists with 4 project ideas and Robin on the roster ("My Bean Plant Diary").
- **Balances tab**: lists every student with their 🪙 spendable-XP balance and a +/- field to
  **manually adjust** it (Apply).
- **Kiosk tab**: generate a new device token (shown once) to set up another device.

Verify the notification: Jennie has a `treehouse_proud` notification (bell icon) titled
"Robin is proud of their work". (Already confirmed in the DB during build.)

**Where is "View roster"?** Facilitator Dashboard → **Showcase** tab → the *Summer Showcase* row →
**View roster** button on the right of that row → it expands inline beneath the event.

## 4. AI age-appropriate tasks (Phase 2.7)

This fixes the "6-year-old got 'Light Refraction' tasks" problem.
- As a Treehouse student in the **Littles (5-7)** cohort, start a new quest and generate tasks
  (the normal personalization flow). The backend auto-derives `age_band` from the cohort and the
  AI now produces simple, hands-on, quick-win tasks with early-reader language.
- Compare against generating for an 8-13 / non-Treehouse user (unchanged behavior).

## 5. Bounty cohort restriction (Phase 2.6)

- Create a bounty: **School Jobs → Create**. A **"Limit to cohort"** dropdown now appears
  (populated from the org's cohorts) — pick "Bigs (8-13)".
- A "Littles" student won't see it; a "Bigs" student (and the poster/superadmin) will.

## 6. Student extras (recently completed)

- **Coin balance**: the student home shows a 🪙 badge (spendable-XP from School Jobs) next to the
  greeting. Adjust it from the facilitator **Balances** tab and refresh to see it change.
- **Productive waiting**: tap **I Need Help** on the student home → an encouraging panel offers
  "work on another task / find a quest / do a School Job / work on my showcase" while help is coming.
- **Showcase ideas**: the student **Showcase** page shows the suggested project ideas (💡) from the
  event and a countdown; "I want to show my project!" joins the roster.

---

## Evidence-optional completion (Phase 2.2) — how to verify

The gate is in [completion.py](../../backend/routes/tasks/completion.py#L106): a Treehouse
student may complete a task **without** submitting evidence (facilitator documents later). XP is
still awarded; the completion row stores null evidence; facilitators get a `treehouse_task_completed`
(or `_quest_completed`) notification.

**Important environment caveat:** the existing task-completion endpoint reads via the Supabase
**user-client (RLS)** path, and this project's Supabase JWT setup rejects the backend's minted
HS256 session tokens on that path (`PGRST301: No suitable key or wrong key type`). That affects
**any minted-token session — kiosk, masquerade, acting-as — not the Treehouse gate**. Per the
project's own architecture ([[project_postgrest_rpc_not_used]] — "all data goes through the backend
with service_role"), data access is meant to use the admin client; this completion endpoint's
`get_user_client()` RLS read predates that and fails locally for minted sessions.

Result: the evidence-optional gate is implemented and code-verified, and is reached immediately
after the (pre-existing) repo read. To see it pass live you need either (a) the completion endpoint
switched to the admin client for the owning student (small follow-up, consistent with the
documented architecture), or (b) a real Supabase-issued student session. I did not change the
shared completion auth path because that's a systemic decision beyond this feature.

---

## Two pre-existing bugs found + fixed (unrelated to The Treehouse, but they blocked completion)

1. **`middleware/idempotency.py`** had two methods named `_get_redis` — Python kept only the
   3-arg one, so `IdempotencyCache.get()` crashed (`_get_redis() missing 2 required positional
   arguments`) on **every** idempotent POST (enroll, complete, etc.). Renamed the reader to
   `_get_from_redis`.
2. **`repositories/base_repository.py`** — `BaseRepository.__init__` didn't accept the `client=`
   kwarg, but `completion.py` (and CLAUDE.md's documented pattern) call `TaskRepository(client=...)`,
   raising `unexpected keyword argument 'client'`. Made the base accept an optional injected client
   (backward compatible: omitting it preserves the lazy-derivation behavior).

Both are worth reviewing/keeping regardless of The Treehouse.

---

## Restarting the servers

Backend (single-process, no reloader — restart after any backend edit):
```bash
cd /Users/optio/pathweaver_2.0/backend
lsof -ti:5001 | xargs kill -9 2>/dev/null
nohup ../venv/bin/python3 app.py > /tmp/treehouse_backend.log 2>&1 &
```
Frontend: already on :3000 (`npm run dev` in `frontend/`). Logs: `/tmp/treehouse_frontend.log`.

## Undoing Phase 0 (if needed)
Org/account/quest changes are reversible: set Jennie back to `role='student'`, `organization_id=NULL`;
set her quests' `organization_id=NULL`; delete the `treehouse` org, cohorts, test student "Robin",
and `treehouse_*` rows. The schema migration is `supabase/migrations/20260610_create_treehouse_program.sql`.
