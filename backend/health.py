"""
M7: Health check helpers.

Kept in a small standalone module (rather than inline in app.py) so the DB
ping is unit-testable without booting the full Flask app — `import app`
currently triggers a heavy chain that's slow/fragile in some envs.
"""

from typing import Optional, Tuple


def ping_database() -> Tuple[bool, Optional[str]]:
    """Tiny indexed read against Supabase so the health check actually proves
    DB reachability. Returns (ok, error_message)."""
    try:
        from database import get_supabase_admin_client
        get_supabase_admin_client().table('users').select('id').limit(1).execute()
        return True, None
    except Exception as e:
        return False, str(e)
