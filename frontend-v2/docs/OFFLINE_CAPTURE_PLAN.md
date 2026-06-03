# Offline-First Capture — Implementation Plan

**Problem:** Learners may have no cell service while recording a learning moment.
Today both the moment-creation API call *and* the media upload fail when offline,
and captured files live in the cache dir (which iOS can purge). We want capture
to work fully offline and sync automatically when connectivity returns.

**Goal (v1):** A learner can capture a moment (text + photo/video/audio/document)
with no connection. It's saved durably on-device and shows a "pending sync"
state. When the app is next online (reconnect or next open on wifi), the queue
replays automatically: create moment → upload media → attach evidence. No data
loss, no duplicates.

---

## What already exists (build on it)
- **Two-phase capture**: the moment is created first, then media uploads run
  fire-and-forget in the background (`src/components/capture/CaptureSheet.tsx`).
- **Robust 3-phase upload**: init → PUT to signed URL → finalize → attach,
  with 3× retry and a native transport that survives backgrounding
  (`src/services/signedUpload.ts`).
- **Progress store** drives the "Uploading… N%" UI (`src/stores/mediaUploadStore.ts`).
- **Backend endpoints are reusable as-is** (self + parent variants of
  upload-init / upload-finalize / evidence).
- `useAppActive()` already tracks foreground transitions.

## What's missing
1. **Persistence** — the upload store is in-memory; killing the app loses the queue.
2. **Network detection** — `@react-native-community/netinfo` isn't installed.
3. **File durability** — captured files are in the cache dir, not Documents.
4. **Idempotency** — replaying a create after a lost response can duplicate moments.

---

## Architecture

### 1. Durable capture queue (persisted)
New `src/stores/captureQueueStore.ts` (Zustand + persisted via AsyncStorage or
MMKV). Each queued item:
```ts
type QueuedCapture = {
  id: string;                 // client-generated uuid — also the idempotency key
  status: 'pending' | 'uploading' | 'failed';
  createdAt: string;
  studentId?: string | null;  // parent capture
  payload: { text, pillars, taskId?, ... };   // for /learning-events/quick
  media: Array<{ localUri: string; type; name; blockType }>;
  eventId?: string;           // set once the moment is created (resume point)
  attempts: number;
  lastError?: string;
};
```
Persist the queue so it survives app kills.

### 2. Durable files
On capture, copy each picked/recorded file from cache → a dedicated
`FileSystem.documentDirectory + 'capture-queue/'` folder, and store *that* uri in
the queue. Delete the file only after the moment + evidence fully succeed.

### 3. Network awareness
Add `@react-native-community/netinfo`; a `useIsOnline()` hook exposes connectivity.
A `QueueProcessor` (mounted in `BugReportHost`-style host, or `app/(app)/_layout`)
flushes the queue when: (a) NetInfo flips to connected, (b) app becomes active
(`useAppActive`), and (c) immediately after a capture if already online.

### 4. Queue processor (replay)
For each `pending` item, run the pipeline idempotently:
1. If `eventId` not set → `POST /api/learning-events/quick` (with idempotency key)
   → store `eventId`.
2. For each media not yet uploaded → reuse `signedUpload` (init → PUT → finalize).
3. `POST .../evidence` to attach blocks.
4. On full success → remove item + delete its files. On failure → mark `failed`,
   bump `attempts`, keep for retry with exponential backoff.

Concurrency: process one item at a time (or a small pool) to avoid thrashing a
just-restored connection.

### 5. Idempotency (backend, small change)
Add a client `idempotency_key` (the queue item id) to `/learning-events/quick`.
Backend: if a moment with that key+user already exists, return it instead of
creating a duplicate. Prevents dupes when a create succeeds but the response is
lost offline. (~1 column + a lookup; the only backend change required.)

### 6. UX
- Capture sheet: if offline, save to queue and toast "Saved — will sync when
  you're online" instead of the normal "Moment saved".
- Journal/feed cards: a "Pending sync" / "Waiting for wifi" badge for queued items
  (reuse the existing upload-progress card slot).
- Manual "Retry" affordance on `failed` items.
- A small queue indicator (e.g. "2 waiting to sync") somewhere unobtrusive.

---

## Phasing & estimate
| Phase | Scope | Est. |
|---|---|---|
| 1 — Core | Persisted queue + durable files + NetInfo + processor (reuses signedUpload) | 4–6 days |
| 2 — UX | Pending/failed badges, offline save toast, manual retry | 2–3 days |
| 3 — Hardening | Idempotency (backend), app-kill-mid-flush recovery, file cleanup, offline tests | 3–4 days |

**~1.5–2 weeks** for production-grade. A rough v1 (Phase 1 + minimal pending UI,
flushing on next foreground/online) is **~1 week**.

## Explicit scope decisions
- **v1 flushes when the app is foregrounded and online** (covers the vast
  majority of real cases). True background upload while the app is *fully closed*
  (iOS/Android background transfer via `expo-task-manager`/background-fetch) is a
  harder stretch goal — defer to a later phase.
- **Idempotency is required** to ship safely; without it, offline retries risk
  duplicate moments.

## Files touched (anticipated)
- New: `src/stores/captureQueueStore.ts`, `src/services/captureQueue.ts`
  (processor), `src/hooks/useIsOnline.ts`, `src/components/capture/QueueBadge.tsx`.
- Edit: `CaptureSheet.tsx` (route through the queue), `app/(app)/_layout.tsx`
  (mount processor), `package.json` (+netinfo).
- Backend: `/learning-events/quick` idempotency key (+ the parent variant).
