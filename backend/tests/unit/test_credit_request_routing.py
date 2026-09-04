"""Regression guard: who gets a credit request first.

Credit routing used to ask "does this student have an organization_id?" and send
everyone who did to a partner org admin. Optio Academy is Optio's own school --
its org holds no org_admin at all -- so every request its students filed parked
at ``pending_org_approval``, a queue with no owner, and never appeared on the
superadmin review page (which filters to ``pending_review`` by default). 67 of
them had piled up by 2026-09-04.

The decision now keys off ``feature_flags.credit_review_by_optio`` on the
student's organization, so an org whose credit Optio reviews directly skips
straight to ``pending_review`` while partner orgs with real admins keep the
two-stage flow. Absent flag = the old behaviour.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

STUDENT_ID = '11111111-1111-1111-1111-111111111111'
TASK_ID = '22222222-2222-2222-2222-222222222222'
QUEST_ID = '33333333-3333-3333-3333-333333333333'
COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
ACADEMY_ORG_ID = '77777777-7777-7777-7777-777777777777'
PARTNER_ORG_ID = '66666666-6666-6666-6666-666666666666'


class Chain:
    """Supabase-style chainable builder returning canned data per table."""

    def __init__(self, list_data=None, single_data=None, record_updates_to=None):
        self._list = list_data if list_data is not None else []
        self._single = single_data
        self._is_single_call = False
        self._record = record_updates_to

    def __getattr__(self, name):
        if name == 'single':
            def _single():
                self._is_single_call = True
                return self
            return _single
        if name == 'execute':
            def _exec():
                if self._is_single_call:
                    return SimpleNamespace(data=self._single, count=None)
                return SimpleNamespace(data=self._list, count=len(self._list))
            return _exec
        if name == 'update':
            def _update(row):
                if self._record is not None:
                    self._record.append(row)
                return self
            return _update

        def _passthrough(*args, **kwargs):
            return self
        return _passthrough


def _client(org_id, completion_updates):
    """An admin client whose student sits in `org_id` (None = platform-direct)."""
    def table(name):
        if name == 'quest_task_completions':
            return Chain(
                single_data={
                    'id': COMPLETION_ID,
                    'user_id': STUDENT_ID,
                    'quest_id': QUEST_ID,
                    'diploma_status': 'none',
                    'revision_number': 1,
                    'user_quest_task_id': TASK_ID,
                },
                record_updates_to=completion_updates,
            )
        if name == 'user_quest_tasks':
            return Chain(single_data={
                'title': 'Build a ski ramp',
                'diploma_subjects': ['fine_arts'],
                'subject_xp_distribution': {'fine_arts': 100},
                'xp_value': 100,
                'quest_id': QUEST_ID,
            })
        if name == 'users':
            # The student's own org lookup, then the notification recipients.
            return Chain(
                single_data={'organization_id': org_id, 'display_name': 'Clare'},
                list_data=[],
            )
        return Chain()

    client = MagicMock()
    client.table.side_effect = table
    return client


@pytest.fixture(autouse=True)
def _noop_xp_helpers():
    # Patch at the xp_helpers source so both import styles resolve to the stub.
    with patch('routes.tasks.xp_helpers.add_pending_subject_xp', return_value=None), \
         patch('routes.tasks.credit.add_pending_subject_xp', return_value=None):
        yield


@pytest.fixture(autouse=True)
def _noop_notifications():
    with patch('services.notification_service.NotificationService') as ns:
        ns.return_value.create_notification = MagicMock()
        yield ns


def _request_credit(client, org_id, flag_enabled):
    """POST request-credit and return (diploma_status written, flag mock)."""
    completion_updates = []
    supabase = _client(org_id, completion_updates)

    with patch('routes.tasks.credit.get_supabase_admin_client', return_value=supabase), \
         patch('database.get_supabase_admin_client', return_value=supabase), \
         patch('routes.tasks.credit.org_has_feature', return_value=flag_enabled) as flag, \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=STUDENT_ID):
        resp = client.post(f'/api/tasks/{TASK_ID}/request-credit', json={})

    assert resp.status_code == 200, resp.get_json()
    status = next(
        (u['diploma_status'] for u in completion_updates if 'diploma_status' in u),
        None,
    )
    return status, flag


def test_academy_org_student_goes_straight_to_optio_review(client):
    """The flagged org skips the ownerless org stage."""
    status, flag = _request_credit(client, ACADEMY_ORG_ID, flag_enabled=True)
    assert status == 'pending_review'
    flag.assert_called_once_with(ACADEMY_ORG_ID, 'credit_review_by_optio')


def test_partner_org_student_still_starts_at_org_approval(client):
    """Orgs with their own admins keep the two-stage flow."""
    status, _ = _request_credit(client, PARTNER_ORG_ID, flag_enabled=False)
    assert status == 'pending_org_approval'


def test_platform_student_never_consults_the_org_flag(client):
    """No organization means no org stage, and no wasted lookup."""
    status, flag = _request_credit(client, None, flag_enabled=False)
    assert status == 'pending_review'
    flag.assert_not_called()
