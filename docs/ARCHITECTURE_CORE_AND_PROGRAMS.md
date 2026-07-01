# Optio Architecture: Core Platform + Program Extensions

**Status:** Baseline / North Star — adopted 2026-06-30
**Owner:** Tanner
**Supersedes ad-hoc program wiring** (slug checks, in-core program branches)

---

## 1. Purpose

Optio is one platform that hosts many **programs** (schools / cohorts / partners):
iCreate, Treehouse, OpenEd Academy (OEA), Gryffin, POE, and future ones. The
long-term goal is:

> **Core Optio is a reusable base. Each program is a thin custom implementation
> built on top of that base.**

This document defines the code structure that goal requires. It is the reference
for where new code goes and how programs are added.

The first program built end-to-end on both halves of the platform (LMS + SIS) is
**iCreate**. It is the reference implementation — not a special case. Anything
iCreate needs that is generally useful belongs in **core**; anything unique to
iCreate belongs in its **program module**.

---

## 2. The one rule: dependency direction

**Core must not know about any specific program. Programs depend on core; core
never depends on a program.**

Today this is violated in several places:

- `Sidebar.jsx` has a hardcoded `if slug === 'oea' / 'treehouse' / 'gryffin'` ladder.
- The transcript / StudentOverview path has OEA-specific branches inline.
- Registration parses `?partner=opened-academy` in shared code.

Each new program today means editing core. The target inverts this: **core
exposes extension points; each program registers into them.** Adding a program
should touch zero core files — only a new program module plus configuration.

---

## 3. Layers

```
FOUNDATION  (kernel — every deployment has it)
  auth · users · organizations · roles/permissions · messaging · notifications
  media/uploads · AI infrastructure (base_ai_service) · audit/compliance

CORE LMS  (learning primitives)            CORE SIS  (school operations)
  quests · tasks (required + optional         roster · households · programs
    template tasks) · XP · evidence           classes · registration · attendance
  curriculum / lessons · credits /            check-in · billing · waitlist
    transcript · learning journal              reports
    (learning_events) · portfolio /          (gated today by feature_flags.sis_enabled)
    diploma
  └─ optional capabilities (per-org toggle):
     bounties · observer

EXTENSION REGISTRY  (connective tissue — to be built)
  capability flags · nav contributors · dashboard widgets
  transcript augmentors · registration-step hooks · theming

PROGRAMS  (thin; register into the registry)
  iCreate · Treehouse · OEA · Gryffin · POE
  = config (which capabilities are on) + only genuinely-unique surfaces
```

### Layer rules

- **Foundation** is program-agnostic and always present.
- **Core LMS** and **Core SIS** are independent halves. A program may use one,
  the other, or both. They share only Foundation (users, orgs, auth). The single
  point of overlap is the `org_classes` table — see §6.
- **Optional capabilities** are core code that a program switches on/off. They
  must degrade cleanly when off (no dangling nav, no broken imports).
- **Programs** hold configuration and only the surfaces that are truly unique
  (e.g. OEA diploma pathways, Treehouse kiosk). They never live inside core.

---

## 4. Extension mechanism

Three parts, built on substrate that already exists (`organizations.feature_flags`
JSONB — proven by `sis_enabled` — and `program_key` on users/orgs).

### 4a. Capability flags

A structured per-org capability config, e.g.:

```jsonc
// organizations.feature_flags
{
  "lms": { "quests": true, "journal": true, "bounties": false, "observer": false },
  "sis": { "enabled": true, "billing": true, "checkin": true },
  "program_key": "icreate"
}
```

Backend gates endpoints on capability, not on org identity. Frontend gates nav
and routes the same way.

### 4b. Program registry

- **Backend:** a `programs/` package. Each program is a module that declares:
  enabled capabilities, config, blueprint(s), and hook registrations. A registry
  loads them at startup. Core iterates the registry; it never names a program.
- **Frontend:** a `programs/registry.ts` mapping `program_key → { navItems,
  routes, dashboardWidgets, theme }`. The Sidebar and router consume the registry
  instead of hardcoded slug checks.

### 4c. Hooks (extension points core exposes)

Examples core provides so programs plug in instead of editing core:

- `nav_contributors` — a program adds sidebar items.
- `dashboard_widgets` — a program adds cards to a dashboard.
- `transcript_augmentors` — OEA registers a credit-pathway augmentor instead of
  branching the transcript service.
- `registration_steps` — a program injects steps into registration.

---

## 5. Target directory structure

**Backend**
```
backend/core/foundation/     auth · users · orgs · roles · messaging · notifications · media · ai · audit
backend/core/lms/            quests · tasks · xp · evidence · curriculum · credits · journal · portfolio
backend/core/lms/capabilities/   bounties · observer
backend/core/sis/            roster · households · programs · classes · registration · attendance · checkin · billing · waitlist · reports
backend/core/extension/      registry · capability flags · hook APIs
backend/programs/{icreate,treehouse,oea,gryffin,poe}/   config + unique surfaces only
```

**Frontend v1 (web)** — SIS is already well-isolated (`sis/`, `pages/sis/`,
`components/sis/`); do the same for programs:
```
frontend/src/core/lms/ · core/sis/ · core/capabilities/
frontend/src/programs/registry.ts
frontend/src/programs/{icreate,treehouse,oea,gryffin,poe}/
```
The shell (Sidebar, router) consumes the registry; the slug ladder is deleted.

**Frontend v2 (mobile)** — already LMS-only and clean. No structural change;
consume the same capability flags.

The physical directory move (§5) is the *last* phase. The logical boundary
(registry + hooks, §4) delivers most of the value and comes first.

---

## 6. Terminology (finalized)

**The "class" collision** — one operational object, one credit unit, one course:

- **Class** = `org_classes` — a group students enroll in. SIS attributes
  (schedule, capacity, billing) are **optional fields on the same object**,
  switched on by program config. There is no separate "LMS class vs SIS class" —
  it is **one Class**, sometimes SIS-managed. Column ownership:
  - LMS-owned: `name`, `description`, `status`, `xp_threshold`
  - SIS-owned: `program_id`, `price_cents`, `capacity`, `registration_status`,
    schedule via `class_meetings`, etc.
- **Credit** = `quests.quest_type = 'class'` — the transcript credit unit
  (~1000 XP). Internally must **never** share the word "class" with `org_classes`.
  Parent-facing copy may still say "class" (established language guidance:
  parents don't think in "credits"), but code identifiers must be unambiguous.
- **Course** = `quests.quest_type = 'course'` — a multi-quest container. Unchanged.

**advisor → teacher** — user-facing copy becomes "Teacher." The **stored role
value stays `advisor`** for now (it is embedded in DB CHECK constraints, ~100 RLS
policies, and an enum). The deep rename (stored value + RLS + identifiers) is a
separate, tracked migration — not done in this pass.

---

## 7. Feature disposition (decided 2026-06-30)

| Feature | Disposition | Notes |
|---|---|---|
| Quests, tasks (required + optional template tasks), XP, credits, evidence, curriculum | **Core LMS** | The base. `quest_types.py` is the home of the unified required/optional task model — **kept**. |
| Learning journal + interest tracks | **Core LMS** | Most-used feature on the platform (525 events / 90d). |
| Portfolio / transcript / diploma | **Core LMS** | Base for OEA and any diploma program. |
| Bounties | **Core, optional** | Light but active; off for iCreate. |
| Observer | **Core, optional** | Modest but live. |
| Companion pet (Yeti + Buddy) | **REMOVED** | Redundant/low-value; Yeti had 1 pet row, Buddy had no data model. |
| Family quests | **REMOVED** | Low usage; overlapped core quests. |
| Constellation (skill map) | **REMOVED** | Underlying `user_skill_xp` stays (used by profile/overview). |
| Spark integration (legacy HMAC LMS SSO/webhooks) | **REMOVED** | No active tenant. |
| Dead jobs (missing-service imports) | **REMOVED** | Broken imports. |
| Marketing site (`/classes`, `/for-families`, homepage, `/demo`, …) | **Keep as-is** | Company surface; not core, not a program. |
| Other programs (OEA/Hearthwood, Treehouse, Gryffin, POE) | **Keep, isolate** | Real active orgs; move behind the registry, no feature loss. |

---

## 8. Roadmap

- **Phase 0 — Safe cleanup** ✅ *done* — removed companion (Yeti+Buddy; spendable-XP
  "coin" ledger carved into `student_wallets`, Treehouse coins + bounty rewards
  preserved), family-quest creation + AI ideas (parent-dependent-quest kept),
  constellation viz (pillar-XP data kept), Spark integration, dead jobs, and the
  already-broken docs-AI generation.
- **Phase 1 — advisor→teacher UI relabel** ✅ *done* — display only; stored role
  value stays `advisor`.
- **Phase 2 — Extension registry** ✅ *done* — program registry on both tiers
  (`frontend/src/programs/registry.jsx`, `backend/programs/registry.py`). Sidebar,
  registration, and cron-dispatch now consult the registry; **no core file names a
  program**. Adding a program = a registry entry. Capability flags already existed
  (backend `utils/org_features.py`, frontend `useOrgFeature`) — the JSONB
  `feature_flags` substrate that gates `sis_enabled`.
- **Phase 3 — Invert OEA** ✅ *done* — OEA's diploma panel + choose-pathway UI moved
  to `frontend/src/programs/oea/DiplomaWidget.jsx`; core `SkillsGrowth` renders the
  registry's diploma widget (`renderDiplomaWidget`) or its Optio-credits default.
  The OEA data fetch moved behind the registry's `fetchProgramDiploma` too, so core
  overview hooks no longer import `oeaAPI`. Core now carries zero OEA rendering or
  API coupling; the only OEA mentions left in core are illustrative code comments.
  (`SubjectProgressRow` extracted to a shared `components/diploma/` primitive.)
- **Phase 4 — Program modules + router inversion** ✅ *done* — program pages
  co-located under `src/programs/<program>/` (oea, treehouse, gryffin, poe); the
  registry contributes routes by mount context and core `App.jsx` renders them
  generically (`getProgramRoutes`) — no program named in the router. iCreate is the
  SIS platform (not a page-based program), so nothing to migrate there.
- **Phase 5 — Physical reorg** into `core/` + `programs/` — finish moving program
  *supporting* code (`components/oea`, `components/treehouse`, program hooks/services,
  backend `routes/oea.py` / `treehouse.py`) into their modules, and split core out.
- **Phase 6 — Class/credit code disambiguation.**

---

## 9. Change log

- **2026-06-30** — Document created; Phases 0–1 executed and Phase 2 foundation built.
  - **Phase 0:** removed companion (Yeti+Buddy) — spendable-XP ledger carved into
    `student_wallets`; removed family-quest *creation* + AI ideas (parent-dependent
    quest flow kept); removed constellation viz (pillar-XP data kept); removed
    Spark; removed dead AI-metrics jobs; removed the already-broken docs-AI
    generation. `yeti_*` + `spark_auth_codes` tables dropped. `quest_types.py`
    retained (active required/optional task model, not legacy).
  - **Phase 1:** advisor→teacher UI relabel (display only; stored value `advisor`).
  - **Phase 2:** program registry on both tiers — core (Sidebar, registration,
    cron-dispatch) consults it; the hardcoded slug ladder, direct `program_key`
    import, and OEA cron endpoint removed. Capability flags already existed.
    Entanglement audit found the codebase far less program-coupled than expected.
  - **Phase 3:** OEA fully inverted — its diploma UI + data fetch moved to
    `programs/oea/`; core `SkillsGrowth` renders a registry diploma widget and core
    overview hooks no longer import `oeaAPI`. Core carries zero OEA rendering/API
    coupling. `SubjectProgressRow` extracted to a shared `components/diploma/` primitive.
  - **Phase 4:** program pages co-located under `src/programs/<program>/`; the
    registry contributes routes by mount context and core `App.jsx` renders them via
    `getProgramRoutes` — the router names no program.
