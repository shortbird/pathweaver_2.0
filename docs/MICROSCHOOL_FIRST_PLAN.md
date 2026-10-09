# Microschool-first school side

**Started:** 2026-10-07. **Owner decision:** Tanner, after Horizon's feedback
("the entire backend/admin view is feeling clunky... Optio feels built more
around iCreate's model").

## Why

The evidence, gathered 2026-10-07 from production and the ticket tracker:

- 253 of 261 org-attributed feature/tweak tickets in the last 90 days (97%)
  came from iCreate. Most landed in shared screens, defaulted on.
- Turning the school console on (`sis`) turns on 16 modules at once,
  billing, registration, paperwork tasks, onboarding, secure documents,
  learning plans, training and a 16-report Reports page among them. Only a
  superadmin can turn any of them off (`/api/admin/organizations/<id>/modules`).
- Outside iCreate (and Optio Academy's own billing), the office side is unused.
  Horizon, Gryffin, Arete and Apogee use projects, submission review,
  messaging (mostly student-driven) and light attendance. Horizon has every
  office module on and used none of them in 30 days.
- The blocks system gates pages, not fields. With billing off, the class form
  still shows tuition, supply fee, materials allowance and teacher pay; the
  dashboard still shows money, substitutes and waitlists; every quest task
  still shows the diploma-credit picker.
- One five-task project takes about 50 controls in the quest editor.

## The five parts

### 1. New schools start small (starter baseline)

`feature_flags.module_baseline = 'starter'` marks an org whose office modules
are OFF unless it has an explicit `feature_flags.modules[key] = true`. Orgs
without the key behave exactly as today, so no existing school changes.

- Off in the starter baseline: `registration`, `catalog`, `billing`, `tasks`,
  `onboarding`, `secure_documents`, `clp`, `resources`, `training`.
- On: `classes`, `attendance`, `submissions`, `curriculum`, `calendar`,
  `reports` (its catalog filtered by module, part 2), messaging, friends,
  student chat, and the rest of the LMS defaults.
- Backend `modules/enabled.py` and web `modules/moduleEnabled.js` evaluate it
  identically (the mirror test covers it).
- Every new org gets the starter baseline: superadmin "Create Organization"
  (`organization_service.new_org_row`) and `/start-school/<token>`.
- The start-school form asks two plain questions, "Would you like families
  to pay tuition through Optio?" and "Would you like families to register
  through Optio?" (reworded 2026-10-09); each yes writes
  the explicit `modules` entries for that group.

### 2. A block switches off its own fields

Turning a module off removes every field and section that belongs to it, not
just its page:

- billing: class tuition, supply fee, materials allowance, teacher pay; the
  dashboard Money section; payment reports; the org card's tuition and
  allowance rows.
- registration: ages, capacity, open for registration, full-day; waitlist and
  age-exception tiles.
- attendance: substitutes, "Teachers to check", today's attendance.
- NOT the per-task diploma-subject picker. A first cut hid it where
  credits, transcripts and prior learning were all off; that was iCreate,
  Gryffin and Horizon, whose tasks nearly all carry chosen subjects, and a
  task with none counts as an elective. It moved behind "More options"
  instead (part 4).
- reports: each report names the module it needs and hides without it.
- settings cards name the module they need (rooms and time blocks need
  classes, incident reports need attendance or classes, and so on).

### 3. School admins choose their own features

A "Features" card in Settings, org admin only, lists every module a school
may switch with one plain sentence each. It writes through
`modules.toggle.apply_changes` (validates `requires`) and keeps
`sis_settings.hidden_modules` consistent (see memory
`sis-module-settings-authoritative`). Optio-controlled modules (`sis`, `ai`,
`credits`, `transcripts`, `prior_learning`, `course_builder`, `bloomy`,
`kiosk`) stay superadmin-only.

### 4. Projects are simpler to build

The quest editor shows the essentials first (title, description, tasks with
title, instructions, XP, links) and moves the rest (pillar override, due
date, credit split, release date, per-student audience, XP lock, "add their
own tasks") behind "More options". The AI draft panel starts collapsed when
the quest already has tasks.

### 5. A guard for new work

A registry test fails when a new non-core module defaults `on` unless it is
on an explicit allowlist, and when a new module is not classified for the
starter baseline. Features built from one school's tickets ship off for
everyone else unless someone decides otherwise.

## Out of scope for now

- Collapsing the four project entry points (class Quests, class Curriculum,
  Library Quests, Library Curriculum) into one. Worth doing; iCreate uses all
  four, so it needs its own plan.
- Moving existing orgs other than Horizon to the starter baseline. Each needs a
  look at its data first.

## Rollout

1. Ship parts 1, 2, 5 (no data change; no existing org moves).
2. Horizon: set `module_baseline = 'starter'` and remove the leftover
   `icreate_registration` key (prod data write, owner approval).
3. Ship parts 3 and 4.
