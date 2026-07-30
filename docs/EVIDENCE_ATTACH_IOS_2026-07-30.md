# iOS: "attaching photos to my quests doesn't work" — 2026-07-30

**Status: not fixed. Instrumented so the next report identifies the cause.**

Two reports, same user (`strattonmchapman@gmail.com`, student), same device
(iPhone 12, iOS 26.3.1, app 1.0.0), 18 days apart:

| Report | Date | Message |
|---|---|---|
| `354df1ec` | 2026-07-12 | "If won't let me upload a video as evidence for my quest" |
| `47dfbec5` | 2026-07-30 | "In my phone settings I've given permission to Optio to use my photos but when I try attaching them in my quests it doesn't work" |

## What the forensics establish

**The failure is entirely client-side, before any network call.** Both reports'
`recent_api_calls` buffers contain only GETs, all 200 — no upload init, no
finalize, nothing. Both `recent_console_errors` buffers are empty. Both
`sentry_event_id` are null.

**It is not a permanent breakage — uploads worked for this user before.** Their
`evidence_document_blocks` history:

| Date | Block |
|---|---|
| 2026-05-20 | video |
| 2026-06-16 | image, then video ×2 |
| 2026-07-08 | video — **last successful media** |
| 2026-07-13 | **text only**: *"I did a foot stall and got it on video"*, *"It took me a couple tries but I got the foot stall on video"* |

The 2026-07-13 rows are the most telling artifact in this whole investigation:
the day after reporting that video wouldn't upload, they saved a text block
*describing* the video they couldn't attach. That is a user working around the
bug, and it corroborates the report independently of anything they typed.

**The breadcrumbs show a short, decisive attempt.** On 2026-07-30 they were on
quest `1518f2b1` from 17:59:26 to 17:59:45 — 19 seconds — then went to
`/dashboard` → `/settings` and filed the report at 18:00:50.

**The July 27 fix does not cover this.** `476194c` ("re-show Add Evidence sheet
before video transcode") is Android-only by construction — it changes the
`Platform.OS === 'android'` branch, and its own message says *"reported on
Galaxy A17"* and *"Photos were unaffected"*. The 07-30 report postdates it.

**Nothing in the code changed in the window where it broke.** No commit between
2026-07-08 and 2026-07-12 touches `components/capture`, `signedUpload`,
`videoCompression`, `uploadQueue`, or `documentScanner`.

## Why it has stayed open

Every failure mode in this pipeline is silent:

- `runWithSheetHidden` on iOS launches the picker and awaits it — a picker that
  never presents produces no error and no result.
- `processPickerAssets` returns bare on `!assets || assets.length === 0`, which
  is indistinguishable from a user cancel.
- `compressImageAsset` caught and fell back to the raw asset with **no**
  telemetry at all (the video path already reported its fallback).
- Size and duration gates dropped assets with only a `captureMessage`, which
  does not reach the bug-report buffer.

So the FAB captured a perfect record of everything *except* the thing that
failed. That is what this change fixes.

## Candidate causes (not yet discriminated)

1. **iOS modal-presentation conflict.** `BottomSheet` is a React Native `Modal`,
   and on iOS `runWithSheetHidden` deliberately does *not* hide it before
   launching the picker (`Platform.OS !== 'android'` → launch directly). The
   picker is a UIViewController presentation on top of an already-presented
   modal. Notably, `bottom-sheet.tsx`'s own documentation states the opposite
   constraint: *"on iOS a new Modal won't present until the previous is fully
   gone, which is what caused the 'tap the drawer action twice' bug"* — and the
   `onClosed` callback built to solve exactly that is used **only** by the
   Android branch. The iOS branch bypasses the mechanism designed for iOS.
2. **The tap never registers.** This component has a documented history of it
   ("tap the drawer option twice, the first tap doesn't register", fixed by
   shortening the entrance animation to 220 ms). A missed tap looks identical to
   a broken picker and emits nothing.
3. **Photo-library permission state.** The user's own wording points here, and
   the library path has no permission handling whatsoever. Note the modern iOS
   picker (PHPicker) needs no grant, so this is the weakest of the three — but
   "limited" access is worth ruling out rather than assuming.

All three produce byte-identical telemetry today: nothing.

## What this change does

Adds a `recent_actions` ring buffer to `diagnostics.ts` (40 entries, deeper than
the 20-entry API/route rings because one attach emits several stages and users
retry before reporting). It rides inside the existing `extra` jsonb column,
which the bug-report route's allow-list already accepts — **no migration and no
backend change**. Metadata only: counts, sizes, permission status, platform;
never URIs or user content.

Stages recorded across `TaskEvidenceSheet` and `CaptureSheet`:

```
evidence:picker-tap          source + platform — proves the tap registered
evidence:library-permission  status + accessPrivileges (read, never requested)
evidence:library-result      canceled + assetCount, straight from the picker
evidence:picker-returned     assetCount after the launch resolves
evidence:picker-threw        the launch rejected
evidence:no-assets           the silent early return, now visible
evidence:rejected-size       asset dropped by the 10MB/500MB gate
evidence:rejected-duration   video dropped by the 5-minute gate
evidence:attached            added + dropped
evidence:save-start          mediaCount
evidence:upload-failed       per-file upload failure
evidence:uploaded            ok + failed
image-compression:failed     the HEIC fallback, previously fully silent
```

`getMediaLibraryPermissionsAsync` is used deliberately over
`requestMediaLibraryPermissionsAsync`: reading the status cannot prompt, so this
adds no permission dialog and cannot regress the PHPicker path.

**Behaviour is otherwise unchanged.** No native presentation logic was touched —
fixing candidate 1 blind risks regressing the path that currently works at least
some of the time, and it cannot be verified without a physical iOS device.

## How the next report resolves it

Read `extra.recent_actions` on the new report:

- `picker-tap` **absent** → the tap never registered (candidate 2).
- `picker-tap` present, no `library-result` → the picker never presented
  (candidate 1). This is the one that would justify switching iOS to the
  `onClosed` sequencing the Android branch already uses.
- `library-result` with `canceled: true` → the picker presented and the user
  backed out; not a bug, or a usability problem in the picker itself.
- `library-permission` showing `denied` / `limited` → candidate 3.
- `rejected-size` / `rejected-duration` → the file was gated; the alert exists
  but may be getting dismissed or missed.
- `upload-failed` → the pipeline worked and the network step is the problem,
  which would be a different investigation entirely.

## Fastest path to an answer

Ask this student to try once more after the OTA lands and file a report from the
same screen — the trail is captured automatically. Failing that, reproducing on
any physical iPhone (Simulator's photo picker does not exercise the same
presentation path) would settle candidate 1 directly.
