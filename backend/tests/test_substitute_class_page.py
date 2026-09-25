"""A substitute on the class page (P7, fixed for the iCreate teacher training,
2026-09-25).

The office marks someone to cover a class for one day. That grant opened the
roster and the day's roll, but the class page offered every tab, and the rest
answered "Class not found". Now:

  - the roster says `my_role: 'substitute'`, so the page shows only what the
    grant opens;
  - the substitute sheet's curriculum read is open to them for that day, and
    to nobody else outside the class.
"""

from contextlib import contextmanager
from datetime import datetime
from unittest.mock import Mock, patch

import pytest

from tests.test_sis_teacher_portal import as_role


def _scope(on_date_scope, everyday_scope):
    return lambda uid, org, on_date=None: on_date_scope if on_date else everyday_scope


@contextmanager
def _roster_world(on_date_scope, everyday_scope):
    cls = Mock()
    for chained in ('table', 'select', 'eq', 'limit'):
        getattr(cls, chained).return_value = cls
    cls.execute.return_value = Mock(data=[{'id': 'c2', 'name': 'Chess', 'organization_id': 'org-1'}])
    with as_role('org_managed', org_role='advisor', org_roles=['advisor']), \
         patch('services.sis_service.class_scope', side_effect=_scope(on_date_scope, everyday_scope)), \
         patch('routes.sis.staff_portal.get_supabase_admin_client', return_value=cls), \
         patch('services.sis_staff_service._org_now', return_value=datetime(2026, 9, 25, 9)), \
         patch('services.sis_staff_service.class_roster_detail', return_value={'students': []}), \
         patch('services.sis_supply_budget_service.budget_for_class', return_value=None), \
         patch('services.sis_service.caller_org_roles', return_value=['advisor']):
        yield


@pytest.mark.unit
class TestRosterNamesTheSubstitute:
    def test_covering_today_is_a_substitute(self, client, auth_headers, mock_verify_token):
        with _roster_world(['c1', 'c2'], ['c1']):
            resp = client.get('/api/sis/teacher/classes/c2/roster?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()['my_role'] == 'substitute'

    def test_their_own_class_is_not(self, client, auth_headers, mock_verify_token):
        with _roster_world(['c1', 'c2'], ['c1', 'c2']):
            resp = client.get('/api/sis/teacher/classes/c2/roster?organization_id=org-1',
                              headers=auth_headers)
        assert resp.get_json()['my_role'] is None


@pytest.mark.unit
class TestCurriculumForTheSubstituteSheet:
    ROW = {'id': 'c2', 'organization_id': 'org-1'}

    def _covering(self, on_date_scope):
        from routes.sis import curriculum
        with patch('services.sis_service.resolve_org_id', return_value='org-1'), \
             patch('services.sis_staff_service._org_now', return_value=datetime(2026, 9, 25, 9)), \
             patch('services.sis_service.class_scope', side_effect=_scope(on_date_scope, ['c1'])):
            return curriculum._covering_today('sub', self.ROW)

    def test_covering_today_may_read(self):
        assert self._covering(['c1', 'c2']) is True

    def test_not_covering_may_not(self):
        assert self._covering(['c1']) is False

    def test_another_school_may_not(self):
        from routes.sis import curriculum
        with patch('services.sis_service.resolve_org_id', return_value='org-9'):
            assert curriculum._covering_today('sub', self.ROW) is False
