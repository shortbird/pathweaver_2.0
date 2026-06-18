# Treehouse Feedback — Tiers 1 & 2: Local Testing Guide

**Date:** 2026-06-18
**Scope:** Everything from [FEEDBACK_2026-06-18_PLAN.md](FEEDBACK_2026-06-18_PLAN.md) Tiers 1 & 2.
Nothing is committed — verify locally first, then we commit/push.

## Before you start
1. **Restart the backend** (local Flask is single-process, no auto-reload):
   stop it and relaunch so the new routes load. The DB migrations are already
   applied to prod Supabase (which local points at), so no DB steps needed.
2. Frontend (Vite) hot-reloads on save; just hard-refresh the tab.
3. Log in at http://localhost:3000.
   - **Facilitator/admin:** `thetreehouse.alc@gmail.com`
   - **Student:** a Treehouse student account (or use the kiosk).

Two cohorts already exist: **Littles (5-7)** — set to the simplified UI — and **Bigs (8-13)**.

---

## Tier 1

### A1 — Cohort scoping + management
- Open **The Treehouse → Facilitator Dashboard**. New **Cohorts** tab (admin only).
  - Assign a facilitator to a cohort; enroll/withdraw students; toggle "Simple
    (young-learner) UI" per cohort.
- On **Signals / Pins / Balances / Capture** tabs, use the **Cohort** dropdown
  (top) to filter to one cohort or "All students."
- As an **advisor** assigned to only one cohort, you should see only that
  cohort's students by default. (An advisor with no cohort sees everyone — by design.)
- Signal notifications now target the student's cohort facilitators (+ all admins).

### A2 — Add student from the dashboard
- Facilitator Dashboard header → **+ Add student** (admin only) opens the
  create-username flow (no parent/email needed). This is the right tool for
  bulk-onboarding students (the "Family tab" is the parent-only tool).

### F2 — Help / Proud inside a quest
- As a Treehouse student, open any quest → an **"I need help" / "I'm proud of
  this!"** bar shows at the top of the task area (and inside the littles finish
  sheet). Tapping notifies facilitators. Buttons don't show for facilitators.

### J1 — Edit a showcase
- Facilitator Dashboard → **Showcase** → **Edit** on any event → change
  title/theme/date/ideas → Save.

### J2 — Past showcases drop off
- Showcase tab has **Upcoming / Past** toggle; past-dated events move to "Past"
  so the default view stays current.

### K1 — Coins persist
- **Balances** tab → set a +/- amount on a student → Apply. The balance updates
  and **stays after refresh** (previously silently reverted for students with no
  pet — now a coin jar is created on first adjust).

### L1 — Hide public School Jobs
- **Organization → Settings → School Jobs → "Hide public School Jobs"** toggle.
  When on, Treehouse students only see org/cohort-posted jobs on the Bounty
  Board (the platform-wide public bounties are hidden).

---

## Tier 2

### G1 — Facilitator phone capture (use your phone browser)
- Facilitator Dashboard → **Capture** tab. Take a photo (opens the camera on
  phones/tablets), add an optional note, **check one or several students**, Save.
  Each tagged student gets the photo in their journal. Optionally filter the
  student list by cohort first.

### F1 — Littles task view (5-7 cohort only)
- Log in as a student in **Littles (5-7)** and open a quest. Tasks render as
  **big buttons with a checkmark**. Tap an unfinished one → a friendly sheet:
  **"Take a photo & finish"** (opens camera, attaches the photo) or **"Just
  finish"** (evidence-optional). Help/Proud buttons are right there too.
- A **Bigs (8-13)** student sees the standard task view — confirm it's unchanged.

### D1 — Batch assign quests
- **Advisor → Quest Invitations** (assign quests). You can now **select multiple
  quests** (checkboxes) and multiple students, then Assign — every selected
  student gets every selected quest.

### H1 — Archive a quest (My Quests)
- On the **Dashboard**, an in-progress quest card has an **archive icon**
  (top-right of the image). It opens an exit survey (reason chips + optional
  note), then hides the quest from your active list **without losing progress or
  XP** (different from the destructive delete). It disappears from the active list.

### I1 — Kiosk idle timeout
- On a **kiosk session** (focus/fullscreen mode, via /treehouse-kiosk login),
  after ~3 minutes of no interaction the device returns to the **student picker**
  automatically. Normal (non-kiosk) sessions are unaffected. (To test fast, you
  can temporarily lower `timeoutMs` in `Layout.jsx`.)

### E3 — AI is opt-in for Treehouse
- As a Treehouse student, enrolling in a quest **no longer auto-launches** the AI
  personalization wizard. You see the facilitator-authored tasks first; the
  "add a task" button still brings in AI suggestions when you want new options.

---

## Automated tests
- Frontend: `cd frontend && npx vitest run` — new tests for the signal bar, idle
  timeout, and archive card pass; the only failures are the pre-existing
  local-only `localStorage` jsdom quirk (they pass in CI).
- Backend: `cd backend && python -m pytest tests/test_treehouse_helpers.py -q` —
  cohort-scoped notification logic (4 tests, all pass).

## Notes / follow-ups
- The `/api/evidence` upload is rate-limited to 10/hour; fine for testing, may
  need raising for heavy end-of-day facilitator capture (flag for Tier 3).
- Tier 3 (custom pins/categories/boards, orientation→unlock sequencing) is
  deferred until you've verified these.
