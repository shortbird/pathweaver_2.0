"""
Ticket bbb477db ("Did you remove the class chats? helpful for admins to see in
one place"): the office's "All class chats" list.

What these pin:
  - the list reads only the caller's org, only chats with a source class, and
    counts with count='exact' and pages with range() (no Python row counting);
  - opening a chat joins the admin as an admin member through the same
    function the class Messages tab uses (ensure_admin_member);
  - a chat of another school's class is refused and nothing is written;
  - a non-admin is refused and nothing is read.
"""

import json
from contextlib import contextmanager
from unittest.mock import MagicMock, Mock, patch

import pytest

from services import class_chat_directory_service as directory
from services import class_group_sync_service

ORG = 'org-1'


class FakeTable:
    """Records every filter call; returns canned rows per table."""

    def __init__(self, name, rows, count=None, log=None):
        self.name, self.rows, self.count, self.log = name, rows, count, log

    def __getattr__(self, attr):
        def call(*args, **kwargs):
            self.log.append((self.name, attr, args, kwargs))
            return self
        return call

    @property
    def not_(self):
        self.log.append((self.name, 'not_', (), {}))
        return self

    def execute(self):
        return Mock(data=self.rows, count=self.count)


def _admin(tables, log):
    admin = MagicMock()
    admin.table.side_effect = lambda name: FakeTable(name, *tables.get(name, ([], None)), log=log)
    return admin


@pytest.mark.unit
class TestList:
    """bbb477db: every class chat at the school, in one place."""

    def test_scoped_to_the_org_counted_exactly_and_paged(self):
        log = []
        admin = _admin({
            'group_conversations': ([{'id': 'g1', 'name': 'Art Parent Chat', 'audience': 'family',
                                      'source_class_id': 'c1', 'last_message_at': 'x'}], 120),
            'org_classes': ([{'id': 'c1', 'name': 'Art'}], None),
        }, log)
        with patch.object(directory, '_admin', return_value=admin):
            out = directory.list_class_chats(ORG, page=2, per_page=50)
        assert out['total'] == 120 and out['page'] == 2
        assert out['chats'][0]['class_name'] == 'Art' and out['chats'][0]['kind'] == 'parent'
        groups = [c for c in log if c[0] == 'group_conversations']
        assert ('group_conversations', 'select', groups[0][2], {'count': 'exact'}) in groups
        assert ('group_conversations', 'eq', ('organization_id', ORG), {}) in groups
        assert ('group_conversations', 'is_', ('source_class_id', 'null'), {}) in groups
        assert ('group_conversations', 'range', (50, 99), {}) in groups
        assert ('org_classes', 'eq', ('organization_id', ORG), {}) in log

    def test_search_matches_the_chat_or_its_class_and_is_sanitised(self):
        log = []
        admin = _admin({'group_conversations': ([], 0),
                        'org_classes': ([{'id': 'c9'}], None)}, log)
        with patch.object(directory, '_admin', return_value=admin):
            directory.list_class_chats(ORG, q='Art,(x)')
        ors = [c for c in log if c[1] == 'or_']
        assert ors and ',(' not in ors[0][2][0].split('source_class_id')[0]
        assert 'source_class_id.in.(c9)' in ors[0][2][0]


@pytest.mark.unit
class TestOpen:
    """bbb477db: opening a chat joins the admin like the class Messages tab."""

    def _run(self, class_org, members=()):
        log = []
        admin = _admin({
            'group_conversations': ([{'id': 'g1', 'name': 'Art Parent Chat',
                                      'source_class_id': 'c1', 'organization_id': ORG}], None),
            # The repository asks for the class WITH organization_id = ORG, so
            # another school's class comes back as no rows.
            'org_classes': ([{'id': 'c1', 'name': 'Art'}] if class_org == ORG else [], None),
            'group_members': (list(members), None),
        }, log)
        with patch.object(directory, '_admin', return_value=admin):
            out = directory.open_class_chat(ORG, 'g1', 'boss')
        return out, log

    def test_opening_joins_the_admin_as_an_admin_member(self):
        out, log = self._run(ORG)
        assert out['id'] == 'g1'
        inserts = [c for c in log if c[0] == 'group_members' and c[1] == 'insert']
        assert inserts and inserts[0][2][0] == {'group_id': 'g1', 'user_id': 'boss',
                                                'role': 'admin', 'added_by': 'boss'}

    def test_a_plain_member_is_promoted(self):
        _out, log = self._run(ORG, members=[{'id': 'm1', 'role': 'member'}])
        assert ('group_members', 'update', ({'role': 'admin'},), {}) in log

    def test_another_schools_class_chat_writes_nothing(self):
        out, log = self._run('org-2')
        assert out is None
        assert ('org_classes', 'eq', ('organization_id', ORG), {}) in log
        assert not [c for c in log if c[0] == 'group_members']

    def test_the_class_messages_tab_uses_the_same_join(self):
        """One join for both doors: staff_portal calls ensure_admin_member."""
        import inspect
        from routes.sis import staff_portal
        assert 'ensure_admin_member' in inspect.getsource(staff_portal.class_messaging)
        assert callable(class_group_sync_service.ensure_admin_member)


def _role_client(role, org_role=None):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'role': role, 'org_role': org_role, 'org_roles': [org_role] if org_role else None}])
    return client


@contextmanager
def caller(role='org_admin', org_role=None):
    with patch('database.get_supabase_admin_client', return_value=_role_client(role, org_role)), \
         patch('services.sis_service.resolve_org_id', return_value=ORG):
        yield


@pytest.mark.unit
class TestRoutes:
    """bbb477db: ADMIN_ROLES only."""

    def test_an_admin_gets_the_list(self, client, auth_headers, mock_verify_token):
        with caller(), patch.object(directory, 'list_class_chats',
                                    return_value={'chats': [], 'total': 0, 'page': 1,
                                                  'per_page': 50}) as run:
            resp = client.get('/api/sis/messaging/class-chats?q=art', headers=auth_headers)
        assert resp.status_code == 200
        run.assert_called_once_with(ORG, 'art', 1, 50)

    def test_another_schools_chat_is_a_404(self, client, auth_headers, mock_verify_token):
        with caller(), patch.object(directory, 'open_class_chat', return_value=None):
            resp = client.post('/api/sis/messaging/class-chats/g1/open', headers=auth_headers)
        assert resp.status_code == 404

    @pytest.mark.parametrize('role,org_role', [
        ('org_managed', 'advisor'), ('org_managed', 'parent'), ('student', None),
    ])
    def test_non_admins_are_refused(self, client, auth_headers, mock_verify_token, role, org_role):
        with caller(role=role, org_role=org_role), \
             patch.object(directory, 'list_class_chats') as run, \
             patch.object(directory, 'open_class_chat') as join:
            get = client.get('/api/sis/messaging/class-chats', headers=auth_headers)
            post = client.post('/api/sis/messaging/class-chats/g1/open', headers=auth_headers)
        assert get.status_code == 403 and post.status_code == 403
        run.assert_not_called()
        join.assert_not_called()
        assert json.loads(get.data).get('chats') is None
