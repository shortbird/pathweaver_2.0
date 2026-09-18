"""The grader names the student's organization, from both endpoints.

A superadmin's credit queue is every org's queue at once, and until 2026-09-18
a row said only ``is_org_student: true`` -- the reviewer could tell an org
student from a platform one, but not Hearthwood from Treehouse, and the
standard being graded against differs between them. The list endpoint now
carries ``organization_name`` on each item (one query for the page) and the
detail endpoint carries it on ``student``, so the header, which prefers the
row it was opened from, and the task card, which reads the detail, agree.

The fake filters rows by ``eq``/``in_`` rather than returning everything, so a
lookup that forgot its ``in_('id', ...)`` would come back with the wrong org.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


SUPERADMIN_ID = '99999999-9999-9999-9999-999999999999'
ORG_STUDENT_ID = '11111111-1111-1111-1111-111111111111'
PLATFORM_STUDENT_ID = '22222222-2222-2222-2222-222222222222'
ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
OTHER_ORG_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
ORG_COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
PLATFORM_COMPLETION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
TASK_ID = '33333333-3333-3333-3333-333333333333'
QUEST_ID = '44444444-4444-4444-4444-444444444444'

REQUESTED_AT = '2026-09-14T15:12:00+00:00'


class _Table:
    """Rows filtered by the ``eq``/``in_`` calls the route actually makes."""

    def __init__(self, rows):
        self._rows = rows
        self._filters = []
        self._single = False

    def select(self, *_a, **_kw):
        return self

    def eq(self, column, value):
        self._filters.append(lambda r: r.get(column) == value)
        return self

    def in_(self, column, values):
        wanted = list(values)
        self._filters.append(lambda r: r.get(column) in wanted)
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        rows = [dict(r) for r in self._rows if all(f(r) for f in self._filters)]
        if self._single:
            return SimpleNamespace(data=rows[0] if rows else None, count=None)
        return SimpleNamespace(data=rows, count=len(rows))

    def __getattr__(self, _name):
        # order, range, limit, gte, lte, not_ ... none of them narrow this fake.
        return lambda *a, **kw: self


def _build_supabase():
    rows = {
        'users': [
            {'id': SUPERADMIN_ID, 'role': 'superadmin', 'org_role': None,
             'org_roles': None, 'organization_id': None},
            {'id': ORG_STUDENT_ID, 'role': 'org_managed', 'org_role': 'student',
             'org_roles': None, 'organization_id': ORG_ID,
             'display_name': 'Sam K', 'first_name': 'Sam', 'last_name': 'K',
             'email': 'sam@example.com', 'avatar_url': None},
            {'id': PLATFORM_STUDENT_ID, 'role': 'student', 'org_role': None,
             'org_roles': None, 'organization_id': None,
             'display_name': 'Clare B', 'first_name': 'Clare', 'last_name': 'B',
             'email': 'clare@example.com', 'avatar_url': None},
        ],
        'organizations': [
            {'id': ORG_ID, 'name': 'Hearthwood Academy'},
            {'id': OTHER_ORG_ID, 'name': 'The Treehouse'},
        ],
        'quest_task_completions': [
            {'id': ORG_COMPLETION_ID, 'user_id': ORG_STUDENT_ID, 'quest_id': QUEST_ID,
             'diploma_status': 'pending_review', 'revision_number': 2,
             'user_quest_task_id': TASK_ID, 'credit_requested_at': REQUESTED_AT,
             'merged_into': None, 'finalized_at': None,
             'credit_reviewer_id': None, 'org_reviewer_id': None},
            {'id': PLATFORM_COMPLETION_ID, 'user_id': PLATFORM_STUDENT_ID,
             'quest_id': QUEST_ID, 'diploma_status': 'pending_review',
             'revision_number': 1, 'user_quest_task_id': TASK_ID,
             'credit_requested_at': REQUESTED_AT, 'merged_into': None,
             'finalized_at': None, 'credit_reviewer_id': None,
             'org_reviewer_id': None},
        ],
        'user_quest_tasks': [
            {'id': TASK_ID, 'title': 'Load test', 'pillar': 'stem', 'xp_value': 100,
             'diploma_subjects': ['science'], 'subject_xp_distribution': {'science': 100},
             'description': '', 'success_criteria': []},
        ],
        'quests': [{'id': QUEST_ID, 'title': 'Bridges'}],
    }
    client = MagicMock()
    client.table.side_effect = lambda name: _Table(rows.get(name, []))
    return client


def _as_superadmin(supabase):
    return patch.multiple(
        'routes.credit_dashboard.items',
        get_supabase_admin_client=lambda: supabase,
    ), patch('database.get_supabase_admin_client', return_value=supabase), \
        patch('utils.session_manager.session_manager.get_effective_user_id',
              return_value=SUPERADMIN_ID)


@pytest.mark.unit
def test_each_queue_row_names_the_students_organization(client):
    supabase = _build_supabase()
    p1, p2, p3 = _as_superadmin(supabase)
    with p1, p2, p3:
        resp = client.get('/api/credit-dashboard/items')

    assert resp.status_code == 200, resp.get_json()
    items = {i['student_id']: i for i in resp.get_json()['data']['items']}
    assert items[ORG_STUDENT_ID]['organization_name'] == 'Hearthwood Academy'
    assert items[ORG_STUDENT_ID]['is_org_student'] is True
    # A platform student has no org; the key is present and empty, not missing.
    assert items[PLATFORM_STUDENT_ID]['organization_name'] is None
    assert items[PLATFORM_STUDENT_ID]['is_org_student'] is False
    # The timestamp the grader shows as "credit requested".
    assert items[ORG_STUDENT_ID]['submitted_at'] == REQUESTED_AT


@pytest.mark.unit
def test_the_detail_names_the_organization_on_the_student(client):
    supabase = _build_supabase()
    p1, p2, p3 = _as_superadmin(supabase)
    with p1, p2, p3:
        resp = client.get(f'/api/credit-dashboard/items/{ORG_COMPLETION_ID}')

    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()['data']
    assert data['student']['organization_name'] == 'Hearthwood Academy'
    assert data['completion']['credit_requested_at'] == REQUESTED_AT
    assert data['completion']['revision_number'] == 2


@pytest.mark.unit
def test_the_detail_leaves_a_platform_student_without_an_organization(client):
    supabase = _build_supabase()
    p1, p2, p3 = _as_superadmin(supabase)
    with p1, p2, p3:
        resp = client.get(f'/api/credit-dashboard/items/{PLATFORM_COMPLETION_ID}')

    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['data']['student']['organization_name'] is None
