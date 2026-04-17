# Frontend-V2 Audit Implementation Plan

Generated from comprehensive audit on 2026-04-14. Overall grade: **C+**.
Scope: `frontend-v2/` mobile app (Expo 55 universal).

---

## Phase 1 — Launch Blockers (Week 1)

Must ship before App Store / Play Store submission.

### Security & Config

- [ ] **S2 / D1: Fix production API URL.** Add `env` block to `production` profile in [eas.json](eas.json) with `EXPO_PUBLIC_API_URL=https://api.optioeducation.com`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Change native default in [src/services/api.ts:15](src/services/api.ts#L15) from `http://192.168.86.20:5001` to `https://api.optioeducation.com`.
- [ ] **S7: Unify token key names in authStore.** [src/stores/authStore.ts:318-319](src/stores/authStore.ts#L318-L319) uses `data.access_token` while login uses `data.app_access_token`. Verify backend registration response shape and align.
- [ ] **D2: Set `requireCommit: true`** for production profile in [eas.json](eas.json).
- [ ] **S4: Narrow console suppression patterns** in [app/_layout.tsx:10-32](app/_layout.tsx#L10-L32) to exact string matches so real errors aren't hidden.
- [ ] **S5: Type API errors safely.** Define shared `ApiError` type; replace `err: any` in auth store and hooks; whitelist safe messages before rendering to UI.

### Observability

- [ ] **E1: Wire up Sentry** (`@sentry/react-native`) in [app/_layout.tsx](app/_layout.tsx). Add EAS build hook for source map upload. Tag releases with `appVersion`.
- [ ] **D6: Timeout-guard `loadUser`** in [app/_layout.tsx:61](app/_layout.tsx#L61) — force `SplashScreen.hideAsync()` after ≤5s so hung `/api/auth/me` can't trap user on splash.

### Error handling & resilience

- [ ] **E2: Add request timeout** to axios instance in [src/services/api.ts:18](src/services/api.ts#L18) — `timeout: 15000`.
- [ ] **E5: Differentiate 401 vs network error** in [src/stores/authStore.ts:69-103 loadUser](src/stores/authStore.ts#L69-L103). Retry once on network error before clearing tokens.

---

## Phase 2 — Mobile Performance (Week 2)

### Polling & battery

- [ ] **P1: AppState-aware polling in `useMessages`.** Pause all 5 intervals ([src/hooks/useMessages.ts:97,129,181,226,282](src/hooks/useMessages.ts#L97)) when `AppState !== 'active'` or screen not focused (`useIsFocused`). Target: zero polling while backgrounded.
- [ ] **P5: Dedupe `recordViews` calls** in [src/hooks/useFeed.ts:114](src/hooks/useFeed.ts#L114). Track recorded ids in a ref Set.

### Rendering & images

- [ ] **P2: Migrate `Image` → `expo-image`** in [src/components/feed/FeedCard.tsx:9](src/components/feed/FeedCard.tsx#L9), LearningEventCard, and other feed/journal cards. Use `cachePolicy="memory-disk"`.
- [ ] **P3: Adopt FlashList.** Install `@shopify/flash-list`. Replace ScrollView + `.map()` patterns in feed, messages, conversation list, and bounty list.
- [ ] **P4: Memoize list item components.** `React.memo` on FeedCard, LearningEventCard. Pass stable `keyExtractor` + `renderItem`.
- [ ] **P7: Lazy / web-gate admin screen.** [app/(app)/(tabs)/admin.tsx](app/(app)/(tabs)/admin.tsx) is 1502 LOC and shouldn't ship to native bundle (not a mobile persona per product scope).

---

## Phase 3 — Architecture (Week 3)

### React Query migration

- [ ] **P6 / A3 / Q3: Migrate top hooks to React Query.** Start with `useFeed`, `useMessages`, `useBounties`, `useJournal`, `useQuests`. Use `useInfiniteQuery` for paginated endpoints. Remove bespoke loading/error/refetch boilerplate.

### Screen decomposition

- [ ] **Q2 / A2: Break up oversized screens (target <400 LOC each).**
  - [ ] [app/(app)/(tabs)/admin.tsx](app/(app)/(tabs)/admin.tsx) — 1502 LOC → extract into `useAdmin` + section components.
  - [ ] [app/(app)/courses/[id]/index.tsx](app/(app)/courses/[id]/index.tsx) — 901 LOC.
  - [ ] [app/(app)/(tabs)/profile.tsx](app/(app)/(tabs)/profile.tsx) — 759 LOC.
  - [ ] [app/(app)/quests/[id].tsx](app/(app)/quests/[id].tsx) — 755 LOC.
  - [ ] [app/(app)/(tabs)/journal.tsx](app/(app)/(tabs)/journal.tsx) — 656 LOC.

### Type safety

- [ ] **Q1: Reduce `any` by 50%.** 110 occurrences across 30 files. Define `ApiQuest`, `ApiTask`, `ApiUser`, `ApiError`. Type `catch (err: unknown)` and narrow.

### Routing

- [ ] **A4: Model onboarding as router group.** Replace imperative `router.replace` in [app/(app)/_layout.tsx:20-46](app/(app)/_layout.tsx#L20-L46) with `(onboarding)` route group + redirect-on-mount.

### API layer

- [ ] **A1: Split `api.ts` per domain.** Break the 229-line mega-object in [src/services/api.ts](src/services/api.ts) into per-domain files (`authAPI.ts`, `questAPI.ts`, etc.) under `src/services/api/`.

---

## Phase 4 — Polish & Hygiene (Week 4)

### OTA updates

- [ ] **D3: Add `runtimeVersion` policy** — `{ "policy": "appVersion" }` in [app.json](app.json).
- [ ] **D4: Wire up EAS Update channels** (dev / preview / production) once runtimeVersion is set.

### Error surfacing

- [ ] **E4 / Q4: Replace silent catches with telemetry + retry.**
  - [ ] [src/hooks/useQuests.ts:114,133,159](src/hooks/useQuests.ts#L114) — show error state + retry.
  - [ ] [src/components/communication/ChatWindow.tsx:69](src/components/communication/ChatWindow.tsx#L69) `markMessageRead` — retry on next poll.
  - [ ] [src/components/communication/GroupChatWindow.tsx:126](src/components/communication/GroupChatWindow.tsx#L126) — same pattern.
  - [ ] [src/hooks/useFeed.ts:114](src/hooks/useFeed.ts#L114) `recordViews` — log to Sentry on failure.

### Cleanup

- [ ] **Q6: Delete unused `CaptureModal.tsx`** (455 LOC) if confirmed unreferenced. `CaptureSheet.tsx` is the one wired into tabs layout.
- [ ] **Q5: Verify logo URI** in [app/(app)/(tabs)/_layout.tsx:20](app/(app)/(tabs)/_layout.tsx#L20) matches the canonical Supabase-hosted `gradient_fav.svg`.
- [ ] **S3: Remove hardcoded EAS projectId fallback** in [src/services/pushNotifications.ts:61,92](src/services/pushNotifications.ts#L61). Read only from `Constants.expoConfig.extra.eas.projectId`.
- [ ] **S8: Convert `require('expo-apple-authentication')`** in [src/stores/authStore.ts:270](src/stores/authStore.ts#L270) to a static platform-gated import.

### WebView hardening

- [ ] **S6: Audit WebView usages.** Confirm `originWhitelist` set and `javaScriptEnabled={false}` wherever admin-authored HTML can reach a WebView on native.

---

## Verification Checklist (before closing plan)

- [ ] Production EAS build connects to `api.optioeducation.com`, not LAN IP.
- [ ] Sentry receives a test crash from a production build.
- [ ] App backgrounded for 5 minutes → no network calls in Charles/Proxyman.
- [ ] Feed scroll at 60fps on a mid-range Android device with 50+ items.
- [ ] `loadUser` recovers from a simulated 10s backend hang without trapping splash.
- [ ] Registration flow yields a working session (S7 verified end-to-end).
- [ ] `tsc --noEmit` passes; `any` count reduced ≥50% from baseline (~110).
- [ ] App Store / Play Store submission passes review.
