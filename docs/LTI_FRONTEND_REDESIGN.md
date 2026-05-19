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
