"""
Consolidated Optio cron dispatcher (single Render cron service).

Runs every ~10 minutes and dispatches the time-appropriate jobs, so we keep ONE
cron service instead of one-per-job:

  - SIS attendance sweep      -> EVERY run (check-in reminders + gap alerts are
                                 time-of-day sensitive; each org's school-hours
                                 window + per-day dedupe are enforced server-side,
                                 so off-hours runs no-op cheaply).
  - AI credit review sweep    -> EVERY run (reviews queued submissions; returns
                                 before any model call, work happens on a thread).
  - Account deletion sweep    -> once/day (09:00 UTC).
  - Data retention sweep      -> once/day (10:00 UTC), no-op unless enabled.

Core jobs are dispatched directly below; only PROGRAM-specific jobs come from
programs/registry.py, which is the seam that keeps core from naming a program.
Account deletion and retention are platform-wide obligations, not a program's,
so they belong here.

(The daily advisor summary was dispatched here until 2026-08-05, when it was
disabled at the owner's request. The job, its service, its email template and
its trigger endpoint were DELETED on 2026-09-07 — there is nothing left to
re-enable, and reinstating it means writing it again.)

Each job is isolated (a failure in one never blocks the other). Required env vars
(already present on the existing cron service): BACKEND_URL, CRON_SECRET.
"""

import os
import sys
import time
from datetime import datetime, timezone

import requests

# Import the backend program registry regardless of the cron's cwd (jobs/ -> backend/).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from programs.registry import daily_cron_jobs


def _post(url, secret):
    return requests.post(
        url, json={},
        headers={"Content-Type": "application/json", "X-Cron-Secret": secret},
        timeout=120,
    )


def _deployed_commit(base):
    """The commit the BACKEND is running, from /api/health, or None.

    This cron service auto-deploys on every push to `main`; the backend deploys
    only from release.yml's `deploy` job, on green tests. So the two run
    different code for as long as a release is red, and a commit that adds both
    a dispatch call and the route it calls ships the caller without the callee.
    See _run for what that costs.
    """
    try:
        r = requests.get(f"{base}/api/health", timeout=15)
        if r.status_code == 200:
            return (r.json() or {}).get('commit')
    except (requests.RequestException, ValueError) as e:
        print(f"[health] could not read the deployed commit: {e}")
    return None


def _run(name, url, secret, failures, retries=1, base=None):
    """POST the job; retry once (30 s later) on 5xx/connection errors so a run
    that lands mid-deploy (Render cutover) doesn't page anyone. 4xx means the
    request itself is wrong (bad secret, auth) — retrying can't help, fail now.

    ONE exception, added 2026-09-10: a 404 while the backend is running a
    DIFFERENT commit than this cron is not a failure, it is the deploy window.
    Both this dispatcher and the route it calls ship in one commit, but the
    cron auto-deploys and the backend waits for green tests, so the cron knows
    to call an endpoint that is not live yet. On 2026-09-08 that made the
    parent-weekly-digest sweep 404 and exit 1 every ten minutes until the
    release went green; on 2026-09-10 credit-ai-review-sweep did the same. The
    run was red for hours with nothing wrong in it.

    The commit comparison is what keeps this honest: a 404 on the SAME commit
    the backend is serving is a real routing bug and still fails the run, so a
    deleted or misspelled route cannot hide here forever.
    """
    for attempt in range(retries + 1):
        try:
            r = _post(url, secret)
            print(f"[{name}] status={r.status_code} body={r.text[:300]}")
            if r.status_code == 200:
                return
            if r.status_code == 404 and base:
                live = _deployed_commit(base)
                mine = os.environ.get('RENDER_GIT_COMMIT')
                if live and mine and live != mine:
                    print(f"[{name}] 404 but the backend is on {live[:8]} and this "
                          f"cron is on {mine[:8]} — route not deployed yet, skipping")
                    return
            if r.status_code < 500:
                break
        except requests.RequestException as e:
            print(f"[{name}] ERROR: {e}")
        if attempt < retries:
            print(f"[{name}] transient failure — retrying in 30s")
            time.sleep(30)
    failures.append(name)


def main():
    backend_url = os.environ.get("BACKEND_URL")
    cron_secret = os.environ.get("CRON_SECRET")
    if not backend_url or not cron_secret:
        print("ERROR: BACKEND_URL and CRON_SECRET env vars are required")
        sys.exit(1)

    base = backend_url.rstrip("/")
    now = datetime.now(timezone.utc)
    failures = []

    # Every run: SIS attendance sweep (reminders + gap alerts).
    _run("sis-attendance-sweep", f"{base}/api/sis/internal/attendance-sweep", cron_secret, failures, base=base)

    # Every run: expire stale per-class waitlist offers (past their 48h TTL) so a
    # freed seat returns to the queue and admins get re-alerted promptly rather
    # than up to a day later. The sweep is idempotent and no-ops cheaply when
    # nothing is expired, so running it each cycle is safe.
    _run("sis-waitlist-offer-sweep", f"{base}/api/sis/internal/waitlist-offer-sweep", cron_secret, failures, base=base)

    # Every run: enroll students in class quests whose scheduled publish time has
    # arrived. Assignment enrolls the class immediately; a quest scheduled for
    # later deliberately doesn't, so this is what delivers it on the day. Skips
    # every pair that already has an enrollment, so re-runs cost one query.
    _run("class-quest-publish-sweep",
         f"{base}/api/sis/internal/publish-class-quests", cron_secret, failures, base=base)

    # Every run: CRM funnel sweep (scheduled nurture/onboarding sends). The
    # send window (9-19 Denver), per-lead throttle, and postal-address gate
    # are all enforced server-side, so off-hours runs no-op cheaply.
    _run("crm-funnel-sweep", f"{base}/api/crm/internal/funnel-sweep", cron_secret, failures, base=base)

    # Every run: AI credit review sweep. Picks up submissions whose request-time
    # thread never ran (deploy mid-request, no worker slot) and reviews abandoned
    # mid-flight. Returns before any model call, so the 120s dispatch timeout is
    # never in play. Idempotent: a review already running or complete is skipped.
    _run("credit-ai-review-sweep", f"{base}/api/credit-dashboard/internal/ai-review-sweep",
         cron_secret, failures, base=base)

    # Every run: weekly parent digest. The send day and hour belong to each
    # school (in ITS timezone), so the window check has to happen server-side —
    # a fixed UTC hour here would send Sunday's digest on Monday for half the
    # country. Off for every org until an admin turns it on, and one row per
    # parent per week means the six ticks inside the send hour send once.
    _run("parent-weekly-digest", f"{base}/api/parent-digest/internal/sweep",
         cron_secret, failures, base=base)

    # Hourly: Google Calendar booking poll (the "scheduled a video chat"
    # conversion trigger). No-ops until the calendar credential is configured.
    if now.minute < 10:
        _run("crm-calendar-poll", f"{base}/api/crm/internal/calendar-poll", cron_secret, failures, base=base)

    # Once/day: SIS tuition payment reminders (15:00 UTC; 25-day per-invoice
    # dedupe is enforced server-side, so daily firing is safe).
    if now.hour == 15 and now.minute < 10:
        _run("sis-billing-reminders", f"{base}/api/sis/internal/billing-reminders", cron_secret, failures, base=base)

    # Once/day: SIS tuition auto-charge sweep (14:00 UTC; charges installments
    # whose due date has arrived on saved-card payment plans. Only touches
    # scheduled/due installments, so re-runs the same day are idempotent — a
    # charged installment is 'paid' and a declined one is 'late', neither of
    # which is picked up again).
    if now.hour == 14 and now.minute < 10:
        _run("sis-tuition-autopay", f"{base}/api/sis/internal/tuition-autopay", cron_secret, failures, base=base)

    # Once/day: open-ended monthly tuition (14:00 UTC, right after the autopay
    # sweep so a school running both bills on one pass). Groups each household's
    # active schedules into ONE invoice and ONE charge. Idempotent within a day:
    # a billed row's next_charge_on has already advanced a month, so a re-run
    # finds nothing due. A declined card is left for staff, never retried.
    if now.hour == 14 and now.minute < 10:
        _run("sis-recurring-tuition", f"{base}/api/sis/internal/recurring-tuition", cron_secret, failures, base=base)

    # Once/day: SIS quest engagement sweep (13:00 UTC; open-alert dedupe is a
    # partial unique index server-side, so re-runs are idempotent).
    if now.hour == 13 and now.minute < 10:
        _run("sis-engagement-sweep", f"{base}/api/sis/internal/engagement-sweep", cron_secret, failures, base=base)

    # Once/day: account deletion executor (09:00 UTC). Erases accounts whose
    # 30-day grace period has expired — the thing that makes "your account is
    # scheduled for deletion" true. Idempotent: it only picks up accounts still
    # marked pending and past their date, re-checks each one immediately before
    # erasing it (so a cancellation wins), and leaves failures pending so the
    # next day retries rather than parking them as done.
    if now.hour == 9 and now.minute < 10:
        _run("account-deletion-sweep", f"{base}/api/users/internal/deletion-sweep", cron_secret, failures, base=base)

    # Once/day: data retention sweep (10:00 UTC). AI tutor conversation history
    # only. DISABLED by default (Config.TUTOR_RETENTION_ENABLED) — with it off
    # the endpoint reports how many conversations would be purged and deletes
    # nothing, so this is safe to dispatch before anyone opts in.
    if now.hour == 10 and now.minute < 10:
        _run("data-retention-sweep", f"{base}/api/users/internal/retention-sweep", cron_secret, failures, base=base)

    # Once/day: program-specific daily jobs (e.g. OEA compliance sweep), declared
    # in the program registry so core cron carries no program-specific endpoints.
    # Each no-ops cheaply off-window; alerts/dedupe are enforced server-side.
    for job in daily_cron_jobs():
        if now.hour == job.utc_hour and now.minute < 10:
            _run(job.name, f"{base}{job.path}", cron_secret, failures, base=base)

    if failures:
        print(f"Completed with failures: {failures}")
        sys.exit(1)
    print("All dispatched jobs succeeded")
    sys.exit(0)


if __name__ == "__main__":
    main()
