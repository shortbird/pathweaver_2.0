"""A school switches its own features (docs/MICROSCHOOL_FIRST_PLAN.md part 3).

Horizon had every office module on, used none of them, and only a superadmin
could turn them off. What these pin:

  - every non-core module is decided: on the school's list, Optio's only, or
    deliberately elsewhere -- a new module cannot slip in unclassified;
  - org admins and the superadmin may read and switch; a campus coordinator
    and an advisor are refused;
  - a module Optio sets up (the console, AI, credits ...) is refused by name;
  - `requires` holds: a feature cannot go on before what it needs, and what
    it needs cannot go off under it;
  - switching a feature on takes it out of sis_settings.hidden_modules in the
    same write, so the two never contradict;
  - new orgs carry the starter baseline, and a settings round-trip cannot
    drop it.
"""

from unittest.mock import Mock, patch

import pytest

from modules.registry import MODULES
from services import school_features_service as svc
from services.organization_service import new_org_row

ORG = 'org-1'


@pytest.fixture(autouse=True)
def audit_repo():
    """Every save writes an admin_audit_logs row; no test may reach a real
    database for it. Yields the stub so the audit tests can read the row."""
    stub = Mock()
    with patch('repositories.admin_audit_repository.AdminAuditRepository', return_value=stub), \
         patch('services.school_features_service._admin', return_value=Mock()):
        yield stub


def _org(flags=None):
    return {'id': ORG, 'feature_flags': flags if flags is not None else {
        'sis_enabled': True, 'module_baseline': 'starter'},
        'ai_features_enabled': True, 'accreditation_source': None}


def _repo(org):
    repo = Mock()
    repo.find_by_id.return_value = org
    return repo


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def test_every_non_core_module_is_decided_for_the_school_list():
    non_core = {k for k, m in MODULES.items() if m.default != 'core'}
    decided = set(svc.FEATURES) | svc.SUPERADMIN_ONLY | svc.NOT_HERE
    assert non_core - decided == set(), (
        'New module: add it to FEATURES (with a plain sentence), SUPERADMIN_ONLY '
        'or NOT_HERE in services/school_features_service.py')
    assert not set(svc.FEATURES) & (svc.SUPERADMIN_ONLY | svc.NOT_HERE)
    assert all(MODULES[k].default != 'core' for k in svc.FEATURES)


def test_optio_controlled_modules_are_not_on_the_school_list():
    for key in ('sis', 'ai', 'credits', 'transcripts', 'prior_learning',
                'course_builder', 'bloomy', 'kiosk'):
        assert key in svc.SUPERADMIN_ONLY and key not in svc.FEATURES


def test_every_feature_has_a_known_group_and_plain_words():
    groups = {k for k, _ in svc.GROUPS}
    for key, (group, name, description) in svc.FEATURES.items():
        assert group in groups, key
        assert name and description.endswith('.'), key
        for word in ('SIS', 'module', 'org '):
            assert word not in description and word not in name, (key, word)


# ---------------------------------------------------------------------------
# The service
# ---------------------------------------------------------------------------

def test_the_list_says_what_is_on_and_what_each_needs():
    out = svc.features_for_row(_org({'sis_enabled': True, 'module_baseline': 'starter',
                                     'modules': {'registration': True}}))
    rows = {r['key']: r for r in out['features']}
    assert rows['billing']['requires'] == ['registration']
    assert rows['catalog']['requires'] == ['classes']
    assert rows['registration']['enabled'] is True
    assert rows['billing']['enabled'] is False      # starter baseline
    assert rows['attendance']['enabled'] is True
    assert [g['name'] for g in out['groups']] == [
        'Teaching', 'Families and registration', 'Money', 'Office']


def test_turning_a_feature_on_removes_it_from_the_hidden_list():
    org = _org({'sis_enabled': True,
                'sis_settings': {'hidden_modules': ['tasks', 'resources']}})
    repo = _repo(org)
    with patch('repositories.organization_repository.OrganizationRepository',
               return_value=repo):
        out = svc.set_features(ORG, {'tasks': True}, actor_id='admin')
    flags = repo.update_organization.call_args[0][1]['feature_flags']
    assert flags['modules'] == {'tasks': True}
    assert flags['sis_settings']['hidden_modules'] == ['resources']
    assert flags['sis_enabled'] is True
    assert {r['key']: r['enabled'] for r in out['features']}['tasks'] is True


def test_turning_a_feature_off_writes_the_map():
    org = _org()
    repo = _repo(org)
    with patch('repositories.organization_repository.OrganizationRepository',
               return_value=repo):
        svc.set_features(ORG, {'attendance': False}, actor_id='admin')
    flags = repo.update_organization.call_args[0][1]['feature_flags']
    assert flags['modules'] == {'attendance': False}
    assert flags['module_baseline'] == 'starter'


def test_a_feature_cannot_go_on_before_what_it_needs():
    repo = _repo(_org())
    with patch('repositories.organization_repository.OrganizationRepository',
               return_value=repo):
        with pytest.raises(svc.FeatureChangeError) as err:
            svc.set_features(ORG, {'billing': True}, actor_id='admin')
    assert err.value.status == 409
    assert err.value.message == 'Tuition and invoices needs Registration. Turn that on first.'
    repo.update_organization.assert_not_called()


def test_both_together_are_fine():
    repo = _repo(_org())
    with patch('repositories.organization_repository.OrganizationRepository',
               return_value=repo):
        svc.set_features(ORG, {'billing': True, 'registration': True}, actor_id='admin')
    assert repo.update_organization.called


def test_what_a_feature_needs_cannot_go_off_under_it():
    repo = _repo(_org({'sis_enabled': True, 'modules': {'billing': True, 'registration': True}}))
    with patch('repositories.organization_repository.OrganizationRepository',
               return_value=repo):
        with pytest.raises(svc.FeatureChangeError) as err:
            svc.set_features(ORG, {'registration': False}, actor_id='admin')
    assert err.value.status == 409
    assert 'Turn Tuition and invoices off first' in err.value.message
    repo.update_organization.assert_not_called()


@pytest.mark.parametrize('key', ['sis', 'ai', 'credits', 'kiosk', 'quests', 'student_chat'])
def test_a_module_the_school_does_not_switch_is_refused(key):
    with pytest.raises(svc.FeatureChangeError) as err:
        svc.check_feature_changes({key: True})
    assert err.value.status == 403


@pytest.mark.parametrize('body', [None, {}, [], {'nope': True}, {'billing': 'yes'}])
def test_a_malformed_body_is_refused(body):
    with pytest.raises(svc.FeatureChangeError) as err:
        svc.check_feature_changes(body)
    assert err.value.status == 400


# ---------------------------------------------------------------------------
# New orgs and the settings round-trip
# ---------------------------------------------------------------------------

def test_a_new_org_starts_on_the_starter_baseline():
    row = new_org_row('Juniper', 'juniper', 'all_optio')
    assert row['feature_flags']['module_baseline'] == 'starter'


def test_a_settings_round_trip_cannot_drop_the_baseline():
    from utils.org_finance_flags import guard_org_flags_write
    stored = {'module_baseline': 'starter', 'modules': {'tasks': True}, 'sis_enabled': True}
    flags, blocked = guard_org_flags_write(stored, {'sis_enabled': True}, sees_finance=True)
    assert not blocked
    assert flags['module_baseline'] == 'starter'
    flags, _ = guard_org_flags_write({}, {'module_baseline': 'starter'}, sees_finance=True)
    assert 'module_baseline' not in flags


# ---------------------------------------------------------------------------
# The routes
# ---------------------------------------------------------------------------

def _caller_client(role_row):
    client = Mock()
    table = Mock()
    for chained in ('select', 'eq', 'limit', 'single', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=role_row)
    client.table.return_value = table
    return client


def _row(org_role, role='org_managed', org_id=ORG):
    return {'id': 'caller', 'role': role, 'org_role': org_role,
            'org_roles': [org_role] if org_role else None,
            'is_org_admin': org_role == 'org_admin', 'organization_id': org_id,
            'email': 'caller@school.test'}


ORG_ADMIN = _row('org_admin')
SUPERADMIN = _row(None, role='superadmin', org_id=None)
COORDINATOR = _row('campus_coordinator')
ADVISOR = _row('advisor')


def _call(client, auth_headers, caller, repo, method='get', path='/api/school-features',
          body=None):
    with patch('database.get_supabase_admin_client', return_value=_caller_client(caller)), \
         patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
        if method == 'get':
            return client.get(path, headers=auth_headers)
        return client.put(path, headers=auth_headers, json=body)


def test_the_routes_are_owned_once():
    from app import app
    adapter = app.url_map.bind('localhost')
    for method in ('GET', 'PUT'):
        endpoint, _ = adapter.match('/api/school-features', method=method)
        assert endpoint.startswith('school_features.')


@pytest.mark.unit
class TestWhoMaySwitch:

    def test_an_org_admin_reads_their_own_school(self, client, auth_headers, mock_verify_token):
        repo = _repo(_org())
        resp = _call(client, auth_headers, ORG_ADMIN, repo,
                     path='/api/school-features?organization_id=other-org')
        assert resp.status_code == 200
        repo.find_by_id.assert_called_with(ORG)   # their own, not the one they named
        keys = {r['key'] for r in resp.get_json()['data']['features']}
        assert 'billing' in keys and 'sis' not in keys

    def test_an_org_admin_switches_a_feature(self, client, auth_headers, mock_verify_token):
        repo = _repo(_org())
        resp = _call(client, auth_headers, ORG_ADMIN, repo, method='put',
                     body={'tasks': True})
        assert resp.status_code == 200
        assert repo.update_organization.call_args[0][1]['feature_flags']['modules'] == {'tasks': True}

    def test_a_superadmin_switches_the_selected_school(self, client, auth_headers, mock_verify_token):
        repo = _repo(_org())
        resp = _call(client, auth_headers, SUPERADMIN, repo, method='put',
                     path=f'/api/school-features?organization_id={ORG}', body={'tasks': True})
        assert resp.status_code == 200
        assert repo.update_organization.call_args[0][0] == ORG

    @pytest.mark.parametrize('caller', [COORDINATOR, ADVISOR])
    def test_a_coordinator_or_advisor_is_refused(self, client, auth_headers, mock_verify_token, caller):
        repo = _repo(_org())
        assert _call(client, auth_headers, caller, repo).status_code == 403
        resp = _call(client, auth_headers, caller, repo, method='put', body={'tasks': True})
        assert resp.status_code == 403
        repo.update_organization.assert_not_called()

    def test_an_optio_module_is_refused_over_the_wire(self, client, auth_headers, mock_verify_token):
        repo = _repo(_org())
        resp = _call(client, auth_headers, ORG_ADMIN, repo, method='put', body={'sis': False})
        assert resp.status_code == 403
        repo.update_organization.assert_not_called()

    def test_requires_is_a_409_over_the_wire(self, client, auth_headers, mock_verify_token):
        repo = _repo(_org({'sis_enabled': True, 'module_baseline': 'starter',
                            'modules': {'classes': False}}))
        resp = _call(client, auth_headers, ORG_ADMIN, repo, method='put', body={'catalog': True})
        assert resp.status_code == 409
        assert resp.get_json()['error'] == 'Class catalog needs Classes. Turn that on first.'
        repo.update_organization.assert_not_called()


def test_a_save_writes_one_audit_row_with_before_and_after(audit_repo):
    """Testing this card on localhost changed six of Apogee Cache Valley's
    features on 2026-10-07 and nothing recorded what they had been. Every
    save now leaves who, which school, and each feature's before and after."""
    org = _org({'sis_enabled': True, 'sis_settings': {'hidden_modules': ['tasks']}})
    with patch('repositories.organization_repository.OrganizationRepository',
               return_value=_repo(org)):
        svc.set_features(ORG, {'tasks': True, 'attendance': False}, actor_id='admin-7')
    audit_repo.create.assert_called_once()
    row = audit_repo.create.call_args[0][0]
    assert row['user_id'] == 'admin-7'
    assert row['organization_id'] == ORG
    assert row['action_type'] == 'school_features_changed'
    assert row['changes']['source'] == 'settings_features_card'
    assert row['changes']['features'] == {
        'tasks': {'before': False, 'after': True},
        'attendance': {'before': True, 'after': False},
    }


def test_a_refused_save_writes_no_audit_row(audit_repo):
    # The starter school has Registration off, so Tuition cannot go on.
    with patch('repositories.organization_repository.OrganizationRepository',
               return_value=_repo(_org())):
        with pytest.raises(svc.FeatureChangeError):
            svc.set_features(ORG, {'billing': True}, actor_id='admin')
    audit_repo.create.assert_not_called()


def test_a_failed_audit_insert_does_not_undo_the_save(audit_repo):
    audit_repo.create.side_effect = RuntimeError('insert refused')
    org = _org({'sis_enabled': True})
    repo = _repo(org)
    with patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
        out = svc.set_features(ORG, {'tasks': False}, actor_id='admin')
    repo.update_organization.assert_called_once()
    assert {r['key']: r['enabled'] for r in out['features']}['tasks'] is False
