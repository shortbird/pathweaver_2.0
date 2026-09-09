# Phase 2 (shared/) — handoff

**Make `shared/` a real workspace package and the single source of truth for
cross-platform contracts.** Completed 2026-09-09.

Branch: `refactor/remediation-2026-09-phase2`.
Ten commits, `1062bbe0` … `HEAD`, on top of `e2beced5`.

The last two (`0cd91cf5`, `6014ede9`) came after the first handoff, from
following up the bugs it recorded — see [B1](#b1-six-paths-seeded-user_skill_xppillar-with-display-names--fixed-in-0cd91cf5).

> **Filename note.** This is *not* `PHASE_2_HANDOFF.md`, which already exists on
> this branch and covers a different Phase 2 (the migration reconciliation,
> OPS-01 / OPS-03). Two unrelated pieces of work share the branch name. See
> [What I could not do](#what-i-could-not-do-and-why) item 1.

---

## Test results

Every suite was run before the work started and again after each commit. Zero
failures at every step; nothing was skipped, xfailed or deleted to get there.

| Suite | Before | After |
|---|---|---|
| Backend (`pytest`) | 5,538 passed / 160 skipped / **0 failed** | 5,579 passed / 160 skipped / **0 failed** |
| Web (`vitest`) | 323 files, 2,855 passed / **0 failed** | 323 files, 2,858 passed / **0 failed** |
| Mobile (`jest`) | 113 suites, 938 passed, 3 skipped / **0 failed** | 113 suites, 938 passed, 3 skipped / **0 failed** |

The +41 backend and +3 web tests are the new guards listed below. No existing
test was removed.

**Other gates, all clean after:** `pyflakes` (undefined names: none),
`ruff` (F/E9/B/S110/S112), `mypy` (1,114 files, no issues),
`tsc --noEmit` (mobile), `vite build`, `npx expo export` (iOS + Android),
`npm run generate:check`.

**Coverage** — all comfortably above their floors, none lowered:

| Suite | Floor | Measured now |
|---|---|---|
| Backend | 41% | 57% |
| Web | 53% | 60.94% statements |
| Mobile | 31 / 24 / 32 / 23 (stmt/br/line/fn) | 37.9 / 30.65 / 39.3 / 29.95 |

**Build verification, not just tests.** `npx expo export` was run before any
change to record a baseline, and after each commit. After `1062bbe0` (the Metro
resolver change) the iOS bundle hash was **byte-identical** to the baseline —
`entry-521c9f1773ecf6d17e984b5c49751216.hbc` — which is the strongest available
evidence that the workspace change moved nothing. It changed at `a8e92a8d`, as
expected: `shared/pillars.ts` stopped importing a `.json` file and started
importing a generated `.ts` one, so the module graph genuinely differs. The
values are pinned identical by the conformance tests.

---

## What changed

### 1. `1062bbe0` — `shared/` is an npm workspace package

`shared/` was a folder that four bundler configs happened to point at. It now
has a `package.json` (`@optio/shared`) and the repo root lists it under
`workspaces`, so it can own scripts — the generator below runs as
`npm run generate` from the root, from CI and from a shell.

`shared/package.json` deliberately declares **no `"type"` field**. Files under
`shared/` take their module type from the nearest `package.json`, which until now
was the repo root's, which has none. Declaring one would silently reclassify
every `.js` under `shared/` as ESM or CJS.

`mobile/metro.config.js` gains `resolver.nodeModulesPaths`. `shared/` has no
`node_modules` of its own, so a module reached through the `@shared` alias
resolves its own imports by walking up past the repo root and out of the tree.
Metro walks `node_modules` directories rather than following Node's algorithm, so
it has to be told both places explicitly. `mobile/jest.config.js` already carried
this fix pinned to `@babel/runtime`, and its comment records the failure mode:
only files needing a babel helper hit it, which is why `shared/legal/*` worked for
months and the first shared module with a default import did not.

**`web/`, `mobile/` and `marketing/` are NOT workspace members.** That is a
decision, not an oversight, and it is the one thing in this phase that did not
get done as specified. See [NEEDS TANNER](#needs-tanner) item 1.

### 2. `a8e92a8d` — one JSON, two languages, generated

`shared/pillars.json` and `shared/subjects.json` were already the single source
for the two apps and could never be one for the backend: a Flask process cannot
import a TypeScript module, and the JSON import the apps use is not available to
it either. That asymmetry is exactly why the pillar vocabulary still had seven
declarations in `backend/` after QF-01 closed.

The JSON moved to `shared/data/` and became the source for
`shared/scripts/generate-constants.mjs`, which emits both languages:

```
shared/data/pillars.json   ->  shared/generated/pillars.ts
                           ->  backend/generated/pillars.py
shared/data/subjects.json  ->  shared/generated/subjects.ts
                           ->  backend/generated/subjects.py
shared/data/credits.json   ->  shared/generated/credits.ts     (commit 4)
                           ->  backend/generated/credits.py
```

**What each language gets is deliberately not the same.** TypeScript gets the
cross-platform identity of a pillar and *not* the `legacy` vocabulary, which only
the backend has to accept. Python gets that plus `legacy`, and not the subject
descriptions or accent colours, which belong to the pickers the clients draw —
the backend has its own `SCHOOL_SUBJECT_DESCRIPTIONS` for a different audience. A
surface that cannot read a field cannot drift from it.

**CI wiring:** `node shared/scripts/generate-constants.mjs --check` re-runs the
generator and fails on any difference. It sits in `tests-web.yml` because that
job already has Node and the backend job does not; the script has no
dependencies, so it runs before any install. Both gates call that reusable
workflow, so it holds the PR and the release.

### 3. `61b0a867` — the backend's copies deleted

Ten modules spelled out the five pillars or the eleven subjects themselves:

| Module | What it declared |
|---|---|
| `utils/pillar_utils.py` | keys, display names, legacy aliases |
| `utils/school_subjects.py` | subject keys, display names |
| `config/pillars.py` | keys, display names, colours |
| `prompts/components.py` | keys, legacy display names |
| `routes/personalization_validators.py` | legacy display names |
| `routes/treehouse.py` | keys, labels |
| `routes/learning_events/crud.py` | keys |
| `services/roster_import_service.py` | legacy display names |
| `services/bounty_service.py` | keys |
| `services/learning_ai_service.py` | keys, legacy aliases |

They did not agree. `prompts/components.PILLAR_DISPLAY_NAMES` and
`utils/pillar_utils.PILLAR_DISPLAY_NAMES` are the same name for two different
maps — one answers `'STEM'`, the other `'STEM & Logic'` — so which one a reader
found depended on which file they opened. Both are kept (the prompts were written
against the older wording and a model reads them), but they are now two views of
one generated vocabulary.

Every value was compared against the declaration it replaced and is equal to it,
including `utils/pillar_utils.PILLARS` and `config/pillars.PILLARS` as whole
nested dicts.

**What stayed local, and why.** Descriptions, icon names, gradients,
subcategories and the treehouse's `'Creative Expression'` label are properties of
an audience or a screen, not of a pillar. Ordering also stayed local wherever it
reaches a user *as a sequence*: `/api/pillars` returns `keys` as a JSON array, the
treehouse builds its category list by iterating, a 400 body joins the list into a
sentence, and two AI services join it into a prompt. Those five orders are
preserved exactly. Forcing one order on them would have been a visible product
change made for a refactor's convenience.

`tests/unit/test_pillar_constants_generated.py` (26 tests) holds the line: every
key list must be a permutation of the canonical five, every name map must equal
the generated one, every legacy spelling must still normalise. **A module may
order the pillars; it may not add, drop or misspell one.**

### 4. `6c9e8068` — the diploma credit contract into `shared/`

Three facts the web app and the backend both act on had no single definition:

| Fact | Where it was |
|---|---|
| `XP_PER_CREDIT` (2000) | **six** backend declarations, one on the web |
| the 24-credit requirement table | `web/src/utils/creditRequirements.js`, plus a copy in `credit_mapping_service.py` under a comment reading *"Aligned with web/src/utils/creditRequirements.js"* |
| the formal transcript names | `routes/public.py`, `routes/admin/transcript_generator.py`, and the web table |

Now `shared/data/credits.json`. The arithmetic over it moved to
`shared/credits.ts`, unchanged, from `web/src/utils/creditRequirements.js` — pure
business logic, no DOM, no network, no store. That file stays as a re-export
because fifteen modules import from it and rewriting them buys nothing.

`xpRequired` is now derived (`credits * XP_PER_CREDIT`) rather than stored beside
`credits`, because storing both is how a row gets a pair that disagree.

**The ratchet found what reading did not.**
`tests/unit/test_credit_constants_generated.py` scans for the literal `2000` near
the word *credit* and turned up a **sixth** copy nobody had counted —
`services/portfolio_service.py`, a local variable inside a method, invisible to
any grep for a module constant — and a **seventh** in `routes/admin/poe.py`
dividing by a bare `2000`. Both now import the constant. The scan is AST-based: a
line-based first version flagged three module docstrings that explain the rate and
found nothing real, which is the shape of a check people learn to switch off.

`mobile/src/__tests__/pillarPalette.test.ts` was updated because commit 3 removed
the pillar hexes from the two backend files it scanned. Its assertion for
`pillar_utils.py` changed from *"its copy agrees"* to *"it holds no copy"*, which
is the stronger claim. `config/pillars.py` still spells hexes inside its web-only
Tailwind gradients, so it is now checked where it matters: every gradient must
open on the canonical base colour, which is the exact value that was flipped in
2026-09-04.

### 5. `a9fe2709` — one definition of the admin client

**Sixty-seven** modules had each written the same accessor:

```python
def _admin():
    return get_supabase_admin_client()
```

Not near-copies — the identical function, arrived at independently, because every
module that must bypass RLS needs the same one-line wrapper and the shortest path
is to type it again. Six wore a different name (`_db`, `_admin_db`,
`_triage_client`); the AST check found those, a grep for `def _admin` would not
have.

The cost was never that the copies disagreed — there was nothing in them to
disagree about. It is that **there was no single place to put anything**. A Sentry
breadcrumb, a call counter, an assertion that we really are on the service role:
each meant sixty-seven edits, so none was made, and the RLS bypass stayed the one
thing in this codebase with no seam in front of it. `utils/admin_client.py` is
that seam. Call sites are untouched — every module imports it under the name it
already used.

**The reasons came with it.** Each copy carried a comment saying why *that* module
bypasses RLS — twenty-seven distinct justifications, and the valuable half of
SEC-13. Every one now sits above its module's import, and
`test_admin_client_justified.py` was extended to treat
`from utils.admin_client import admin_client` as a call site. **Without that
extension this refactor would have silently emptied that test of sixty-seven of
its subjects while it kept passing** — the exact failure mode that test's own
docstring was written about. It sees 1,080 call sites today, 61 of them accessor
imports, 0 unjustified.

The `database` import stays *inside* the function, and that is measured rather
than assumed. Hoisting it was tried: `import database` from a `utils/` module
raises `ImportError` on a partially initialised module, because `database`
imports `utils.log_scrubber`, which closes the loop. Five of the copies had
already found this; their comments said so and now point at the shared accessor.

`tests/unit/test_one_admin_accessor.py` caps this at one definition, matched on
**shape** rather than on the name (a copy returning as `_sb()` is the same
duplication with a different label), and pins the location — a bare count would be
satisfied by someone moving the definition back into a route module.

---

## Verification asked for, and the answer

| Asked | Result |
|---|---|
| All three suites green | Yes — backend 5,575 / web 2,857 / mobile 938, zero failures |
| Mobile builds through Metro | Yes — `npx expo export` for iOS **and** Android, clean. Byte-identical bundle across the workspace change |
| Web builds through Vite | Yes — `npm run build`, clean |
| Generator produces byte-identical output to what was deleted | **Values are identical; bytes are not, and could not be.** See below |
| 86 pillar / 84 subject references resolve to the generated output | Substantially yes, with one deliberate exception. See below |

**On "byte-identical".** A generator cannot reproduce the *bytes* of a
hand-written module — the old files interleaved data with helper functions,
audience-specific descriptions and comments. What was verified instead, and what
the claim actually needs, is that **every generated value equals the value it
replaced**, checked by executing the pre-change modules out of `git show HEAD:` and
comparing structures: `PILLAR_KEYS`, `PILLAR_DISPLAY_NAMES`,
`LEGACY_PILLAR_MAPPINGS` and the whole nested `PILLARS` dict from
`pillar_utils.py`; `PILLARS` from `config/pillars.py`; `SCHOOL_SUBJECTS` and
`SCHOOL_SUBJECT_DISPLAY_NAMES` from `school_subjects.py`. All equal, order
included where order is observable.

**On "all references resolve to the generated output".** The *vocabulary* now has
one source and nothing re-declares it. What five modules still declare is a
**display order** — a list of the same five keys in a different sequence — because
each of those orders reaches a user as a sequence (a JSON array, an iterated
category list, a joined error string, two AI prompts). Changing them would have
been a product change. The guard test asserts each is a permutation of the
canonical keys, so those lists cannot add, drop or misspell a pillar. If you would
rather they all take the canonical order, that is a one-line change per module
plus a decision about the `/api/pillars` response — say the word and it is a small
follow-up.

---

## Bugs found

The phase's ground rule was to record bugs rather than fix them inline. B1 was
followed up afterwards, on the user's instruction, and is now fixed end to end —
code, data and constraint. The rest are recorded only.

### B1. Six paths seeded `user_skill_xp.pillar` with display names — **fixed in `0cd91cf5`**

**This turned out to be six times larger than first reported, and it hid a
second bug that would have destroyed data.** Both are fixed; the data cleanup is
the part still waiting on you.

`user_skill_xp.pillar` holds a pillar KEY. Six account-creation paths seeded a
new student's five zero rows with the pre-2025 DISPLAY names instead:

| Path | |
|---|---|
| `routes/auth/registration.py` | email signup |
| `routes/auth/login/security.py` | **runs on every login** |
| `routes/auth/google_oauth.py` | Google sign-in |
| `routes/admin/bulk_import.py` | both bulk-import routes |
| `routes/admin/organization_courses.py` | org student create |
| `services/roster_import_service.py` | roster import |

There is no CHECK constraint on the column, so every write returned 200.
Production held **2,850 such rows across 570 students** — more wrong-shaped rows
than right-shaped ones in the entire table — and the most recent was written on
2026-09-09, the day of the fix. No XP was lost: all 2,850 carry `xp_amount = 0`.
The seeding simply never did its job, and 159 of those students later grew a
second, correct set of rows the moment they earned anything.

#### The trap underneath it

The obvious fix is one line per site. **Shipping only that would have been a
data-loss incident.**

Those writes are `upsert(..., on_conflict='user_id,pillar')` carrying
`xp_amount: 0`, and a PostgREST upsert **overwrites** on conflict. One of them
sits under a comment reading *"Try to insert all at once, ignore conflicts (if
they already exist)"* — what the author believed, not what the call does. And
`ensure_user_diploma_and_skills` runs on **every successful login**
(`routes/auth/login/core.py:801`), outside the "new diploma" branch that guards
the rest of the function.

So the wrong names were the only thing keeping it safe: they never collided, so
the overwrite never had anything to overwrite. **Correcting the names is
precisely what would have armed it** — and the next login would have reset all
five balances to zero for every returning student.

Both halves therefore landed together in `0cd91cf5`, because either alone is
worse than neither:

- every seeding upsert now passes `ignore_duplicates=True` (`ON CONFLICT DO
  NOTHING`) — a no-op today by construction, since nothing collides yet;
- the six pillar lists now come from `generated.pillars.PILLAR_KEYS`.

`scripts/repair_missing_xp.py` deliberately keeps its overwriting upsert: it
writes a *corrected* balance, which is the whole point of a repair script. The
guard test distinguishes them by the literal zero.

`tests/unit/test_skill_xp_seeded_with_pillar_keys.py` holds both rules, plus a
floor so the scan cannot pass by finding nothing.

#### The data — cleaned up 2026-09-09

Three scripts, each executed end to end against staging (synthetic data only)
before going anywhere near production, then **run against production on
2026-09-09**:

| Script | What it does |
|---|---|
| [`cleanup_skill_xp_legacy_pillars.sql`](cleanup_skill_xp_legacy_pillars.sql) | Backs up then deletes the 2,850 rows. Two tripwires abort it if anything is not as expected. |
| [`cleanup_skill_xp_legacy_pillars_rollback.sql`](cleanup_skill_xp_legacy_pillars_rollback.sql) | Restores them from the backup table. |
| [`20260909205019_user_skill_xp_pillar_is_a_key.sql`](../../supabase/migrations/20260909205019_user_skill_xp_pillar_is_a_key.sql) | The CHECK constraint that stops a seventh path. Applied as a recorded migration. |

Verified on staging: the cleanup deleted exactly the 15 seeded legacy rows and
left all 3,905 real rows untouched with their balances intact; the rollback
restored all 15; **tripwire 1 was armed deliberately** (one legacy row given
4,200 XP) and aborted the run as intended; the constraint refused to be added
while legacy rows were present and then rejected an `'Arts & Creativity'`
insert. Staging was returned to exactly the state it was found in.

Deleting rather than re-keying, because `user_skill_xp` has
`UNIQUE (user_id, pillar)` and 159 students already hold correct rows with real
balances — an UPDATE would collide with exactly the rows that matter. Nothing
references `user_skill_xp.id` (zero foreign keys, checked against the live
catalog), so the delete is self-contained.

### B2. The demo shows a different subject name from everywhere else

`web/src/contexts/DemoContext.jsx:113` renders `cte: 'Career & Technical'`. Every
other surface — both transcript routes, the credit table, the shared JSON — says
`'Career & Technical Education'`. It is a demo fixture, so it was left alone
rather than quietly repointed at the shared map, which would have changed what a
prospective family sees.

### B3. A third subject vocabulary, in the prompts

`prompts/components.SCHOOL_SUBJECT_DISPLAY_NAMES` is a hybrid: the short picker
names for most subjects (`'Math'`), but the long transcript names for `pe` and
`cte`. It may well be deliberate — the long form reads better to a model — but
nothing says so. Left as found;
`test_credit_constants_generated.py` pins the two legitimate vocabularies
against each other so nobody "fixes" the difference by accident.

### B4. A dead validator holding a stale pillar list

`utils/quest_validation.py` scores a quest's tasks against
`self.valid_pillars`, which is the pre-2025 display names — so a task carrying a
modern key would be marked *"invalid or missing pillar"*. It does not bite,
because `QuestValidator` is **never instantiated**: the only live imports are the
module-level `can_activate_quest` and `can_make_public`. Dead code with a stale
copy of a vocabulary, which is worth deleting on its own merits.

### B5. Display fallbacks that render a retired name

`routes/quest/completion.py` (4 sites) and `services/portfolio_service.py`
(3 sites) fall back to `task_info.get('pillar', 'Arts & Creativity')`. These are
response-dict *display* values, not database writes, so a task with no pillar
renders a name the product retired in 2025. Left alone because changing them
changes what a portfolio shows.

---

## What I could not do, and why

**1. The branch already belonged to a different Phase 2.**
`refactor/remediation-2026-09-phase2` was checked out and clean at session start,
and its recent commits are the migration reconciliation (OPS-01 / OPS-03), with
its own `PHASE_2_HANDOFF.md`. I committed this phase on top rather than cutting a
new branch, and rather than rewriting the branch afterwards: another agent is
working in this tree, and `reset`/`rebase` on a shared branch is exactly the
destructive git that CLAUDE.md rule 11 forbids. So one branch now carries two
unrelated phases, and this handoff has a distinct filename to avoid clobbering the
other one. If you want them split, the clean way is `git branch <new> HEAD` plus a
revert on the old branch — your call, and I did not make it for you.

**2. npm workspaces across all four `package.json` files — deliberately not done.**
This is the one item of the brief I did not deliver as written, and the reason is
that it cannot ship without changing production build commands I do not have
access to. Full detail in NEEDS TANNER item 1.

**3. API request/response types and validation schemas — nothing left to move.**
The brief asked for these to go into `shared/`. Having looked: **`web/src` is 100%
JavaScript — 0 TypeScript files across 1,339 modules.** So there are no API types
on the web side to unify with mobile's, and mobile's are declared inline in the
service modules that use them. Moving them to `shared/` would relocate
single-consumer code into a folder whose README says it is for things two surfaces
both need — cost with no duplication removed. The genuinely duplicated validation
rules were already moved by QF-01 (`shared/roles.ts`, `shared/richTextCases.json`,
the upload cap, the subject vocabulary). Credit calculation, the one substantial
piece left, is done. **If web ever adopts TypeScript this becomes worth revisiting;
today it is not.** I would rather say that than ship a directory of moved files
and call it consolidation.

**4. The 25-XP floor is backend-only.** `MIN_XP_REWARD` / `MIN_XP` / a bare `25`
appear in three backend modules (`bounty_service`, `sis_quest_authoring`,
`quest_ai_service`). It is real duplication but not *cross-platform*, so it does
not belong in `shared/`. A backend-internal consolidation for a later phase.

---

## NEEDS TANNER — all three resolved 2026-09-09

Kept as the record of what was decided and what was done.

### 1. npm workspaces for `web/`, `mobile/`, `marketing/` — **declined**

Asked and answered: no. `shared/` stays the only workspace member, the apps keep
reaching it through the `@shared` alias, and the three Render build commands are
untouched. Nothing to do; if this is ever reopened, the analysis and the
numbered dashboard steps are in git history for this file.

### 2. The mis-keyed rows — **cleaned up, and the door is shut**

Run against production (`vvfgxcykxjybtvpfzwyx`) on 2026-09-09:

| Step | Result |
|---|---|
| `cleanup_skill_xp_legacy_pillars.sql` | 2,850 rows backed up to `user_skill_xp_legacy_backup_20260909`, then deleted. 570 students. |
| Verification | 795 rows remain, exactly five keys, **376,407 XP unchanged** |
| CHECK constraint | Applied as migration `20260909205019_user_skill_xp_pillar_is_a_key` |

The constraint was verified by trying the exact write that caused the bug —
inserting `'Arts & Creativity'` — and production refused it.

It went in **as a recorded migration**, not by hand: the SQL is committed at
`supabase/migrations/20260909205019_user_skill_xp_pillar_is_a_key.sql` and
`supabase_migrations.schema_migrations` holds a row at that same version, so the
directory and the history still agree. Applying DDL through the SQL editor is
exactly the habit that produced the drift OPS-03 closed a day earlier, and this
was not the moment to reopen it.

**The backup table is still there** and is the only copy of those 2,850 rows.
`cleanup_skill_xp_legacy_pillars_rollback.sql` restores them. Drop it when you
are satisfied:

```sql
DROP TABLE public.user_skill_xp_legacy_backup_20260909;
```

### 3. The demo's CTE label — **fixed, by deleting the copy**

`'Career & Technical'` → `'Career & Technical Education'`.

Rather than retyping the string, the whole eleven-entry map went: with the CTE
value corrected it was character-for-character the transcript vocabulary the
backend already publishes, so `DemoContext` now reads
`TRANSCRIPT_SUBJECT_NAMES` from `@shared/credits`. One fewer copy is one fewer
place to drift, and this copy had already drifted — on the first screen a
prospective family sees.

---

## Follow-ups done since the handoff was first written

- **The transcript vocabulary is one map.** It turned out to be EIGHT copies on
  the web, not five, and three of them disagreed about the same subject:
  `'Career & Technical Education'` in the transcript views, `'Career &
  Technical'` in the demo, `'Career & Tech Ed'` on two portfolio cards. All
  eight read `@shared/credits` now. The two normalisation tables
  (`EvidenceMasonryGallery`, `SubjectBadges`) keep their four genuinely local
  aliases — `Arts`, `Music`, `Business`, `Technology` — explicit, because what
  is local should look local. Guarded by a check that no file under `web/src`
  spells any of the three CTE variants outside a comment.
- **The dead validator is gone.** `utils/quest_validation.py` lost 561 lines: a
  `QuestValidator` class doing reading-level estimation and XP scoring that was
  never instantiated anywhere. 666 lines → 112. Its stale `valid_pillars` list
  went with it.
- **`SubjectBadges` has tests now**, which it did not before. The derivation
  that replaced its twenty-five hand-written entries was checked once by hand
  against the literal — and a one-off check that is then deleted is the exact
  pattern this directory records four defects from. It is a test instead.

## Still open, for a later pass

- **B4** — resolved above (the dead validator is deleted).
- **B5** — seven display fallbacks still render `'Arts & Creativity'` when a task
  has no pillar (`routes/quest/completion.py`, `services/portfolio_service.py`).
  Response values, not writes, so a portfolio can still show a name the product
  retired in 2025.
- **B3** — `prompts/components.SCHOOL_SUBJECT_DISPLAY_NAMES` is a third, hybrid
  subject vocabulary: picker names for most subjects, transcript names for `pe`
  and `cte`. May be deliberate; nothing says so.
- **`SubjectDistributionEditor.jsx`** uses subject keys that are not in the
  `school_subject` enum at all — `english`, `arts`, `physical_education`,
  `other`. It is live (TeacherVerificationPage → VerificationModal), so whatever
  distribution it writes is keyed on values nothing else recognises. Found while
  removing the transcript copies; not investigated, because it is a data-shape
  question rather than a duplication one.
- The five backend modules that declare their own pillar **display order** could
  take the canonical one, if you would rather `/api/pillars` and the treehouse
  agree on ordering. A product call, not a refactor.
