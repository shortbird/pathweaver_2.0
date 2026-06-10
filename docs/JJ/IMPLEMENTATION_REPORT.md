# The Treehouse — Optio v1 Implementation Effort Report

**Program:** The Treehouse (an Agile Learning Center microschool, ages ~5–13)
**Owner/facilitator:** Jennie Jones — `thetreehouse.alc@gmail.com` (user `420b85d6-3bdd-46e6-9f7d-11865c1b601e`)
**Date:** 2026-06-10
**Source docs:** [student.txt](student.txt), [teacher.txt](teacher.txt)
**Scope:** v1 web platform (`frontend/`, `backend/`), built as a program-specific tab
gated to Treehouse users — the same pattern used for OpenEd Academy (OEA).

> Naming: user-facing copy says **"The Treehouse"**. Internal identifiers use org
> `slug = 'treehouse'` (and `treehouse_*` tables/routes where new tables are needed).

---

## 0. What Jennie has already built (live DB context)

Jennie has already created **16 quests** in production while exploring the platform. They
fall into two groups and they validate the entire approach below:

**A. "Path" quests = her badge/pin board (already built as ordinary quests).** Several are
explicitly age-coded `(5-7)`, each with kid-friendly sub-"missions", 50 XP each, all
`is_required = false` (free choice / any order):

- `Space Explorer (5-7)` — 8 "zone" missions across art/communication/stem (Drawing Area, Writing Area, Reading Zone, Numbers Zone, Building Zone, Craft Station, Nature Station, Puzzle Challenge)
- `Builder (5-7)`, `Artist Path (5-7)`, `Book & Story Path (5-7)`, `Nature Explorer (5-7)`, `Kitchen Path`
- `Treehouse Community Builder`, `Materials Guardian` (Home Finder, Shelf Helper, "Ready for the next Friend"), `Project Finisher` — her civics/community + materials-stewardship theme

**B. Personalized per-child quests** with age + interest baked into the description:
`How Light Works` ("6 years old… quick wins and hands-on"), `4th grade division`,
`Soccer` ("9 years old…"), `Learn to Cook` ("11 years old…"), `Yearbook (10-13)`,
`Learn Japanese`, `Outschool class to learn Unity`.

**Two findings that directly drive the plan:**
1. **Reframing badges as curated quests is the right call** — she's *already doing it*. We
   should not resurrect the dropped badge engine; we should give these quests a visual,
   category-browsable home in the Treehouse tab.
2. **The age-appropriateness gap is real.** Her 6-year-old "How Light Works" quest generated
   tasks like *"Experiment with Light Refraction"* and *"Design a Light-Up Circuit"* — too
   advanced for a 6yo. This is concrete evidence to prioritize the AI age/reading-level
   differentiation (Student 2.3 / Teacher 1.2).

All 16 quests are currently `is_public = false`, `organization_id = NULL`, created by her
personal `student` account — i.e. they live in her private space. Onboarding step 1 is to
create the Treehouse org and re-home this content under it (see plan).

---

## 1. How we'll ship this (the OEA pattern)

The Treehouse gets its own program surface, visible only to Treehouse users, exactly like OEA:

- **Org-based gating.** Create an organization with `slug = 'treehouse'`. Treehouse
  students/facilitators get `organization_id` pointing to it. The sidebar already keys program
  tabs off org slug: `ORG_PROGRAM_TABS` in
  [Sidebar.jsx:16-27](../../frontend/src/components/navigation/Sidebar.jsx#L16-L27), conditionally
  pushed at [Sidebar.jsx:222-230](../../frontend/src/components/navigation/Sidebar.jsx#L222-L230).
  Add a `treehouse:` entry → tab appears only for Treehouse org members.
- **Backend membership helper.** Copy `_is_oea_student()` / `_verify_manages_student()` from
  [backend/routes/oea.py:32-109](../../backend/routes/oea.py#L32-L109) → a `routes/treehouse.py`
  blueprint with `_is_treehouse_user()`. Always include `superadmin` in checks (CLAUDE.md rule 7).
- **Pages + routes.** New `frontend/src/pages/treehouse/` directory, routes in
  [App.jsx](../../frontend/src/App.jsx), API client block in
  [services/api.js:716-744](../../frontend/src/services/api.js#L716-L744) (mirror `oeaAPI`).
- **Tables + RLS.** New `treehouse_*` tables, RLS enabled, admin-client access only (Flask uses
  service-role, not `auth.uid()`).

**Key insight:** Most of what The Treehouse wants is *already built into core Optio*. The
Treehouse tab is mostly a **simplified, kid-friendly re-skin** over existing
quest/task/journal/bounty/advisor systems, plus a few genuinely new pieces (kiosk login, help
queue, showcase events, "I'm proud" button). We do NOT rebuild the engine — we build a
child-appropriate front door to it.

---

## 2. Effort legend

| Level | Meaning |
|-------|---------|
| **REUSE** | Exists and works. Just surface it. Hours. |
| **LIGHT** | Small config or UI shim over existing feature. ~0.5–1 day. |
| **MEDIUM** | Real new code, but reuses existing infra/tables. ~2–4 days. |
| **HEAVY** | New subsystem. ~1 week+. |
| **DEFER** | Out of scope / low ROI for v1 / "future enhancement" in her own docs. |

---

## 3. Isolation analysis — what stays inside the program vs. touches the platform

A core design requirement: the Treehouse must not change behavior for any other user.
Every feature falls into one of three buckets.

### Bucket 1 — Naturally Treehouse-isolated (zero platform impact)
New tables / routes / pages gated by org slug. Nothing global moves.
- Simplified Treehouse home screen
- Showcase events system (`treehouse_showcase_*`)
- "I Need Help" / "I'm Proud" signals + facilitator queue (`treehouse_signals`)
- Pins-ready-to-create queue
- "Badge quests" curated by category (curated content + nullable `recommended_age` column)
- Kiosk login (a *new* auth route; existing login untouched)

### Bucket 2 — Lives in shared code, but strictly additive (no behavior change for others)
Touches core files behind nullable columns / optional params / org conditionals.
- AI task-gen age/reading-level tuning (extra optional prompt inputs)
- Facilitator completion notifications (new event type, fired only for Treehouse advisors)
- Multi-student observation tagging (fan-out over existing `learning_events`)
- AI growth-trait tags & quarterly summaries (additive AI endpoints)
- Bounty cohort filtering + repeatable flag + facilitator balance adjust (nullable cols/filters)

### Bucket 3 — Would change global behavior unless deliberately gated ⚠️ → gated, becomes Bucket 1
- **Evidence-optional task completion.** See §4 — gated to Treehouse membership, fully contained.

---

## 4. Evidence-optional completion — design (the one Bucket-3 item)

**Verified against code.** Evidence is enforced in exactly one place:
[completion.py:106-174](../../backend/routes/tasks/completion.py#L106-L174). The endpoint requires
`evidence_type` (lines 107-113), validates content, stores it, then awards XP.

**Why gating works cleanly:**
- **XP is independent of evidence** — `base_xp` comes from `task_data['xp_value']`
  ([completion.py:177](../../backend/routes/tasks/completion.py#L177)), not from evidence. A
  no-evidence completion still awards XP and advances quest progress.
- **The completion row already tolerates null evidence** — `evidence_text`/`evidence_url` are
  independently nullable ([completion.py:187-188](../../backend/routes/tasks/completion.py#L187-L188)).
  Both-null is a new combination, not a new shape.

**The gate (one conditional, before line 107):** if the **effective user** (`effective_user_id`,
not the caller) belongs to org `slug = 'treehouse'`, allow `evidence_type` to be absent → skip
the evidence block, create the completion with null evidence. Resolve membership server-side
from the user record; never trust the client. Gating on `effective_user_id` correctly covers
both a kid completing via kiosk *as themselves* and a facilitator completing *on behalf of*
the child (existing `acting_as_dependent_id` path, lines 42-57).

**Downstream is safe — no consumer hard-requires evidence:**
- Portfolio/evidence gallery iterates evidence blocks → renders nothing for a no-evidence
  completion (no crash).
- Diploma credit defaults `diploma_status='none'` (line 191) and needs an explicit request +
  evidence → no-evidence completions can't slip onto a transcript.
- Showcase pulls evidence blocks → these completions simply don't surface there.

**Companion piece (the real workflow):** her flow is "kid taps done now; facilitator captures
the photo/notes *later*." So we also need facilitator **post-hoc evidence attach** to an
*already-completed* task. The [helper_evidence.py](../../backend/routes/helper_evidence.py) path
does helper uploads today but assumes the task is still open — extending it to completed tasks
is a small, Treehouse-gated change. (This is the celebration/documentation loop in Student 4.2 /
Teacher 3.2.)

---

## 5. Feature-by-feature analysis

### STUDENT — Epic 1: Login & Navigation

| Ask | Status today | Effort | Notes |
|-----|--------------|--------|-------|
| **7.1 Kiosk / photo / no-password login** | **MISSING.** Login is email+password / Google / Apple ([auth/login/core.py](../../backend/routes/auth/login/core.py)). Dependent child accounts exist (`is_dependent`, `managed_by_parent_id`) but log in via the parent. | **HEAVY** | Biggest net-new build. Needs a kiosk route: device authenticates as a classroom/facilitator session, shows a roster of student photos, tapping one opens that student's scoped view with no password. Security model needs care (shared device, COPPA). Recommend a dedicated device/facilitator token + student picker. |
| **1.2 Clean young-learner home** (4 big buttons: My Quests / Find Quest / Showcase / School Jobs) | Underlying pages all exist. No simplified dashboard. | **LIGHT–MEDIUM** | New `TreehouseHomePage.jsx`, 4 large icon buttons linking to existing routes. |

### STUDENT — Epic 2: Quest Selection & Tasks

| Ask | Status today | Effort | Notes |
|-----|--------------|--------|-------|
| **2.1 Browse quests by visual category** (Art/STEM/Wellness/Communication/Civics) | **REUSE.** [QuestDiscovery.jsx](../../frontend/src/pages/QuestDiscovery.jsx) does topic/pillar browse w/ color chips + icons. Her 5 categories ≈ our 5 pillars. | **REUSE → LIGHT** | Re-skin into big touch cards; surface her "(5-7)" Path quests here. |
| **"Custom Quest" option** | **REUSE.** [CreateQuestModal.jsx](../../frontend/src/components/CreateQuestModal.jsx). | REUSE | |
| **2.2 Select → auto-adds to board, auto-saves, multiple active** | **REUSE.** Enrollment ([quest/enrollment.py](../../backend/routes/quest/enrollment.py)). | REUSE | |
| **2.3 Age-appropriate AI task lists** | **REUSE core / LIGHT tuning.** AI gen exists ([quest_personalization.py](../../backend/routes/quest_personalization.py), [quest_ai_service.py](../../backend/services/quest_ai_service.py)). Her 6yo "How Light Works" tasks came out too advanced — gap is proven. | **LIGHT** | Feed age-cohort / reading-level / "small chunks, quick wins" into the prompt. Audio read-aloud → DEFER. |
| Any-order tasks / switch projects | **REUSE.** `order_index`, no sequential lock; her quests already use `is_required=false`. | REUSE | |

### STUDENT — Epic 3: Help Requests & Momentum

| Ask | Status today | Effort | Notes |
|-----|--------------|--------|-------|
| **3.1 "I Need Help" → facilitator notification + queue** | **MISSING.** No help table/queue. Notification infra exists. | **MEDIUM** | New `treehouse_signals` row (type=`help`) + facilitator queue view; reuse [notification_service.py](../../backend/services/notification_service.py). |
| **3.2 "Productive waiting" suggestions** | Building blocks exist. | **LIGHT** | Static encouragement panel after Help, linking to existing actions. |

### STUDENT — Epic 4: Task Completion & Celebration

| Ask | Status today | Effort | Notes |
|-----|--------------|--------|-------|
| **4.1 One-tap complete, "most recent task" on top, no approval** | **PARTIAL.** Core flow requires evidence. | **MEDIUM** | Evidence-optional gate (§4) + "most recent task" dashboard query. |
| **4.2 Facilitator celebration notification + quick documentation** | **MISSING** (no "student completed" push to advisor). | **MEDIUM** | New advisor notification event + post-hoc evidence attach (§4) reusing [helper_evidence.py](../../backend/routes/helper_evidence.py) + advisor learning moments. |

### STUDENT — Epic 5: Showcase Experience

| Ask | Status today | Effort | Notes |
|-----|--------------|--------|-------|
| **5.1 Showcase theme/date/countdown + ideas** | **MISSING.** Our "Showcase" is a marketing tool, not an event. Quest deadlines were dropped. | **HEAVY** | New `treehouse_showcase_events` (theme, date, prompts, examples) + participants roster. |
| **5.2 Scaffolded showcase tasks w/ backward-planned deadlines** | **MISSING.** No task deadlines anywhere. | **HEAVY** | Per-task due dates (new) + AI spacing backward from showcase date + reminders. AI engine reusable; scheduling layer is new. |
| **5.3 Presenter notifications + planning dashboard** | **MISSING.** | **MEDIUM** | Depends on 5.1. Roster + counts; reuse notifications. |

### STUDENT Epic 6 / TEACHER Epic 6: "I'm Proud" + Observation/Portfolio Documentation

| Ask | Status today | Effort | Notes |
|-----|--------------|--------|-------|
| **6.1 "I'm Proud of This!" → facilitator notification** | **MISSING** as a distinct trigger. | **MEDIUM** | Same mechanism as Help — `treehouse_signals` type=`proud`. |
| **6.2 Quick mobile documentation** (photo, voice-to-text, tag domains, save to portfolio, <2 min) | **REUSE (mostly).** Advisor learning moments, helper evidence, **voice-to-text** ([learning_events/ai.py](../../backend/routes/learning_events/ai.py)), Snap-to-Learn all exist. | **REUSE → LIGHT** | Assemble into one streamlined Treehouse capture screen. |
| **6.3 AI reflection prompts for facilitators** | **PARTIAL.** Snap-to-Learn returns prompts; AI suggests pillars/titles. | **LIGHT** | Add her kid-friendly prompt set. Keep tone simple/kind (`feedback_ai_review_tone`). |
| **6.4 AI portfolio context — skill tags + growth traits** | **PARTIAL.** AI infers pillars, not specific skill tags / growth traits. | **MEDIUM** | Extend [learning_ai_service.py](../../backend/services/learning_ai_service.py) w/ growth-trait classification + accept/reject UI. |
| **6.1(teacher) Social-style post tagging MULTIPLE students** | **MISSING.** Learning events are 1:1. | **MEDIUM** | Fan-out: one capture → N `learning_events` (one per tagged student). Cheaper & lower-risk than a new junction; each student gets a real portfolio entry. |
| **6.4(teacher) Portfolio growth tracking** | **REUSE (partial).** Portfolio aggregates quests/XP/evidence ([portfolio.py](../../backend/routes/portfolio.py), [DiplomaPage.jsx](../../frontend/src/pages/DiplomaPage.jsx)). | **LIGHT–MEDIUM** | "Trends over time" is presentation over existing data. |
| **6.5(teacher) AI quarterly summaries / highlight reels / next-quest ideas** | **MISSING.** | **MEDIUM** | New AI summarization endpoint over existing events/completions. Good phase-2. |

### TEACHER — Epic 1: Quest Planning & Management

| Ask | Status today | Effort | Notes |
|-----|--------------|--------|-------|
| **1.1 Facilitator creates/edits personalized quests; AI suggest, accept/reject/regenerate/custom** | **REUSE.** AI gen + accept/edit/regenerate exists; advisors manage student tasks ([advisor/main.py](../../backend/routes/advisor/main.py), [StudentTasksPanel.jsx](../../frontend/src/components/advisor/StudentTasksPanel.jsx)). She's already doing this. | **REUSE → LIGHT** | Optional small facilitator form for student interests/goals/supports. |
| **1.2 Differentiate AI by developmental needs** | **LIGHT.** Same as Student 2.3. | **LIGHT** | |
| **1.3 Multiple active/paused/completed + dashboard (active/paused/%/last activity)** | **REUSE.** Pickup/setdown ([quest_lifecycle.py](../../backend/routes/quest_lifecycle.py)) + advisor dashboard with rhythm/last check-in/progress ([AdvisorDashboard.jsx](../../frontend/src/pages/AdvisorDashboard.jsx)). | REUSE | |

### TEACHER — Epic 2: Badge & Pin System

| Ask | Status today | Effort | Notes |
|-----|--------------|--------|-------|
| **2.1 Preloaded reusable "badge/pin" quests** | **PARTIAL.** `badges` table dropped, BUT she's already building badges as quests (the "(5-7)" Paths). | **LIGHT–MEDIUM** | Reframe: curate Treehouse quests w/ icons by category = her badge board. Add nullable `recommended_age`. Do NOT resurrect the badge engine. |
| **2.2 Categorize/filter by domain** | **REUSE.** Pillar/topic filtering. | REUSE | |
| **2.3 "Pins ready to create" queue + batch mark created** | **MISSING.** | **MEDIUM** | New `treehouse_pins` view over completed quests; batch "mark created." |

### TEACHER — Epic 3: Facilitator Dashboard & Notifications

| Ask | Status today | Effort | Notes |
|-----|--------------|--------|-------|
| **3.1 High-level dashboard + filters** | **REUSE (strong).** [AdvisorDashboard.jsx](../../frontend/src/pages/AdvisorDashboard.jsx) shows roster, rhythm, last check-in, activity, active quests. | **REUSE → LIGHT** | Missing only cohort filter + showcase progress. |
| **3.2 Task completion notifications** | **MISSING.** | **MEDIUM** | Same advisor-notification work as Student 4.2. |
| **3.3 Quest completion notif + auto-move + pin queue + celebration reminder** | **PARTIAL.** Completion/portfolio move exist; advisor notif + pin queue new. | **MEDIUM** | |

### TEACHER — Epic 4: Bounty Board (School Jobs & Credits)

| Ask | Status today | Effort | Notes |
|-----|--------------|--------|-------|
| **4.1 Create/manage bounties** (title/desc/reward/repeatable/due/max) | **REUSE.** Fully built; live schema verified complete (`deliverables`, `rewards`, `visibility`, `allowed_student_ids`, `max_participants`, `deadline` all present). [bounties.py](../../backend/routes/bounties.py). | **REUSE** | Gap: **repeatable vs one-time** not modeled → MEDIUM if recurring jobs needed. |
| **4.2 Differentiate boards by cohort/age** | **PARTIAL.** No cohort on bounties, but `org_classes` + `poe_cohorts` exist as precedents; bounties support org/family/`allowed_student_ids`. | **MEDIUM** | Add cohort eligibility filter, reuse `org_classes`. |
| **4.3 Earn credits → spend on materials; balance/history; manual adjust** | **PARTIAL.** "Credits" = spendable XP today (bounty approval → balance → Yeti shop, [yeti_repository.py](../../backend/repositories/yeti_repository.py)). | **MEDIUM** | Treehouse-facing balance + earnings view; "materials" redemption vs Yeti accessories; facilitator manual adjust is new. Earn/track plumbing exists. |

### TEACHER — Epic 5: Showcase Project System
Same as Student Epic 5 — **HEAVY**, net-new (events, dates, scaffolded deadlines, reminders).

---

## 6. Roles & permissions mapping

Her roles map cleanly onto ours (no new role system):

| Treehouse role | Optio role | Notes |
|----------------|-----------|-------|
| Facilitator | `advisor` (org-scoped) + `org_admin` for Jennie | Advisor already manages tasks, dashboard, moments, bounties. |
| Student | `student` (org-managed) or `is_dependent` child | Young students = dependent child accounts. |
| Parent (future) | `parent` / `observer` | View progress/portfolio already supported. |

Org `slug='treehouse'`; facilitators as advisors assigned via `advisor_student_assignments`;
`org_classes` provides the cohort grouping.

---

## 7. Effort summary

### Tier A — REUSE / LIGHT (surface existing power) — **do first**
Quest browse by category, custom quests, multiple active, pause/resume, AI task gen (+age tuning),
advisor dashboard, bounty board, portfolio aggregation, facilitator quick documentation,
simplified home, "badge quests" as curated content, roles/cohort via advisor + `org_classes`.

### Tier B — MEDIUM (new code, reuses infra) — **core Treehouse value-adds**
Help/Proud signals + facilitator queue; facilitator completion notifications; evidence-optional
completion + post-hoc facilitator evidence; "most recent task" dashboard; multi-student
observation tagging (fan-out); AI growth-trait tags; pins-ready queue; bounty cohort filter +
credits/materials view; AI quarterly summaries.

### Tier C — HEAVY / DEFER
- **Kiosk / photo / passwordless login** — HEAVY, security-sensitive. The thing she says
  everything "hinges" on. Its own phase with a clear shared-device security model.
- **Showcase events system** — HEAVY, net-new scheduling layer.
- Audio read-aloud, real-time voice recording, offline drafts — **DEFER** (she flagged as future).

### Headline
The quest engine, AI task generation, bounties, advisor dashboard, journal/observation capture,
and portfolio are **already built and reusable** — and Jennie is already using them. The
Treehouse is mostly a kid-friendly façade plus a handful of MEDIUM glue features, all
org-isolated. The only true greenfield builds are **kiosk login** and a **showcase-events
system**. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the phased build.
