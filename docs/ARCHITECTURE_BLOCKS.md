# Optio Architecture: Building Blocks

**Status:** North Star — adopted 2026-08-18
**Owner:** Tanner
**Extends** [ARCHITECTURE_CORE_AND_PROGRAMS.md](ARCHITECTURE_CORE_AND_PROGRAMS.md), whose
Phases 0–5 inverted the *programs* (OEA, Treehouse, Gryffin, POE) out of core. This
document does the same for the *SIS and the school-management surface*: core exposes
**modules**; each school runs the set it needs. The marketing page already sells this
("Every block can be switched on or off… the ones you turn off disappear completely"
— [ForSchoolsPage.jsx](../frontend/src/pages/marketing/ForSchoolsPage.jsx)); this doc
makes the code able to keep that promise.

**Decisions baked in (2026-08-18):**
1. Block control is **superadmin-only** (sales-assisted, matches the custom-quote model). Org admins see their enabled set, read-only.
2. LMS-only student onboarding = **roster-pick + class invite links**. Teachers do not create accounts or reset passwords; that stays org_admin.
3. **Two class surfaces by design**: main app = basic class management (LMS core); SIS console = the add-on richness. Same `org_classes` rows. Convergence deferred.
4. This document ships first; implementation phases (P0–P5, §6) each start on an explicit go-ahead.

---

## 1. Executive summary

**Verdict: restructure in place — a strangler around a new gating backbone. Not a
rewrite.** The SIS is ~59k LOC of *working* production code with 130 test files
encoding two years of hard-won lessons; iCreate starts classes 2026-08-24 with an
active 23-ticket backlog; and every backbone piece already exists in embryo, proven
in production. "Ground up" legitimately applies to the **config model and gating
backbone**, which barely exist — the feature code strangles into that backbone
unchanged. This is the same shape as the programs inversion, which delivered its
value through the logical seam and explicitly descoped the physical rewrite.

The backbone is four things:

| One… | What it is |
|---|---|
| **registry** | `backend/modules/registry.py` + a frontend metadata twin — every module's key, category, marketing blocks, default, dependencies, role floor, surfaces |
| **config key** | `organizations.feature_flags.modules = {key: bool}` — absent key = registry default, derived from today's legacy flags, so unmigrated orgs behave identically |
| **server gate** | `module_guard(bp, key)` / `@require_module(key)` — disabled modules return 404 everywhere, not just hidden nav. Ships log-only, flips to enforce after soak |
| **toggle panel** | superadmin Blocks panel in the org dashboard — the config's first real writer (today `hidden_modules` is hand-edited JSON) |

On top of the backbone, the **LMS core** gets the missing school-management basics so
a teacher on a no-SIS org can create a class, fill it with an invite link, assign
quests, and track progress — closing the audit's gap table (§3.3) with almost
entirely existing components.

Total program: **8–10 weeks** at solo-founder-plus-agents pace, shipping value from
week two, vs 6+ months for a rewrite with nothing shippable in between. The single
riskiest step is the enforcement flip (§6, P3) — everything in the plan's shape
exists to make that step boring.

---

## 2. Product model: blocks and modules

### 2.1 Blocks are sales granularity; modules are gating granularity

The for-schools page advertises **46 blocks in 6 categories**. The code has ~20 SIS
features and ~13 LMS features. Forcing a 1:1 mapping would either shatter real
features into fake toggles or merge real toggles into fake features. So:

> **A module is the unit that gates. A block is the unit that sells.** Each module
> lists the marketing blocks it presents as (`blocks` tuple, display metadata).
> Several blocks share a module; every block maps to exactly one module (or to the
> platform itself).

### 2.2 The module table (35 modules)

**Defaults:** `core` = always on, no toggle · `on` = opt-out · `off` = opt-in.
`parent` cascades at read time (turning `sis` off silences every SIS module).
`requires` is validated at **toggle time** (409), never at read time.
`min_tier` is the role floor for the module's console routes (see §4.6).

**Platform / LMS (13):**

| key | default | category | marketing blocks | notes |
|---|---|---|---|---|
| `quests` | core | learning | Quests | the spine; not toggleable |
| `xp` | core | learning | XP & Five Pillars | |
| `portfolio` | core | learning | Portfolios, Evidence Reports | |
| `journal` | on | learning | Learning Journal | |
| `courses` | on | learning | Courses & Lessons | browse + enroll |
| `course_builder` | off | learning | Course Builder | absorbs the `COURSE_CREATOR_USER_IDS` hardcode in `backend/routes/courses/__init__.py` |
| `bounties` | on | learning | Bounty Board | `hide_public_bounties` stays a *setting* inside it |
| `observer` | on | community | Observer Access | |
| `teaching` | core | operations | Advisor Check-Ins, Teacher Dashboards (LMS half) | the LMS-core teacher toolkit: class create/roster/progress/verification/check-ins (§4.4) |
| `messaging` | core | community | Announcements, Messaging | foundation |
| `credits` | off | credentials | Credit Tracking, Transfer Credits, Credit Review | on for Optio Academy / Hearthwood |
| `transcripts` | off | credentials | Accredited Transcripts | `requires: (credits)` |
| `ai` | off | ai | AI Tutor, Lesson Helper, Task Suggestions, Course Generator, Curriculum Upload | `gate: ai_columns` — the dedicated AI columns stay (parental-consent semantics, per-child overrides via `utils/ai_access.py`) |

**SIS add-on (22):**

| key | default | marketing blocks | deps / tier / notes |
|---|---|---|---|
| `sis` | **off** | Roster & Households, Student Records, Five Ways to Add People, Teacher Dashboards (console half) | **the add-on switch** = today's `sis_enabled`. Console core: dashboard, People, staff admin, directory, my-profile, settings. `min_tier: admin` |
| `classes` | on | Classes & Scheduling, Schedule Assistant | parent `sis`. SIS scheduling add-on on `org_classes` (sections, rooms, capacity, meetings, schedule AI/sync, teacher My Classes / My Schedule, discussions, materials, gradebook, engagement). Key name kept — the `hidden_modules` config is a promise already made |
| `catalog` | on | Catalog Widgets | parent `sis`, `requires: (classes)`, surface `public` |
| `registration` | on | Registration Builder, Waitlists & Age Gates, Schedule Builder | parent `sis`. Staff console + family funnel + both waitlist systems. The funnel *config dict* stays at `feature_flags.registration` untouched |
| `attendance` | on | Attendance, Accountability Board | parent `sis`. Includes the nightly sweep + gap alerts |
| `billing` | on | Tuition & Invoicing | parent `sis`, `requires: (registration)`, `min_tier: finance`. Covers billing.py, tuition.py, pay links |
| `timesheets` | on | Timesheets | parent `sis`, `min_tier: finance` for admin views; staff keep My Time |
| `tasks` | on | — (Task Center / My Tasks umbrella) | parent `sis` |
| `forms` | on | Forms & Requests | parent `sis` |
| `onboarding` | on | Onboarding Checklists | parent `sis` |
| `secure_documents` | on | Secure Documents | parent `sis`, `min_tier: hr` |
| `clp` | on | Learning Plans | parent `sis` |
| `goals` | off | — (goals-mode alternative to CLP) | parent `sis`; replaces `post_registration_flow: 'goals'` as the gate |
| `submissions` | on | Submissions Inbox | parent `sis`. **New key** — `/submissions` has no module key today |
| `curriculum` | on | — (SIS curriculum library, quest drafts) | parent `sis` |
| `calendar` | on | School Calendar | parent `sis`; family + mobile surfaces |
| `resources` | on | — | parent `sis` |
| `training` | on | Staff & Family Training | parent `sis` |
| `reports` | on | Reports & Exports | parent `sis`, `min_tier: admin` |
| `community` | off | Community Hub, Family Directory | parent `sis`; = today's `community_enabled` |
| `prior_learning` | off | Prior Learning | parent `sis`; = today's `prior_learning_enabled` — already gated full-stack, the template this design generalizes |
| `kiosk` | off | Kiosk Check-In | parent `sis`; = today's flat `kiosk` flag |

**Tuition** (inside `billing`) additionally declares `requires_any: (clp, goals)` —
the tuition-approval queue keys on CLP/goal completion, and today a Goals-mode org
gets a **silently empty queue**. Making the dependency a validated configuration
turns that bug class into a 409 at toggle time.

### 2.3 Block → module mapping (all 46)

The non-obvious ones — everything else maps by name:

| Block | Module | Why |
|---|---|---|
| Mobile App | — (platform) | the one block with no toggle; rendered from the registry's "always included" bucket |
| Evidence Reports | `portfolio` | shareable reports are a portfolio surface |
| Credit Review | `credits` | the review queue is the credits workflow |
| Schedule Assistant | `classes` | `schedule_ai.py` drafts the master schedule — a classes feature, not an AI-consent feature |
| Course Generator, Curriculum Upload | `ai` | AI authoring; `course_builder` is the non-AI authoring surface |
| Waitlists & Age Gates, Schedule Builder | `registration` | the enrollment funnel owns both |
| Learning Plans | `clp` | |
| Accountability Board | `attendance` | the unresolved-absence queue |
| Advisor Check-Ins | `teaching` | LMS core, not SIS — check-ins exist without a console |
| Teacher Dashboards | `teaching` + `sis` | the LMS TeacherHome vs the console TeacherDashboard |
| Five Ways to Add People, Student Records, Roster & Households | `sis` | console people core |
| Family Directory | `community` | ships with the hub (module granularity; `directory_default_in` remains its setting) |
| Announcements, Messaging | `messaging` | |
| Reports & Exports | `reports` | |

### 2.4 The compositions round-trip

The three marketing compositions are expressible as module sets — the model holds:

- **Hybrid Microschool**: `sis:true` with defaults, `community:true`, `timesheets:false`, `secure_documents:false`.
- **Homeschool Co-op**: `sis:true`, `billing:false`, `timesheets:false`, `community:true`; `journal`/`portfolio` are core/on already.
- **Online Program**: `sis:false` (or minimal), `courses` on, `ai:true` (+ consents), `credits:true`, `transcripts:true`, `observer` on, `attendance:false`, `kiosk:false`.

One granularity note: "Family Directory without the noticeboard" is not expressible —
both live in `community`. Acceptable; split later only if a real school asks.

---

## 3. Current state (audit, 2026-08-18)

### 3.1 Size and shape

| Area | Files | LOC |
|---|---|---|
| `backend/routes/sis/` — 37 modules, 36 blueprints, **378 routes** | 37 | 13,674 |
| `backend/services/sis_*.py` | 41 | 18,224 |
| `frontend/src/pages/sis/` + `components/sis/` + `sis/SisRoutes.jsx` | 90 | 26,761 |
| Other backend SIS (sis_roles, repos, gates, jobs) | 6 | 745 |
| **SIS production subtotal** | **~173** | **~59,400** |
| SIS tests (63 backend + 67 frontend files) | 130 | 23,409 |
| Adjacent: `routes/icreate_registration.py` (2,163), kiosk, oea | 9 | ~4,300 |
| Adjacent: 13 family-facing pages outside `pages/sis/` calling `/api/sis/*` | 13 | ~4,400 |

53 `sis_*` + 5 `oea_*` tables. 30 of the 36 blueprints share the bare `/api/sis`
prefix — flat URL space, ownership by convention.

### 3.2 SIS feature inventory (19 features)

| Feature | Frontend | Backend | Notes |
|---|---|---|---|
| A. People / roster / households / staff | PeoplePage (Roster/Staff/Households), StudentDetailModal, DirectoryPage | `routes/sis/__init__.py` (46 routes) + `staff_admin.py` (26) | `sis_service.py` (2,185 LOC) is the god module |
| B. Classes / catalog / scheduling | ClassesPage (1,313 LOC), schedule grid, AI editor | `catalog.py` (22), `schedule_ai.py`, `schedule_sync.py` | `sis_class_repository` |
| C. Registration + waitlists + eligibility | RegistrationPage, age gates, waitlist modals | `registration.py` (17), `waitlist.py` (10) | family funnel is `routes/icreate_registration.py` (`/api/icreate/*`) |
| D. Attendance | AttendancePage | `attendance.py` (6) | nightly sweep + gap-alert workflow, parent planned absences |
| E. Billing / Stripe / tuition | BillingPage, TuitionApprovalPage; FamilyBillingPage | `billing.py` (21, FINANCE), `tuition.py`, `pay.py` (token-auth public) | `sis_billing_service.py` 1,916 LOC; org's own Stripe key in `organization_secrets` |
| F. Timesheets / payroll | MyTimePage, TimesheetsPage | `staff_portal.py` `/time/*`, `staff_admin.py` | per-person `uses_time_clock` |
| G. Paperwork: onboarding, forms, signatures, secure docs | Onboarding/StaffForms/MyTasks/TaskCenter/SecureDocuments pages | `staff_admin.py`, `secure_documents.py` (HR), `tasks.py`, `parent_forms.py` | signature batches + portal hold; `signature_request_views.py` shared-view-body pattern |
| H. Teacher / staff portal | TeacherDashboard, MyClassesPage, TeacherClassPage, MySchedulePage | `staff_portal.py` (21) | admin "view as teacher" via `?teacher_id=` |
| I. Curriculum / class quests / gradebook / submissions / engagement | CurriculumPage, SubmissionsPage, ClassQuestsManager, QuestAiDraftPanel | `curriculum.py`, `class_quests.py`, `gradebook.py`, `submissions.py`, `engagement.py`, `quest_drafts.py` | |
| J. CLP | ClpPage (951 LOC) | `clp.py` | drives tuition eligibility (`finished_at`) |
| K. Goals (CLP alternative) | GoalsReviewPage | `goals.py` | `post_registration_flow: 'goals'` orgs |
| L. Prior learning | PriorLearningPage (877 LOC) | `prior_learning.py`, `parent_prior_learning.py` | **the one module gated full-stack** |
| M. Calendar / events | CalendarPage; FamilyCalendarPage | `events.py` | |
| N. Resources + staff training | ResourcesPage, StaffTrainingPage (904 LOC) | `resources.py`, `staff_training.py` (1,323 LOC) | training-as-quests, multi-audience |
| O. Community Hub | CommunityPage (784 LOC) | `community.py` (19) | opt-in |
| P. Reports | ReportsPage | `reports.py` (10) | enrollment, revenue, attendance, medications, allergies, media release |
| Q. Dashboards | SisDashboard → Teacher/Coordinator | `coordinator.py`, `sis_dashboard_service` | the dashboard service imports **9** sibling services |
| R. Family portal API | 13 pages on the LEARNING surface (FamilyPortal/Billing/Calendar/Forms/Goals/… , SchoolPage, ScheduleBuilderPage) | `parent.py` (**45 routes**), `school.py` | `sis_parent_service.py` (1,391 LOC) imports **12** sibling services |
| S. Messaging | FamilyMessagingPage | platform `/api/announcements` | |

### 3.3 LMS school-management inventory — and the gap

One table, `org_classes`, shared by LMS and SIS: SIS adds columns (capacity,
price_cents, billing_*, registration_status, waitlist, ages) and its own routes on
the same rows. LMS class routes: `backend/routes/classes/{crud,students,quests,advisors,messaging}.py`;
UI shared by the teacher surface (`/org-classes`, no create button) and the org-admin
surface (`/organization?tab=classes`, with create). All the modal/tab components in
`frontend/src/components/classes/` are reusable as-is.

**The gap for a teacher on an LMS-only org:**

| Need | Status today | Fix (P2) |
|---|---|---|
| (a) Teacher creates a class | **Missing** — `POST .../classes` is org_admin/superadmin only | widen role + auto `class_advisors` row for creator + show the existing CreateClassModal when `isAdvisorView` |
| (b) Students into the class | **Partial** — admin-push only; **no class join code or self-enroll path exists** | extend the standing-link machinery (`routes/admin/user_invitations.py`, `generate_invitation_link`) with `class_id`: accepting joins org + enrolls in class, role locked to student |
| (c) Assign content | Quests: yes, advisor-callable with full UI (`class_quests` + publish_at/due_date). Courses: **no** — no course→class attachment; authoring locked to superadmin + one hardcoded UUID | quests suffice for LMS core; courses deferred (§7) |
| (d) Track progress | Exists — but caseload reads `advisor_student_assignments` **only**: teaching a class does not populate "My Students" (`advisor_service.py`) | union class rosters into the caseload, tag the source |
| (e) Student account management | reset-password is org_admin; no org-scoped deactivate exists at all (only superadmin toggle-status) | **stays org_admin** (decision 2); build an org-scoped deactivate for org_admin, not teachers |

Also: the main Sidebar has **no advisor items** (only TeacherHome tiles reach the
advisor tools); `components/admin/OrgStudentProgress.jsx` is a working org-wide
progress view that is **not mounted anywhere**; `AdminPage.jsx` contains an
unreachable org_admin/advisor "Teacher Panel" tab shell; several
`components/organization/` tabs are exported but never rendered.

### 3.4 Mobile (frontend-v2)

A student/parent/observer product. Every role-gated nav item is `platforms:['web']`;
the advisor caseload panel and admin users panel are desktop-web-only; a native
advisor login lands on the student dashboard. Org context (including
`feature_flags`) already arrives via `/api/auth/me` into `authStore`. No class
management on mobile. Note the naming trap: mobile `CreateClassSheet.tsx` (and web
`/my-classes`) are the *student credit class* (`quests.quest_type='class'`), not
`org_classes` — see CORE_AND_PROGRAMS §6.

### 3.5 The gating that exists today — three storage shapes

All per-org gating lives on `organizations.feature_flags` (jsonb), read by
`backend/utils/org_features.py` (`org_has_feature`: top-level keys, absent = off,
fail-closed) and `frontend/src/contexts/OrganizationContext.jsx` (`useOrgFeature`).
Roughly 30 gates in three inconsistent shapes:

1. **Flat flags**: `sis_enabled`, `kiosk`, `xp_goals`, `scheduled_publish`, `due_dates`, `lock_xp_editing`, `hide_public_bounties`, `step_printing`, `email_reply_to`, `registration`/`icreate_registration` (dual-key).
2. **`sis_settings` blob**: `hidden_modules` (opt-out array over 14 keys — see [sisModules.js](../frontend/src/pages/sis/sisModules.js)), `community_enabled` + `prior_learning_enabled` (opt-in booleans), `post_registration_flow` (enum mode), plus ~25 operational settings (rooms, time blocks, age gates, pricing, school year, …).
3. **Dedicated columns**: `ai_features_enabled` + 3 granular AI booleans, `quest_visibility_policy`, `course_visibility_policy`, `timezone`, `accreditation_source`.

**`hidden_modules` is nav-only by design** ("the backend endpoints stay available").
It has **no editing UI** — configuring a school means hand-editing JSON. The family
half is outside the toggle system entirely: none of the 13 family pages import
`sisModules.js`, so hiding a console module leaves its family twin live.

Security guardrails that must survive any change here: `feature_flags` is
**anon-readable** (RLS filters rows, not columns) → `backend/utils/org_secrets.py`
strips/rejects secret-shaped keys (the settings UI read-modify-writes the whole
blob); `backend/utils/org_finance_flags.py` redacts pricing keys from non-finance
staff; `backend/tests/test_secret_exposure_guard.py` scans every route.

### 3.6 Org-specific hardcoding (severity order)

1. ~~**`icreate_registrations`**~~ — **DONE 2026-08-25.** Renamed to `registrations` (expand/contract, compat view behind it); `routes/icreate_registration.py` → `routes/registration_funnel.py`, blueprint `registration`, served at `/api/registration/*` with `/api/icreate/*` as a deprecated alias. `routes/sis/__init__.py` still imports `_finish_fee_step`/`_org_config` **from another route module** — now `routes.registration_funnel`. That route→route import is the remaining smell here.
2. **`frontend/src/config/optioAcademy.js`** — a hardcoded org UUID consumed by `postLoginPath.js`, `FamilyHome.jsx`, `SchoolPage.jsx`. Its own comment says "promote to feature_flags if a second school wants this shape."
3. **`registration_config.py`** dual-key: reads `registration` with fallback to `icreate_registration`, writes both.
4. **URL naming**: `/api/icreate/*`; `register/icreate/*` — Gryffin's live registration link is literally `register/icreate/gryffin-family-2026`.
5. One-off slug/ID switches: `partnerOrgs.js` (OnFire simplified dashboard), `utils/treehouse.py`, `email_service.py` support-copy exclude list, slug checks in `QuestsTab.jsx` / `AcceptInvitationPage.jsx` / `RosterImportPage.jsx`.

The ~180 'icreate' hits in SIS comments are design records (which request motivated
the code), not conditionals — only one slug branch exists in SIS logic proper (the
org-picker default in `sisOrgStore.js`).

### 3.7 Cohesion problems the backbone fixes

1. **Two parallel admin surfaces per org**: `components/sis/SisOrgSettings.jsx` vs `components/organization/SettingsTab.jsx`, already diverged (each has controls the other lacks); same duplication for People and Classes.
2. **Role-tier aliasing**: 7 route modules import a stricter tier *as* `STAFF_ROLES` (`FINANCE_ROLES as STAFF_ROLES` in billing/tuition; `ADMIN_ROLES as STAFF_ROLES` in clp/registration/reports/waitlist; `HR_ROLES as STAFF_ROLES` in secure_documents) — the name means four different things depending on the file.
3. **Service fan-ins**: `sis_dashboard_service` imports 9 sibling services (and is the only backend code honoring `hidden_modules`); `sis_parent_service` imports 12; tuition→CLP coupling gives Goals orgs a silently empty queue.
4. **Family half ungated** (§3.5).
5. **God modules**: `sis_service.py` (2,185 LOC), `routes/sis/__init__.py` (46 routes).
6. **Three auth generations** coexist: role-tuple decorators; per-class moderator gates under `@require_auth`; family-relationship gates in services. Teacher `class_scope()` is a manual call in 19 handlers — forgetting it reads org-wide.
7. **Five separate CSV/export paths** (the iCreate backlog already proposes one roster engine).
8. **Settings writes**: independent cards each PATCHing the whole `feature_flags` blob from the browser.
9. `routes/classes/*` hardcodes role tuples ~20 times and omits `campus_coordinator` throughout.

### 3.8 Prior art the design generalizes

`ModuleRoute` (frontend route guard) · `prior_learning` full-stack gating (the
template) · `sis_dashboard_service` module skipping · the programs registry on both
tiers · `signature_request_views.py` shared-view-body pattern · per-item
`visible_to_roles` · audience enums · `MODULE_ENFORCEMENT`-style env kill switches
(`ACCREDITATION_ACTIVE` precedent).

---

## 4. Target architecture

### 4.1 Module registry

Hand-maintained twin files, **backend canonical**, parity enforced by a CI test
(generation machinery isn't worth it for ~35 entries; the codebase already lives
comfortably with test-guarded mirrors).

| New file | Contents |
|---|---|
| `backend/modules/registry.py` | canonical `ModuleDef` dataclasses + `MODULES` dict (mirrors the `programs/registry.py` style) |
| `backend/modules/enabled.py` | evaluation: raw flag → effective; request-scoped cache; `enabled_set(org_id)` |
| `backend/modules/gate.py` | `module_guard(bp, key)` + `@require_module(*keys)` |
| `frontend/src/modules/moduleKeys.json` | machine-readable `{key: {default, parent, requires}}` — imported by the JS registry, asserted against Python by the parity test |
| `frontend/src/modules/registry.js` | display metadata: name, category, blocks, description, icon, nav paths |
| `frontend/src/modules/useModule.js` | `useModule(key)` hook + pure `moduleEnabled(flags, key)` |
| `backend/tests/test_module_registry.py` | Python ⇔ JSON parity; every `requires` target exists; every SIS module has `parent: sis`; each gated blueprint's role tier matches its registry `min_tier` |

```python
@dataclass(frozen=True)
class ModuleDef:
    key: str                      # stable id; the feature_flags.modules key
    name: str
    category: str                 # learning | credentials | ai | people | operations | community
    blocks: Tuple[str, ...] = ()  # marketing block names (display only)
    default: str = 'on'           # 'core' (always on) | 'on' (opt-out) | 'off' (opt-in)
    parent: Optional[str] = None  # read-time cascade ('sis' for SIS modules)
    requires: Tuple[str, ...] = ()      # all-of, validated at TOGGLE time
    requires_any: Tuple[str, ...] = ()  # any-of, validated at TOGGLE time
    min_tier: str = 'staff'       # staff | admin | finance | hr (documented floor; CI tripwire)
    surfaces: Tuple[str, ...] = ('console',)  # console | learning | family | mobile | public
    gate: str = 'flags'           # 'flags' | 'ai_columns'
    legacy: Optional[str] = None  # 'sis_enabled' | 'hidden_modules' | 'community_enabled' | ...
```

**Division of labor:** the backend computes; the frontend displays. The server
attaches the computed `effective_modules` list to org payloads the frontend already
loads (`/api/auth/me` organization embed, the SIS org picker, `school_context`).
`sisModules.js` becomes a thin adapter with **unchanged exports** reading
`org.effective_modules`, falling back to local evaluation (via `moduleKeys.json`
defaults) only for stale cached payloads and mobile. Gating *semantics* are never
re-implemented in JS — drift is structurally impossible, not test-suppressed.

### 4.2 Config schema and evaluation

**Flat map**: `organizations.feature_flags.modules = {"<key>": bool}`.
(Rejected: keeping the `hidden_modules` opt-out array — it cannot express opt-ins,
which is exactly why `community_enabled`/`prior_learning_enabled` grew as one-offs.
Rejected: CORE_AND_PROGRAMS §4a's nested `{"lms":{},"sis":{}}` — the LMS/SIS split
is a registry *attribute*, not a storage concern, and nesting forces every
path-aware guard to know two namespaces.)

Evaluation (`backend/modules/enabled.py`):

```python
def module_enabled(org_id, key) -> bool:
    entry = MODULES[key]                    # unknown key = programmer error, fail loudly
    if entry.default == 'core': return True # no DB read — a flags hiccup can't take down the LMS
    if entry.gate == 'ai_columns': return _ai_master_enabled(org_id)
    flags = _org_flags(org_id)              # request-cached (flask.g), fail-closed on error
    raw = _raw(flags, entry)                # modules[key] → legacy fallback → registry default
    if not raw: return False
    return module_enabled(org_id, entry.parent) if entry.parent else True
```

`_raw`'s legacy fallback order makes the config a **veneer**: explicit
`modules[key]` wins; absent → derive from the entry's `legacy` source
(`sis_enabled`; `key not in sis_settings.hidden_modules`; the opt-in booleans; flat
`kiosk`; `post_registration_flow == 'goals'`); absent everywhere → registry default.
**An org with no `modules` key behaves exactly as today. Rollback of the whole
program = delete the `modules` keys.** Legacy keys are not rewritten until the
narrow P4 collapse.

**What stays outside the module system** (deliberately):

| Gate | Disposition |
|---|---|
| `xp_goals`, `scheduled_publish`, `due_dates`, `lock_xp_editing`, `hide_public_bounties`, `step_printing`, `email_reply_to`, `oea_settings`, the ~25 `sis_settings` operational keys | **Settings**, not modules — behavior tweaks inside a module. Keep `org_has_feature` / `useOrgFeature` |
| `registration` / `icreate_registration` config dict | Funnel *config*; the toggle is `modules.registration`. Dual-key collapse is its own P4 step |
| `ai_features_enabled` + 3 granular columns | **Stay dedicated columns** (parental-consent semantics, per-child overrides). The registry `ai` entry bridges them for the panel and marketing page |
| `quest_visibility_policy`, `course_visibility_policy` | Content policy columns, unchanged |

**Guardrail survival**: `modules` is a boolean map — nothing secret-shaped, safe
under anon-readable RLS, invisible to `FINANCE_FLAG_PATHS` (pricing keys stay
redacted exactly as today). One new hazard is closed in the same guarded write
path: the whole-blob settings round-trip could let a stale org-admin tab clobber
superadmin toggles, so `feature_flags.modules` is **restored from storage for any
non-superadmin writer** (same preserved-paths mechanism `org_finance_flags` uses).
Toggle writes go only through the dedicated endpoint (§4.7), never the blob.

### 4.3 Server-side enforcement

Two mechanisms in `backend/modules/gate.py`:

- **`module_guard(bp, 'billing')`** — one line per single-module blueprint (about 30 of the 36). A `before_request` that resolves the caller, resolves the org exactly the way `_org_or_error` does today (query param, silent JSON body, multipart form field → `sis_service.resolve_org_id`), and checks `module_enabled`. Unauthenticated or org-unresolvable requests **pass through** — the route's own `@require_role`/`@require_auth` still 401s them; the gate answers only "is this module on for this org."
- **`@require_module('billing')`** — per-route, placed under the auth decorator, for shared blueprints (`parent.py`'s 45 family routes tagged per feature) and LMS routes. For family routes with no explicit org param, the org comes from the service-resolved relationship.

Policies:

- **Disabled → 404 with no module name leaked.** "The ones you turn off disappear completely" — an endpoint that answers 403 "billing disabled" hasn't disappeared.
- **Superadmin gets NO bypass.** This mirrors the shipped `ModuleRoute` semantics (a superadmin viewing an org is bounced too — the console mirrors exactly what that org's admin sees). Role checks keep their superadmin-always-passes rule; the module gate is org configuration, not authorization. Superadmin changes what an org has via the Blocks panel, not by walking through walls.
- **Fail-closed** on flag-read errors, matching `org_has_feature`; `core` modules never touch the DB.
- **Rollout kill-switch**: `MODULE_ENFORCEMENT = off | log | enforce` (env). Ships in `log` (Sentry tag `source:module_gate`, pass through); flips per-tier in P3 after soak.
- **Per-request caching**: org flags cached on `flask.g`; `enabled_set(org_id)` derives the full frozen set once for fan-in services.

Exemptions, documented in the registry entry, never ad-hoc:

- **`pay.py`** — the signed token *is* the authorization, and it only exists because billing was on when the invoice went out. Turning `billing` off stops *creating* invoices, not *settling* them; gating pay links would strand a parent mid-payment.
- **Internal cron routes** — exempt; the *jobs* filter per-org by `enabled_set` (attendance sweep, gap alerts, late fees, waitlist offers skip disabled orgs — the same pattern `sis_dashboard_service` already uses). Cron org loops paginate (PostgREST 1000-row cap).
- **`/api/sis/school/context` and `/api/sis/parent/context`** — never gated; they are the discovery endpoints that *report* the module set (§4.4).

Fan-in services **skip disabled siblings, never hard-fail**:
`sis_dashboard_service`'s `hidden_modules` check becomes `enabled_set(org_id)`;
`sis_parent_service` composes family payloads from the same set. Dependencies
(`billing requires registration`, `transcripts requires credits`, tuition
`requires_any(clp, goals)`, `catalog requires classes`) are **validated at toggle
time** with a 409 naming the conflict — read-time transitive enforcement could
silently kill billing for a live org over a mis-migrated dependency.

The gate attaches to existing blueprints and registers no routes, so Flask's
silent duplicate-route dispatch trap is untouched.

### 4.4 Surfaces

**LMS core (main web app).** The `teaching` module closes gaps (a)–(d) of §3.3:
advisor class creation (widened role + auto `class_advisors` row, reusing
`CreateClassModal`), class invite links (standing-link machinery + `class_id`, role
locked to student), caseload = assignments ∪ class rosters, a real advisor section
in the main Sidebar, and `OrgStudentProgress` finally mounted. Gap (e) stays
org_admin by decision 2 (plus a new org-scoped deactivate endpoint for org_admin —
today only superadmin can deactivate anyone). `GettingStartedChecklist` remains the
LMS-core happy path. The legacy `routes/classes/*` role tuples migrate to
`sis_roles` imports, finally adding `campus_coordinator`.

**SIS console** keeps the add-on modules. `SisRoutes.jsx`'s three wrappers
(`ModuleRoute` / `CommunityRoute` / `PriorLearningRoute`) collapse into one
registry-driven `<ModuleGate module="key">`; the Finance/HR role wrappers stay —
roles are not modules.

**Settings unification.** New `frontend/src/settings/settingsRegistry.js`: every
card declares `{key, module, minTier, Component}` and physically moves from
`SisOrgSettings.jsx` (332 LOC) and `SettingsTab.jsx` (615 LOC) into
`frontend/src/settings/cards/`. Both `pages/sis/SettingsPage.jsx` and the legacy
tab become thin renderers of the same registry filtered by surface × enabled
modules × caller tier — a disabled module's settings cards disappear with it.
Target write path: one `PATCH .../settings` doing a **server-side merge**, killing
the browser-side whole-blob read-modify-write that `org_secrets.py` and
`org_finance_flags.py` exist to defend against (cards keep their own PATCHes until
then).

**Family surface joins the module system.** `sis_parent_service._hub_org_entry`
gains `"modules": sorted(enabled_set(oid) & FAMILY_SURFACE_KEYS)`, returned by both
context endpoints. A `useSchoolModules(orgId)` hook replaces the ad-hoc fields
(`prior_learning_enabled`, `post_registration_flow` — kept during transition) and
the hardcoded Optio Academy UUID in `SchoolPage.jsx`. Family surface and backend
gate now agree **by construction**: same `enabled_set`.

### 4.5 Navigation

- **`SisSidebar.jsx`**: each `NAV_SECTIONS` item gains `module: '<key>'`, replacing the path-map lookup and the `communityMode`/`priorLearningMode`/`goalsMode` one-offs. Filter = module enabled ∧ tier flags.
- **Main `Sidebar.jsx`**: items for journal, courses, bounties, credits, the school hub, and the new advisor section declare module keys via `useModule(key)`.
- **Mobile `frontend-v2/src/config/navigation.ts`**: `NavItem` gains `module?: string`; the tab layout filters with `moduleEnabled(authStore.organization?.feature_flags, key)` from a small `frontend-v2/src/config/modules.ts` mirror (keys + defaults only, for the keys mobile consumes).
- `postLoginPath.js` swaps its `sis_enabled` read for the shared `moduleEnabled(flags, 'sis')`.

### 4.6 Roles

The 7 platform/org roles and the `sis_roles.py` tiers are **unchanged**. Three fixes:

1. **Kill the aliasing** mechanically: the 7 files importing a tier *as* `STAFF_ROLES` import it under its real name. Zero behavior change; honest grep results. The two literal tuples (`community.py`, `staff_training.py`) switch to `sis_roles` imports.
2. **The registry documents the floor**: `min_tier` per module, with a CI tripwire asserting each gated blueprint's declared tier matches — a drift alarm, not a runtime indirection. Target idiom for new routes: `@module_route('billing')` composing role tier + module gate.
3. **Teacher class scope becomes non-optional** at the **repository level**: `sis_class_repository` read entry points take the caller and return admin-wide or teacher-scoped rows by tier, so the 19 manual `class_scope()` call sites (and every future one) can't forget. Scope belongs where the query is built.

### 4.7 Blocks panel (superadmin)

Lives beside the existing `sis_enabled` toggle in
`pages/admin/OrganizationDashboard.jsx`: new `OrgBlocksPanel.jsx`, registry-driven —
categories → module rows → toggle + "includes: <blocks>" + tier badge + dependency
notes; parent-blocked rows greyed with the reason; `core` rows shown locked-on.

Backend in `routes/admin/organization_management.py`:

- `GET  /api/admin/organizations/<org_id>/modules` → `{key: {raw, effective, default, requires, blocked_by}}`
- `PATCH /api/admin/organizations/<org_id>/modules` `{"community": true}` — superadmin-only; validates `requires`/`requires_any` (409 naming the conflict); warns on open invoices when disabling `billing`; **server-side merge into `feature_flags.modules` only**; audit-logged.

The old `sis_enabled` toggle becomes the `sis` module row (write-mirrored to the
legacy key during the transition window — the proven `registration_config.py`
pattern).

### 4.8 Mobile

Flags already arrive via `/api/auth/me → organization.feature_flags` in
`authStore`. Add `frontend-v2/src/config/modules.ts` (`moduleEnabled(flags, key)`
with embedded defaults for the keys mobile consumes: journal, bounties, courses,
community, calendar, attendance, billing, observer, sis); nav items and school-hub
cards key off it; parent screens additionally consume the `modules` list from
school context (platform parents have no organization embed). Student, parent, and
observer remain the mobile product. A future teacher shell needs only: advisor nav
unlocked to mobile, class list/roster/attendance/verification screens, the same
module keys — **noted, not designed**.

---

## 5. User stories under the target structure

- **Student** (any org): logs into the learning app or mobile — `quests`, `xp`, `portfolio` always; `journal`/`courses`/`bounties` as enabled; the school hub shows only modules the school turned on; AI helpers only where `ai` + personal consent allow.
- **Parent / family**: the school hub and family pages list exactly the enabled family surfaces — invoices and pay links (`billing`), absence reporting (`attendance`), the enrollment funnel and schedule builder (`registration` + `classes`), paperwork (`onboarding`/`tasks`), calendar and directory (`calendar`/`community`). A disabled module never renders a card that 404s.
- **Observer**: follows linked students' feed and portfolio (`observer`); every view audited; nothing else.
- **Teacher in an LMS-only org** (`sis: false`): lands on `/dashboard`; creates a class, shares a join link, assigns quests with due dates, tracks roster progress, verifies work, runs check-ins — all `teaching` core, no SIS console anywhere. Account actions (passwords, deactivation) go through the org admin.
- **Teacher in a full-SIS org**: the same core, plus the console portal — My Classes / My Schedule (`classes`), roll (`attendance`), gradebook and submissions, My Time (`timesheets`), My Tasks and paperwork (`tasks`/`onboarding`), the staff directory. Every read class-scoped at the repository.
- **Campus coordinator**: the whole console via `ADMIN_ROLES` minus the money (`billing`, `timesheets` admin) and HR (`secure_documents`); pricing fields redacted from settings exactly as today.
- **Org admin (front office)**: everything the enabled set offers — People, Registration, Classes, Task Center, Reports, and the unified settings surface whose cards match the enabled modules. Sees the school's block set read-only. In an LMS-only org: `/organization` basics + the getting-started checklist.
- **Finance admin (org_admin)**: Billing, Tuition approval, Timesheets approval, pricing settings — the `min_tier: finance` modules.
- **Superadmin**: the org picker; sees each org **exactly as configured** (no module bypass); flips blocks in the Blocks panel with dependencies explained; masquerade unchanged.

---

## 6. Migration plan

### 6.0 Why not a rewrite

Restated from §1, because it is the load-bearing decision: the 59k LOC and 130 test
files are assets encoding production archaeology (PostgREST truncation, duplicate-
route dispatch, RLS column exposure, blob round-trips); iCreate's calendar forbids a
long-lived branch; parallel agents in one working tree rot any integration branch in
days; and the backbone generalizes four patterns already proven in production. The
programs inversion (CORE_AND_PROGRAMS Phases 2–5) is the precedent: logical seam
first, physical moves descoped.

### 6.1 Phases

Every phase is independently shippable and non-breaking (§6.2). Sizes assume
solo-founder-plus-agents pace with the iCreate backlog interleaved.

**P0 — Pre-flight (S, 1–2 days; can start immediately, safe before 08-24)**
- Land or explicitly park PRs #92/#94 first, honoring the pre-merge hazards documented in [docs/icreate/BACKLOG_PLAN_2026-08-18.md](icreate/BACKLOG_PLAN_2026-08-18.md). The refactor never rebases over them.
- Write `backend/scripts/audit_module_parity.py`: for every active org (prod, read-only), print the effective module set under current rules and the answer to every legacy gate. Save as the baseline artifact.
- Agree the file-ownership map with the backlog agents (§6.3).

**P1 — Backbone + first writer (L, 6–9 days)**
- The registry, evaluation, and gate files of §4.1–4.3. Seed from the current de-facto set.
- Apply `module_guard` blueprint-level to the ~30 single-module blueprints (one line each; multi-module files wait for P3). Convert `prior_learning`/`community`'s bespoke checks to the decorator — their enforcement is already live, so they skip log-only mode.
- `backend/tests/test_module_coverage.py` (the `url_map` fixture technique from `test_no_duplicate_routes.py`): every `/api/sis` rule declares a module or sits on an explicit allowlist (`parent.py` until P3, `pay.py`, `school.py`).
- Compat tests from fixture blobs copied from the three real storage shapes; parity script re-run — diff vs baseline must be empty.
- Frontend: `modules/registry.js` + `moduleKeys.json`; `sisModules.js` becomes the adapter (unchanged exports, `effective_modules` primary, local fallback); SisSidebar/SisRoutes driven by module keys; three route wrappers collapse to one.
- Minimal Blocks panel writing only `feature_flags.modules`; `test_secret_exposure_guard.py` stays green.
- Sequencing: the additive pieces (registry, tests, parity script, panel) can merge before 08-24; the wide blueprint wave waits until 08-25+.

**P2 — LMS core school management (M, 3–5 days; parallelizable with P1 — disjoint files)**
- Widen `POST .../classes` to `advisor` + `campus_coordinator`; auto `class_advisors` row for an advisor creator; CreateClass button when `isAdvisorView`.
- Caseload union in `advisor_service.py` (assignments ∪ class rosters, source-tagged, `fetch_all_rows`).
- Advisor section in the main Sidebar; mount `OrgStudentProgress`.
- Org-scoped deactivate endpoint (`@require_school_admin`, own-org only, cannot touch org_admins, audited). No advisor-level account actions (decision 2).
- Class invite links: `generate_invitation_link` + optional `class_id`; accept path enrolls after org join; role locked to student.

**P3 — Enforcement + family + settings (L, 7–10 days; the riskiest phase)**
- Review a full week of log-only hits per org; resolve every one (caller bug or map bug) **before** any flip. Flip `enforce` for the staff console first; family-facing a week later.
- `_hub_org_entry` returns the `modules` map (old keys kept during transition — mobile reads this payload); tag `parent.py`'s 45 routes per module; the 13 family pages gate off school-context modules.
- Unified registry-driven settings surface (§4.4); per-key server-side-merge PATCH; retire the diverged legacy controls.
- Blocks panel v2: dependency notes and per-module log-hit counts shown before a superadmin turns something off.

**P4 — De-hardcoding (M/L, 4–6 days; nothing before ~09-01)**
- `optioAcademy.js` UUID → org config (the promotion its own comment promised); `partnerOrgs.js` → a `simplified_partner_dashboard` flag; `treehouse.py` → the program registry; the one-off slug switches → flags.
- ~~`icreate_registrations`: repository wrapper, no physical rename~~ — **superseded 2026-08-25.** The physical rename happened instead (see 3.6): the judgement below that it carried "zero user value" undercounted the cost of a client's name on a table three orgs write to. Still outstanding: the route→route import in `routes/sis/__init__.py`, which wants `_finish_fee_step`/`_org_config` moved into a service both routes call.
- Dual-key collapse: verify prod is past the deploy that read only the legacy key, drop the mirror + fallback, scrub `icreate_registration` keys from org rows.
- URLs: ~~`/api/icreate/*` API paths **stay**~~ — renamed 2026-08-25 to `/api/registration/*`, with `/api/icreate/*` kept as a deprecated alias (the two frontends deploy separately, so the old prefix has to outlive the deploy gap). `register/icreate/*` still redirects **forever** — Gryffin's live link (`register/icreate/gryffin-family-2026`) must never 404.

**P5 — Cleanup (M, 3–5 days)**
- Converge the other four CSV/export paths onto the roster engine **after** the backlog agent lands it.
- `routes/classes/*` literal role tuples → `sis_roles` tiers (+`campus_coordinator` throughout).
- Repository-level class scoping (§4.6) replacing the 19 manual `class_scope()` calls, with a coverage-style test so a 20th site can't forget.
- Dead code: unrendered `components/organization/` tabs, the unreachable AdminPage "Teacher Panel" shell.
- `sis_service.py` split: **deferred** — ratchet rule instead (no new functions; extract per-domain only when a phase already owns that domain).

### 6.2 The non-breaking guarantee (mechanical)

1. **Derivation, not migration.** The config is a veneer over legacy flags; an org with no `modules` key behaves exactly as today; rollback = delete the keys the panel wrote.
2. **Parity script** before and after every phase merge: per-org effective module set + all legacy gate answers. Empty diff, except where a phase's changelog explicitly claims a change (P3 changes *enforcement*, never the *set* — the script asserts the set).
3. **Permanent compat tests** from real-shape fixture blobs.
4. **Observe-then-enforce.** No flip while any log-only hit is unexplained.

### 6.3 iCreate interaction

- **Freeze until ~2026-09-01** (classes begin 08-24): the registration funnel, billing/pay, waitlists, onboarding, attendance + its sweep, any schema change, any enforcement flip.
- PRs #92/#94 resolve on their own terms first (P0). P1 avoids the backlog-hot files (`catalog.py`, `sis_waitlist_service.py`, `sis_onboarding_service.py`, `sis_reports_service.py`, `ClassesPage.jsx`, `quest_drafts.py`).
- The one wide touch (gating lines across `routes/sis/*.py`) is one line per file, landed as short per-blueprint commits: check `git status` first, skip any file carrying someone else's uncommitted changes, never `git add -A`. New code goes in new files wherever possible — new files can't conflict.
- Backlog items that land naturally inside phases: the roster engine convergence (P5), the coordinator role-tuple gaps (P2/P5), the export-archived-rows fix (P5).

### 6.4 Estimate

~4–6k LOC net-new (registries, evaluation, gate, panel, parity script, ~2k of
tests); mechanical one-to-few-line edits across ~150–200 files; ~1–2k LOC deleted
(bespoke gating logic, collapsed wrappers, dual-key util, `optioAcademy.js`/
`partnerOrgs.js`, dead tabs). Calendar: P0 this week; P1+P2 — most of the strategic
value — by ~2026-09-08; P3 through September; P4+P5 by mid-to-late October.
**8–10 weeks end-to-end, shipping continuously from week two.**

---

## 7. Deferred — not in this program

| Item | Why not now |
|---|---|
| Mobile teacher shell | mobile is student/parent/observer by design; no demand signal yet |
| Course→class attachment | no data model exists and course authoring is locked to one user — a product decision, not a refactor step |
| Campus/location entity | blocked on iCreate's 14 unanswered client questions; inventing the model first guarantees rework |
| Per-block billing / entitlements-as-product | tiers were deliberately removed; selling blocks needs zero code until a second paying school asks |
| ~~`icreate_registrations` physical rename~~ | **Reversed and done 2026-08-25** — see 3.6. The surface turned out to be smaller than feared (no RLS policies, no triggers, no dependent views) and an expand/contract with a compat view carried it with no downtime. |
| Renaming `/api/icreate/*` or any family-bookmarked URL | live links are promises; aliases forward, originals live forever |
| `sis_service.py` god-module split | the file every parallel agent touches; ratchet rule instead |
| `routes/sis/` physical directory move / `core/` split | the CORE_AND_PROGRAMS Phase 5 verdict applies verbatim: high churn, no value once the logical seam exists |
| Advisor-level account actions | decision 2; org_admin covers it |
| advisor→teacher stored-role rename | tracked separately (CHECK constraints, ~100 RLS policies) |
| Splitting `community` into Hub vs Directory | wait for a school to ask |
| Blocks↔modules forced 1:1 | blocks are sales granularity; the panel copy maps them |

---

## 8. Appendices

### 8.A Role × module × surface matrix

C = SIS console, L = learning app, F = family pages, M = mobile, P = public.
Tier shown where above `staff`. Superadmin sees each org exactly as configured.

| Module | student | parent | observer | advisor | campus_coord | org_admin | finance |
|---|---|---|---|---|---|---|---|
| quests / xp / portfolio / journal | L M | L M (view) | L M (view) | L | L | L | — |
| courses / course_builder | L M | L | — | L / builder | L | L + builder | — |
| bounties | L M | L M | L M | L | L | L | — |
| teaching (core) | — | — | — | L (own classes) | L | L (all classes) | — |
| messaging | L M | L M | — | L C | C | C | — |
| credits / transcripts / prior_learning | L | F | — | L (verify) | C | C | — |
| ai | L M (consented) | consent UI | — | L | C settings | C settings | — |
| sis (console core) | — | F (hub) | — | C (portal) | C | C | C |
| classes | — | F (schedule) | — | C (My Classes) | C | C | C |
| registration | — | F (funnel) | — | — | C | C | C (fees) |
| attendance | M (kiosk) | F (absences) | — | C (take roll) | C | C | — |
| billing | — | F (invoices, pay) | — | — | **no** | C | C |
| timesheets | — | — | — | C (My Time) | **no** | C | C |
| tasks / forms / onboarding | — | F | — | C (mine) | C | C | — |
| secure_documents | — | — | — | own docs | **no** | C (hr) | — |
| clp / goals | — | F (plan) | — | C | C | C | — |
| submissions / curriculum | — | — | — | C (own classes) | C | C | — |
| calendar / resources / training | — | F M | — | C | C | C | — |
| reports | — | — | — | — | C | C | C |
| community | — | F (hub, directory) | — | C | C | C | — |
| kiosk | shared device | — | — | C setup | C | C | — |

### 8.B Legacy gate → target compatibility table

| Gate today | Target | Mechanics |
|---|---|---|
| `sis_enabled` | `modules.sis` | backfill; readers use `module_enabled('sis')` with legacy fallback; write-mirror both keys for one deploy window, then drop |
| `sis_settings.hidden_modules` | `modules[k] = false` per listed key | backfill; array left in place until old bundles age out |
| `sis_settings.community_enabled` | `modules.community` | backfill where true |
| `sis_settings.prior_learning_enabled` | `modules.prior_learning` | backfill; backend check swaps to `module_enabled` |
| `kiosk` (flat) | `modules.kiosk` | backfill; `routes/kiosk.py` gets `module_guard` |
| `post_registration_flow: 'goals'` | `modules.goals = true` (+ `modules.clp = false` where applicable) | enum stays as the family-flow setting during transition |
| `registration` / `icreate_registration` (config dict) | unchanged (config, not toggle) | dual-key collapse is its own P4 step |
| `ai_features_enabled` + 3 columns | stay columns; registry bridges via `gate: 'ai_columns'` | none |
| `xp_goals`, `scheduled_publish`, `due_dates`, `lock_xp_editing`, `hide_public_bounties`, `step_printing`, `email_reply_to` | stay flat settings | none |
| `quest_visibility_policy` / `course_visibility_policy` | stay columns | none |
| `COURSE_CREATOR_USER_IDS` hardcode | `modules.course_builder` + a creator-role check | P2+/P4 |
| `optioAcademy.js` UUID | module set + org config | P4 |
| `partnerOrgs.js` ONFIRE_ORG_ID | `simplified_partner_dashboard` flag | P4 |
| `treehouse.py` TREEHOUSE_SLUG | program registry | P4 |

### 8.C Worked registry entries

**`billing`**
```python
ModuleDef(key='billing', name='Tuition & Invoicing', category='operations',
          blocks=('Tuition & Invoicing',), default='on', parent='sis',
          requires=('registration',), min_tier='finance',
          surfaces=('console', 'family'), legacy='hidden_modules')
```
Backend: `module_guard(bp, 'billing')` in `billing.py` + `tuition.py` (tuition also
reads `requires_any(clp, goals)` state at toggle time); `pay.py` exempt
(documented); `@require_module('billing')` on the family `/billing/*` routes;
late-fee and reminder sweeps skip disabled orgs; the `FINANCE_ROLES as STAFF_ROLES`
alias fixed. Frontend: sidebar Billing/Tuition rows carry `module: 'billing'` +
`financeOnly`; `<ModuleGate module="billing">`; the family billing page gates on
school-context modules; the dashboard invoice card already skips. Toggle: the panel
warns "requires Registration" and "N open invoices" on disable. iCreate migration:
`modules.billing` absent → default `on` → unchanged.

**`attendance`**
```python
ModuleDef(key='attendance', name='Attendance', category='operations',
          blocks=('Attendance', 'Accountability Board'), default='on', parent='sis',
          min_tier='staff', surfaces=('console', 'family', 'mobile'),
          legacy='hidden_modules')
```
Backend: `module_guard` on `attendance.py`; `@require_module` on family
`/absences*`; the nightly sweep and gap alerts filter orgs by `enabled_set`.
Frontend: sidebar + route by key; family absence card from school-context modules;
teacher dashboard roll widget skips. The homeschool co-op composition is
`modules.attendance: false` — console page, family card, nightly nudges, and
endpoints all gone.

**`community`**
```python
ModuleDef(key='community', name='Community Hub', category='community',
          blocks=('Community Hub', 'Family Directory'), default='off', parent='sis',
          min_tier='staff', surfaces=('console', 'family', 'mobile'),
          legacy='community_enabled')
```
Backend: `module_guard` on `community.py` — the hub's first backend gate;
`@require_module('community')` on family `/directory*`. Frontend:
`isCommunityEnabled` shim → `moduleEnabled(flags, 'community')`; `CommunityRoute`
folds into `ModuleGate`. Migration: orgs with `community_enabled: true` backfill to
`modules.community: true`; the opt-in default is preserved for everyone else.

---

## Change log

- **2026-08-18** — Document created from a full audit of the SIS and LMS admin
  surfaces (three exploration passes + two design passes). Decisions 1–4 recorded.
  No implementation yet; P0–P5 each start on an explicit go-ahead.
