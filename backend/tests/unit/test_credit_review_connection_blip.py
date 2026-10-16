"""A dropped Supabase connection during school credit review is a 503, not a 500.

Tickets bab53dea + f46f581d (Sentry, optio-backend + optio-web, 2026-10-15):
Jackie at Arete pressed Grow This on a credit request in /credit-review. The
pooled connection to Supabase had gone stale and httpx raised
RemoteProtocolError("Server disconnected"). org_grow_this caught every
exception, logged it at error level and answered 500, so a transient blip filed
two Sentry issues and told the reviewer the action failed for good. This is a
missed case of 55a039981, which taught the helper-evidence routes to re-raise a
retryable error to the global handler (503 + Retry-After, a warning).

The same handler also took the student's pending subject XP back BEFORE it moved
the request to grow_this, so a drop between the two writes would leave the
request pending with its XP gone and a retry would take the XP twice. The status
now moves first, only from pending_org_approval, and the XP goes back only when
this request made that move.

Ticket 50e507a2 (Sentry, optio-backend): XPService.update_user_mastery logged a
PostgREST 502 ("JSON could not be generated") at error level. The award was
already committed; only the cached totals were stale until the next award.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest
from postgrest.exceptions import APIError

# _xp_helpers (autouse) and notify are fixtures from the credit review suite.
from tests.unit.test_school_credit_review import (  # noqa: F401
    ADMIN_ID, STUDENT_ID, _DB, _post, _xp_helpers, notify,
)

pytestmark = pytest.mark.usefixtures('notify')


def _disconnected():
    return httpx.RemoteProtocolError('Server disconnected')


class _DroppedDB(_DB):
    """The first read of the completion hits a stale pooled connection."""

    def rows_for(self, q):
        if q.name == 'quest_task_completions':
            raise _disconnected()
        return super().rows_for(q)


class _AlreadyMovedDB(_DB):
    """Another reviewer moved the request between our read and our write: the
    conditional update (filtered on diploma_status) matches no row."""

    def rows_for(self, q):
        if q.name == 'quest_task_completions' and 'diploma_status' in q.filters:
            return []
        return super().rows_for(q)


@pytest.mark.unit
class TestGrowThisOnADroppedConnection:
    def test_the_ticket_answers_503_and_files_no_sentry_error(self, client):
        """bab53dea: before the fix this answered 500 ORG_GROW_THIS_ERROR."""
        db = _DroppedDB()
        with patch('sentry_sdk.capture_exception') as sentry, \
             patch('routes.credit_dashboard.org_admin_actions.logger') as log:
            resp = _post(client, db, ADMIN_ID, 'org-grow-this',
                         body={'feedback': 'Show your sources'})
        assert resp.status_code == 503, resp.get_json()
        assert int(resp.headers['Retry-After']) > 0
        sentry.assert_not_called()
        log.error.assert_not_called()
        assert db.writes == {}

    def test_a_real_defect_still_answers_500(self, client):
        class _BrokenDB(_DB):
            def rows_for(self, q):
                if q.name == 'quest_task_completions':
                    raise ValueError('bad state')
                return super().rows_for(q)

        resp = _post(client, _BrokenDB(), ADMIN_ID, 'org-grow-this',
                     body={'feedback': 'x'})
        assert resp.status_code == 500
        assert resp.get_json()['error']['code'] == 'ORG_GROW_THIS_ERROR'


@pytest.mark.unit
class TestGrowThisTakesTheXpBackOnce:
    def test_the_status_moves_before_the_xp_is_taken_back(self, client):
        db = _DB()
        seen = []

        def remove(*_a, **_k):
            seen.append(list(db.writes.get('quest_task_completions') or []))

        with patch('routes.tasks.remove_pending_subject_xp', side_effect=remove):
            resp = _post(client, db, ADMIN_ID, 'org-grow-this',
                         body={'feedback': 'Show your sources'})
        assert resp.status_code == 200, resp.get_json()
        assert len(seen) == 1
        assert seen[0] and seen[0][-1]['diploma_status'] == 'grow_this'

    def test_a_request_someone_else_already_moved_keeps_its_xp(self, client):
        db = _AlreadyMovedDB()
        with patch('routes.tasks.remove_pending_subject_xp') as remove:
            resp = _post(client, db, ADMIN_ID, 'org-grow-this',
                         body={'feedback': 'Show your sources'})
        assert resp.status_code == 400
        assert resp.get_json()['error']['code'] == 'INVALID_STATE'
        remove.assert_not_called()
        assert 'user_quest_tasks' not in db.writes


@pytest.mark.unit
def test_org_approve_on_a_dropped_connection_is_a_503_too(client):
    """Same gap in the sibling handler, closed with the ticket."""
    with patch('sentry_sdk.capture_exception') as sentry:
        resp = _post(client, _DroppedDB(), ADMIN_ID, 'org-approve')
    assert resp.status_code == 503, resp.get_json()
    sentry.assert_not_called()


def _gateway_error():
    return APIError({'code': 502, 'message': 'JSON could not be generated',
                     'details': '502 Bad Gateway', 'hint': None})


def _xp_service(execute_side_effect):
    from services.xp_service import XPService
    supabase = MagicMock()
    supabase.table.return_value.select.return_value.eq.return_value \
        .execute.side_effect = execute_side_effect
    return XPService(client=supabase)


@pytest.mark.unit
class TestUpdateUserMasteryOnAGatewayBlip:
    def test_a_502_warns_and_answers_none(self):
        """50e507a2: before the fix this logged at error level (a Sentry issue)."""
        svc = _xp_service(_gateway_error())
        with patch('services.xp_service.logger') as log:
            assert svc.update_user_mastery(STUDENT_ID) is None
        log.error.assert_not_called()
        assert 'Error updating user mastery' in log.warning.call_args[0][0]

    def test_a_real_defect_still_logs_an_error(self):
        svc = _xp_service(ValueError('bad state'))
        with patch('services.xp_service.logger') as log:
            assert svc.update_user_mastery(STUDENT_ID) is None
        assert log.error.called

    def test_the_total_xp_sync_warns_on_a_disconnect(self):
        from services.xp_service import XPService
        supabase = MagicMock()

        def table(name):
            t = MagicMock()
            if name == 'user_skill_xp':
                t.select.return_value.eq.return_value.execute.return_value = \
                    MagicMock(data=[{'xp_amount': 40}])
            elif name == 'users':
                t.update.return_value.eq.return_value.execute.side_effect = _disconnected()
            else:
                t.select.return_value.eq.return_value.execute.return_value = \
                    MagicMock(data=[{'id': 'm'}])
            return t

        supabase.table.side_effect = table
        svc = XPService(client=supabase)
        with patch('services.xp_service.logger') as log:
            svc.update_user_mastery(STUDENT_ID)
        log.error.assert_not_called()
        assert any('users.total_xp' in c[0][0] for c in log.warning.call_args_list)
