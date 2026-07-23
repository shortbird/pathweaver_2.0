"""
Consolidated Optio cron dispatcher (single Render cron service).

Runs every ~10 minutes and dispatches the time-appropriate jobs, so we keep ONE
cron service instead of one-per-job:

  - SIS attendance sweep      -> EVERY run (check-in reminders + gap alerts are
                                 time-of-day sensitive; each org's school-hours
                                 window + per-day dedupe are enforced server-side,
                                 so off-hours runs no-op cheaply).
  - Daily advisor summary     -> ONCE per day, in the 12:00 UTC window (preserves
                                 the original "0 12 * * *" behaviour).

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

# Daily jobs fire once/day in this UTC hour (the cron runs every 10 min, so the
# first run of the hour — minute < 10 — is the single trigger).
DAILY_SUMMARY_UTC_HOUR = 12


def _post(url, secret):
    return requests.post(
        url, json={},
        headers={"Content-Type": "application/json", "X-Cron-Secret": secret},
        timeout=120,
    )


def _run(name, url, secret, failures, retries=1):
    """POST the job; retry once (30 s later) on 5xx/connection errors so a run
    that lands mid-deploy (Render cutover) doesn't page anyone. 4xx means the
    request itself is wrong (bad secret, auth) — retrying can't help, fail now."""
    for attempt in range(retries + 1):
        try:
            r = _post(url, secret)
            print(f"[{name}] status={r.status_code} body={r.text[:300]}")
            if r.status_code == 200:
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
    _run("sis-attendance-sweep", f"{base}/api/sis/internal/attendance-sweep", cron_secret, failures)

    # Once/day: daily advisor summary emails (first run of the 12:00 UTC hour).
    if now.hour == DAILY_SUMMARY_UTC_HOUR and now.minute < 10:
        _run("advisor-summary", f"{base}/api/admin/advisor-summary/trigger", cron_secret, failures)

    # Once/day: SIS tuition payment reminders (15:00 UTC; 25-day per-invoice
    # dedupe is enforced server-side, so daily firing is safe).
    if now.hour == 15 and now.minute < 10:
        _run("sis-billing-reminders", f"{base}/api/sis/internal/billing-reminders", cron_secret, failures)

    # Once/day: SIS quest engagement sweep (13:00 UTC; open-alert dedupe is a
    # partial unique index server-side, so re-runs are idempotent).
    if now.hour == 13 and now.minute < 10:
        _run("sis-engagement-sweep", f"{base}/api/sis/internal/engagement-sweep", cron_secret, failures)

    # Once/day: program-specific daily jobs (e.g. OEA compliance sweep), declared
    # in the program registry so core cron carries no program-specific endpoints.
    # Each no-ops cheaply off-window; alerts/dedupe are enforced server-side.
    for job in daily_cron_jobs():
        if now.hour == job.utc_hour and now.minute < 10:
            _run(job.name, f"{base}{job.path}", cron_secret, failures)

    if failures:
        print(f"Completed with failures: {failures}")
        sys.exit(1)
    print("All dispatched jobs succeeded")
    sys.exit(0)


if __name__ == "__main__":
    main()
