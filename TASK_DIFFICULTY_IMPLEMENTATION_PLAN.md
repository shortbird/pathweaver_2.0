# Quest Task Difficulty - Implementation Plan

**Status**: Approved for implementation | **Date**: 2026-07-23 | **Branch**: `claude/quest-difficulty-levels-uw9kz5`

## Background

Client feedback: AI-generated tasks are too easy for some students (examples: Chess,
3-D Printing quests). Advanced students get tasks beneath their level with no way to
adjust them.

Two levers, shipped together:

1. **Challenge level at generation time** (the primary fix). A three-option selector in
   the personalization wizard - Easier / Standard / Challenge - that changes the
   difficulty guidance in the AI prompt for the whole batch. Remembered per user.
2. **Per-task complexity dial** (the refinement layer). "Make easier" / "Make harder"
   buttons on each suggested task card during review. Calls a fast AI edit that rewrites
   the task and adjusts its XP. Both web (v1) and mobile (v2).

## Locked Decisions

| Decision | Choice |
|----------|--------|
| XP bands | Easier 50-75, Standard ~100 (50-150), Challenge 150-200. AI-side XP clamp raised from 150 to 200 (matches the existing accept-time cap in `clamp_xp_value`). |
| 50%-at-100 rule | `_enforce_xp_distribution` becomes level-aware: 50% of tasks anchor at the level's standard value (Easier: 75, Standard: 100, Challenge: 150). |
| Persistence | New `users.preferred_challenge_level` column. Wizard pre-selects it; updated whenever the student generates with a different level. NULL = Standard. |
| UI labels | **Easier / Standard / Challenge**. API values: `'easier' \| 'standard' \| 'challenge'`. |
| Per-task dial | Stateless endpoint (client sends the task object + direction, gets the adjusted task back). No session coupling, so it drops into every v2 call site. UI caps adjustment at 2 steps in either direction from the original. |
| Age bands | Challenge level composes with the existing `age_band` guidance (Treehouse 5-7 / 8-13) - difficulty is expressed *relative to* the age band, never overriding it. |
| Model | `gemini-2.5-flash-lite` via the existing `generate_with_fallback()` - no new AI infrastructure. |

---

## Phase 1 - Database migration

New file: `supabase/migrations/20260723_add_preferred_challenge_level.sql`

```sql
ALTER TABLE users
  ADD COLUMN preferred_challenge_level text
  CHECK (preferred_challenge_level IN ('easier', 'standard', 'challenge'));
```

- Nullable, no default: NULL means Standard, so existing rows need no backfill.
- No per-table GRANT needed (covered by the 20260527 default-privileges migration).
- Verify current `users` schema via Supabase MCP before applying (per CLAUDE.md rule 4).

## Phase 2 - Backend: generation-time challenge level

### `backend/routes/personalization_validators.py`
- Add `VALID_CHALLENGE_LEVELS = ['easier', 'standard', 'challenge']`.
- `validate_generate_tasks_request`: validate optional `challenge_level` against the list.
- New `validate_adjust_task_request(data)`: requires `task` (dict with title) and
  `direction` in `('easier', 'harder')`.

### `backend/routes/quest_personalization.py` - `generate_tasks`
- Read `challenge_level` from the body. Resolution order:
  1. explicit body value ->
  2. `users.preferred_challenge_level` (fetch alongside the existing `bio` query - no
     extra round trip) ->
  3. `'standard'`.
- When the body value differs from the stored preference, update
  `users.preferred_challenge_level` (fire-and-forget, logged on failure).
- Pass `challenge_level` through to `generate_task_suggestions`.
- `refine-tasks` route: pass through the same way (it shares the service method).

### `backend/services/personalization_service.py`
- `generate_task_suggestions(..., challenge_level='standard')` - new parameter.
- `TaskCacheService.build_cache_key(...)`: append `level:<challenge_level>` to the key
  string. **Required** - otherwise a Challenge request can be served a cached Standard
  batch for up to 7 days.
- `_build_personalization_prompt(...)`:
  - Replace the hardcoded XP lines (`2. At least 50% of tasks should be worth exactly
    100 XP` / `3. Other tasks can range from 50-150 XP`) with per-level guidance:
    - **easier**: "At least 50% of tasks worth exactly 75 XP; others 50-100 XP."
    - **standard**: unchanged (50% at 100 XP; others 50-150 XP).
    - **challenge**: "At least 50% of tasks worth exactly 150 XP; others 100-200 XP."
  - Add a `challenge_guidance` block (mirroring how `age_guidance` works):
    - **easier**: smaller scope, more scaffolding, single clear outcome per task,
      confidence-building framing.
    - **challenge**: meaningfully larger scope and rigor - multi-session projects,
      original creation over consumption, real-world constraints, self-directed
      research. Explicitly instruct: "This student finds typical tasks too easy. Do
      NOT pad word count - increase actual scope and depth."
  - Composition rule: when `age_band` is set, the challenge block is phrased relative
    to the band (e.g. "the most ambitious version an 8-13 year old can own
    end-to-end"), and the age block's reading-level rules always win. The existing
    `difficulty_line` selection stays driven by `age_band`; challenge level modifies
    scope within it.
  - Keep the reading-level guidelines untouched for all levels - "the TASK can be
    challenging, but the WORDS describing it should be simple" already says exactly
    the right thing.
- `_validate_tasks(..., challenge_level)`: clamp XP with level-aware bounds -
  easier 25-100, standard 25-150, challenge 50-200.
- `_enforce_xp_distribution(tasks, challenge_level='standard')`: anchor value from
  `{'easier': 75, 'standard': 100, 'challenge': 150}` instead of hardcoded 100.

### `backend/services/quest_ai_service.py`
- `_validate_xp(xp_value, max_xp=150)`: add optional `max_xp` (default 150 preserves
  every existing caller). Personalization passes 200 when level is `challenge`.

### Explicitly unchanged
- `refine_task` (student free-text edit) keeps its "similar XP" behavior.
- `clamp_xp_value` cap stays 200 - the accept-time boundary already accommodates the
  new Challenge band, and it remains the anti-abuse boundary for client-supplied XP.

## Phase 3 - Backend: per-task adjust endpoint

New route in `backend/routes/quest_personalization.py`:

```
POST /api/quests/<quest_id>/adjust-task-difficulty
@require_auth + require_ai_access

Body:    { "task": {title, description, pillar, xp_value, diploma_subjects?},
           "direction": "easier" | "harder",
           "age_band": optional }
Returns: { "success": true, "task": {adjusted task, same shape} }
```

- **Stateless**: no session read/write, no DB insert. The client swaps the adjusted
  task into its local list; the task only becomes real via the existing `accept-task`
  / `finalize-tasks` paths (which already clamp XP server-side, so this adds no new
  XP-injection surface).
- New service method `PersonalizationService.adjust_task_complexity(task, direction,
  age_band=None)`:
  - Prompt (one task, ~15 lines): rewrite meaningfully easier/harder - change actual
    scope and rigor, not adjectives; move `xp_value` one step (multiples of 25,
    roughly +/-25-50) in the matching direction within 25-200; same pillar; keep the
    5th-6th grade reading level; respect `age_band` when provided; return the same
    JSON shape.
  - `generate_with_fallback()` + `_parse_quest_response()` (same plumbing as
    `refine_task`).
  - Server-side validation: `_validate_pillar`, XP clamped 25-200 and snapped to a
    multiple of 25, `diploma_subjects` renormalized to sum to the new XP via
    `normalize_diploma_subjects`.
- Error mapping mirrors `generate_tasks` (429 for rate limits, generic 500 otherwise).

## Phase 4 - Web (v1, `frontend/`)

`frontend/src/components/quests/QuestPersonalizationWizard.jsx`:

- **Step 2 (interests, ~line 543)**: "Challenge Level" segment - three pill buttons
  (Easier / Standard / Challenge) with one-line descriptions. Pre-select from the
  user's `preferred_challenge_level` (exposed via `/api/auth/me` -> auth context; add
  the field to the serializer if absent). Include `challenge_level` in the
  `generate-tasks` payload (~line 180). Optio brand colors for the selected state.
- **Step 4 (one-at-a-time review, ~line 734)**: "Make easier" / "Make harder" buttons
  on the task card next to the XP badge. On tap: call `adjust-task-difficulty` with
  the current task, show a spinner on the card, disable both buttons while in flight,
  then swap in the returned task (title, description, XP). Track steps per task index;
  cap at +/-2 from the original (disable the button at the limit). Adjusted task
  flows into the existing accept/skip handlers unchanged.
- **Path flow (step 5) and manual flow**: out of scope - curated paths are authored
  content, manual tasks are student-authored.

Tests (`QuestPersonalizationWizard.test.jsx`): selector renders + default; payload
includes `challenge_level`; dial swaps the task and updates XP; buttons disable while
pending and at the +/-2 cap; API error leaves the original task intact.

## Phase 5 - Mobile (v2, `frontend-v2/`)

- `src/hooks/useQuestDetail.ts`: `generateTasks` gains an optional `challengeLevel`
  argument (threaded into the `generate-tasks` payload, line ~130); new
  `adjustTask(task, direction)` calling the new endpoint.
- `src/components/tasks/TaskCreationWizard.tsx`: level selector on the interests step
  (both the class and quest variants, ~lines 494/543); Easier/Harder buttons on
  suggested-task rows with per-row pending state and the same +/-2 cap.
- Other `generate-tasks` call sites pass the user's stored preference implicitly (the
  backend fallback covers them - no client change strictly required):
  `src/hooks/useJournal.ts`, `app/(app)/courses/[id]/index.tsx`,
  `app/(app)/parent/quest/[studentId]/[questId].tsx`. The parent flow gets the
  selector in a follow-up if requested.
- Jest tests for the hook changes (payload shape, adjustTask swap, error path).

## Phase 6 - Backend tests

`backend/tests/` additions:
- Validators: `challenge_level` accept/reject; `validate_adjust_task_request`.
- `build_cache_key`: different levels produce different keys; same level is stable.
- `_enforce_xp_distribution`: anchors at 75/100/150 per level.
- Prompt building: challenge block present per level; composes with `age_band`
  (both set -> both blocks present, reading-level rules intact); standard level with
  no age band produces today's prompt (regression guard).
- Adjust endpoint: XP clamped + snapped to 25s, pillar preserved on invalid AI output,
  diploma subjects renormalized, 400s on bad direction/missing task.

## Rollout

1. Implement on `claude/quest-difficulty-levels-uw9kz5`, apply the migration to the
   Supabase branch/dev DB first.
2. User verifies locally at http://localhost:3000 (and the v2 dev build) - per
   CLAUDE.md, no merge before that.
3. Merge to `develop` (dev deploy + preview OTA), client validates with the Chess /
   3-D Printing quests specifically.
4. `main` when confirmed.

## Out of scope (noted for later)

- Difficulty variants for pre-authored paths (`approach_examples`) and course-builder
  authored tasks.
- Parent/advisor-enforced difficulty locks per student.
- Analytics on dial usage (which quests get "harder" taps -> signal for authoring).
- Raising XP scale beyond 200.
