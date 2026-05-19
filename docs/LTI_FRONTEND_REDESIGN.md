# LTI Frontend Redesign — Design Doc

**Status:** Draft for review · **Author:** Claude + Tanner · **Date:** 2026-05-19
**Decision:** Target **frontend-v2** (LTI is the first surface fully cut over to the universal app)
**Not urgent:** the current LTI works; Williamsburg students start August. Design-then-build.

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

## 3. Decision: target frontend-v2

LTI becomes the first surface fully cut over to the universal app. Rationale:
no throwaway work (v1 is being retired), v2 already has an `(lti)` route group
and the upload machinery, and a contained surface is a good first full cutover.

**Accepted risk — the cutover sub-project.** Prod LTI today redirects to
`www.optioeducation.com` (v1, `frontend/`). Moving to v2 means repointing the
LTI host and proving v2 renders correctly inside real Canvas *before* August.
De-risking plan in §8.

## 4. Current-state inventory

### v1 (`frontend/src/pages/lti/`) — live in prod
| Page | State |
|---|---|
| `LtiLaunchPage` | code→token handoff; minimal; fine conceptually |
| `LtiQuestPage` | student: wizard, task list, **text-only** evidence, submit/reopen |
| `LtiDeepLinkPage` | teacher: quest creation form |
| `LtiErrorPage` | error states |
| *(teacher evidence review)* | **none** — reuses full `DiplomaPage` |

### v2 (`frontend-v2/app/(lti)/`) — exists, NOT the live host
- `lti-launch.tsx`, `deep-link.tsx`, `error.tsx`, `quest/[id].tsx` (267 lines,
  text-only evidence via `completeTask(taskId,[{type:'text',content:{text}}])`).
- **No** `src/components/evidence/` in v2 — multi-format editor must be built.
- Reusable v2 infra already present:
  - `src/components/capture/CaptureSheet.tsx` — `expo-image-picker`, multi-media
    capture, the proven pattern for image/video.
  - `src/services/signedUpload.ts` — signed direct-to-Supabase upload (videos to
    500MB).
  - `src/components/ui/bottom-sheet.tsx` — built for evidence-upload UX.
  - `src/services/api.ts`, `tokenStore.ts` — Bearer auth (LTI-compatible).
- v2 `ui/` design system is small (button, card, input, text, vstack, …) — an
  `LtiShell` slots in cleanly.

### Backend — already multi-format ready
- `POST /api/evidence/documents/{task_id}` accepts `blocks: [...]` of any type;
  persists to `evidence_document_blocks`. **No backend evidence change needed.**
- The signed evidence token (`lti_service.issue/verify_evidence_token`,
  shipped 2026-05-19) is reusable to authorize a new quest-scoped teacher
  endpoint.

## 5. Architecture

### 5.1 Shared `LtiShell`
New `frontend-v2/src/components/lti/LtiShell.tsx`:
- Width-breakpoint-aware single column (handles ~320px SpeedGrader → wide).
- No nav/footer/marketing; compact header (context/quest title only).
- Unified loading + error boundary.
- LTI iframe-resize `postMessage` (`lti.frameResize`) to Canvas so height
  isn't clipped — implemented here in Phase 1 (decision §9.2).
- Brand tokens; touch-target sizing for Canvas mobile.

### 5.2 LTI design tokens
Constrained max-width, compact spacing/typography scale that holds at small
sizes. Lives alongside the v2 `ui/` library.

### 5.3 Pages (all on `LtiShell`)
| Page | Audience | Notes |
|---|---|---|
| Launch handoff | both | spinner + error only; small change |
| Quest | student | wizard, task list, **multi-format evidence**, submit/reopen |
| No-target / error | student | clear messaging, no chrome |
| Deep-link create | teacher | compact quest-creation form |
| **Quest evidence review (NEW)** | teacher | **only this quest's** tasks + evidence + earned XP, read-only |

### 5.4 Multi-format evidence in the student LTI quest (the new requirement)
- Build `frontend-v2/src/components/lti/LtiEvidenceEditor.tsx` supporting
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
1. **`LtiShell` + tokens**; shell-ify launch/error in v2 (low risk).
2. **Teacher quest-scoped evidence page + backend endpoint + repoint AGS**
   (highest value; fixes the thing just hit). Token reused.
3. **Student quest page on shell + `LtiEvidenceEditor`** (multi-format) +
   deep-link create page.
4. **v2-as-LTI-host cutover** (see §8).
Each phase: gated PR + tests.

## 8. v2-as-LTI-host cutover (the main risk)
LTI must keep working on v1 until v2 is proven in real Canvas:
- Build/verify phases 1–3 in v2 behind a non-prod path first.
- Stand up v2 at an LTI-reachable host; verify a real Canvas launch
  (resource-link + deep-link + SpeedGrader) end-to-end against a test course.
- Flip `Config.LTI_FRONTEND_URL` (new, LTI-only — decision §9.3) to the v2
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
   fully decoupled from the broader v1→v2 migration and reversible via one env
   var. Whole-`FRONTEND_URL` repoint is rejected (blast radius, August risk).
4. **Keep 500MB video ceiling + soft UX warning above ~100MB.** Signed-upload
   is direct-to-Supabase (no server risk); no LTI-only hard cap. The editor
   warns on large files re: slow school networks instead.

## 10. Non-goals
- No backend evidence-model changes (blocks API already multi-format).
- No change to the LTI auth/launch/token model.
- Not redesigning the broader Optio app — LTI surface only.

## 11. Implementation status (2026-05-19)

Phases 1–3 built, tested, merged to `main`, deployed. **No live-behaviour
change** — `LTI_FRONTEND_URL` defaults to `FRONTEND_URL` (v1), so prod LTI
still serves v1 and the AGS link still points at the working
`/public/diploma` URL.

| Phase | Shipped | PR |
|---|---|---|
| 1 — `LtiShell` + frameResize + shell-ify launch/error | ✅ | #27 |
| 2 — `/lti/evidence` endpoint + `decode_evidence_token` + teacher page | ✅ | #28 |
| 3 — `LtiEvidenceEditor` (multi-format) + quest/deep-link on shell | ✅ | #29 |
| 4 — config plumbing (`LTI_FRONTEND_URL`, `_frontend_url()`) | ✅ staged | (this) |
| 4 — **prod cutover (env flip + AGS repoint + real-Canvas E2E)** | ⛔ **USER** | — |

Wording correction to §9.1: the endpoint shipped as **`/lti/evidence`**
(not `/api/lti/evidence`) to match the existing LTI blueprint prefix
(`/lti/launch`, `/lti/token`, …). Behaviour is exactly as decided.

## 12. Phase 4 cutover runbook (USER-performed, gated on real Canvas)

> Claude built/staged everything below the line; the cutover itself was
> explicitly scoped to the user (it needs a real Canvas launch only you can
> perform and it changes live Williamsburg behaviour). **Do not run during
> an active Williamsburg session. Complete before August.**

**Preconditions**
- PRs #27–#29 on `main` and deployed (done).
- frontend-v2 reachable at an HTTPS host Canvas can iframe (the v2 web
  deploy URL). Call it `<V2_HOST>`.

**Step A — verify v2 in real Canvas BEFORE flipping anything.**
Temporarily point a *test* Canvas course's tool at `<V2_HOST>` (or set
`LTI_FRONTEND_URL=<V2_HOST>` on the **dev** backend) and run, against the
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
**before** the env flip *only if* `<V2_HOST>` already serves `/lti-evidence`
for everyone — otherwise sequence B after A's env flip. Recommended: do the
env flip (Step C) first in the same maintenance window, then merge B.

**Step C — flip the host.** Set `LTI_FRONTEND_URL=<V2_HOST>` in the **prod
backend** Render env and let it redeploy. Launch/token redirects move to v2
automatically (no code change — `_frontend_url()` already reads it).

**Step D — confirm + watch.** Re-run Step A's checklist against prod. Watch
Render LTI logs for the first real student submission. Confirm SpeedGrader
shows the quest-scoped page.

**Rollback (either direction, ~1 min):**
- Unset/blank `LTI_FRONTEND_URL` in prod env → redeploy → LTI instantly
  back on v1.
- Revert the Step B PR → AGS link back to `/public/diploma` (already
  proven working).
Both are independent and reversible; v1 LTI stays fully intact throughout.
