"""
SIS Attendance Sweep Cron Trigger

Lightweight standalone script executed by Render's cron service every ~10 min during
the day. POSTs to the SIS sweep endpoint, which sends check-in reminders + attendance
gap alerts for every sis_enabled org (each org's school-hours window is enforced
server-side, so a wide cron window is fine).

Required env vars:
  BACKEND_URL  - Base URL of the backend (e.g. https://api.optioeducation.com)
  CRON_SECRET  - Shared secret for authenticating cron requests
"""

import os
import sys

import requests


def main():
    backend_url = os.environ.get("BACKEND_URL")
    cron_secret = os.environ.get("CRON_SECRET")

    if not backend_url:
        print("ERROR: BACKEND_URL env var is not set")
        sys.exit(1)
    if not cron_secret:
        print("ERROR: CRON_SECRET env var is not set")
        sys.exit(1)

    url = f"{backend_url.rstrip('/')}/api/sis/internal/attendance-sweep"
    headers = {"Content-Type": "application/json", "X-Cron-Secret": cron_secret}
    print(f"Triggering SIS attendance sweep at {url}")

    try:
        response = requests.post(url, json={}, headers=headers, timeout=120)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")
        sys.exit(0 if response.status_code == 200 else 1)
    except requests.RequestException as e:
        print(f"ERROR: Request failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
