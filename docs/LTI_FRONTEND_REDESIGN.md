# LTI Frontend Redesign — Design Doc

**Status:** SHIPPED. The redesign is live on the web app. · **Author:** Claude + Tanner
**Written:** 2026-05-19 · **Decision superseded:** 2026-05-20 · **Reconfirmed:** 2026-09-08
**Decision:** LTI is hosted on the **web app** (`web/src/pages/lti/`). It is not
moving to the mobile app.

> **Read this before §3 onwards.** This document was written on 2026-05-19
> proposing that LTI cut over to the mobile app. **One day later, on 2026-05-20,
> that was overruled** and the redesign was rebuilt on the web app instead
> ("Path A", commit `0dd805b5`). Everything the redesign was for — the
> iframe-aware shell, the teacher evidence page, multi-format evidence capture,
> `lti.frameResize` — has been live on `www.optioeducation.com` since then.
>
> The doc was never updated, so §7's Phase 4, §8 and §11's status table spent
> almost four months describing a pending cutover that had already been called
> off. Those sections are corrected in place below rather than deleted, because
> the cutover machinery they describe (`Config.LTI_FRONTEND_URL`) is still in the
> code and someone will find it and wonder.
>
> §1, §2, §5, §6, §9 and §10 — the problem, constraints, layouts and the
> resolved API decisions — are unaffected and were implemented as written.

---

## 1. Problem

The LTI surface reuses general-app pages built for neither the Canvas iframe nor
its two audiences. Concretely:

1. **Renders wrong in-iframe.** Canvas embeds Optio in a narrow, variable-size
   iframe (worst in SpeedGrader). General pages assume full viewport + nav +
   marketing chrome.
2. **Teacher review shows the wrong thing.** The AGS submission link reuses the
   full `DiplomaPage` — the teacher sees the student's *entire portfolio*, not
   just the assigned quest's evidence.
3. **Students can only submit text evidence.** Both LTI quest pages hardcode a
   single `{type:'text'}` block, while Optio supports text, link, file, image,
   and video evidence everywhere else.

These share one root cause: there is no purpose-built LTI frontend.

## 2. Constraints (what makes LTI different)

- Embedded in Canvas iframe: narrow/variable width, short/variable height,
  inner scroll; SpeedGrader pane especially cramped.
- No app chrome — single-purpose surface launched from the LMS.
- No third-party cookies — memory Bearer tokens (already handled by
  `tokenStore`).
- Two audiences with different needs: **students** (do the quest, submit
  evidence) and **teachers** (review/grade one quest's evidence).
- Also embeds in the Canvas **mobile app** → touch-friendly, not just narrow-web.

## 3. Decision: LTI is hosted on the web app

**Current decision (2026-05-20, reconfirmed 2026-09-08): the LTI surface lives
in `web/src/pages/lti/` and stays there.** Prod LTI serves
`www.optioeducation.com`. There is no separate LTI host and no cutover pending.

### What this doc originally proposed, and why it was overruled

The 2026-05-19 proposal was to cut LTI over to the mobile app, on three
arguments: no throwaway work (because the web app was being retired), the mobile
app already had an `(lti)` route group and the upload machinery, and a contained
surface makes a good first full cutover.

It was overruled the next day, on the user's direction not to stand up a second
host for one surface. `0dd805b5` rebuilt the whole redesign in the web app's
React-DOM + Tailwind stack and repointed the AGS submission URL, "collapsing the
planned Phase 4 cutover into a single PR". That shipped and is live.

### Why it is not being revisited (2026-09-08)

Two of the three original arguments are now dead, and the third never mattered
enough on its own:

1. **"No throwaway work — the web app is being retired" is false.** Web and
   mobile are permanent platform siblings; the directories were renamed
   `frontend/` → `web/` and `frontend-v2/` → `mobile/` on 2026-09-08 to stop
   this exact misreading. Work on `web/src/pages/lti/` is permanent work.
2. **"The mobile app already has the route group and the upload machinery" is
   no longer an advantage** — the web app has an equivalent implementation now,
   built and tested, in production, and grading real Williamsburg submissions.
   Cutting over would replace working code with a second copy of it.
3. **"A contained surface is a good first full cutover"** was an argument for a
   migration programme that does not exist. There is no first cutover because
   there is no sequence of cutovers.

Against that, the cutover still costs what §8 says it costs: a second HTTPS host
Canvas can iframe, an env flip on the prod backend, and a real-Canvas E2E pass
before it can be trusted. Nothing on the benefit side is left to pay for it.

### What this leaves behind

**`mobile/app/(lti)/` and `mobile/src/components/lti/` are now unreferenced by
any live route.** `0dd805b5` kept them "as design reference and ready for the
eventual broader migration"; that migration is cancelled, so the reason they were
kept is gone. They are not harmful — they are typechecked and tested like the
rest of the mobile app — but nobody should assume they are reachable. Deleting
them is a reasonable follow-up and is deliberately *not* done here, because it is
a code change and this branch is structural. See PHASE_1_HANDOFF.md.

`Config.LTI_FRONTEND_URL` also stays. It defaults to `FRONTEND_URL`, so it is a
no-op today, and it is the one-env-var lever that would move the LTI iframe to
any other host without touching code. Keeping a working escape hatch costs
nothing; §8 and §12 document how it would be used.

## 4. Current-state inventory (as of 2026-05-19 — HISTORICAL)

> This is the state the redesign was written *against*, not the state today.
> Every gap named below was closed by Path A on 2026-05-20: `LtiQuestPage`
> now uses `LtiEvidenceEditor` (multi-format), and `LtiEvidencePage` is the
> quest-scoped teacher review that the "none" row asks for. See §11.

### Web app (`web/src/pages/lti/`) — live in prod
| Page | State |
|---|---|
| `LtiLaunchPage` | code→token handoff; minimal; fine conceptually |
| `LtiQuestPage` | student: wizard, task list, **text-only** evidence, submit/reopen |
| `LtiDeepLinkPage` | teacher: quest creation form |
| `LtiErrorPage` | error states |
| *(teacher evidence review)* | **none** — reuses full `DiplomaPage` |

### Mobile app (`mobile/app/(lti)/`) — exists, NOT the live host
- `lti-launch.tsx`, `deep-link.tsx`, `error.tsx`, `quest/[id].tsx` (267 lines,
  text-only evidence via `completeTask(taskId,[{type:'text',content:{text}}])`).
- **No** `src/components/evidence/` in the mobile app — multi-format editor must be built.
- Reusable mobile infra already present:
  - `src/components/capture/CaptureSheet.tsx` — `expo-image-picker`, multi-media
    capture, the proven pattern for image/video.
  - `src/services/signedUpload.ts` — signed direct-to-Supabase upload (videos to
    500MB).
  - `src/components/ui/bottom-sheet.tsx` — built for evidence-upload UX.
  - `src/services/api.ts`, `tokenStore.ts` — Bearer auth (LTI-compatible).
- the mobile `ui/` design system is small (button, card, input, text, vstack, …) — an
  `LtiShell` slots in cleanly.

### Backend — already multi-format ready
- `POST /api/evidence/documents/{task_id}` accepts `blocks: [...]` of any type;
  persists to `evidence_document_blocks`. **No backend evidence change needed.**
- The signed evidence token (`lti_service.issue/verify_evidence_token`,
  shipped 2026-05-19) is reusable to authorize a new quest-scoped teacher
  endpoint.

## 5. Architecture

### 5.1 Shared `LtiShell`
New `mobile/src/components/lti/LtiShell.tsx`:
- Width-breakpoint-aware single column (handles ~320px SpeedGrader → wide).
- No nav/footer/marketing; compact header (context/quest title only).
- Unified loading + error boundary.
- LTI iframe-resize `postMessage` (`lti.frameResize`) to Canvas so height
  isn't clipped — implemented here in Phase 1 (decision §9.2).
- Brand tokens; touch-target sizing for Canvas mobile.

### 5.2 LTI design tokens
Constrained max-width, compact spacing/typography scale that holds at small
sizes. Lives alongside the the mobile `ui/` library.

### 5.3 Pages (all on `LtiShell`)
| Page | Audience | Notes |
|---|---|---|
| Launch handoff | both | spinner + error only; small change |
| Quest | student | wizard, task list, **multi-format evidence**, submit/reopen |
| No-target / error | student | clear messaging, no chrome |
| Deep-link create | teacher | compact quest-creation form |
| **Quest evidence review (NEW)** | teacher | **only this quest's** tasks + evidence + earned XP, read-only |

### 5.4 Multi-format evidence in the student LTI quest (the new requirement)
- Build `mobile/src/components/lti/LtiEvidenceEditor.tsx` supporting
  **text, link, file, image, video** — emitting the same `blocks[]` shape the
  backend already accepts.
- Reuse, don't reinvent: lift the capture/upload pattern from `CaptureSheet` +
  `signedUpload.ts` (image/video/file → signed direct upload; text/link → inline
  block). `bottom-sheet` for the add-block UX on mobile/narrow.
- Video: keep the 500MB signed-upload ceiling; show a soft warning above
  ~100MB about slow school networks (no LTI-only hard cap — decision §9.4).
- Submission stays `POST /api/evidence/documents/{taskId}` with a real
  multi-block array instead of one text block.

### 5.5 Teacher quest-scoped evidence (NEW backend endpoint)
- New `GET /api/lti/evidence?lti_token=<token>` returning **only** that quest's
  tasks + evidence blocks + earned XP. The `(user_id, quest_id)` pair is read
  from the signed token, not query params (decision §9.1).
- Authorized by the existing signed token (no security-model change).
- Repoint the AGS submission URL from `/public/diploma/...` to the new LTI
  evidence route.

## 6. Low-fi layouts

```
STUDENT — QUEST (narrow iframe)            STUDENT — ADD EVIDENCE (bottom sheet)
┌───────────────────────────┐             ┌───────────────────────────┐
│ Build Something… (title)  │             │  Add evidence             │
│ ───────────────────────── │             │ ┌───┬───┬───┬───┬───┐     │
│ ▸ Task 1            ✓ done │             │ │Txt│Lnk│Img│Vid│Fil│     │
│ ▸ Task 2        [Add ev.+] │             │ └───┴───┴───┴───┴───┘     │
│ ▸ Task 3        [Add ev.+] │             │ [ pick / type … ]         │
│ ───────────────────────── │             │ ( upload progress ▓▓░ )   │
│ XP 300 / 500              │             │            [ Attach ]     │
│        [ Submit for grad. ]│             └───────────────────────────┘
└───────────────────────────┘

TEACHER — QUEST EVIDENCE REVIEW (SpeedGrader, very narrow, read-only)
┌───────────────────────────┐
│ Jane D. · Build Something… │
│ XP 300/500 · 3/3 tasks     │
│ ───────────────────────── │
│ Task 1 ▸ "…" (text)        │
│ Task 2 ▸ [img thumb] +cap  │
│ Task 3 ▸ ▶ video / 🔗 link │
└───────────────────────────┘
   (only THIS quest — no portfolio)

TEACHER — DEEP LINK CREATE            BOTH — LAUNCH HANDOFF / ERROR
┌───────────────────────────┐        ┌───────────────────────────┐
│ New Optio quest            │        │        ◐ Loading…         │
│ Title  [_______________]   │        │   (or) ⚠ <clear message>  │
│ Desc   [_______________]   │        └───────────────────────────┘
│ XP threshold [ 500 ]       │
│            [ Create ]      │
└───────────────────────────┘
```

## 7. Phased delivery
0. **This doc** + layout sign-off.
1. **`LtiShell` + tokens**; shell-ify launch/error in the mobile app (low risk).
2. **Teacher quest-scoped evidence page + backend endpoint + repoint AGS**
   (highest value; fixes the thing just hit). Token reused.
3. **Student quest page on shell + `LtiEvidenceEditor`** (multi-format) +
   deep-link create page.
4. ~~**mobile-as-LTI-host cutover** (see §8).~~ **Superseded 2026-05-20.**
   Replaced by "Path A": rebuild phases 1-3 in the web app and repoint AGS,
   in one PR (`0dd805b5`). No cutover, no second host.
Each phase: gated PR + tests.

## 8. mobile-as-LTI-host cutover — NOT DONE, NOT PLANNED

> **Superseded on 2026-05-20 and closed on 2026-09-08 (see §3).** This section
> is kept because `Config.LTI_FRONTEND_URL` is real and still in the code, so
> this is the record of what it was for and what moving the host would take. It
> is not a plan. Nothing here is outstanding.

The plan as written was:
- Build/verify phases 1-3 in the mobile app behind a non-prod path first.
- Stand up the mobile app at an LTI-reachable host; verify a real Canvas launch
  (resource-link + deep-link + SpeedGrader) end-to-end against a test course.
- Flip `Config.LTI_FRONTEND_URL` (new, LTI-only — decision §9.3) to the mobile
  host only after green E2E in real Canvas. `FRONTEND_URL` is untouched, so the
  rest of the app is unaffected and rollback is a one-env-var revert.
- Do the flip well before August; never during an active Williamsburg session.

## 9. Resolved decisions (2026-05-19)
1. **New `GET /api/lti/evidence/...` endpoint.** Quest derived from the signed
   token (not a trusted query param). Keeps the LTI concern out of the shared
   public-diploma endpoint; no regression risk to the main-app diploma page.
2. **Iframe auto-resize in Phase 1, inside `LtiShell`.** `lti.frameResize`
   postMessage done once in the shell. Must be verified per Canvas context
   (SpeedGrader / course-nav / assignment) against the Williamsburg instance
   during Phase 1.
3. **LTI-specific base URL.** New `Config.LTI_FRONTEND_URL` (defaults to
   `FRONTEND_URL`), used only by launch/token/grade-sync. The LTI cutover is
   fully decoupled from the broader question of which surface hosts what and reversible via one env
   var. Whole-`FRONTEND_URL` repoint is rejected (blast radius, August risk).
4. **Keep 500MB video ceiling + soft UX warning above ~100MB.** Signed-upload
   is direct-to-Supabase (no server risk); no LTI-only hard cap. The editor
   warns on large files re: slow school networks instead.

## 10. Non-goals
- No backend evidence-model changes (blocks API already multi-format).
- No change to the LTI auth/launch/token model.
- Not redesigning the broader Optio app — LTI surface only.

## 11. Implementation status (corrected 2026-09-08)

**Everything in this doc that was going to ship has shipped, on the web app.**
The table below said the prod cutover was blocked on the user; it had been
called off the day after this doc was written, and nobody came back to say so.

| Phase | Built where | Status |
|---|---|---|
| 1 — `LtiShell` + frameResize + shell-ify launch/error | mobile (#27), then rebuilt in web (`0dd805b5`) | ✅ live on web |
| 2 — `/lti/evidence` endpoint + `decode_evidence_token` + teacher page | backend (#28) + web page (`0dd805b5`) | ✅ live |
| 3 — `LtiEvidenceEditor` (multi-format) + quest/deep-link on shell | mobile (#29), then rebuilt in web (`0dd805b5`) | ✅ live on web |
| 4 — config plumbing (`LTI_FRONTEND_URL`, `_frontend_url()`) | backend | ✅ in code, no-op by default |
| 4 — prod cutover (env flip + AGS repoint + real-Canvas E2E) | — | ❌ **superseded, not pending** |

**The AGS repoint did happen** — as part of Path A, not as a cutover step.
`lti_grade_sync_service._evidence_url_for_quest` returns
`{LTI_FRONTEND_URL}/lti-evidence?lti_token=...`, which resolves to the web app.
Submissions graded before 2026-05-20 still carry the old `/public/diploma` URLs
and those continue to work.

Wording correction to §9.1: the endpoint shipped as **`/lti/evidence`**
(not `/api/lti/evidence`) to match the existing LTI blueprint prefix
(`/lti/launch`, `/lti/token`, …). Behaviour is exactly as decided.

## 12. Phase 4 cutover runbook — DO NOT RUN

> **This runbook is obsolete. It is kept as reference, not as an instruction.**
> The cutover it describes was superseded on 2026-05-20 (§3) and closed on
> 2026-09-08. Its Step B is already done by other means, and its "Preconditions"
> assume a mobile LTI host that was never stood up.
>
> If a reason to move the LTI host ever appears, this is still roughly the shape
> of the work — but re-derive it against the code rather than following it, since
> it describes a 2026-05 tree.

**Preconditions**
- PRs #27–#29 on `main` and deployed (done).
- mobile reachable at an HTTPS host Canvas can iframe (the mobile web
  deploy URL). Call it `<MOBILE_HOST>`.

**Step A — verify the mobile app in real Canvas BEFORE flipping anything.**
Temporarily point a *test* Canvas course's tool at `<MOBILE_HOST>` (or set
`LTI_FRONTEND_URL=<MOBILE_HOST>` on the **dev** backend) and run, against the
Williamsburg test course:
1. Resource-link launch (course nav) → quest page renders in-iframe, no
   clipping (frameResize working) in: course nav, assignment, SpeedGrader.
2. Deep-link create → assignment lands in the module.
3. Student: personalize → add **text, link, image, video, file** evidence →
   submit for grading.
4. Within ~5 min the Canvas gradebook shows the score; SpeedGrader opens
   the **quest-scoped** `/lti-evidence` page (not the full portfolio),
   renders all block types, works unauthenticated.
5. Replay an old launch JWT → still 401 (nonce replay unaffected).

**Step B — repoint AGS to the new evidence route (code, via gated PR).**
In `backend/services/lti_grade_sync_service.py` `_evidence_url_for_quest`,
change the return to:
```python
base = (Config.LTI_FRONTEND_URL or Config.FRONTEND_URL).rstrip("/")
token = issue_evidence_token(user_id, quest_id)
return f"{base}/lti-evidence?lti_token={token}"
```
(Currently it returns `{FRONTEND_URL}/public/diploma/<uid>?...&lti_token=`.)
Ship via the normal develop→PR→green→merge flow. This is safe to merge
**before** the env flip *only if* `<MOBILE_HOST>` already serves `/lti-evidence`
for everyone — otherwise sequence B after A's env flip. Recommended: do the
env flip (Step C) first in the same maintenance window, then merge B.

**Step C — flip the host.** Set `LTI_FRONTEND_URL=<MOBILE_HOST>` in the **prod
backend** Render env and let it redeploy. Launch/token redirects move to the mobile app
automatically (no code change — `_frontend_url()` already reads it).

**Step D — confirm + watch.** Re-run Step A's checklist against prod. Watch
Render LTI logs for the first real student submission. Confirm SpeedGrader
shows the quest-scoped page.

**Rollback (either direction, ~1 min):**
- Unset/blank `LTI_FRONTEND_URL` in prod env → redeploy → LTI instantly
  back on the web app.
- Revert the Step B PR → AGS link back to `/public/diploma` (already
  proven working).
Both are independent and reversible; the web app's LTI stays fully intact throughout.
