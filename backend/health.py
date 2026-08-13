"""
M7: Health check helpers.

Kept in a small standalone module (rather than inline in app.py) so the DB
ping is unit-testable without booting the full Flask app — `import app`
currently triggers a heavy chain that's slow/fragile in some envs.

The ping deliberately does NOT go through the shared supabase-py client:

* Render's health check gives up after **5 seconds**, but supabase-py's
  `postgrest_client_timeout` defaults to **120s** (and `database.py` never
  passes custom `ClientOptions` to `create_client` anyway). One hung request
  therefore turned `/api/health` into a Render "timed out after 5 seconds"
  failure rather than the 503 the route is designed to return.
* The shared client's connection pool is where the failure actually came
  from: a keepalive socket the far end had already closed surfaces as
  `[SSL: UNEXPECTED_EOF_WHILE_READING]` on reuse. Probing the pool that
  serves real traffic makes the health check *inherit* that flakiness.

So the ping is a bounded, self-contained PostgREST GET on a fresh connection.
It still proves end-to-end DB reachability (PostgREST has to reach Postgres to
answer), and its worst case is capped well under Render's budget.
"""

import time
from typing import Optional, Tuple

import httpx

# Per-attempt cap. Two attempts plus Flask overhead must stay under Render's
# 5s health-check timeout, so the retry below is also deadline-gated.
PING_TIMEOUT_SECONDS = 1.5

# Only retry while the whole ping still fits comfortably in the budget.
PING_DEADLINE_SECONDS = 3.0


def ping_database() -> Tuple[bool, Optional[str]]:
    """Tiny indexed read against Supabase so the health check actually proves
    DB reachability. Returns (ok, error_message).

    Bounded by `PING_DEADLINE_SECONDS` in every path — a hang must surface as
    a 503 (transient unhealthy, LB pulls the instance) and never as a timeout.
    """
    try:
        from app_config import Config

        if not Config.SUPABASE_URL or not Config.SUPABASE_SERVICE_ROLE_KEY:
            return False, 'Missing Supabase configuration'

        url = f"{Config.SUPABASE_URL.rstrip('/')}/rest/v1/users"
        params = {'select': 'id', 'limit': '1'}
        headers = {
            'apikey': Config.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': f'Bearer {Config.SUPABASE_SERVICE_ROLE_KEY}',
            'Accept': 'application/json',
        }
    except Exception as e:  # noqa: BLE001 - config access must never raise here
        return False, str(e)

    started = time.monotonic()
    last_error = None

    for attempt in range(2):
        if attempt and (time.monotonic() - started) >= PING_DEADLINE_SECONDS - PING_TIMEOUT_SECONDS:
            # No room left in the budget for a second attempt.
            break
        try:
            # A fresh client per ping: never reuses (and never poisons) the
            # pool that serves request traffic. `Connection: close` keeps the
            # far end from holding the socket open after we drop it.
            with httpx.Client(timeout=PING_TIMEOUT_SECONDS) as client:
                response = client.get(
                    url,
                    params=params,
                    headers={**headers, 'Connection': 'close'},
                )
            if response.status_code < 400:
                return True, None
            last_error = f'PostgREST returned HTTP {response.status_code}'
        except Exception as e:  # noqa: BLE001 - any failure means "unreachable"
            last_error = str(e)

    return False, last_error
