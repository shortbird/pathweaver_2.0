# Phase 1 handoff — rename the two frontends to platform siblings

**Branch:** `refactor/remediation-2026-09-phase1` — **shipped to `main` 2026-09-09 as `79a2db4b`**
**Branched from:** `docs/remediation-2026-09-phase0` @ `b02091a8`, which is 5 commits
ahead of `main`. Phase 0 is still unmerged, so this branch carries Phase 0's
commits too.
**Date:** 2026-09-08
**Scope:** directory rename and terminology. **No behaviour changed.**

`frontend/` → `web/`, `frontend-v2/` → `mobile/`, done with `git mv` so history
follows each file. The names encoded a succession that is not the plan: web and
mobile are permanent platform siblings.

> **SHIPPED 2026-09-09.** The three Render services were repointed first, then
> `develop`, then `main`. `Release (main)` green on all seven jobs; prod verified
> by hand afterwards (§7). NEEDS TANNER §1 is done — it is kept below as the
> record of what was changed and why.

---

## 1. What changed

| SHA | Commit | Files | +/- |
|---|---|---|---|
| `4573b560` | Rename `frontend/` -> `web/` and `frontend-v2/` -> `mobile/`, and repoint every path | 1,975 | +756 / -557 |
| `f746e9a5` | Say web and mobile in code comments, not v1 and v2 | 72 | +126 / -120 |
| `3d33fbd9` | Say web and mobile in the docs, and flag the two claims the rename invalidates | 27 | +217 / -189 |
| `62044805` | Two more surface references: the design-sync entry and OPEN_FINDINGS | 2 | +4 / -4 |
| `af1d0f01` | Phase 1 handoff (this file, first version) | 1 | +496 |
| `eae0aaae` | LTI is hosted on the web app — write down the decision that was made in May | 4 | +140 / -52 |
| `b5bd755e` | Fix the e2e workflow's dead Render service ID, and untrack a test artifact | 3 | +14 / -612 |
| `79a2db4b` | Give the E2E smoke test's first assertion the same 15s the rest of the suite uses | 1 | +14 / -2 |

Plus one more commit updating this file for the decisions in §5 and §6.

> `d2c7d146` also sits on this branch and is **not** part of this work — it is
> a second session's Messages-badge feature. See §3.

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

Baselines were captured on this tree **before** the move. The "after" numbers are
from the working tree at the tip of this branch, with no uncommitted changes.
(Mid-branch, while a second session had uncommitted work here, the after-numbers
were taken from a scratch worktree instead — see §3.)

| Suite | Before | After |
|---|---|---|
| Backend (`cd backend && pytest`) | 5,528 passed, 160 skipped, **0 failed** | 5,538 passed, 160 skipped, **0 failed** |
| Web (`npm run test:run`) | 322 files, 2,829 passed, **0 failed** | 323 files, 2,855 passed, **0 failed** |
| Mobile (`npm run test:run`) | 113 suites, 932 passed, 3 skipped, **0 failed** | 113 suites, 936 passed, 3 skipped, **0 failed** |

All three counts grew — backend +10, web +26, mobile +4. **Those additions are
not mine.** They come from `d2c7d146`, a second session's Messages-badge feature
that landed on this branch (§3). Nothing in this branch's own commits adds or
removes a test.

Additional verification, re-run at the branch tip:

| Check | Result |
|---|---|
| `cd mobile && npx tsc --noEmit` | exit 0, no output |
| `cd web && npm run build` | exit 0, `version.json` written |
| `cd mobile && npx expo export --platform web` | exit 0, `Exported: dist` |

The web build still prints its pre-existing "chunks larger than 600 kB" warning.
That is unchanged by this branch.

---

## 3. A second session shares this branch — resolved

While this work was in progress another Claude session was building the Messages
unread-badge feature in the same checkout. **It has since finished and committed**
as `d2c7d146` ("Group a parent's class chats by child on the web, and fix the
badge that hid them"), 14 files, on top of this branch. The tree is clean.

Two things that follow from that, neither of them a problem to fix here:

1. **Merging this branch also merges their feature.** `d2c7d146` sits on
   `refactor/remediation-2026-09-phase1`, not on its own branch. It is a real,
   tested feature with 3 new test files, so this is a packaging question, not a
   quality one — but a reviewer expecting a pure rename should know it is there.
   Splitting it out is a rebase decision that belongs to whoever merges.
2. **The rename moved their files out from under them mid-session.** `git mv`
   renames the directory on disk, so their in-flight edits ended up at
   `web/src/components/communication/...` rather than
   `frontend/src/components/...`. Nothing was lost, and their commit landed
   cleanly at the new paths.

For the record, while both sessions were live, `pytest` in the shared tree showed
two failures in `test_direct_db_calls_do_not_grow` — 3 new `.table(` calls in
their then-uncommitted `group_message_service.get_unread_total`. This branch's
diff added zero. Their commit raised the `repositories` baseline to 442 and the
suite is green again. It is recorded here only because the same thing will happen
to the next person who runs a suite in a shared checkout: **measure attribution
before assuming the failure is yours**, and stage with `git add <files>`, never
`git add -A`.

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

## 5. Two documents asserted things this rename makes false — both now resolved

Both were flagged for the user rather than quietly reworded. Both came back with
a decision on 2026-09-08, and both are now settled in the tree.

### 5a. `mobile/README.md` — rewritten, and the rewrite is confirmed

It opened with *"Will replace the v1 Vite frontend page-by-page"* and framed its
parity checklist as work to do *"until v1 is retired"*. It now says the checklist
is the standing cost of shipping two surfaces.

**Confirmed by the user: the web app is not being retired.** The rewrite stands.
Nothing further to do here.

### 5b. `docs/LTI_FRONTEND_REDESIGN.md` — decision rewritten, and it was already stale

Asked to decide the cutover, the first step was to find out what had actually
happened. **The doc had been wrong for almost four months, and not in the way the
rename made it wrong.**

`git log --follow` on `web/src/components/lti/LtiShell.jsx` leads to `0dd805b5`,
dated **2026-05-20 — one day after the doc was written**:

> *"Per user direction (don't set up a separate v2 deploy yet), the LTI redesign
> moves into the v1 stack (frontend/) instead of cutting over to frontend-v2.
> … This collapses the planned Phase 4 v2 cutover into a single PR. No separate
> v2 host, no DNS, no LTI_FRONTEND_URL env-var flip required; LTI stays on
> www.optioeducation.com."*

So the cutover was called off the day after it was proposed, the whole redesign
was rebuilt on the web app, and **nobody updated the doc**. Since then it has
said Phase 4 is `⛔ USER` — a live action item, on a plan that no longer existed.

The doc now records what happened, and the decision is made rather than deferred:

- **Header** — status `SHIPPED`, decision *"LTI is hosted on the web app"*, and a
  banner explaining the supersession before anyone reads §3.
- **§3** rewritten as the decision plus why it is not being revisited. Two of the
  three original arguments are dead: "no throwaway work because the web app is
  being retired" is false, and "the mobile app already has the route group" stopped
  being an advantage the moment the web app got an equivalent one that is in
  production grading real Williamsburg submissions. Cutting over now would replace
  working code with a second copy of it and still cost a second HTTPS host, an env
  flip and a real-Canvas E2E pass.
- **§4** marked HISTORICAL. It described text-only student evidence and no teacher
  review page — exactly the gaps `0dd805b5` closed. Read as current state it is
  simply wrong.
- **§7, §8, §11, §12** corrected: Phase 4 struck through as superseded, the
  cutover section relabelled *NOT DONE, NOT PLANNED*, the status table rewritten
  to show where each phase actually shipped, and the runbook marked *DO NOT RUN*.
  All kept rather than deleted, because `Config.LTI_FRONTEND_URL` is still in the
  code and the next person to find it deserves the record.

Three code comments carried the same stale claim and were corrected with it:

| File | Said | Reality |
|---|---|---|
| `backend/app_config.py` | `LTI_FRONTEND_URL` is a no-op "until the cutover", and "the AGS evidence URL repoint is a separate, coordinated cutover step" | No cutover pending; the AGS repoint shipped in `0dd805b5` |
| `backend/routes/lti/launch.py` | `_frontend_url()` is a no-op "until the staged cutover flips `LTI_FRONTEND_URL`" | Same |
| `mobile/app/(lti)/lti-evidence.tsx` | "not yet wired to AGS. grade-sync keeps pointing at the web app's `/public/diploma` URL" | **Wrong on both counts since 2026-05-20** — AGS points at `/lti-evidence` on the web app. The screen is not reachable in production and never was |

`Config.LTI_FRONTEND_URL` is deliberately **kept**. It is a no-op by default and
is the one-env-var lever to move only the LTI iframe to another host without a
code change. A working escape hatch with no plan to use it costs nothing.

**One follow-up this surfaces, not done here:** `mobile/app/(lti)/` and
`mobile/src/components/lti/` are now unreferenced by any live route. `0dd805b5`
kept them "as design reference and ready for the eventual broader migration" —
and that migration is cancelled, so the reason they were kept is gone. They are
harmless (typechecked and tested like everything else) but nobody should assume
they run. Deleting them is a code change, not a structural one, so it is left for
a later phase. See NEEDS TANNER §4.

---

## 6. Bugs found — both fixed

Both were reported first and fixed on the user's instruction.

1. **`.github/workflows/mobile-e2e.yml` polled a Render service that does not
   exist.** It waited on `srv-d76n4bdm5p6s73fac69g`; the Render API answers that
   ID with `404 not found: service` and it appears nowhere in the account. Fixed
   to `srv-d9sjl42fngtc73fff1d0` (`optio-dev-v2-frontend`) — confirmed correct
   because the health check four lines below already probes that service's
   hostname.

   Worth knowing *why it hid*: on a 404 the `jq` filter yields no status, so
   `DEPLOY_STATUS` is `"unknown"` on all 60 attempts, the loop falls through, and
   the E2E run proceeds against whatever was deployed before — ten minutes late
   and green. A missed deploy and a slow deploy looked identical. The comment
   left in the file says so.

2. **`mobile/playwright-report.xml` was tracked in git.** It is the junit
   reporter's output (`mobile/playwright.config.ts`, `outputFile:
   'playwright-report.xml'`), regenerated on every run and already uploaded as a
   CI artifact — and the committed copy was a frozen record of one 2026-04-01 run
   *containing 6 failures*. `git rm --cached`'d and added to `.gitignore`, which
   covered `playwright-report/` (the directory) but not the file.

---

## NEEDS TANNER

### 1. ~~Render dashboard~~ — DONE 2026-09-09, before the merge

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

### 2. ~~Decide the LTI cutover~~ — RESOLVED 2026-09-08

Answered: LTI stays on the web app, and it turned out the cutover had already
been called off on 2026-05-20. `docs/LTI_FRONTEND_REDESIGN.md` and three stale
code comments are corrected. Details in §5b. Nothing outstanding.

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

### 5. ~~Tell the other session its files moved~~ — RESOLVED

That session finished and committed as `d2c7d146` on this branch. See §3, which
also flags that merging this branch merges their feature along with it.

### 6. Optional follow-up: the mobile app's LTI route group is now dead code

Not urgent and not a decision you have to make today, but it is new information
from §5b that nothing else records.

`mobile/app/(lti)/` (7 files) and `mobile/src/components/lti/` (`LtiShell.tsx`,
`LtiEvidenceEditor.tsx`, `PlatformStorage.ts`) are not reachable from any live
route. They were built for the cutover, kept in 2026-05 as "design reference …
ready for the eventual broader migration", and that migration is now cancelled.

1. They cost nothing to keep — they typecheck and their tests pass with the rest
   of the mobile suite. Leaving them is defensible.
2. They cost something to *believe* — the next person reading
   `mobile/app/(lti)/lti-evidence.tsx` may reasonably think it serves Canvas
   teachers. Its header now says in plain terms that it does not.
3. If you want them gone, that is a code deletion with its own tests to remove,
   so it belongs in a later phase rather than in a rename branch.

---

## 7. What shipped, and how it was verified

Order was: Render dashboard first, then `develop`, then `main`. The dashboard had
to move first because the old build command breaks the moment the rename lands
and the new one breaks until it does, and the two cannot change atomically.

| Step | Result |
|---|---|
| Three Render services repointed | Verified by reading them back from the Render API, not from the dashboard UI |
| `develop` @ `1e8c79a9` | dev web, dev mobile web and dev backend all **live**; `/login` 200, `/version.json` matched |
| `main` @ `79a2db4b` | `Release (main)` **success on all 7 jobs** — backend, web, mobile, integration, deploy, smoke, OTA |
| Prod verified by hand | `optio-prod-frontend` deploy **live**, built from `web/`; `app.optioeducation.com/login` 200; `version.json` = `79a2db4`; `api/health` = `79a2db4b`, `db: ok` |

**The by-hand prod check was not optional.** As §6 explains, the `deploy` job only
confirms Render *accepted* the API call, and `smoke` probes
`www.optioeducation.com`, which is the marketing site. Neither would have noticed
a failed web build — the exact failure this rename risked. `app.optioeducation.com`
is the host that had to be checked, and it was.

### Two things that came up during the ship

**Saving the Render settings fires a deploy immediately.** Both dev static sites
recorded a `build_failed` at 13:57, before the code was pushed — a
`service_updated` deploy against the old develop tip, which still had `frontend/`.
Expected, harmless, and superseded two minutes later. Worth knowing so the next
person does not read it as a real failure.

**One E2E test failed on develop, and it was not the rename.** `Mobile E2E Tests`
S1 timed out on `getByText('Total XP')`. The same workflow had already failed on
2026-09-02, before this branch existed — and that earlier run died at the *Wait
for Render deploy* step, i.e. on the dead service ID fixed in `b5bd755e`. So this
branch's run was the first to reach the tests at all: 7 passed, 1 failed.

The failure was a 5s default expect timeout on a stat tile that needs an API
round-trip, against a backend that had cold-started two minutes earlier. S1 was
the only assertion in the file without an explicit timeout; S2-S4 and three other
specs all use 15-20s. Fixed in `79a2db4b` by giving it the same 15s, with the
matcher left exact so a genuinely missing tile still fails. Re-run: **8 passed.**

Worth recording the causal chain, because it is the opposite of what it looks
like: fixing the service ID is what *exposed* the flake. The suite now runs
immediately after a deploy instead of ten minutes later against a warm site. The
flake was always there; nothing had ever looked at it.

### Still open after the ship

- **NEEDS TANNER §3** — renaming the Render services themselves. Optional,
  cosmetic, and carries a real trap (the dev hostnames are hard-coded in auth
  code). Not required by anything.
- **NEEDS TANNER §4** — what to do with `MOBILE_LAUNCH_READINESS.md`.
- **NEEDS TANNER §6** — the mobile app's now-unreferenced `(lti)` route group.
- **§4b** — the 19 ambiguous `v1`/`v2` sites that need a person who knows which
  was meant.

---

## What I could not do, and why

- **Could not delete the mobile app's now-dead `(lti)` route group.** It is a
  code deletion with tests attached, and this is a structural branch. Written up
  in NEEDS TANNER §6 instead.
- **Did not touch `supabase/migrations-archive/`** (ground rule 7's subject, and
  a record of what already ran). Three stale path comments remain there (§4c).
- **Did not run the integration suite** (`tests-integration.yml`). It needs a
  local Supabase stack; CI runs it on the PR. It reads no frontend path.
- **Did not rename `web/package.json`'s `name`** (`optio-quests-frontend`). It is
  not v1/v2 language, and `.design-sync/` tooling reads it. The stale note in
  `.design-sync/NOTES.md` that said PKG_DIR would resolve to `frontend` was fixed
  to say `web`.
- **Everything above was done and shipped.** See §7.
