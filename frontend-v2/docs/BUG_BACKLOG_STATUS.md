# Bug-report backlog — status (2026-06-03)

Triaged from the `bug_reports` table. Most items shipped; the rest are recorded
here with why they're deferred and what they need.

## Shipped

| Item | Fix |
|------|-----|
| Sentry bug-report inbox | `captureBugReport()` — each report is its own Sentry issue, `feature:bug_report` tag. Triage with `search_issues('is:unresolved feature:bug_report')`. |
| Drawer "tap twice" | Deterministic `BottomSheet onClosed` callback (capture-moment, manage-observers, start-class). |
| Bounty list stale after approve | `/bounties` refetches on focus. |
| Feed video keeps playing off-screen | FlatList viewability → `FeedCard isActive` → `VideoPlayer` pause. |
| Status-bar icons invisible on white | Theme-driven `<StatusBar>` in the root layout. |
| Video needs app restart to show | `VideoPlayer` shows tap-to-retry on a transient load error (`replaceAsync`). |
| Bounty screenshot doesn't show | Image evidence falls back to `content.url` when there's no `items[]`. |
| Superadmin sees everyone's activity in a journal | Journal feed always scopes to `studentId ?? currentUserId`. |
| Moment delete = full page refresh | Optimistic removal from the list. |
| Learning-event update 500 | (earlier) childId routing + 404 on zero-row update. |
| openURL date crash | (earlier) `safeOpenURL`. |
| Video upload made you wait | Optimistic create + **background** upload/finalize; moment saves immediately, media fills in on completion. |

## Needs your input / infra (deferred)

### B12 — Push notifications not delivered (INFRA, not code)
The send pipeline is correct and fully wired: `registerForPushNotifications()`
(after login) → `device_tokens` → `NotificationService.create_notification` →
`ExpoPushService.send_notification` → Expo Push API, for a broad set of
notification types. Tokens ARE being stored (active tokens exist).

**Most likely root cause:** the EAS project's **FCM (Android) / APNs (iOS)
credentials aren't configured**, so Expo accepts the push (ticket `ok`) but
delivery fails — and those errors only appear in *receipts*, which we weren't
checking. Fixes applied in code:
- Added `EXPO_ACCESS_TOKEN` support (needed if "Enhanced Security for Push" is
  on — otherwise every send is rejected).
- Loud per-ticket failure logging (was a bare failed count).

**Action for you:** in the Expo dashboard, confirm FCM V1 credentials (Android)
and an APNs key (iOS) are uploaded for the project, then send a test push. If
"Enhanced Security for Push" is enabled, set `EXPO_ACCESS_TOKEN` in the backend
env. (Receipt-polling — fetching delivery results ~15 min after send — is the
remaining code enhancement; it needs a scheduled job, so it's left for a
dedicated pass.)

### B5 — "Awaiting" pill icon "looks weird" (needs the screenshot)
Too vague to fix confidently. The status pill itself (`bounties/review/[id]`) is
text-only; the "weird icon" is elsewhere. Pull the report's screenshot
(`GET /api/bug-reports/:id` as superadmin → signed URL) to see it.

### B6 — Keyboard-dismiss leaves empty space under a popup
The shared `BottomSheet` already handles this (manual keyboard padding that
resets to 0). The remaining offender is `CommentSheet`, which uses its own
`Modal` + `KeyboardAvoidingView`. Converting it to the `BottomSheet` keyboard
approach is the fix, but it needs on-device verification (Android soft-input
behavior) before changing a chat-style layout — deferred to avoid regressing it
blind.

### B14 — "iPhone kebab bug" (needs repro)
No detail in the report. Needs the screenshot / a repro to action.

### B15 — Bounty-create "improve UX" (needs scoping)
Open-ended; needs specific direction.
