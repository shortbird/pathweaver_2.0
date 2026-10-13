"""Who may see a student's quests with every task, done or not.

Horizon, 2026-10-13 (ticket 8c21d8e7): the director, an org_admin with no
advisor assignment, could open a student's overview and see quest names, but
"When I click on their quests I am only seeing what they completed. Is there a
way to see their next steps they haven't done without ... masquerade as
student?" AdvisorService.get_student_active_quests_with_tasks answers that, but
it admitted only an assigned advisor. An org admin holds every teacher
capability (ruling 2026-09-12), and a class teacher has no assignment row
either.
"""

from unittest.mock import Mock, patch

import pytest

from services.advisor_service import AdvisorService

ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001'
STUDENT = 'bbbbbbbb-0000-4000-8000-000000000002'
ORG = 'cccccccc-0000-4000-8000-000000000003'
OTHER_ORG = 'dddddddd-0000-4000-8000-000000000004'


def _client(rows_by_table):
    client = Mock()

    def table(name):
        t = Mock()
        for chained in ('select', 'eq', 'in_', 'order', 'not_', 'is_'):
            getattr(t, chained).return_value = t
        t.execute.return_value = Mock(data=rows_by_table.get(name, []))
        return t

    client.table.side_effect = table
    return client


class _Access:
    """Patches the three relationship checks the service asks in turn."""

    def __init__(self, users, teaches, assigned):
        by_id = {u['id']: u for u in users}
        self._patches = [
            patch('utils.portfolio_access.teaches_student', return_value=teaches),
            patch('utils.portfolio_access.is_advisor_of', return_value=assigned),
            patch('utils.portfolio_access._fetch_user',
                  side_effect=lambda uid, _cols: by_id.get(uid)),
        ]

    def __enter__(self):
        for p in self._patches:
            p.start()

    def __exit__(self, *exc):
        for p in self._patches:
            p.stop()


def _service(rows, teaches=False):
    with patch('services.advisor_service.get_supabase_admin_client', return_value=_client(rows)):
        svc = AdvisorService()
    svc._is_superadmin = Mock(return_value=False)
    svc._verify_same_organization = Mock(return_value=True)
    return svc, _Access(rows['users'], teaches, bool(rows['advisor_student_assignments']))


def _rows(caller, assignment=()):
    return {
        'advisor_student_assignments': list(assignment),
        'users': [caller, {'id': STUDENT, 'role': 'org_managed', 'org_role': 'student',
                           'org_roles': None, 'organization_id': ORG}],
        'user_quests': [{'id': 'uq1', 'quest_id': 'q1', 'started_at': '2026-10-01',
                         'completed_at': None,
                         'quests': {'id': 'q1', 'title': 'Endocrine System',
                                    'description': '', 'image_url': None}}],
        'user_quest_tasks': [{'id': 't1', 'user_quest_id': 'uq1', 'title': 'Read chapter'},
                             {'id': 't2', 'user_quest_id': 'uq1', 'title': 'Draw a gland map'}],
        'quest_task_completions': [{'task_id': 't1', 'completed_at': '2026-10-02'}],
    }


def _admin(org=ORG):
    return {'id': ADMIN, 'role': 'org_managed', 'org_role': 'org_admin',
            'org_roles': ['org_admin'], 'organization_id': org}


@pytest.mark.unit
class TestQuestsWithTasksAccess:

    def test_org_admin_of_the_school_sees_unfinished_tasks(self):
        svc, teaches = _service(_rows(_admin()))
        with teaches:
            quests = svc.get_student_active_quests_with_tasks(STUDENT, ADMIN)
        tasks = quests[0]['tasks']
        assert [t['title'] for t in tasks] == ['Read chapter', 'Draw a gland map']
        assert [t['completed'] for t in tasks] == [True, False]
        assert quests[0]['completed_tasks'] == 1 and quests[0]['total_tasks'] == 2

    def test_org_admin_of_another_school_is_refused(self):
        svc, teaches = _service(_rows(_admin(OTHER_ORG)))
        with teaches, pytest.raises(ValueError):
            svc.get_student_active_quests_with_tasks(STUDENT, ADMIN)

    def test_unassigned_advisor_is_still_refused(self):
        advisor = {'id': ADMIN, 'role': 'org_managed', 'org_role': 'advisor',
                   'org_roles': ['advisor'], 'organization_id': ORG}
        svc, teaches = _service(_rows(advisor))
        with teaches, pytest.raises(ValueError):
            svc.get_student_active_quests_with_tasks(STUDENT, ADMIN)

    def test_class_teacher_without_assignment_is_admitted(self):
        advisor = {'id': ADMIN, 'role': 'org_managed', 'org_role': 'advisor',
                   'org_roles': ['advisor'], 'organization_id': ORG}
        svc, teaches = _service(_rows(advisor), teaches=True)
        with teaches:
            assert svc.get_student_active_quests_with_tasks(STUDENT, ADMIN)

    def test_assigned_advisor_is_admitted(self):
        advisor = {'id': ADMIN, 'role': 'org_managed', 'org_role': 'advisor',
                   'org_roles': ['advisor'], 'organization_id': ORG}
        svc, teaches = _service(_rows(advisor, assignment=[{'id': 'a1'}]))
        with teaches:
            assert svc.get_student_active_quests_with_tasks(STUDENT, ADMIN)
