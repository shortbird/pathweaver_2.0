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
from datetime import datetime, timezone

import requests

# Daily jobs fire once/day in this UTC hour (the cron runs every 10 min, so the
# first run of the hour — minute < 10 — is the single trigger).
DAILY_SUMMARY_UTC_HOUR = 12


def _post(url, secret):
    return requests.post(
        url, json={},
        headers={"Content-Type": "application/json", "X-Cron-Secret": secret},
        timeout=120,
    )


def _run(name, url, secret, failures):
    try:
        r = _post(url, secret)
        print(f"[{name}] status={r.status_code} body={r.text[:300]}")
        if r.status_code != 200:
            failures.append(name)
    except requests.RequestException as e:
        print(f"[{name}] ERROR: {e}")
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

    if failures:
        print(f"Completed with failures: {failures}")
        sys.exit(1)
    print("All dispatched jobs succeeded")
    sys.exit(0)


if __name__ == "__main__":
    main()
