# Phase 2 (shared/) — handoff

**Make `shared/` a real workspace package and the single source of truth for
cross-platform contracts.** Completed 2026-09-09.

Branch: `refactor/remediation-2026-09-phase2`.
Five commits, `1062bbe0` … `a9fe2709`, on top of `e2beced5`.
139 files changed, +2,687 / −1,186.

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
| Backend (`pytest`) | 5,538 passed / 160 skipped / **0 failed** | 5,575 passed / 160 skipped / **0 failed** |
| Web (`vitest`) | 323 files, 2,855 passed / **0 failed** | 323 files, 2,857 passed / **0 failed** |
| Mobile (`jest`) | 113 suites, 938 passed, 3 skipped / **0 failed** | 113 suites, 938 passed, 3 skipped / **0 failed** |

The +37 backend and +2 web tests are the new guards listed below. No existing
test was removed.

**Other gates, all clean after:** `pyflakes` (undefined names: none),
`ruff` (F/E9/B/S110/S112), `mypy` (1,113 files, no issues),
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

## Bugs found — recorded, not fixed

Per the ground rule that this pass is structural.

### B1. Roster import writes legacy display names into `user_skill_xp.pillar` — **live, 2,850 rows**

`services/roster_import_service.py::_init_skill_xp` seeds a new student's five
pillar rows using the pre-2025 **display names** (`'Arts & Creativity'`,
`'STEM & Logic'`, …) where every other writer in the codebase uses a key
(`'art'`, `'stem'`). There is no CHECK constraint on `user_skill_xp.pillar`
(verified against production), so the write succeeds silently.

Production, as of 2026-09-09:

| Shape | Rows | Users |
|---|---|---|
| Legacy display names (5 × 570) | **2,850** | 570 |
| Correct keys (`stem`/`art`/…) | 795 | 176 max per key |

**There are more wrong-shaped rows in this table than right-shaped ones.**

Impact is bounded but real: **every one of the 2,850 rows has `xp_amount = 0`**, so
no XP has been lost or misfiled. They are inert placeholders that the seeding was
supposed to create under the right key. 159 of the 570 users have both shapes —
they earned XP later, which correctly created key-shaped rows alongside the dead
ones. The cost is that any read which iterates a user's `user_skill_xp` rows sees
five extra unrecognised pillars at zero, and the seeding does not do the job it
exists to do.

A fix is two parts: point `_init_skill_xp` at the pillar keys, and delete or
re-key the 2,850 rows. A CHECK constraint on `pillar` would have caught this at
the first write and would stop the next one — but that is a migration, and this
phase was told not to touch `supabase/migrations/`. The call site now carries a
comment pointing here.

### B2. The demo shows a different subject name from everywhere else

`web/src/contexts/DemoContext.jsx:113` renders `cte: 'Career & Technical'`. Every
other surface — both transcript routes, the credit table, the shared JSON — says
`'Career & Technical Education'`. It is a demo fixture, so it was left alone
rather than quietly repointed at the shared map, which would have changed what a
prospective family sees.

### B3. A third subject vocabulary, in the prompts

`prompts/components.SCHOOL_SUBJECT_DISPLAY_NAMES` is a hybrid: the short picker
names for most subjects (`'Math'`), but the long transcript names for `pe` and
`cte` (`'Physical Education'`, `'Career & Technical Education'`). It may well be
deliberate — the long form reads better to a model — but nothing says so, and it
is a third list where the codebase now has two documented ones. Left as found.
`test_credit_constants_generated.py` pins the two legitimate vocabularies against
each other so nobody "fixes" the difference between them by accident.

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

## NEEDS TANNER

### 1. Decide whether `web/`, `mobile/` and `marketing/` become workspace members

**Why it stopped here.** Adding them requires editing build commands in the Render
dashboard, which I cannot reach, and `render.yaml` is inert for static sites — the
dashboard is authoritative. I read the live values through the Render API to be
sure rather than guessing:

| Service | rootDir | Live build command | Under workspaces |
|---|---|---|---|
| `optio-prod-frontend` | `""` | `cd web && npm install && npm run build` | Installs the **whole** monorepo; `npm run build` breaks — it hardcodes `node_modules/vite/bin/vite.js`, which hoists to the root |
| `optio-dev-frontend` | `""` | same | same |
| `optio-marketing` | `marketing` | `npm ci && npm run build` | **Fails outright.** `npm ci` needs a lockfile in the working directory; workspaces put one lockfile at the root |
| `optio-dev-v2-frontend` | `mobile` | `npm install --legacy-peer-deps && npx expo export --platform web` | Applies `--legacy-peer-deps` to the web app's tree as well |

`optio-marketing` serves **www.optioeducation.com** and auto-deploys on every
commit to `main`. A static-site build failure leaves the previous deploy serving,
so this is "deploys stop working until the dashboard is updated", not "the site
goes down" — but it is still a production pipeline breaking on merge.

There is a second, quieter cost: under workspaces every frontend build installs
every other app's dependencies. `web/vite.config.js` already carries a comment
that its build "runs close enough to the heap limit on Render's builder that it
has OOM'd there while passing locally", and all four services are on the `starter`
build plan.

**What you get for it:** `web/` and `mobile/` could depend on `@optio/shared` as a
package instead of through the five-config `@shared` alias. The alias works today
and `sharedAlias.test.ts` guards all five declarations, so this is tidiness, not
capability. `shared/` is already a real workspace package either way, which is what
the phase was for.

**My recommendation: don't, unless you want it for its own sake.** If you do:

1. Open the Render dashboard → `optio-marketing` → Settings → Build Command.
   Change `npm ci && npm run build` to `npm ci --workspaces --include-workspace-root && npm run build`,
   or set the service's rootDir to `""` and use `cd marketing && …`.
2. Same page for `optio-prod-frontend` and `optio-dev-frontend`: no command change
   needed, but `web/package.json`'s `build` script must first change from
   `node --max-old-space-size=4096 node_modules/vite/bin/vite.js build` to
   `NODE_OPTIONS=--max-old-space-size=4096 vite build` (a repo change; say the word
   and I'll make it).
3. `optio-dev-v2-frontend`: confirm `npm install --legacy-peer-deps` at the
   workspace root is acceptable for the web app's dependency tree too, or split the
   command.
4. Then, in the repo: add `"web"`, `"mobile"`, `"marketing"` to the root
   `workspaces` array, delete the three per-app `package-lock.json` files, run
   `npm install` at the root once, and update the three CI workflows
   (`tests-web.yml`, `tests-mobile.yml`) — each does `npm ci` in a
   `working-directory` and caches on a per-app lockfile path.
5. Verify with a real `npx expo export`, not a test run, before merging.

Steps 4 and 5 are mine to do once you have done 1–3. **Tell me which way you want
it.**

### 2. Decide what to do about the 2,850 mis-keyed `user_skill_xp` rows (B1)

Two decisions, then I can do both:

1. **The code fix** — point `_init_skill_xp` at the pillar keys. One line, no
   product decision. Say go and it is done in the next phase.
2. **The data** — the 2,850 rows all carry `xp_amount = 0`, so deleting them loses
   nothing; re-keying them would collide with the correct-key rows the 159 active
   students already have (there is a `UNIQUE (user_id, pillar)` constraint). I would
   **delete** them and let the fixed seeding recreate them properly, but that is a
   write to production data on 570 real students' rows and I am not doing it on my
   own judgment. Confirm the approach and whether you want an export first.
3. **Optional, and the thing that stops a recurrence:** a CHECK constraint on
   `user_skill_xp.pillar` restricting it to the five keys. That is a migration, and
   this phase was told not to touch `supabase/migrations/`, so it needs to be a
   Phase-2-migrations task rather than mine.

### 3. Confirm B2 is a bug and not a deliberate demo label

`web/src/contexts/DemoContext.jsx` shows CTE as `'Career & Technical'`. If that is
just a typo, point it at the shared map — one line. If the demo shortens it on
purpose to fit a layout, say so and I will leave a comment there recording that,
so the next person to notice does not re-open it.

---

## Where things now live

| Path | What it is |
|---|---|
| `shared/data/*.json` | The canonical data. Hand-edited. Nothing else is a source. |
| `shared/generated/*.ts` | Emitted. **Do not edit.** |
| `backend/generated/*.py` | Emitted. **Do not edit.** |
| `shared/scripts/generate-constants.mjs` | The generator. `npm run generate` / `npm run generate:check`. |
| `shared/credits.ts`, `shared/pillars.ts`, `shared/subjects.ts` | Typed front doors — helpers over the generated data, hand-written. |
| `backend/utils/admin_client.py` | The one admin-client accessor. |
| `shared/README.md` | What belongs in `shared/` and what does not. |

**If you edit a JSON file under `shared/data/`, run `npm run generate` from the
repo root and commit what it writes.** CI fails otherwise.

### New guards

| Test | Holds |
|---|---|
| `backend/tests/unit/test_pillar_constants_generated.py` | Every backend pillar list is a permutation of the canonical five; every name map equals the generated one; every legacy spelling still normalises |
| `backend/tests/unit/test_credit_constants_generated.py` | The credit table, rate and transcript names match the JSON; no module writes `2000` near "credit" again (AST) |
| `backend/tests/unit/test_one_admin_accessor.py` | One admin-client accessor, matched on shape, pinned to `utils/admin_client.py`, database imported lazily |
| `backend/tests/unit/test_admin_client_justified.py` *(extended)* | Importing the shared accessor now requires a justification comment, same as calling the factory |
| `mobile/src/__tests__/sharedAlias.test.ts` *(extended)* | `shared/` is a workspace package with no `"type"`; Metro declares `nodeModulesPaths` |
| `mobile/src/__tests__/pillarPalette.test.ts` *(updated)* | `pillar_utils.py` holds **no** pillar hex; every `config/pillars.py` gradient opens on the canonical base |
| `web/…/studentContextCredits.test.jsx` *(extended)* | No credit table under `web/src`; the app reaches it via `@shared/credits`; it agrees with the canonical JSON |
| `.github/workflows/tests-web.yml` *(new step)* | The generator's output matches what is committed |
