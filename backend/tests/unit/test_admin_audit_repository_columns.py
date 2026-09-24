"""AdminAuditRepository writes and reads the columns admin_audit_logs has.

Sentry tickets 278abb85, 453af49a, a7a33143 (2026-09-24): adding a person in
the CRM logged "Could not find the 'admin_id' column of 'admin_audit_logs'"
(PGRST204). The table has user_id and changes; the repository wrote admin_id,
metadata and request_path, so every AdminAuditService.log_action failed and
no action logged through it was ever recorded. Its reads were broken twice
over: they filtered and joined on admin_id, and they called self.query(),
which BaseRepository does not have.

Two services had already worked around it by building rows themselves
(sis_person_service, organization_lifecycle). This fixes the repository, and
keeps its callers' vocabulary: reads alias user_id -> admin_id and
changes -> metadata.
"""
from unittest.mock import MagicMock

import pytest

from repositories.admin_audit_repository import AdminAuditRepository
from repositories.base_repository import DatabaseError

ADMIN = 'ad8e119c-0000-4000-8000-000000000001'
PERSON = 'b0b0b0b0-0000-4000-8000-000000000002'
TABLE_COLUMNS = {'id', 'organization_id', 'user_id', 'action_type', 'resource_type',
                 'resource_id', 'changes', 'ip_address', 'user_agent', 'created_at'}


def _repo():
    client = MagicMock()
    q = MagicMock()
    for m in ('select', 'eq', 'gte', 'lte', 'order', 'limit', 'offset', 'insert'):
        getattr(q, m).return_value = q
    q.execute.return_value = MagicMock(data=[{'id': 'log-1'}], count=1)
    client.table.return_value = q
    return AdminAuditRepository(client=client), client, q


@pytest.mark.unit
class TestLogActionWritesRealColumns:
    def test_a_crm_person_added_row_uses_only_columns_the_table_has(self):
        repo, client, q = _repo()
        repo.log_action(ADMIN, 'crm_person_added', resource_type='crm_person', resource_id=PERSON,
                        ip_address='203.0.113.9', user_agent='Chrome', request_path='/api/admin/crm/people',
                        metadata={'email': 'lead@example.com'})
        row = q.insert.call_args.args[0]
        assert set(row) <= TABLE_COLUMNS
        assert row['user_id'] == ADMIN
        assert row['changes'] == {'email': 'lead@example.com', 'request_path': '/api/admin/crm/people'}
        client.table.assert_called_with('admin_audit_logs')

    def test_no_metadata_and_no_path_writes_no_changes(self):
        repo, _client, q = _repo()
        repo.log_action(ADMIN, 'crm_person_added')
        assert q.insert.call_args.args[0] == {'user_id': ADMIN, 'action_type': 'crm_person_added'}

    def test_metadata_keeps_its_own_request_path(self):
        repo, _client, q = _repo()
        repo.log_action(ADMIN, 'x', request_path='/from/request', metadata={'request_path': '/theirs'})
        assert q.insert.call_args.args[0]['changes'] == {'request_path': '/theirs'}

    def test_a_failed_insert_is_still_a_database_error(self):
        repo, _client, q = _repo()
        q.execute.side_effect = RuntimeError('down')
        with pytest.raises(DatabaseError):
            repo.log_action(ADMIN, 'x')


@pytest.mark.unit
class TestReadsFilterOnUserIdAndAliasBack:
    def test_an_admins_logs_filter_on_user_id(self):
        repo, _client, q = _repo()
        assert repo.get_admin_logs(ADMIN) == [{'id': 'log-1'}]
        q.eq.assert_any_call('user_id', ADMIN)
        assert 'admin_id:user_id' in q.select.call_args.args[0]
        assert 'metadata:changes' in q.select.call_args.args[0]

    def test_the_paginated_admin_filter_is_user_id(self):
        repo, _client, q = _repo()
        out = repo.get_all_logs_paginated(filters={'admin_id': ADMIN})
        assert out == {'logs': [{'id': 'log-1'}], 'total': 1}
        q.eq.assert_any_call('user_id', ADMIN)
        assert q.select.call_args.kwargs == {'count': 'exact'}

    @pytest.mark.parametrize('call', [
        lambda r: r.get_resource_logs('crm_person', PERSON),
        lambda r: r.get_organization_logs('org-1'),
        lambda r: r.get_recent_logs(),
        lambda r: r.get_all_logs_paginated(),
    ])
    def test_the_admin_join_goes_through_user_id(self, call):
        repo, _client, q = _repo()
        call(repo)
        select = q.select.call_args.args[0]
        assert 'users!admin_audit_logs_user_id_fkey(' in select
        assert 'users!admin_id' not in select


@pytest.mark.unit
class TestTheServiceWritesAsTheSystem:
    """admin_audit_logs accepts INSERT from service_role only. The service was
    built with the caller's user_id, so even with the right columns its insert
    ran under the admin's own client and RLS refused it."""

    def test_log_action_inserts_through_the_service_role_client(self, app):
        from unittest.mock import patch
        from services.admin_audit_service import AdminAuditService
        repo, admin_client, q = _repo()
        with app.test_request_context('/api/admin/crm/people', method='POST',
                                      headers={'User-Agent': 'Chrome', 'X-Forwarded-For': '203.0.113.9, 10.0.0.1'}), \
             patch('database.get_supabase_admin_client', return_value=admin_client):
            AdminAuditService(user_id=ADMIN).log_action(
                admin_id=ADMIN, action_type='crm_person_added', resource_type='crm_lead',
                resource_id=PERSON, metadata={'email': 'lead@example.com'})
        row = q.insert.call_args.args[0]
        assert row['user_id'] == ADMIN
        assert row['ip_address'] == '203.0.113.9'
        assert row['changes'] == {'email': 'lead@example.com', 'request_path': '/api/admin/crm/people'}
