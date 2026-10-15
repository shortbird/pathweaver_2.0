"""
The class XP goal in the SIS console.

org_classes.xp_threshold is the XP a student earns in a class's quests to
complete the class; it drives the student's "class complete" percentage
(class_service.calculate_student_class_progress). Only the organization console
could set it. The console is going away (Tanner, 2026-10-15: every org is an SIS
org), so /api/sis/classes writes it now, and a changed goal re-checks who has
completed the class, as the console's ClassService.update_class did.
"""

import json
from contextlib import contextmanager
from unittest.mock import MagicMock, Mock, patch

import pytest

from repositories.sis_class_repository import SIS_CLASS_FIELDS
from routes.sis import catalog as catalog_routes


def _role_client(role):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@contextmanager
def _patch_route(role='org_admin', existing_threshold=100):
    existing = {'id': 'c1', 'organization_id': 'org-1', 'name': 'Art',
                'xp_threshold': existing_threshold}
    repo = MagicMock()
    repo.find_by_id.return_value = existing
    repo.update_sis_fields.side_effect = lambda _id, fields: {**existing, **fields}
    repo.create_for_org.side_effect = lambda org, created_by, fields: {'id': 'new', **fields}
    service = MagicMock()
    with patch('database.get_supabase_admin_client', return_value=_role_client(role)), \
         patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('routes.sis.catalog.get_supabase_admin_client', return_value=MagicMock()), \
         patch('routes.sis.catalog.SisClassRepository', return_value=repo), \
         patch('services.class_service.ClassService', return_value=service):
        yield repo, service


@pytest.mark.unit
class TestTheField:
    def test_is_a_writable_sis_field(self):
        """Not on the whitelist means create and PATCH silently drop it."""
        assert 'xp_threshold' in SIS_CLASS_FIELDS

    def test_validation(self):
        v = catalog_routes._validate_class_fields
        assert v({'xp_threshold': 0}) is None
        assert v({'xp_threshold': 500}) is None
        assert v({}) is None
        # NOT NULL in the table (default 100): a null would 500 the PATCH.
        for bad in (None, -1, '100', 1.5, True):
            assert v({'xp_threshold': bad}) == 'xp_threshold must be a non-negative integer'


@pytest.mark.unit
class TestTheRoutes:
    def test_create_writes_it(self, client, auth_headers, mock_verify_token):
        with _patch_route() as (repo, _service):
            resp = client.post('/api/sis/classes', headers=auth_headers,
                               json={'name': 'Art', 'xp_threshold': 250})
        assert resp.status_code == 201
        assert repo.create_for_org.call_args.kwargs['fields']['xp_threshold'] == 250

    def test_a_new_goal_rechecks_who_completed_the_class(
            self, client, auth_headers, mock_verify_token):
        with _patch_route(existing_threshold=100) as (repo, service):
            resp = client.patch('/api/sis/classes/c1', headers=auth_headers,
                                json={'xp_threshold': 300})
        assert resp.status_code == 200
        assert repo.update_sis_fields.call_args[0][1] == {'xp_threshold': 300}
        assert json.loads(resp.data)['class']['xp_threshold'] == 300
        service._check_and_update_completions.assert_called_once_with('c1')

    def test_the_same_goal_does_not_recheck(self, client, auth_headers, mock_verify_token):
        with _patch_route(existing_threshold=100) as (_repo, service):
            resp = client.patch('/api/sis/classes/c1', headers=auth_headers,
                                json={'xp_threshold': 100})
        assert resp.status_code == 200
        service._check_and_update_completions.assert_not_called()

    def test_a_failed_recheck_does_not_fail_the_save(self, client, auth_headers, mock_verify_token):
        with _patch_route() as (_repo, service):
            service._check_and_update_completions.side_effect = RuntimeError('down')
            resp = client.patch('/api/sis/classes/c1', headers=auth_headers,
                                json={'xp_threshold': 50})
        assert resp.status_code == 200

    def test_a_negative_goal_is_refused(self, client, auth_headers, mock_verify_token):
        with _patch_route() as (repo, _service):
            resp = client.patch('/api/sis/classes/c1', headers=auth_headers,
                                json={'xp_threshold': -5})
        assert resp.status_code == 400
        repo.update_sis_fields.assert_not_called()

    def test_a_teacher_may_not_set_it(self, client, auth_headers, mock_verify_token):
        with _patch_route(role='advisor') as (repo, _service):
            resp = client.patch('/api/sis/classes/c1', headers=auth_headers,
                                json={'xp_threshold': 50})
        assert resp.status_code == 403
        repo.update_sis_fields.assert_not_called()
