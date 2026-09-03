"""One definition of "now", because there were thirty-five.

`_now_iso()` was copy-pasted into 35 modules -- routes, services, repositories,
scripts -- and the copies had diverged. THIRTY-TWO returned an aware UTC
timestamp (`2026-09-03T22:00:00+00:00`); THREE returned a naive one
(`2026-09-03T22:00:00`) via `datetime.utcnow()`:

    routes/sis/goals.py
    services/messaging_extras_service.py
    services/sis_community_service.py

That is the failure mode duplication produces here. It is not a style
complaint: `datetime.utcnow()` is deprecated from Python 3.12, and a naive
string compared against an aware one raises TypeError rather than sorting
wrong, so the bug surfaces as a crash in whichever code path first mixes a
goal's timestamp with anything else's.

The copies now alias these, so call sites are untouched:

    from utils.timestamps import now_iso as _now_iso

`utcnow()` is here for the handful of callers that wanted a datetime rather
than a string.
"""

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Timezone-AWARE current UTC time.

    Aware, always. `datetime.utcnow()` returns a naive datetime that claims to
    be UTC and cannot be compared with an aware one -- and Python 3.12
    deprecated it for exactly that reason.
    """
    return datetime.now(timezone.utc)


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string, with the offset included.

    The trailing `+00:00` matters: Postgres reads a naive string into a
    `timestamptz` column by ASSUMING a timezone, and which one it assumes
    depends on the session. Being explicit removes the question.
    """
    return utcnow().isoformat()
