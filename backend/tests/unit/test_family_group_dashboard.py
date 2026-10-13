"""The family group dashboard (services/family_group_dashboard.py): who may run
a group, and that every add and drop stays inside the group's families."""
from unittest.mock import MagicMock

import pytest

from services import family_group_dashboard as dashboard

GROUP = {'id': 'g1', 'organization_id': 'org1', 'name': 'OpenEd',
         'funding_source': 'opened', 'academy_pathway': 'parent_supported'}


def _client_returning(rows):
    client = MagicMock()
    chain = client.table.return_value.select.return_value
    chain.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = rows
    return client


def test_require_manager_hides_a_group_without_a_grant(monkeypatch):
    monkeypatch.setattr(dashboard, '_group', lambda gid: GROUP)
    monkeypatch.setattr(dashboard, '_admin', lambda: _client_returning([]))
    monkeypatch.setattr(dashboard, '_is_superadmin', lambda uid: False)
    with pytest.raises(dashboard.DashboardError) as e:
        dashboard.require_manager('someone', 'g1')
    assert e.value.status == 404


def test_require_manager_lets_a_granted_manager_in(monkeypatch):
    monkeypatch.setattr(dashboard, '_group', lambda gid: GROUP)
    monkeypatch.setattr(dashboard, '_admin', lambda: _client_returning([{'id': 'grant'}]))
    monkeypatch.setattr(dashboard, '_is_superadmin', lambda uid: False)
    assert dashboard.require_manager('eliza', 'g1') is GROUP


def test_require_manager_lets_a_superadmin_in(monkeypatch):
    monkeypatch.setattr(dashboard, '_group', lambda gid: GROUP)
    monkeypatch.setattr(dashboard, '_admin', lambda: _client_returning([]))
    monkeypatch.setattr(dashboard, '_is_superadmin', lambda uid: True)
    assert dashboard.require_manager('tanner', 'g1') is GROUP


def _plan(students, parents):
    return {'students': students, 'parents': parents, 'row_errors': [], 'counts': {}}


def test_import_refuses_a_family_outside_the_group(monkeypatch):
    """A self-pay family already at the school must not be retagged OpenEd."""
    from services import sis_attach_service
    monkeypatch.setattr(sis_attach_service, 'household_for_guardian',
                        lambda org, uid: {'p-out': 'hh-other', 'p-in': 'hh-group'}.get(uid))
    monkeypatch.setattr(dashboard, '_all_households_of', lambda ids: {})
    plan = _plan(
        students=[
            {'row': 2, 'email': 'a@x.com', 'first_name': 'A', 'last_name': 'X',
             'parent_email': 'out@x.com', 'existing_user_id': None},
            {'row': 3, 'email': 'b@x.com', 'first_name': 'B', 'last_name': 'Y',
             'parent_email': 'in@x.com', 'existing_user_id': None},
        ],
        parents=[
            {'row': 2, 'email': 'out@x.com', 'existing_user_id': 'p-out'},
            {'row': 3, 'email': 'in@x.com', 'existing_user_id': 'p-in'},
        ])
    errors = dashboard._outside_group_errors(plan, 'org1', {'hh-group'})
    assert [e['row'] for e in errors] == [2]
    assert 'not in this group' in errors[0]['errors'][0]


def test_import_refuses_a_student_with_no_parent(monkeypatch):
    monkeypatch.setattr(dashboard, '_all_households_of', lambda ids: {})
    plan = _plan(students=[{'row': 2, 'email': 'a@x.com', 'first_name': 'A', 'last_name': 'X',
                            'parent_email': None, 'existing_user_id': None}], parents=[])
    errors = dashboard._outside_group_errors(plan, 'org1', set())
    assert [e['row'] for e in errors] == [2]


def test_import_lets_a_dropped_student_in_the_group_back(monkeypatch):
    monkeypatch.setattr(dashboard, '_all_households_of', lambda ids: {'s1': ['hh-group']})
    plan = _plan(students=[{'row': 2, 'email': 'a@x.com', 'first_name': 'A', 'last_name': 'X',
                            'parent_email': 'p@x.com', 'existing_user_id': 's1'}],
                 parents=[{'row': 2, 'email': 'p@x.com', 'existing_user_id': None}])
    assert dashboard._outside_group_errors(plan, 'org1', {'hh-group'}) == []


def test_commit_files_the_family_and_enrolls_the_students(monkeypatch):
    from services import academy_enrollment_service, roster_import_service, sis_attach_service, sis_person_service
    admin = MagicMock()
    monkeypatch.setattr(dashboard, '_admin', lambda: admin)
    monkeypatch.setattr(dashboard, '_org_name', lambda org: 'Optio Academy')
    monkeypatch.setattr(roster_import_service, 'execute_plan', lambda *a, **k: {
        'results': [
            {'kind': 'parent', 'email': 'p@x.com', 'status': 'created', 'user_id': 'p1'},
            {'kind': 'student', 'status': 'created', 'user_id': 's1'},
            {'kind': 'student', 'status': 'existing', 'user_id': 's2'},
            {'kind': 'student', 'status': 'failed'},
        ],
        'counts': {}, 'family_errors': []})
    monkeypatch.setattr(sis_attach_service, 'household_for_guardian', lambda org, uid: 'hh1')
    enrolled = {}
    monkeypatch.setattr(sis_person_service, 'enroll_students',
                        lambda org, ids: enrolled.setdefault('school', list(ids)))
    academy = []
    monkeypatch.setattr(academy_enrollment_service, 'enroll',
                        lambda sid, pathway, created_by=None: academy.append((sid, pathway)) or {'id': 'x'})

    from services import credit_bank_service
    banked = []
    monkeypatch.setattr(credit_bank_service, 'bank_opened_year',
                        lambda sid, actor_id=None: banked.append(sid) or True)

    out = dashboard.commit_import(GROUP, _plan([], [{'email': 'p@x.com', 'existing_user_id': None}]),
                                  'eliza', send_emails=True)

    admin.table.assert_any_call('household_family_groups')
    upsert = [c for c in admin.table.return_value.upsert.call_args_list]
    assert upsert[0].args[0] == {'household_id': 'hh1', 'group_id': 'g1', 'added_by': 'eliza'}
    admin.table.return_value.update.assert_any_call({'funding_source': 'opened'})
    assert enrolled['school'] == ['s1', 's2']
    assert academy == [('s1', 'parent_supported'), ('s2', 'parent_supported')]
    # OpenEd's year carries its credits.
    assert banked == ['s1', 's2']
    assert out['problems'] == []


def test_drop_refuses_a_student_outside_the_group(monkeypatch):
    monkeypatch.setattr(dashboard, '_all_households_of', lambda ids: {'s9': ['hh-other']})
    monkeypatch.setattr(dashboard, '_group_household_ids', lambda gid: {'hh-group'})
    with pytest.raises(dashboard.DashboardError) as e:
        dashboard.set_dropped(GROUP, 's9', True, 'eliza')
    assert e.value.status == 404


def test_drop_withdraws_the_academy_enrollment(monkeypatch):
    from services import sis_person_service
    admin = MagicMock()
    monkeypatch.setattr(dashboard, '_admin', lambda: admin)
    monkeypatch.setattr(dashboard, '_all_households_of', lambda ids: {'s1': ['hh-group']})
    monkeypatch.setattr(dashboard, '_group_household_ids', lambda gid: {'hh-group'})
    monkeypatch.setattr(sis_person_service, 'set_student_standing',
                        lambda org, sid, withdrawn: {'withdrawn': withdrawn, 'name': 'Brock'})
    monkeypatch.setattr(sis_person_service, 'audit_removal', lambda *a, **k: None)

    out = dashboard.set_dropped(GROUP, 's1', True, 'eliza')

    assert out == {'name': 'Brock', 'status': 'dropped'}
    admin.table.assert_called_with('academy_enrollments')
    payload = admin.table.return_value.update.call_args.args[0]
    assert payload['status'] == 'withdrawn'
