"""
Honey records: rows that no caller should ever receive, watched on the way out.

A fake student sits in a fake, archived org that has no staff and no families.
Nothing legitimate ever returns that student to anyone but a superadmin, so a
response that carries the student's id to anybody else is an access bug -- an
org-scoping slip, a relationship check that let the wrong person through, an
RLS policy that stopped enforcing. Those bugs are otherwise silent: the wrong
person sees the data and the logs show a 200.

The ids come from the CANARY_RECORD_IDS environment variable, never from the
repository. Somebody reading the source must not learn which rows to avoid.
Unset means the watch is off, which is the state for local development and
tests.

What the watch does on a hit is report, never block. Refusing the response
would tell the prober which row is the trap; the report goes to Sentry at
level `error`, fingerprinted per endpoint so one leaking route is one issue,
and the Sentry workflow turns that issue into a ticket.

The watch only reads JSON bodies that are already in memory. Streamed and
file responses are skipped: they are not where a list of students goes, and
buffering them would cost memory on every download.
"""

from typing import Optional, Tuple

from flask import request

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)


def _load_ids() -> Tuple[bytes, ...]:
    raw = Config.CANARY_RECORD_IDS or ''
    return tuple(
        part.strip().lower().encode()
        for part in raw.split(',')
        if part.strip()
    )


def _caller_role(user_id: str) -> Optional[str]:
    """The caller's raw `role` column. Only read on a hit, so never hot."""
    try:
        from repositories.user_repository import UserRepository
        user = UserRepository().find_by_id(user_id)
        return user.get('role') if user else None
    except Exception:
        # Unknown role is treated as not-superadmin: a false report is cheap,
        # a missed leak is not.
        return None


class CanaryWatch:
    def __init__(self, app=None, ids: Optional[Tuple[bytes, ...]] = None):
        self._ids = ids
        if app:
            self.init_app(app)

    @property
    def ids(self) -> Tuple[bytes, ...]:
        if self._ids is None:
            self._ids = _load_ids()
        return self._ids

    def init_app(self, app):
        app.after_request(self.after_request)

    def after_request(self, response):
        try:
            self._check(response)
        except Exception:
            # The watch must never break a response.
            logger.exception('[Canary] watch failed')
        return response

    def _check(self, response):
        ids = self.ids
        if not ids:
            return
        if response.is_streamed or response.direct_passthrough:
            return
        if not response.is_json:
            return

        body = response.get_data().lower()
        hit = next((i for i in ids if i in body), None)
        if hit is None:
            return

        user_id = getattr(request, 'user_id', None)
        role = _caller_role(user_id) if user_id else None
        if role == 'superadmin':
            return

        self._report(hit.decode(), user_id, role, response.status_code)

    def _report(self, record_id, user_id, role, status):
        endpoint = request.url_rule.rule if request.url_rule else request.path
        # warning, not error: logger.error opens its own Sentry issue, and the
        # fingerprinted message below is the one that should group and alert.
        logger.warning(
            f'[Canary] honey record {record_id} returned by '
            f'{request.method} {endpoint} to user={user_id} role={role} '
            f'status={status}'
        )
        try:
            import sentry_sdk
            with sentry_sdk.push_scope() as scope:
                scope.set_tag('canary_endpoint', endpoint)
                scope.set_context('canary', {
                    'record_id': record_id,
                    'method': request.method,
                    'path': request.path,
                    'endpoint': endpoint,
                    'user_id': user_id,
                    'role': role,
                    'status': status,
                    'ip': request.headers.get('X-Forwarded-For', request.remote_addr),
                })
                scope.fingerprint = ['canary-record-exposed', request.method, endpoint]
                sentry_sdk.capture_message(
                    f'Honey record exposed by {request.method} {endpoint}',
                    level='error',
                )
        except Exception:
            # telemetry must never break the request
            logger.exception('[Canary] Sentry report failed')


canary_watch = CanaryWatch()
