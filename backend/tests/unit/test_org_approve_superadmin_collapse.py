"""Regression guard: superadmin org-approve collapses the org+Optio steps.

Product decision: when a superadmin reviews a credit request sitting at
``pending_org_approval``, one click advances all the way to
``diploma_status='approved'`` + ``accreditor_status='pending_accreditor'``
and finalizes XP — skipping the ``pending_optio_approval`` intermediate.

Non-superadmin org admins keep the two-step flow. Subject-XP overrides
in the request body must apply to the task in either path so reviewers
can edit XP-per-subject in the same click.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
STUDENT_ID = '11111111-1111-1111-1111-111111111111'
TASK_ID = '22222222-2222-2222-2222-222222222222'
QUEST_ID = '33333333-3333-3333-3333-333333333333'
SUPERADMIN_ID = '99999999-9999-9999-9999-999999999999'
ORG_ADMIN_ID = '88888888-8888-8888-8888-888888888888'
ORG_ID = '77777777-7777-7777-7777-777777777777'


class Chain:
    """Supabase-style chainable builder.

    Behaves as both a list-returning query and a single-returning query
    depending on whether ``.single()`` was called in the chain. A fresh
    Chain is returned per ``.table(name)`` call so updates against
    different tables don't clobber each other.
    """

    def __init__(self, list_data=None, single_data=None, record_updates_to=None):
        self._list = list_data if list_data is not None else []
        self._single = single_data
        self._is_single_call = False
        self._record = record_updates_to  # dict to stash last update row in

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
                    # Track every update in-order so tests can see an
                    # override applied in step 1 even if step 2 updates
                    # different columns on the same row.
                    self._record['row'] = row  # last one (back-compat)
                    self._record.setdefault('rows', []).append(row)
                return self
            return _update
        if name == 'insert':
            return lambda *a, **kw: self
        # select, eq, in_, order, limit, range, gte, lte, etc.
        return lambda *a, **kw: self


def _build_supabase(*, reviewer_role, reviewer_id, reviewer_org=None):
    """Route every ``.table(name)`` call to a fresh Chain configured for
    the given table. Captures updates-by-table so tests can assert on the
    final row written to quest_task_completions / user_quest_tasks."""
    captures = {
        'quest_task_completions': {},
        'user_quest_tasks': {},
        'diploma_review_rounds': {},
    }

    reviewer_user_row = {
        'id': reviewer_id,
        'role': reviewer_role,
        'org_role': 'org_admin' if reviewer_role != 'superadmin' else None,
        'org_roles': ['org_admin'] if reviewer_role != 'superadmin' else None,
        'organization_id': reviewer_org,
    }
    student_user_row = {
        'id': STUDENT_ID,
        'organization_id': ORG_ID,
        'display_name': 'Clare B',
        'first_name': 'Clare',
        'last_name': 'Bingham',
        'email': 'clare@school.edu',
    }
    completion_row = {
        'id': COMPLETION_ID,
        'user_id': STUDENT_ID,
        'quest_id': QUEST_ID,
        'diploma_status': 'pending_org_approval',
        'user_quest_task_id': TASK_ID,
        'credit_requested_at': '2026-04-18T00:00:00+00:00',
    }
    task_row = {
        'id': TASK_ID,
        'title': 'A task',
        'diploma_subjects': ['math'],
        'subject_xp_distribution': {'math': 100},
        'xp_value': 100,
    }

    # Users is hit multiple times: decorator (list), verify_org_scope
    # reviewer (single), verify_org_scope student (single), and the
    # notification lookups. Seed single and list forms of the same data.
    def _users_chain():
        # Return reviewer on the first logical call, student on the
        # subsequent ones. We swap behavior per .table('users') invocation.
        return Chain(
            list_data=[reviewer_user_row],
            single_data=reviewer_user_row,
        )

    def _table(name):
        if name == 'users':
            # Every users lookup returns the reviewer row. Even the student
            # lookup in verify_org_scope resolves to the same organization,
            # which passes the scope check — and the superadmin path bypasses
            # that check entirely, so the student_user_row precision doesn't
            # matter for what's under test.
            return Chain(list_data=[reviewer_user_row], single_data=reviewer_user_row)
        if name == 'quest_task_completions':
            return Chain(
                single_data=completion_row,
                list_data=[completion_row],
                record_updates_to=captures['quest_task_completions'],
            )
        if name == 'user_quest_tasks':
            return Chain(
                single_data=task_row,
                list_data=[task_row],
                record_updates_to=captures['user_quest_tasks'],
            )
        if name == 'diploma_review_rounds':
            return Chain(
                list_data=[{'id': 'round-1'}],
                single_data={'id': 'round-1'},
                record_updates_to=captures['diploma_review_rounds'],
            )
        # user_subject_xp etc. — XP helpers are stubbed at the import level.
        return Chain()

    client = MagicMock()
    client.table.side_effect = _table
    return client, captures


@pytest.fixture(autouse=True)
def _noop_notifications():
    with patch('services.notification_service.NotificationService') as ns:
        ns.return_value.create_notification = MagicMock()
        yield ns


@pytest.fixture(autouse=True)
def _noop_xp_helpers():
    # Patch at the xp_helpers source so both `from routes.tasks.xp_helpers
    # import X` and `from routes.tasks import X` resolve to the stub.
    with patch('routes.tasks.xp_helpers.finalize_subject_xp', return_value=100), \
         patch('routes.tasks.xp_helpers.remove_pending_subject_xp', return_value=None), \
         patch('routes.tasks.xp_helpers.add_pending_subject_xp', return_value=None):
        yield


def _post(client, reviewer_id, body=None):
    with patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=reviewer_id):
        return client.post(
            f'/api/credit-dashboard/items/{COMPLETION_ID}/org-approve',
            json=body or {},
        )


def test_org_admin_approval_still_advances_only_to_pending_optio(client):
    """Non-superadmin path unchanged: two-step review preserved."""
    supabase, captures = _build_supabase(
        reviewer_role='org_managed', reviewer_id=ORG_ADMIN_ID, reviewer_org=ORG_ID,
    )
    with patch('routes.credit_dashboard.org_admin_actions.get_supabase_admin_singleton',
               return_value=supabase), \
         patch('database.get_supabase_admin_client', return_value=supabase):
        resp = _post(client, ORG_ADMIN_ID)

    assert resp.status_code == 200, resp.get_json()
    update = captures['quest_task_completions'].get('row') or {}
    assert update.get('diploma_status') == 'pending_optio_approval', (
        f'expected two-step flow to leave status at pending_optio_approval; got {update!r}'
    )


def test_superadmin_approval_skips_pending_optio_and_finalizes(client):
    """One click, all the way to accreditor review."""
    supabase, captures = _build_supabase(
        reviewer_role='superadmin', reviewer_id=SUPERADMIN_ID,
    )
    with patch('routes.credit_dashboard.org_admin_actions.get_supabase_admin_singleton',
               return_value=supabase), \
         patch('database.get_supabase_admin_client', return_value=supabase):
        resp = _post(client, SUPERADMIN_ID)

    assert resp.status_code == 200, resp.get_json()
    update = captures['quest_task_completions'].get('row') or {}
    assert update.get('diploma_status') == 'approved', (
        f'expected collapsed approval to land at approved; got {update!r}'
    )
    assert update.get('accreditor_status') == 'pending_accreditor', (
        'superadmin approvals must queue the item for accreditor review'
    )
    assert update.get('credit_reviewer_id') == SUPERADMIN_ID
    assert update.get('finalized_at') is not None


def test_superadmin_subject_override_is_applied_during_collapse(client):
    """Reviewer must be able to edit XP-per-subject in the same click."""
    supabase, captures = _build_supabase(
        reviewer_role='superadmin', reviewer_id=SUPERADMIN_ID,
    )
    override = {'math': 60, 'english': 40}
    with patch('routes.credit_dashboard.org_admin_actions.get_supabase_admin_singleton',
               return_value=supabase), \
         patch('database.get_supabase_admin_client', return_value=supabase):
        resp = _post(client, SUPERADMIN_ID,
                     body={'subjects': override, 'feedback': 'great work'})

    assert resp.status_code == 200, resp.get_json()
    all_task_updates = captures['user_quest_tasks'].get('rows') or []
    saved_distributions = [
        row['subject_xp_distribution']
        for row in all_task_updates
        if 'subject_xp_distribution' in row
    ]
    assert override in saved_distributions, (
        'reviewer-provided subject_xp_distribution must be persisted on the '
        f'task so downstream reviewers (accreditor) see the approved split. '
        f'writes to user_quest_tasks: {all_task_updates!r}'
    )
