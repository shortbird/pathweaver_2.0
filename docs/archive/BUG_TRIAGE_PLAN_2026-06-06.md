# Mobile (v2) Bug + Feedback Triage Plan — 2026-06-06

Source data: Sentry (`optio-llc` / "Optio Mobile (v2)") + `bug_reports` table (Supabase prod).
Scope: everything (crashes, bugs, UX polish, feature requests). Ranking: pure severity.
Deliverable: written plan only — no code changes yet.

## Key facts that shape this plan

- **OTA updates are disabled** (`ota_updates.is_enabled = false` in every event). Even JS-only
  fixes require a new EAS build to reach testers. Batch fixes per build; don't expect hotfixes.
- **Only 2 real error signatures exist in Sentry.** The other 13 "captureMessage" issues are
  shake-to-report submissions mirrored from `bug_reports` via `captureBugReport`
  (`src/components/bugreport/BugReportSheet.tsx` → `src/services/sentry.ts:124`). They are
  resolved in Sentry as part of this triage; the canonical copy lives in `bug_reports`.
- Most reports are Tanner dogfooding on a Pixel 10 Pro Fold (Android 16, builds 16/17). External
  beta reporters: `sarahbros` (parent, iOS), `cdport2024` (student), `jakeiglinski` (student, iOS),
  `tyler@zionforge` (parent, iOS), `conradjhanna` (iOS, the engagement-timeout user).
- The Android crashes/tap issues are concentrated on Android; the engagement timeout and
  sign-in-scroll are iOS.

## Real Sentry errors (keep OPEN, fix via `Fixes NODE-xx` commit)

| Issue | Signature | Platform | Maps to |
|-------|-----------|----------|---------|
| NODE-29 | `ExponentImagePicker.launchImageLibraryAsync` rejected — "unregistered ActivityResultLauncher" | Android (build 17) | P0-2 |
| NODE-2Y / NODE-1S | `AxiosError: timeout of 15000ms` on `GET /api/quests/:id/engagement` | iOS | P0-3 |

---

## P0 — Crashes & broken core actions (release blockers)

### P0-1 — Notification tap crashes app + forces re-login
Reports: `9dd3f7e7` (/notifications), `65b8d76b` (sarahbros /notifications), `82984611` (sarahbros /family push).
- Symptom: tapping any in-app notification or push → crash, no route, kicked to login.
- Suspected: the notification deep-link/route resolver throws (bad/empty route) and the error
  boundary tears down the auth session. Cross-reference the `notification crash` item already
  noted as live on build 16 in the bug-triage memory.
- Plan: harden `frontend-v2` notification tap handler — validate the target route, wrap navigation
  in try/catch, never clear auth on a navigation error. Add a fallback route (notifications list).
  Reproduce from a push tap (cold start) and an in-app tap.
- Verify: tap each notification type from cold start + foreground on iOS and Android.

### P0-2 — Android image picker / document scan crash (NODE-29)
Reports: `9c6f2723` (camera won't open, files won't open), `81f245e1` (scan "Unavailable jpeg"),
`b27277fc`, `7ed56c53` ("…make sure these are reported through sentry" — they now are, via NODE-29).
- Root cause: `launchImageLibraryAsync` called before the Android `ActivityResultLauncher` is
  registered — typically launching the picker from inside a modal/sheet that isn't mounted as an
  Activity-attached component, or calling before first render completes.
- Plan: ensure picker/camera/scan launches happen from a mounted screen (not a transient sheet),
  defer launch to after interaction, and guard with a registration check. Confirm `expo-image-picker`
  / `expo-document-scanner` (whatever drives "scan") version + config plugin. Surface the underlying
  error to the user instead of the opaque "invalid jpeg".
- Verify on physical Android (the crash is Android-only; high-end Pixel reproduces).

### P0-3 — `/api/quests/:id/engagement` 15s timeout (NODE-2Y / NODE-1S)
- Symptom: engagement fetch exceeds the 15s axios timeout on iOS.
- Note: `backend/routes/parent/engagement.py` and `frontend/src/hooks/api/useQuests.js` are
  currently modified in the working tree — confirm whether in-flight work already touches this path.
- Plan: profile the engagement query (likely N+1 or unindexed aggregation over completions);
  add indexes / batch the query / cache. Consider raising the client timeout only as a stopgap.
- Verify: measure p95 latency for the endpoint with a realistic data set.

---

## P1 — High-impact reliability & data correctness

### P1-1 — Android: first tap swallowed / requires double-tap
Reports: `66aef9d0`, `785cf265` (bounty card won't open), `961bb0f5` (drawer 2×),
`c3ac99f8` (manage observers 2×), `1c17965d` (capture-moment 2×).
- Pattern: first press is consumed (likely a Pressable inside a gesture/scroll container, or a
  sheet that intercepts the first tap to dismiss). Audit `Pressable`/`TouchableOpacity` nested in
  gesture handlers and bottom-sheet drawers. Check `react-native-css-interop` press wrapping seen
  in the stack traces.

### P1-2 — Keyboard covers text input (multiple screens)
Reports: `eb3d8134` (/journal new topic), `c36db3fc` (/parent/journal), `7605a163` & `c4cb51f2`
(/messages), `df5ab071` (/feed keyboard gap).
- Plan: standardize a `KeyboardAvoidingView`/`keyboard-controller` wrapper for all text-entry
  surfaces (compose, new topic, journal moment, message). One shared component fixes the class.

### P1-3 — Document scan turns 1 scan into 2 PDF pages
Reports: `966edab8` (/feed), `c34ba7eb` (sarahbros). Noted as still-live on build 16 in memory.
- Plan: fix the scan→PDF pipeline so one capture = one page (off-by-one / duplicate page append).

### P1-4 — Moment media won't attach / stale media reappears
Reports: `58c197b2`, `bd2b39e9`, `60fe6584` (video doesn't attach/appear), `865feb9b`, `06fe5d66`
(previous video reappears in next capture), `a4ae0c4b` (must wait on capture screen),
`4c83a986` (2 pics, 1 shows), `85f2e4b8`.
- Two bugs bundled: (a) video upload state leaks into the next moment (not cleared on submit/cancel);
  (b) video attach completes only if the user waits on the capture screen — no background upload.
- Plan: clear capture draft state on submit/dismiss; upload media in the background with a visible
  thumbnail + progress so the user can submit without waiting. Fix multi-file (2 images → both).

### P1-5 — Feed media not rendering (image/video)
Reports: `f5f92827` (image missing in feed, present in post), `d990f6a2` (video black, play dead),
`2b0889d8` (video unavailable), `7cbdffe8` (renders after app restart → caching/lifecycle).
- Plan: investigate feed media URL/signed-URL expiry and `expo-video` lifecycle in a list
  (recycling). Likely related to P1-4 upload completion + feed cache invalidation.

### P1-6 — Data integrity: actions land on wrong account / XP mismatch
Reports: `a396a494` ("did these for Jane but they appeared on my account" — superadmin act-as),
`eda96bfe` (tyler: "James XP is much lower").
- Plan: confirm whether the impersonation/act-as context correctly scopes writes on v2 (see the
  native-impersonation-refresh-token history). Audit the XP rollup for James — recompute and compare
  `user_skill_xp` vs `quest_task_completions`. Data bug is higher severity than its single report.

### P1-7 — New parent can't add a child ("button doesn't work")
Reports: `efc0c4a6` (beta parent, button dead), `306f8d08` (added kid not shown + placement).
- Plan: fix the add-child action for fresh parent accounts (likely missing handler / failed call),
  refresh the family list after add. This blocks onboarding for real parents — high severity.

---

## P2 — UX correctness & polish bugs

- **P2-1 Messages unread badge stuck / screen flashing** — `06c43fe5` (badge persists after read),
  `86ab7bca` (messages flash & reload randomly). Fix read-state sync + re-render/refetch loop.
- **P2-2 Swipe-back loses bottom nav bar** — `f3e413b5` (swipe-back from conversation drops nav),
  `39823ffa` (need clear back / keep navbar in quest view). Fix nested navigator back behavior.
- **P2-3 Bounty review: stale list + missing screenshot** — `a4da63c0` (approved bounty still
  listed, no refresh), `f109685f` (review screenshot not shown), `610c9fdf` (upload page layout),
  `e979b69b` ("1 selected file" phantom). Invalidate the review query on approve; fix image render.
- **P2-4 Feed interactions** — `15c40ced` (pull-to-refresh), `e8ce4f65` (stop video on scroll-away),
  `f1428762` (fullscreen video), `d002b2d9` (tappable post → detail page).
- **P2-5 Push notifications not delivered to device** — `549e3a77` (in-app notifications exist but no
  OS push). Verify Expo push token registration + send path. (Distinct from P0-1, which is the crash
  on tap.)
- **P2-6 Visual polish** — `b6e42955` (date cursor far-right), `d61d538c` (awaiting pill icon),
  `da77b542` (dark-mode in-progress pill), `878119aa` (search box vertical centering).
- **P2-7 Sign-in page can't scroll (iOS)** — `dbe1bbe2` (jakeiglinski couldn't see/scroll full
  sign-in, esp. returning from forgot-password). Make auth screen scrollable / keyboard-safe.
- **P2-8 Profile copy** — `ec70a114` (display name + first/last redundant; reconcile with backend
  display_name), `b63d2e89` ("Optio" on who-can-see should be the logo).

---

## P3 — Feature requests & larger UX work

### Parent of young/under-13 children (theme — biggest product gap)
`c081630f` (parents need full quest functionality for <13 kids), `27476327` (young-kid family page
empty; want XP for learning moments), `c5c83863` (full engagement calendar on child page),
`efdd92e4` (show journal topics on child page), `b3ab07d1` (student journal feed should show only
their own activity). Treat as a small epic, not isolated tickets.

### Journal topics management
`4ec30037` (delete topics), `168c3538` (no + button), `e145fc39` (add-moment-in-topic discoverability),
`735612a8` (tags vs topics — design decision), `00d5792c` (add moment to journal topics as well as
quests), `d2d2490f` ("I don't have an active piano class" — empty/edge state on /journal).

### Messaging
`8cc41147` (no "new message" entry point), `232e310f` (unread badge on messages tab),
`20fc7b03` (parents message others + see kids' messages), `044541f2` (styling), `9d17d9da` (empty-state copy).

### Feed for parents
`b658483a` (combine all kids into one post when following all), `205c982c` (filter by individual kid).

### Bounties copy & UX
`97440cde` ("claim" → "start a bounty" + drop-bounty option), `833be3c6` (remove XP disclaimer),
`d5f221fc` (50/200 XP framing), `14e4485e` (general create-page UX), `34093945` (swipe between tabs).

### Quests personalization & content
`cbbc6804` + `74d05588` (interest/personalization forms should be tappable options, not free text —
mirror the class-quest wizard), `c85ee8c3` (add scan to quest task evidence),
`a7012fdb` (darker description text), `1aad903f` (larger description text), `5a551c40` (bigger
"view" button on non-clickable cards).

### Misc
`ac15fe50` (avoid full-page refresh when deleting a moment), `25e88391` (remove Family dashboard from
parent kebab).

---

## Noise (test/diagnostic submissions — resolved as not-real)
`5565437d`, `c6492086`, `b3004fb6`, `9ec086db`, `093beb1e`, `75fed2cd`, `f20fc896` (Tanner test rows),
`d372d5d0`, `750f7782` (apple.review QA rows).

## Already resolved (pre-existing, left as-is)
`d1fcb962`, `11d832af`, `ea4ab372`, `bcef246b` (parent landing/shake/preview fixes, 9b520f29),
`8a1c5d31` (status bar c6ed2b51), `769a05f6` (parent moment update 346eec49).

---

## Suggested sequencing

1. **Build N (stability):** P0-1, P0-2, P0-3, P1-1, P1-2, P1-7. Ship, retest on device.
2. **Build N+1 (media + correctness):** P1-3, P1-4, P1-5, P1-6, P2-1..P2-4.
3. **Build N+2 (polish):** remaining P2.
4. **Parallel track:** P3 epics (young-kid parent experience first — it's the largest gap).

Because OTA is off, group fixes by build and verify on a physical Android device (most P0/P1 are
Android-specific) plus one iOS device (P0-3, P2-7).
