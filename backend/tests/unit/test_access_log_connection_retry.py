"""A dropped keepalive socket must not cost a FERPA disclosure row.

AccessLogger swallows its own failures on purpose -- an audit write must never
break the read it is recording -- which means a dropped write is invisible: the
handler logs, returns False, and the request carries on without the row.

The admin client keeps Supabase connections alive between requests. When the
far end closes one it has already handed out, the next call through the pool
raises httpx.RemoteProtocolError("Server disconnected") before the request is
even sent, so nothing reached Postgres and a second attempt on a fresh
connection succeeds. Sentry OPTIO-BACKEND-84 was that, on a parent reading a
student's schedule.
"""

from unittest.mock import patch

import httpx
import pytest

from utils.access_logger import AccessLogger

STUDENT_ID = '99999999-9999-4999-8999-999999999999'
ACCESSOR_ID = '88888888-8888-4888-8888-888888888888'


class _Insert:
    def __init__(self, outcomes):
        self._outcomes = list(outcomes)
        self.attempts = 0

    def execute(self):
        self.attempts += 1
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class _Client:
    """Admin client whose insert answers each attempt from `outcomes`."""

    def __init__(self, outcomes):
        self.insert_calls = []
        self._insert = _Insert(outcomes)

    def table(self, name):
        assert name == 'student_access_logs'
        return self

    def insert(self, row):
        self.insert_calls.append(row)
        return self._insert

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        # _lookup_accessor_role's read; the role it resolves is not the point.
        return type('R', (), {'data': [{'id': ACCESSOR_ID, 'role': 'parent'}]})()


def _log_with(client):
    with patch('utils.access_logger.get_supabase_admin_singleton', return_value=client), \
         patch('utils.retry_handler.time.sleep'):
        return AccessLogger.log_student_data_access(
            student_id=STUDENT_ID,
            accessor_id=ACCESSOR_ID,
            data_type='schedule',
            purpose='parent_request',
            endpoint='/api/sis/parent/students/x/schedule',
        )


@pytest.mark.parametrize('dropped', [
    httpx.RemoteProtocolError('Server disconnected'),
    httpx.RemoteProtocolError('Server disconnected without sending a response.'),
])
def test_a_dropped_connection_is_retried_and_the_row_lands(dropped):
    client = _Client([dropped, object()])

    assert _log_with(client) is True
    assert client._insert.attempts == 2
    assert client.insert_calls[-1]['student_id'] == STUDENT_ID


def test_the_row_is_written_once_when_nothing_drops():
    client = _Client([object()])

    assert _log_with(client) is True
    assert client._insert.attempts == 1


def test_a_write_that_never_succeeds_still_does_not_raise():
    """The caller's read must survive an audit failure, retries exhausted.

    max_retries counts attempts, not extra attempts: two in total, so an audit
    write never holds a request open for more than one extra round trip.
    """
    client = _Client([httpx.RemoteProtocolError('Server disconnected')] * 2)

    assert _log_with(client) is False
    assert client._insert.attempts == 2
