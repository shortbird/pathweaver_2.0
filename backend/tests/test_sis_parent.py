"""
Unit tests for SIS parent self-service authorization (sis_parent_service).

The security-critical property: a guardian may only register students in their own
family, and only in SIS-enabled orgs. registerable_students drives every check, so
it gets a filter-aware fake DB; the lifecycle helpers are tested by patching it.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_parent_service as parent


class _Query:
    """Records select/eq/in_ filters so the resolver can branch on them."""
    def __init__(self, table, resolver):
        self._table = table
        self._resolver = resolver
        self._eq = {}
        self._in = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._eq[col] = val
        return self

    def in_(self, col, vals):
        self._in[col] = vals
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        return Mock(data=self._resolver(self._table, self._eq, self._in))


def _fake_admin(resolver):
    client = Mock()
    client.table.side_effect = lambda name: _Query(name, resolver)
    return client


# A guardian 'g1' shares household 'h1' (org 'org1') with student 'stu1'.
def _resolver(table, eq, in_):
    if table == 'household_members':
        if eq.get('user_id') == 'g1':
            return [{'household_id': 'h1', 'relationship': 'guardian'}]
        if eq.get('relationship') == 'student' and 'h1' in (in_.get('household_id') or []):
            return [{'user_id': 'stu1', 'household_id': 'h1', 'relationship': 'student'}]
        return []
    if table == 'households':
        return [{'id': 'h1', 'organization_id': 'org1'}]
    if table == 'users':
        if eq.get('managed_by_parent_id') == 'g1':
            return []  # no dependent-account children
        if 'stu1' in (in_.get('id') or []):
            return [{'id': 'stu1', 'display_name': 'Stu One'}]
        return []
    if table == 'organizations':
        return [{'id': 'org1', 'name': 'Micro School'}]
    return []


@pytest.mark.unit
class TestRegisterableStudents:
    def test_household_student_is_registerable_when_sis_enabled(self):
        with patch('services.sis_parent_service.get_supabase_admin_client',
                   return_value=_fake_admin(_resolver)), \
             patch('services.sis_parent_service.org_has_feature', return_value=True):
            students = parent.registerable_students('g1')
        assert len(students) == 1
        assert students[0]['student_id'] == 'stu1'
        assert students[0]['org_id'] == 'org1'
        assert students[0]['name'] == 'Stu One'

    def test_excluded_when_org_not_sis_enabled(self):
        with patch('services.sis_parent_service.get_supabase_admin_client',
                   return_value=_fake_admin(_resolver)), \
             patch('services.sis_parent_service.org_has_feature', return_value=False):
            assert parent.registerable_students('g1') == []

    def test_non_guardian_has_no_students(self):
        with patch('services.sis_parent_service.get_supabase_admin_client',
                   return_value=_fake_admin(_resolver)), \
             patch('services.sis_parent_service.org_has_feature', return_value=True):
            assert parent.registerable_students('stranger') == []

    def test_context_groups_students_by_org(self):
        with patch('services.sis_parent_service.get_supabase_admin_client',
                   return_value=_fake_admin(_resolver)), \
             patch('services.sis_parent_service.org_has_feature', return_value=True):
            ctx = parent.context('g1')
        assert len(ctx['orgs']) == 1
        assert ctx['orgs'][0]['organization_name'] == 'Micro School'
        assert ctx['orgs'][0]['students'][0]['student_id'] == 'stu1'


@pytest.mark.unit
class TestLifecycleAuthorization:
    _MINE = [{'student_id': 'stu1', 'org_id': 'org1', 'household_id': 'h1', 'name': 'Stu One'}]

    def test_cannot_register_someone_elses_child(self):
        with patch('services.sis_parent_service.registerable_students', return_value=self._MINE):
            result = parent.create_registration('g1', 'org1', 'not-my-kid')
        assert result.get('error')

    def test_can_register_own_child(self):
        with patch('services.sis_parent_service.registerable_students', return_value=self._MINE), \
             patch('services.sis_parent_service.regs.create_registration',
                   return_value={'id': 'reg1'}) as create:
            result = parent.create_registration('g1', 'org1', 'stu1')
        assert result['registration']['id'] == 'reg1'
        create.assert_called_once_with('org1', 'stu1', guardian_user_id='g1')

    def test_add_item_rejects_unowned_registration(self):
        with patch('services.sis_parent_service.regs.get_registration',
                   return_value={'id': 'reg1', 'guardian_user_id': 'someone-else', 'status': 'draft'}):
            result = parent.add_item('g1', 'org1', 'reg1', 'class1')
        assert result['error'] == 'Registration not found'

    def test_add_item_rejects_class_not_open(self):
        with patch('services.sis_parent_service.regs.get_registration',
                   return_value={'id': 'reg1', 'guardian_user_id': 'g1', 'status': 'in_progress'}), \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_parent_service.open_classes', return_value=[{'id': 'open-class'}]):
            result = parent.add_item('g1', 'org1', 'reg1', 'closed-class')
        assert result['error'] == 'This class is not open for registration'

    def test_add_item_allows_open_class_on_owned_registration(self):
        with patch('services.sis_parent_service.regs.get_registration',
                   return_value={'id': 'reg1', 'guardian_user_id': 'g1', 'status': 'in_progress'}), \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_parent_service.open_classes', return_value=[{'id': 'class1'}]), \
             patch('services.sis_parent_service.regs.add_item',
                   return_value={'item': {'id': 'it1'}, 'evaluation': {}}) as add:
            result = parent.add_item('g1', 'org1', 'reg1', 'class1')
        assert result['item']['id'] == 'it1'
        add.assert_called_once_with('org1', 'reg1', 'class1')

    def test_submit_requires_items(self):
        with patch('services.sis_parent_service.regs.get_registration',
                   return_value={'id': 'reg1', 'guardian_user_id': 'g1', 'status': 'in_progress', 'items': []}):
            result = parent.submit('g1', 'org1', 'reg1')
        assert result.get('error')
