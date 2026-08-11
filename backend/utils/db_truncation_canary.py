"""
Make silent PostgREST truncation loud.

PostgREST caps a response at `db-max-rows` and tells the caller nothing: the
supabase-py `APIResponse` exposes only `data` and `count`, so a read that was cut
off is indistinguishable from a complete one at every call site in this codebase.
That is what let the SIS class list under-report enrollment for an unknown length
of time — the counts were simply wrong, with no error and no log line
(docs/icreate/FAB_TRIAGE_2026-07-29_enrollment_counts.md).

Paging (`utils.db_fetch.fetch_all_rows`) fixes the reads we know about. This
catches the ones we don't, in production, on real data volumes — including reads
written after today by someone who has never heard of the row cap.

## How

PostgREST does report the row count, in the `Content-Range` response header
(`0-999/*`). A response holding exactly `Config.POSTGREST_MAX_ROWS` rows is
almost certainly truncated, so we log a warning naming the table and filters and
report it to Sentry once per distinct query shape.

The hook is attached to the postgrest client's httpx session and is strictly
read-only: it inspects headers, never the body (reading the body inside a
response hook would interfere with the caller), and swallows everything. It
cannot change a query's result.

Reads that bound themselves are skipped. A request carrying an explicit `limit`
query param within the cap (`.limit(n)` / `.range(a, b)` both send one) asked
for at most that many rows and got them — the cap cut nothing. Without this,
`fetch_all_rows` itself trips the canary on every full page, because it pages
at exactly the cap: the one read pattern that is definitionally safe produced
most of the alarms (OPTIO-BACKEND-39, 180 events), burying the real ones. A
request whose `limit` EXCEEDS the cap still warns — PostgREST silently
overrides it, which is exactly the trap this canary exists to catch.

## Acting on a warning

A hit means some read is returning a truncated row set and whatever is computed
from it is wrong. Fix the call site — page it with `fetch_all_rows`, or better,
push the aggregate into Postgres so there are no rows to truncate. Do not raise
`POSTGREST_MAX_ROWS` to silence it; that moves the cliff without removing it.

A legitimate read that matches exactly `max_rows` rows will warn spuriously. That
is the intended trade: the false positive costs one log line, the false negative
costs silently wrong numbers in front of a customer.
"""

from typing import Any, Optional, Set

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

_HOOK_FLAG = '_optio_truncation_canary'

# Bounded so a hot truncated endpoint can't grow this without limit; we only
# need to hear about each query shape once per process.
_MAX_REPORTED = 256
_reported: Set[str] = set()


def _rows_in(content_range: str) -> Optional[int]:
    """Rows carried by a PostgREST `Content-Range` value (`0-999/*`), or None.

    An empty result is reported as `*/0` or `*/*`, which has no range part.
    """
    span = content_range.split('/')[0].strip()
    if '-' not in span:
        return None
    start, _, end = span.partition('-')
    try:
        return int(end) - int(start) + 1
    except ValueError:
        return None


def _caller_bounded(url: Any, cap: int) -> bool:
    """True when the request's own `limit` param is within the cap, meaning the
    caller asked for at most this many rows and PostgREST honored it — nothing
    was silently cut. `.limit(n)` and `.range(a, b)` both send the param; a
    limit above the cap is NOT honored, so it does not count as bounded."""
    try:
        limit = url.params.get('limit')
        return limit is not None and int(limit) <= cap
    except Exception:  # noqa: BLE001 — an unparseable limit falls back to warning
        return False


def _shape(url: Any) -> str:
    """A stable label for the query — its path plus the filter keys, without the
    filter VALUES, so ids and emails stay out of the logs."""
    try:
        keys = sorted({k for k in url.params.keys() if k != 'select'})
        return f"{url.path}?{'&'.join(keys)}" if keys else str(url.path)
    except Exception:  # noqa: BLE001 — labelling must never break the hook
        return '<unknown>'


def _on_response(response: Any) -> None:
    try:
        cap = Config.POSTGREST_MAX_ROWS
        if not cap:
            return
        content_range = response.headers.get('content-range')
        if not content_range:
            return
        rows = _rows_in(content_range)
        if rows is None or rows < cap:
            return
        if _caller_bounded(response.request.url, cap):
            return

        shape = _shape(response.request.url)
        if shape in _reported:
            return
        if len(_reported) < _MAX_REPORTED:
            _reported.add(shape)

        logger.warning(
            f'[DB] Read returned exactly {cap} rows ({content_range}) — PostgREST '
            f'almost certainly TRUNCATED it, so anything computed from this result '
            f'is wrong. Page it with utils.db_fetch.fetch_all_rows, or move the '
            f'aggregate into Postgres. Query: {shape}'
        )
        _report_to_sentry(shape, cap, content_range)
    except Exception as e:  # noqa: BLE001 — a canary must never break a query
        logger.debug(f'[DB] truncation canary skipped: {e}', exc_info=True)


def _report_to_sentry(shape: str, cap: int, content_range: str) -> None:
    """Best-effort; no-op when Sentry isn't initialized (local dev)."""
    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            scope.set_tag('source', 'db_truncation')
            scope.set_tag('query_shape', shape)
            scope.set_context('db_truncation', {
                'content_range': content_range,
                'max_rows': cap,
                'query_shape': shape,
            })
            sentry_sdk.capture_message(
                f'PostgREST response truncated at {cap} rows: {shape}',
                level='warning',
            )
    except Exception as e:  # noqa: BLE001
        logger.debug(f'[DB] truncation canary sentry report skipped: {e}')


def install(client: Any) -> Any:
    """Attach the canary to a supabase client. Returns the same client.

    Idempotent, and a no-op if the postgrest session doesn't expose httpx event
    hooks (a supabase-py version change must not break client construction).
    """
    try:
        session = client.postgrest.session
        if getattr(session, _HOOK_FLAG, False):
            return client
        session.event_hooks['response'].append(_on_response)
        setattr(session, _HOOK_FLAG, True)
    except Exception as e:  # noqa: BLE001 — observability is never worth a 500
        logger.debug(f'[DB] could not install truncation canary: {e}')
    return client
