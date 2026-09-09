# Phase 1 handoff — rename the two frontends to platform siblings

**Branch:** `refactor/remediation-2026-09-phase1` (4 commits, not merged, not pushed)
**Branched from:** `docs/remediation-2026-09-phase0` @ `b02091a8`, which is 5 commits
ahead of `main`. Phase 0 is still unmerged, so this branch carries Phase 0's
commits too.
**Date:** 2026-09-08
**Scope:** directory rename and terminology. **No behaviour changed.**

`frontend/` → `web/`, `frontend-v2/` → `mobile/`, done with `git mv` so history
follows each file. The names encoded a succession that is not the plan: web and
mobile are permanent platform siblings.

> **Read NEEDS TANNER first if this branch is anywhere near merging.** Three
> Render services are dashboard-managed with `frontend`/`frontend-v2` hard-coded
> in their build config. Merging this to `develop` or `main` without changing
> them first breaks the web deploy on the first build.

---

## 1. What changed

| SHA | Commit | Files | +/- |
|---|---|---|---|
| `4573b560` | Rename `frontend/` -> `web/` and `frontend-v2/` -> `mobile/`, and repoint every path | 1,975 | +756 / -557 |
| `f746e9a5` | Say web and mobile in code comments, not v1 and v2 | 72 | +126 / -120 |
| `3d33fbd9` | Say web and mobile in the docs, and flag the two claims the rename invalidates | 27 | +217 / -189 |
| `62044805` | Two more surface references: the design-sync entry and OPEN_FINDINGS | 2 | +4 / -4 |

### `4573b560` — the move, and everything that resolves a path

1,872 of the 1,975 files are pure renames. The rest are the references.

**Why the repoint is in the same commit as the move.** A commit that renames
1,872 files and repoints nothing is a commit where all three suites and both
builds fail. There would be no green point on this branch to bisect to, which is
worse than one commit that is large because a rename is large. The three
follow-up commits are terminology only and each is independently green.

Repointed:

- **CI** — `working-directory`, `cache-dependency-path`, `paths:` filters and the
  audit-gate `--dir` argument across `tests-web.yml`, `tests-mobile.yml`,
  `eas-update.yml`, `ios-testflight.yml`, `release.yml` and the e2e workflow.
- **Workflow file renamed:** `.github/workflows/frontend-v2-e2e.yml` →
  `mobile-e2e.yml`.
- **dependabot** — both npm ecosystem directories (`/frontend` → `/web`,
  `/frontend-v2` → `/mobile`).
- `.gitignore`, `.env.example`, `mac-setup.sh`, `scripts/*.sh`,
  `scripts/mac-mini-bootstrap.sh`, `.design-sync/gen-styles.sh` and `NOTES.md`.
- `mobile/package.json`'s `name` (`frontend-v2` → `mobile`) and the two matching
  `name` fields in its lockfile. Checked first that `npm ci` does not fail on a
  package/lockfile name mismatch — it does not — so the lockfile edit is tidiness,
  not a requirement.
- **Three path references built from separate segments**, which a search for
  `frontend/` does not find and which fail only when the line executes:
  - `REPO / 'frontend' / 'src'` — `backend/tests/test_client_api_paths_exist.py`
  - `'frontend', 'src', 'modules', 'moduleKeys.json'` — `test_module_registry.py`
  - `join(..., 'frontend', 'src', 'utils', 'appSurface.js')` —
    `mobile/src/services/__tests__/deepLinkRouter.test.ts`

  Only the third one failed a test run, which is how the class was found at all.
  The other two were found by grepping for the shape once it was known.

**`render.yaml` is hand-edited, not swept.** Its stated purpose is to be a
truthful record of dashboard-managed services. A blind sweep had rewritten its
record of what is *live* — the file would have claimed the live build command
already said `web`. It now records the live (stale) values, the post-rename
values, and a header saying which is which.

**Config aliases needed no change.** All five `@shared` declarations (vite,
vitest, metro, tsconfig, jest) are relative, so they followed the rename.
`mobile/src/__tests__/sharedAlias.test.ts` passes unchanged apart from the paths
it reads.

### `f746e9a5` — code comments

72 files. Only *surface* references were rewritten. Two were more than wording:

- **`backend/routes/quest/detail.py`** justified keeping the legacy
  `quest_tasks` response key "until the v1→v2 migration retires v1". There is no
  such migration, so the comment promised a cleanup that will never arrive. It
  now says the key stays while the web app reads it, and that dropping it means
  changing the four call sites first.
- **`backend/routes/auth/token_delivery.py`**'s `_NON_V1_ORIGIN_HINTS` →
  `_NON_WEB_APP_ORIGIN_HINTS`. Its **values are untouched**:
  `optio-dev-v2-frontend` is a live Render service name, not a description.
  See NEEDS TANNER §3 — that string is load-bearing.

Two test names moved with them, so a failure names the surface that broke:
`test_the_v2_web_target_keeps_working` → `test_the_mobile_web_target_keeps_working`,
and the `@shared` alias test's `V2` path constant → `MOBILE`.

### `3d33fbd9` — docs

CLAUDE.md's directory map, environments table, tech stack, CI job list and
coverage table follow the new names; header date is now September 8, 2026. Its
surface-names note previously read "v1 = web app; v2 = mobile app. Web users
stay on v1 indefinitely" — a sentence that had to argue with its own vocabulary.
It now states the sibling relationship, records the old directory names and the
rename date, and asks that v1/v2 not come back for these two.

Also swept: `LOCAL_DEVELOPMENT.md`, `mac-setup.sh`, `.design-sync/NOTES.md`,
`ADR-001-token-storage.md`, `SESSION_LOGOUT_AUDIT_2026-07-30.md`,
`ARCHITECTURE_CORE_AND_PROGRAMS.md`, the OEA Phase 2 plan, the SIS discovery and
implementation plans, the JJ and Gryffin plans, `DESIGN_SYSTEM.md`,
`ROUND8_SHIPPED_2026-07-31.md` and `brevo_funnel_plan.md`.

Renamed: `mobile/V2_LAUNCH_READINESS.md` → `MOBILE_LAUNCH_READINESS.md`,
`mobile/V2_AUDIT_IMPLEMENTATION_PLAN.md` → `MOBILE_AUDIT_IMPLEMENTATION_PLAN.md`.
The first is a 61-reference parity table whose column headers were literally
`| V1 | V2 |`; they now read `| Web | Mobile |`, and the file carries a banner
saying its observations are as of 2026-03-27 and were **not** re-verified.
Renaming the vocabulary in a snapshot must not be mistaken for refreshing it.

`mobile/README.md` was rewritten (see §4). While rewriting it, two pre-existing
defects in it were fixed because leaving them in a file being rewritten would
have been odd: a dead link to a Windows-absolute path
(`../C:/Users/tanne/.claude/plans/tender-bubbling-teacup.md`) is dropped, and its
"CLAUDE.md rule 7" citation is corrected to **rule 8**, which is the superadmin
rule it meant.

---

## 2. Test results

Baselines were captured on this tree **before** the move, and the "after" numbers
come from a **clean worktree** checked out at `62044805` — see §3 for why that
matters.

| Suite | Before | After |
|---|---|---|
| Backend (`cd backend && pytest`) | 5,528 passed, 160 skipped, **0 failed** | 5,528 passed, 160 skipped, **0 failed** |
| Web (`npm run test:run`) | 322 files, 2,829 passed, **0 failed** | 323 files, 2,849 passed, **0 failed** |
| Mobile (`npm run test:run`) | 113 suites, 932 passed, 3 skipped, **0 failed** | 113 suites, 932 passed, 3 skipped, **0 failed** |

The web suite gained one file and 20 tests. **Those are not mine** — they are
another session's uncommitted work in this shared tree (§3). Nothing this branch
did adds or removes a web test.

Additional verification, all at `62044805`:

| Check | Result |
|---|---|
| `cd mobile && npx tsc --noEmit` | exit 0, no output |
| `cd web && npm run build` | exit 0, `✓ built in 8.15s`, `version.json` written |
| `cd mobile && npx expo export --platform web` | exit 0, `Exported: dist` |

The web build still prints its pre-existing "chunks larger than 600 kB" warning.
That is unchanged by this branch.

---

## 3. Another session is working in this tree — read before you run pytest

`pytest` run **in the main working tree right now reports 2 failures**:

```
FAILED tests/unit/test_direct_db_calls_do_not_grow.py::test_direct_db_calls_do_not_grow[services]
FAILED tests/unit/test_direct_db_calls_do_not_grow.py::test_the_upper_layers_do_not_grow_in_total
  Direct `.table(...)` calls in services/ grew from 1828 to 1831.
```

**They are not from this branch.** Another Claude session is mid-feature on the
Messages unread badge and has uncommitted work in the same checkout:

- modified: `backend/routes/direct_messages.py`,
  `backend/services/group_message_service.py`,
  `backend/tests/unit/test_direct_db_calls_do_not_grow.py`,
  `web/src/components/communication/ConversationList.test.jsx`,
  `web/src/components/communication/GroupChatWindow.test.jsx`
- untracked: `backend/repositories/group_repository.py`,
  `backend/tests/test_messages_unread_badge.py`,
  `web/src/utils/groupsByChild.test.js`

That list is a snapshot taken while writing this, and it grew during the session
(`web/src/utils/groupsByChild.js`, `mobile/src/utils/groupsByChild.ts`,
`mobile/src/stores/prefsStore.ts` and both `ConversationList` implementations
appeared later). Run `git status` for the current set rather than trusting it.
The rule that matters is the one this branch followed: `git add <the files you
touched>`, never `git add -A`.

Attribution, measured rather than assumed: their unstaged diff adds exactly 3
`.table(` calls (all in `group_message_service.get_unread_total`); this branch's
diff adds **zero**. Running only `test_direct_db_calls_do_not_grow.py` in a clean
worktree at this branch's tip passes 10/10.

Their work is mid-flight and internally inconsistent at the moment — they have
already raised the `repositories` baseline from 439 to 442 for a new
`GroupRepository`, but the three calls still live in `services/`. That is their
migration to finish, and **none of their files were staged or touched here.**

**Two consequences for whoever picks this up:**

1. To verify this branch, use a scratch worktree, not the shared tree:
   ```bash
   git worktree add /tmp/verify refactor/remediation-2026-09-phase1
   cp backend/.env /tmp/verify/backend/.env
   cd /tmp/verify/backend && pytest -q
   ```
2. **The rename moved files out from under that session.** Their edits survived —
   `git mv` renames the directory on disk, so their working-tree changes now sit
   at `web/src/components/communication/...` instead of
   `frontend/src/components/...`. Nothing was lost. But their session's idea of
   where its files are is now wrong, and they will need to be told.

---

## 4. Ambiguous cases — listed rather than guessed

A "v1"/"v2" that means something other than a surface was left exactly as it was.
Two groups.

### 4a. Unambiguously not a surface — no decision needed

`/api/v1` and the deprecation `Link` header, `api_response_v1.py`,
`utils/versioning.py`, `routes/decorators.py`'s version-aware decorator, cgroup
v1/v2 in `memory_monitor.py`, `TOKEN_VERSION` default `v1`, `supabase/setup-cli@v1`
and `google-github-actions/auth@v2`, `application/vnd.ims.lis.v1|v2`, `PRD V2`
(the OEA requirements doc), `enc:v1:` (the org-secrets envelope prefix), the
lesson-content schema versions in `lesson_helper.py`, `create_quest_v2`,
`get_items_v2`, `test_award_xp_v2.py`, the `v1.1`/`v1.2` document version history
in `shared/legal/*`, and the vendored `jscanify v1.4.0`.

### 4b. Genuinely ambiguous — reads as "the first cut of this feature", but could mean the web app

These are the ones a person who was there should decide. **19 sites:**

| File:line | Text | Likely meaning |
|---|---|---|
| `backend/routes/sis/community.py:7,227` | "by any staff member (v1)" | first cut of the community feature |
| `backend/routes/sis/secure_documents.py:8` | "v1 has no per-person visibility" | first cut |
| `backend/services/sis_form_template_service.py:40` | "v1 field types" | first cut |
| `backend/routes/lti/config.py:12` | "matches the v1 implementation surface" | first LTI implementation |
| `backend/routes/lti/launch.py:332` | "For v1, JSON-encode into target_path" | first LTI implementation |
| `backend/services/lti_grade_sync_service.py:14,112` | "v1 calls this inline" | first cut (the next sentence is about a future cron job) |
| `backend/tests/unit/test_quest_reopen.py:72` | "only supported for Canvas LTI quests in v1" | first cut |
| `backend/routes/admin/org_modules.py:71,121` | "v2 of the panel", "Blocks panel v2" | second iteration of one panel |
| `web/src/pages/admin/OrgBlocksPanel.jsx:61` | "v2: name the consequences BEFORE a turn-off" | same panel |
| `docs/ARCHITECTURE_BLOCKS.md:548`, `docs/blocks/STATUS.md:12` | "Blocks panel v2" | same panel |
| `web/src/services/api.js:199` | "v1-style nested error payloads" | an API response shape |
| `web/src/pages/sis/SecureDocumentsPage.jsx:11` | "v1 is admin-only" | first cut |
| `mobile/src/components/lti/PlatformStorage.ts:12` | "In v1 our backend signs `state` as a JWT" | current implementation |
| `mobile/src/hooks/useSchool.ts:190`, `.../__tests__/useSchool.test.ts:50` | "no school surface for them in v1" | first cut |
| `mobile/docs/OFFLINE_CAPTURE_PLAN.md:8,101,105` | "Goal (v1)", "a rough v1" | first release of that feature |
| `docs/icreate/FORM_BUILDER_PROPOSAL_2026-08-20.md:57,97,126` | "Field types for v1" | first release |
| `docs/icreate/age-group-waitlist-gating-design.md:130` | "Out of scope v1" | first release |
| `docs/icreate/FEEDBACK_ROUND6_QUESTIONS_2026-07-28.md:91` | "v1 has no per-person visibility" | quoted from a reply to iCreate |
| `docs/play-store/PLAY_STORE_LISTING.md:266`, `docs/JJ/IMPLEMENTATION_PLAN.md:175`, `docs/JJ/IMPLEMENTATION_REPORT.md:83`, `docs/gryffin/GRYFFIN_SIS_PLAN.md:113`, `docs/OEA_Implementation_Plan_for_Approval.md:165,217` | "Skip for v1", "essential for v1", "low ROI for v1", "simplest v1 =", "For v1 planning" | scoping language |

### 4c. Deliberately left with their old vocabulary

- **`supabase/migrations-archive/`** — three files still cite `frontend/` or
  `frontend-v2/` in comments (`20260602_allow_audio_evidence_block_type.sql`,
  `20260801_org_secrets_and_rls_gaps.sql`,
  `20260802_revoke_data_api_on_student_work.sql`).
  Those files record migrations that already ran; rewriting them
  makes the record differ from what was applied. (Ground rule 7 fences
  `supabase/migrations/`; the active directory contains no such reference.)
- **`docs/remediation-2026-09/CLOSED_FINDINGS.md`** and **`PHASE_0_HANDOFF.md`** —
  dated records of what was found and measured. QF-01's title is literally "v1/v2
  duplication". Their file *paths* were repointed with everything else.
- **`mac-setup.sh:24`** — `PROJECT_DIR="$HOME/Desktop/pw_v2"`. That is a
  checkout directory on some machine, not a surface. It also does not match the
  actual checkout (`~/pathweaver_2.0`), so it may be stale for a different reason.

---

## 5. Two documents asserted things this rename makes false

Neither is mine to decide, so both are marked in place rather than quietly
reworded.

### 5a. `mobile/README.md` — rewritten

It opened with *"Will replace the v1 Vite frontend page-by-page"* and framed its
parity checklist as work to do *"until v1 is retired"*. Under the sibling model
that is not a burndown, it is the standing cost of shipping two surfaces, and the
README now says so. **If replacing the web app page-by-page is still the intent,
this rewrite is wrong and the whole rename is the wrong call** — say so and it
can be reverted as one commit.

### 5b. `docs/LTI_FRONTEND_REDESIGN.md` — flagged, not decided

**This is a real product question, not a wording one.** That doc decides to move
the LTI surface from the web app to the mobile app, and gives three reasons. The
first is *"no throwaway work (v1 is being retired)"*. That reason is now void:
the web app is not being retired, so remaining work on `web/src/pages/lti/` is
not throwaway.

The other two reasons are unaffected — the mobile app already has the `(lti)`
route group and the upload machinery, and LTI is a contained surface. The
original rationale is left in place with a note underneath recording that half of
it no longer holds. **See NEEDS TANNER §2.**

The rest of that doc was repointed normally: `<V2_HOST>` → `<MOBILE_HOST>`,
"v2-as-LTI-host cutover" → "mobile-as-LTI-host cutover". The staged cutover plan
in §8 and §10 is intact and still executable if the answer is "yes, still do it".

---

## 6. Bugs found, not fixed

Per ground rule 5, these are reported rather than repaired.

1. **`.github/workflows/mobile-e2e.yml:64` polls a Render service that does not
   exist.** It waits on `srv-d76n4bdm5p6s73fac69g`; the Render API returns
   `404 not found: service` for that ID, and it appears nowhere in the account's
   service list. The intended service is almost certainly
   `srv-d9sjl42fngtc73fff1d0` (`optio-dev-v2-frontend`). Every ID beside it in
   that file is valid, so this is a single stale ID, not a dead workflow. Effect:
   the "poll until the frontend deploy finishes" step never sees a deploy.
2. **`mobile/playwright-report.xml` is tracked in git.** It is a test-run
   artifact, ~12 references to the old path deep, and it was swept along with
   everything else in `4573b560`. It should probably be `git rm`'d and
   gitignored, which is a decision about that file, not about this rename.

---

## NEEDS TANNER

### 1. Render dashboard — do this BEFORE this branch merges to `develop` or `main`

All three services below are **dashboard-managed**. `render.yaml` is not synced,
so the rename in this branch does not reach them. Verified against the live
Render API on 2026-09-08.

The failure is not subtle: the build step runs `cd frontend`, that directory no
longer exists on the branch, and the build exits non-zero. Prod web would stop
receiving deploys; the last good build stays live, so users see stale code rather
than an outage.

Because the value must change at the same moment the code does, and it cannot be
changed atomically, **the safe order is: change the dashboard first, merge
second.** The old build command breaks the moment the rename lands; the new one
breaks until it lands. Pick a window where a failed dev deploy is acceptable, or
do dev first, confirm, then prod.

**Step 1 — dev web** (safe to get wrong; auto-deploys on every `develop` push):

1. Open https://dashboard.render.com/static/srv-d9sjl3n10e5c73a14b2g
   (service `optio-dev-frontend`).
2. Settings → Build & Deploy → **Build Command**. Change:
   - from `cd frontend && npm install && npm run build`
   - to   `cd web && npm install && npm run build`
3. Same page → **Publish Directory**. Change `frontend/dist` → `web/dist`.
4. Leave **Root Directory** empty. It already is; do not set it.
5. Save. Do **not** deploy yet — `develop` still has `frontend/`, so a deploy now
   fails. That is expected and harmless.

**Step 2 — dev mobile web target:**

6. Open https://dashboard.render.com/static/srv-d9sjl42fngtc73fff1d0
   (service `optio-dev-v2-frontend`).
7. Settings → Build & Deploy → **Root Directory**. Change `frontend-v2` → `mobile`.
8. Leave its Build Command (`npm install --legacy-peer-deps && npx expo export
   --platform web`) and Publish Directory (`dist`) alone — both are relative to
   Root Directory and need no change.
9. Save.

**Step 3 — merge to `develop` and watch:**

10. Merge this branch to `develop` and push. Both dev services auto-deploy on
    commit. Watch both builds go green in the Render dashboard before continuing.
    If one fails, the fix is in steps 1–2, not in the code.

**Step 4 — prod web** (do this only after step 3 is green):

11. Open https://dashboard.render.com/static/srv-d9sjl2qjnfac739k091g
    (service `optio-prod-frontend`, which serves **app.optioeducation.com**).
12. **Build Command**: `cd frontend && npm install && npm run build`
    → `cd web && npm install && npm run build`.
13. **Publish Directory**: `frontend/dist` → `web/dist`.
14. Leave Root Directory empty.
15. Save. Auto-deploy is **off** for this service, so nothing happens yet — the
    deploy is triggered by `release.yml` after the tests pass. That is what you
    want.

**Step 5 — ship:**

16. Push to `main`, watch the `Release (main)` workflow. The `deploy` job triggers
    the prod Render deploys; the `smoke` job then probes the live API and
    `www.optioeducation.com`.

**Nothing else in Render needs touching.** Verified: both backends build with
`pip install -r requirements.txt` and start with `cd backend && ...`, the cron
service has `rootDir: backend`, and `optio-marketing` has `rootDir: marketing`.
None of them reference either renamed directory.

### 2. Decide the LTI cutover

`docs/LTI_FRONTEND_REDESIGN.md` chose to move LTI from the web app to the mobile
app, partly because "v1 is being retired". That premise is gone (§5b).

1. Read `docs/LTI_FRONTEND_REDESIGN.md` §3 — the rationale and the note under it.
2. Decide one of:
   - **Still do it.** The staged plan in §8/§10 is intact. Nothing to change.
   - **Don't.** Then `web/src/pages/lti/` is the permanent LTI surface, the
     `(lti)` route group in `mobile/app/` is dead code, and
     `Config.LTI_FRONTEND_URL` exists for a cutover that will not happen.
   - **Undecided.** Fine — but say so in the doc, because right now it reads as
     a decided plan resting on a reason that no longer exists.
3. Whatever you pick, a one-line status at the top of that doc saves the next
   person the same investigation.

### 3. Renaming the Render services themselves — optional, and it has a trap

Three service *names* still say v1/v2 or "frontend": `optio-prod-frontend`,
`optio-dev-frontend`, `optio-dev-v2-frontend`. Renaming them is cosmetic and
**not required** by this branch. If you want to:

**Does renaming break the URL?** Evidence, not a guarantee:

- Render's API exposes `name` and `slug` as separate fields, and they already
  differ in your account — `optio-prod-frontend` has slug
  `optio-prod-frontend-ch7c`, and an unrelated service named `1077-1` has slug
  `one077-1`. The `.onrender.com` URL is built from the **slug**, which is fixed
  at creation.
- Render's community forum reports that changing a service's name does not change
  its address ([Changing name of service doesn't change internal
  address](https://community.render.com/t/changing-name-of-service-doesnt-change-internal-address/341),
  [Can I change my existing subdomain?](https://community.render.com/t/can-i-change-my-existing-subdomain-onrender-com-to-a-new-one/9999)).
  Getting a *new* subdomain requires recreating the service or contacting support.
- Render's own docs do not state the rename behaviour on the pages checked, so
  this is inference plus community reports, not a documented promise.

**Why it matters here even though prod uses custom domains.** `app.` and `api.`
are custom domains bound to the services and would follow a rename regardless.
The risk is on **dev**, where the `.onrender.com` hostnames are hard-coded in
code that gates authentication:

- `optio-dev-v2-frontend` appears verbatim in
  `backend/routes/auth/token_delivery.py`'s `_NON_WEB_APP_ORIGIN_HINTS`. That
  string is how the backend decides to keep sending body tokens to the mobile
  web target. If the hostname changed, mobile web dev login breaks.
- `optio-dev-v2-frontend-x1dk.onrender.com` also appears in
  `backend/app_config.py`'s CORS origins, `mobile/e2e/helpers.ts`,
  `mobile/maestro/suites/smoke.yaml`, `scripts/audit_auth_redirects.py` and
  `.github/workflows/mobile-e2e.yml` — 7 files in all.
- `optio-dev-frontend-r3v8.onrender.com` is worse: **24 tracked files**, and four
  of them are backend runtime code, not docs — `backend/utils/session_manager.py`,
  `backend/routes/observer/helpers.py`, `backend/app_config.py` and
  `backend/.env.example`. Plus `web/src/utils/canonicalUrl.test.js`, both
  `ENVIRONMENT_VARIABLES.md` copies, and the E2E plans under `tests/`.

Renaming the services is therefore a bigger search-and-replace than it looks, and
one whose failure mode is "dev login stops working" rather than a build error.
Nothing in this branch requires it.

**Recommended, if you want the rename:**

1. Rename **`optio-dev-v2-frontend` only** first — dev, and the riskiest one, so
   it is the right canary. Suggested new name: `optio-dev-mobile`.
2. Immediately check the URL is unchanged:
   `curl -s -o /dev/null -w '%{http_code}\n' https://optio-dev-v2-frontend-x1dk.onrender.com/`
   — a 200 means the slug did not move.
3. If it did move, revert the name and stop. If it did not, rename
   `optio-dev-frontend` → `optio-dev-web` and `optio-prod-frontend` →
   `optio-prod-web`, and confirm `app.optioeducation.com` still resolves.
4. The service **IDs** never change, so `release.yml`'s deploy job, the key-rotation
   script and CLAUDE.md's ID table all keep working either way. Only the display
   names in CLAUDE.md's Render table would want updating afterward.

### 4. Decide what to do with `mobile/MOBILE_LAUNCH_READINESS.md`

It is a 61-row parity comparison written 2026-03-27 and last updated 2026-03-31.
Its terminology is now correct; its *content* is six months old and was not
re-verified. It carries a banner saying so.

1. If it is finished work, it belongs in the stale-doc list in `STALE_DOCS.md`
   (it is not there today) or deleted.
2. If it is still a live checklist, it needs a pass against the current apps —
   which is a real piece of work, not a rename.

### 5. Tell the other session its files moved

Another Claude session has uncommitted work on the Messages unread badge in this
same checkout (§3). Nothing was lost, but its files are now under `web/` and
`mobile/`. If that session is still open, it will be looking for
`frontend/src/components/communication/` and not finding it.

---

## What I could not do, and why

- **Could not run the full backend suite green in the main working tree.** Two
  ratchet tests fail there because of another session's uncommitted code (§3).
  Proven not to be this branch's doing, and verified green in a clean worktree.
  Fixing it would mean editing files that are not mine.
- **Did not touch `supabase/migrations-archive/`** (ground rule 7's subject, and
  a record of what already ran). Three stale path comments remain there (§4c).
- **Did not run the integration suite** (`tests-integration.yml`). It needs a
  local Supabase stack; CI runs it on the PR. It reads no frontend path.
- **Did not rename `web/package.json`'s `name`** (`optio-quests-frontend`). It is
  not v1/v2 language, and `.design-sync/` tooling reads it. The stale note in
  `.design-sync/NOTES.md` that said PKG_DIR would resolve to `frontend` was fixed
  to say `web`.
- **Did not push, and did not merge.** The branch is local. Merging it before
  NEEDS TANNER §1 breaks the web deploy.
