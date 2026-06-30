"""
Cron Trigger Script for Class Attendance Reminders (iCreate SIS)

Lightweight standalone script executed by Render's cron service every ~15 min.
POSTs to the backend trigger endpoint with the cron secret header. The backend
figures out which classes are starting now and pings their advisors.

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

    url = f"{backend_url.rstrip('/')}/api/admin/attendance-reminder/trigger"
    headers = {
        "Content-Type": "application/json",
        "X-Cron-Secret": cron_secret,
    }

    print(f"Triggering attendance reminders at {url}")

    try:
        response = requests.post(url, json={}, headers=headers, timeout=120)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")

        if response.status_code == 200:
            print("Attendance reminders triggered successfully")
            sys.exit(0)
        else:
            print(f"ERROR: Unexpected status code {response.status_code}")
            sys.exit(1)

    except requests.Timeout:
        print("ERROR: Request timed out after 120 seconds")
        sys.exit(1)
    except requests.RequestException as e:
        print(f"ERROR: Request failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
