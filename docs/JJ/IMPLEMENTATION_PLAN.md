# The Treehouse — Implementation Plan

**Companion to:** [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md)
**Date:** 2026-06-10
**Pattern:** Program-specific tab gated by org `slug = 'treehouse'` (OEA model)
**Owner:** Jennie Jones — `thetreehouse.alc@gmail.com` (`420b85d6-3bdd-46e6-9f7d-11865c1b601e`)

This plan sequences the work so the platform is usable early and the two heavy builds
(kiosk login, showcase events) come last. Every phase is independently shippable.

---

## Guiding principles

1. **Reuse first.** ~60% of asks are existing core features. Surface them before building.
2. **Org-isolated by default.** New tables are `treehouse_*` with RLS, admin-client access
   (Flask uses service-role, not `auth.uid()`). Shared-code changes are additive + org-gated so
   no other user's behavior changes (see Report §3).
3. **Always include `superadmin`** in role checks (CLAUDE.md rule 7).
4. **Local verification before commit.** Verify at http://localhost:3000; commit only after
   user confirms (CLAUDE.md rules 1–2). Branch off `main`; confirm before pushing to `main`.
5. **No new role system.** Facilitator = `advisor`/`org_admin`; young student = dependent child.

---

## Phase 0 — Org setup & content re-homing (prerequisite, ~0.5 day)

The foundation everything else gates on. No app code yet.

- [ ] **Create the Treehouse organization** with `slug = 'treehouse'` (migration or admin UI).
      Set `quest_visibility_policy` appropriately.
- [ ] **Convert Jennie's account** `420b85d6…` to an org member: `organization_id = <treehouse>`,
      `role = 'org_managed'`, `org_role = 'org_admin'` (so she's facilitator + admin).
- [ ] **Re-home her 16 existing quests** under the org: set `organization_id = <treehouse>` on
      the quests she created (currently `organization_id = NULL`, `created_by = 420b85d6…`).
      Decide `is_public` per quest (the "(5-7)" Path quests should be discoverable inside the
      Treehouse tab; personalized per-child ones stay private).
- [ ] **Create cohort(s)** via existing `org_classes` (e.g. "Littles 5-7", "Bigs 8-13") and
      enroll students; assign Jennie as advisor via `advisor_student_assignments`.
- [ ] Verify: Jennie logs in, lands as org_admin/advisor, sees her quests under the org.

**Risk:** re-homing quests changes their visibility scope. Do it on a small set first and
confirm her existing personalized quests don't leak across the org.

---

## Phase 1 — The Treehouse tab + reuse surface (Tier A, ~3–5 days)

Goal: a working, kid-friendly front door over existing features. Delivers the majority of the
asks with almost no engine work.

### 1.1 Program tab scaffold (Bucket 1)
- [ ] Add `treehouse:` entry to `ORG_PROGRAM_TABS` in
      [Sidebar.jsx:16-27](../../frontend/src/components/navigation/Sidebar.jsx#L16-L27).
- [ ] Create `frontend/src/pages/treehouse/` + register routes in
      [App.jsx](../../frontend/src/App.jsx) (`/treehouse`, `/treehouse/...`).
- [ ] Create `backend/routes/treehouse.py` with `_is_treehouse_user()` + `_verify_*` helpers
      copied from [oea.py:32-109](../../backend/routes/oea.py#L32-L109). Register blueprint.
- [ ] Add a `treehouseAPI` block in [services/api.js](../../frontend/src/services/api.js)
      (mirror `oeaAPI`, lines 716-744).
- [ ] Verify the tab shows ONLY for Treehouse org members and superadmin.

### 1.2 Simplified young-learner home (Student 1.2) — LIGHT–MEDIUM
- [ ] `TreehouseHomePage.jsx`: 4 large touch buttons — My Quests / Find a Quest / Showcase /
      School Jobs — linking to existing routes. Big icons, minimal text. "Most recently started
      task" surfaced at top (simple query on `user_quest_tasks` + last activity).

### 1.3 Visual quest/badge browse (Student 2.1, Teacher 2.1/2.2) — REUSE → LIGHT
- [ ] Reuse [QuestDiscovery.jsx](../../frontend/src/pages/QuestDiscovery.jsx); present Treehouse
      quests as large category cards (5 pillars = her 5 categories). Surface the "(5-7)" Paths.
- [ ] Add nullable `recommended_age` to `quests` (additive) and show an age chip.

### 1.4 Surface existing reuse features
- [ ] Confirm enrollment / multiple-active / pickup-setdown / custom-quest / one-tap-with-evidence
      all work for a Treehouse student inside the tab.
- [ ] Point facilitators at the existing [AdvisorDashboard.jsx](../../frontend/src/pages/AdvisorDashboard.jsx)
      (roster, rhythm, last check-in, progress) — Teacher 1.3 / 3.1 mostly done.
- [ ] Confirm bounty board ("School Jobs") works for the org; create a sample bounty.

**Milestone:** Jennie can run a real day — students browse Treehouse quests by category, enroll,
work tasks, claim School Jobs; she monitors from the advisor dashboard.

---

## Phase 2 — Treehouse glue features (Tier B, ~1.5–2 weeks)

The MEDIUM features that make it feel purpose-built. All org-gated.

### 2.1 Student signals: Help + Proud (Student 3.1, 3.2, 6.1) — MEDIUM
- [ ] Migration: `treehouse_signals` (`id, student_id, type ['help'|'proud'], quest_id, task_id,
      status ['open'|'resolved'], created_at, resolved_by, resolved_at`). RLS, admin-client.
- [ ] Endpoints in `treehouse.py`: create signal, list open signals (facilitator queue),
      resolve. Reuse [notification_service.py](../../backend/services/notification_service.py)
      → new event types `treehouse_help_requested` / `treehouse_proud` to facilitators.
- [ ] UI: "I Need Help" + "I'm Proud of This!" big buttons on task/quest pages (Treehouse tab
      only); "productive waiting" encouragement panel; facilitator help-queue view.

### 2.2 Evidence-optional completion + post-hoc facilitator evidence (Student 4.1/4.2, Teacher 3.2) — MEDIUM
- [ ] Gate in [completion.py](../../backend/routes/tasks/completion.py) before line 107: if
      `effective_user_id` is a Treehouse member and no `evidence_type`, create completion with
      null evidence, skip evidence block. XP path unchanged. (Report §4.)
- [ ] Extend [helper_evidence.py](../../backend/routes/helper_evidence.py) to attach evidence to
      an **already-completed** task (facilitator captures photo/notes after the fact).
- [ ] New advisor notification on task/quest completion (event type, Treehouse-gated).
- [ ] Verify a non-Treehouse user still gets the "evidence required" error (no global change).

### 2.3 Facilitator celebration/documentation flow (Student 6.2/6.3, Teacher 6.1–6.3) — REUSE → LIGHT/MEDIUM
- [ ] Assemble one streamlined capture screen reusing advisor learning moments + Snap-to-Learn +
      voice-to-text ([learning_events/ai.py](../../backend/routes/learning_events/ai.py)).
- [ ] **Multi-student tagging**: fan-out one capture → N `learning_events` (one per tagged
      student). Each lands in that student's portfolio. (Cheaper than a new junction table.)
- [ ] Add her kid-friendly reflection prompt set (simple/kind tone — `feedback_ai_review_tone`).

### 2.4 AI growth-trait tagging (Teacher 6.4) — MEDIUM
- [ ] Extend [learning_ai_service.py](../../backend/services/learning_ai_service.py) with a
      growth-trait/skill-tag classification prompt over captions. Store suggestions; facilitator
      accept/edit/reject before publish. Additive; reuse Gemini infra.

### 2.5 Pins-ready queue (Teacher 2.3, 3.3) — MEDIUM
- [ ] Facilitator view over completed Treehouse quests: student / badge / completion date /
      artifacts; batch "mark created/distributed" (`treehouse_pins` or a status column).

### 2.6 Bounty cohort filter + credits/materials view (Teacher 4.2/4.3) — MEDIUM
- [ ] Add cohort eligibility to bounties reusing `org_classes` (nullable, additive).
- [ ] Treehouse-facing balance + earnings-history view over existing spendable-XP
      ([yeti_repository.py](../../backend/repositories/yeti_repository.py)); facilitator manual
      balance adjust. Define "materials" redemption vs Yeti accessories.
- [ ] (Optional) repeatable vs one-time bounty flag.

### 2.7 AI age/reading-level differentiation (Student 2.3, Teacher 1.2) — LIGHT
- [ ] Extend personalization prompt ([quest_personalization.py](../../backend/routes/quest_personalization.py),
      [quest_ai_service.py](../../backend/services/quest_ai_service.py)) with age-cohort /
      reading-level / "small chunks, quick wins" inputs. Validate against her "How Light Works"
      case (6yo should NOT get "Light Refraction"-level tasks).

**Milestone:** the Treehouse-specific loop works end to end — frictionless completion,
help/proud signals, celebration documentation, pins, cohort bounties.

---

## Phase 3 — Heavy builds (Tier C, sequence last)

### 3.1 Kiosk / photo / passwordless login (Student 7.1, 4.1) — HEAVY (~1–1.5 weeks)
The thing everything "hinges" on; do it deliberately with a security review.
- [ ] Design a shared-device model: device/facilitator session token → student picker (photos +
      first names) → scoped student session with no password and **no account/portfolio editing**.
- [ ] COPPA / shared-device considerations; dependent child accounts as the student representation.
- [ ] New kiosk route(s) — existing login flow untouched. Security review of the new path.

### 3.2 Showcase events system (Student 5.1–5.3, Teacher 5.1–5.3) — HEAVY (~1+ week)
Net-new; introduces the scheduling layer the platform deliberately lacks.
- [ ] `treehouse_showcase_events` (theme, date, prompts, examples) + `treehouse_showcase_participants`.
- [ ] Per-task due dates + AI spacing backward from showcase date + milestone reminders.
- [ ] Countdown UI, project-idea suggestions, presenter roster + facilitator planning view.

### Deferred (her own "future enhancements")
Audio read-aloud, real-time in-app voice recording, offline-first drafts, QR pins,
ESA compliance reporting, marketplace, habit/emotion check-ins.

---

## Suggested first PR

Phase 0 + Phase 1.1 (org setup + tab scaffold) in one branch — smallest shippable unit that
proves the gating works end to end before building features on top. Then 1.2–1.4 surface the
reuse features.

## Open questions for Jennie

1. **Age bands / cohorts** — exact groupings? (her quests imply 5-7 and 8-13.)
2. **Credits vs XP** — does she want a literal "materials credit" currency, or is spendable-XP
   acceptable? Affects Phase 2.6 scope.
3. **Kiosk security tolerance** — fully passwordless on a shared device, or a facilitator
   unlock + student picker? Drives the Phase 3.1 model.
4. **Showcase cadence** — how often, and is backward-scaffolded deadlines essential for v1 or a
   fast-follow? (It's the heaviest single piece.)
