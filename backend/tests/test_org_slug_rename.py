"""
Renaming an organization's slug.

The Edit dialog on /admin/organizations/<id> has always shown a Slug field, but
the PUT dropped it: `slug` was not in any allowed_fields list, so the name saved,
the slug silently did not, and the School Login Link card kept the old URL.

The slug is the school's login URL (/login/<slug>) and the key programs are wired
to (backend/programs/registry.py), so the rename is superadmin-only and refuses a
duplicate, a malformed value, or an org a program is attached to.
"""

from unittest.mock import Mock, patch

import pytest


def _caller_client(role_row):
    client = Mock()
    table = Mock()
    for chained in ('select', 'eq', 'limit', 'single', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=role_row)
    client.table.return_value = table
    return client


SUPERADMIN_ROW = {'id': 'super', 'role': 'superadmin', 'org_role': None, 'org_roles': None,
                  'is_org_admin': False, 'organization_id': None, 'email': 'super@optio.test'}

ORG_ADMIN_ROW = {'id': 'admin', 'role': 'org_managed', 'org_role': 'org_admin',
                 'org_roles': ['org_admin'], 'is_org_admin': True,
                 'organization_id': 'org-1', 'email': 'admin@school.test'}


def _repo(slug='willow-creek', existing=None):
    repo = Mock()
    repo.find_by_id.return_value = {'id': 'org-1', 'name': 'Willow Creek', 'slug': slug,
                                    'feature_flags': {}}
    repo.get_by_slug.return_value = existing
    repo.update_organization.side_effect = lambda org_id, data: {'id': org_id, 'slug': slug, **data}
    return repo


def _put(client, auth_headers, caller, repo, payload, sees_pay=True):
    with patch('database.get_supabase_admin_client', return_value=_caller_client(caller)), \
         patch('services.sis_service.caller_sees_pay', return_value=sees_pay), \
         patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
        return client.put('/api/admin/organizations/org-1', headers=auth_headers, json=payload)


@pytest.mark.unit
class TestSuperadminRenamesTheSlug:

    def test_the_new_slug_is_written(self, client, auth_headers, mock_verify_token):
        repo = _repo()
        resp = _put(client, auth_headers, SUPERADMIN_ROW, repo,
                    {'name': 'Willow Creek', 'slug': 'willow-creek-academy'})
        assert resp.status_code == 200
        assert repo.update_organization.call_args[0][1]['slug'] == 'willow-creek-academy'
        # The login link the UI renders comes from the echoed row.
        assert resp.get_json()['slug'] == 'willow-creek-academy'

    def test_case_and_whitespace_are_normalized(self, client, auth_headers, mock_verify_token):
        repo = _repo()
        resp = _put(client, auth_headers, SUPERADMIN_ROW, repo, {'slug': '  Willow-Creek-2  '})
        assert resp.status_code == 200
        assert repo.update_organization.call_args[0][1]['slug'] == 'willow-creek-2'

    def test_resubmitting_the_same_slug_is_not_a_write(self, client, auth_headers, mock_verify_token):
        repo = _repo()
        resp = _put(client, auth_headers, SUPERADMIN_ROW, repo,
                    {'name': 'Willow Creek Academy', 'slug': 'willow-creek'})
        assert resp.status_code == 200
        assert 'slug' not in repo.update_organization.call_args[0][1]

    def test_a_taken_slug_is_refused(self, client, auth_headers, mock_verify_token):
        repo = _repo(existing={'id': 'org-2', 'slug': 'gryffin-north'})
        resp = _put(client, auth_headers, SUPERADMIN_ROW, repo, {'slug': 'gryffin-north'})
        assert resp.status_code == 400
        assert 'already uses' in resp.get_json()['error']
        repo.update_organization.assert_not_called()

    def test_a_malformed_slug_is_refused(self, client, auth_headers, mock_verify_token):
        repo = _repo()
        resp = _put(client, auth_headers, SUPERADMIN_ROW, repo, {'slug': 'Willow Creek!'})
        assert resp.status_code == 400
        repo.update_organization.assert_not_called()

    def test_a_program_org_cannot_be_renamed_out_from_under_the_registry(
            self, client, auth_headers, mock_verify_token):
        """programs/registry.py binds Hearthwood by slug; renaming here would turn
        the program's tab and rules off with nothing to say why."""
        repo = _repo(slug='hearthwood')
        resp = _put(client, auth_headers, SUPERADMIN_ROW, repo, {'slug': 'hearthwood-academy'})
        assert resp.status_code == 400
        assert 'registry' in resp.get_json()['error']
        repo.update_organization.assert_not_called()


@pytest.mark.unit
class TestEveryoneElse:

    def test_an_org_admin_saves_the_name_but_not_the_slug(self, client, auth_headers, mock_verify_token):
        repo = _repo()
        resp = _put(client, auth_headers, ORG_ADMIN_ROW, repo,
                    {'name': 'Willow Creek Academy', 'slug': 'something-else'})
        assert resp.status_code == 200
        written = repo.update_organization.call_args[0][1]
        assert written['name'] == 'Willow Creek Academy'
        assert 'slug' not in written
