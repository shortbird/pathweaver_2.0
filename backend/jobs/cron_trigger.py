"""
Cron Trigger Script for Daily Advisor Summary

Lightweight standalone script executed by Render's cron service.
POSTs to the backend API endpoint with the cron secret header.

Required env vars:
  BACKEND_URL  - Base URL of the backend (e.g. https://optio-prod-backend.onrender.com)
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

    url = f"{backend_url.rstrip('/')}/api/admin/advisor-summary/trigger"
    headers = {
        "Content-Type": "application/json",
        "X-Cron-Secret": cron_secret,
    }

    print(f"Triggering advisor summary at {url}")

    try:
        response = requests.post(url, json={}, headers=headers, timeout=300)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")

        if response.status_code == 200:
            print("Advisor summary triggered successfully")
            sys.exit(0)
        else:
            print(f"ERROR: Unexpected status code {response.status_code}")
            sys.exit(1)

    except requests.Timeout:
        print("ERROR: Request timed out after 300 seconds")
        sys.exit(1)
    except requests.RequestException as e:
        print(f"ERROR: Request failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
