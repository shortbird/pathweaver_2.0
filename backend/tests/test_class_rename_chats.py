"""
A class rename follows into its two chats, and a roster-only class flag saves.

Ticket 644d46d5 (iCreate, teacher Karin): the class "Math Minds: Glow" showed
its chat as "Math Minds: Beam Parent Chat". The class was copied from Beam and
renamed; the group name is written once, when the chat is created, and the
class PATCH never touched it. These tests pin the fix: a rename replaces the
names this service generated from the old class name, keeps a name the school
typed by hand, and touches no other class's chats.

Ticket 2704bbd4 (iCreate, org_admin Molly): "I also added some classes just so
the teachers could have a roster, and I need to exclude them from being paid."
org_classes.exclude_from_pay is the flag; the PATCH must accept a boolean and
refuse anything else.
"""

import json
from contextlib import contextmanager
from unittest.mock import MagicMock, Mock, patch

import pytest

from repositories.sis_class_repository import SIS_CLASS_FIELDS
from services import class_group_sync_service as sync
from services import sis_catalog_service as catalog


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, admin, table):
        self.admin, self.table = admin, table
        self._filters, self._op, self._payload = [], 'select', None

    def select(self, *a, **k):
        self._op = 'select'; return self

    def update(self, payload):
        self._op = 'update'; self._payload = payload; return self

    def eq(self, col, val):
        self._filters.append(lambda r: r.get(col) == val); return self

    def execute(self):
        rows = [r for r in self.admin.rows.get(self.table, []) if all(f(r) for f in self._filters)]
        if self._op == 'update':
            for r in rows:
                r.update(self._payload)
        return _Resp([dict(r) for r in rows])


class _FakeAdmin:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        return _Query(self, name)


def _group(gid, class_id, audience, name, description=None):
    return {'id': gid, 'source_class_id': class_id, 'audience': audience,
            'name': name, 'description': description, 'is_active': True}


def _names(admin):
    return {g['id']: g['name'] for g in admin.rows['group_conversations']}


@pytest.mark.unit
class TestRenameClassGroups:
    def _admin(self):
        return _FakeAdmin({'group_conversations': [
            _group('fam', 'glow', 'family', 'Math Minds: Beam Parent Chat',
                   'Group chat for Math Minds: Beam families and teachers'),
            _group('stu', 'glow', 'student', 'Math Minds: Beam Student Chat',
                   'Group chat for Math Minds: Beam students and teachers'),
            # The real Beam class keeps its own chats.
            _group('beam-fam', 'beam', 'family', 'Math Minds: Beam Parent Chat'),
            _group('beam-stu', 'beam', 'student', 'Math Minds: Beam Student Chat'),
        ]})

    def test_rename_follows_into_both_chats(self):
        admin = self._admin()
        with patch.object(sync, '_admin', return_value=admin):
            n = sync.rename_class_groups('glow', 'Math Minds: Beam', 'Math Minds: Glow')
        assert n == 2
        names = _names(admin)
        assert names['fam'] == 'Math Minds: Glow Parent Chat'
        assert names['stu'] == 'Math Minds: Glow Student Chat'
        descs = {g['id']: g['description'] for g in admin.rows['group_conversations']}
        assert descs['fam'] == 'Group chat for Math Minds: Glow families and teachers'
        assert descs['stu'] == 'Group chat for Math Minds: Glow students and teachers'

    def test_other_classes_chats_are_untouched(self):
        admin = self._admin()
        with patch.object(sync, '_admin', return_value=admin):
            sync.rename_class_groups('glow', 'Math Minds: Beam', 'Math Minds: Glow')
        names = _names(admin)
        assert names['beam-fam'] == 'Math Minds: Beam Parent Chat'
        assert names['beam-stu'] == 'Math Minds: Beam Student Chat'

    def test_a_name_the_school_typed_is_kept(self):
        admin = _FakeAdmin({'group_conversations': [
            _group('fam', 'glow', 'family', 'Glow Families 26-27', 'Our own words'),
            _group('stu', 'glow', 'student', 'Math Minds: Beam Student Chat'),
        ]})
        with patch.object(sync, '_admin', return_value=admin):
            n = sync.rename_class_groups('glow', 'Math Minds: Beam', 'Math Minds: Glow')
        assert n == 1
        fam = admin.rows['group_conversations'][0]
        assert fam['name'] == 'Glow Families 26-27'
        assert fam['description'] == 'Our own words'
        assert _names(admin)['stu'] == 'Math Minds: Glow Student Chat'

    def test_the_older_class_chat_auto_name_becomes_the_parent_chat(self):
        admin = _FakeAdmin({'group_conversations': [
            _group('fam', 'glow', 'family', 'Math Minds: Beam Class Chat')]})
        with patch.object(sync, '_admin', return_value=admin):
            sync.rename_class_groups('glow', 'Math Minds: Beam', 'Math Minds: Glow')
        assert _names(admin)['fam'] == 'Math Minds: Glow Parent Chat'

    def test_same_name_is_a_no_op(self):
        admin = MagicMock()
        with patch.object(sync, '_admin', return_value=admin):
            assert sync.rename_class_groups('glow', 'Glow', 'Glow') == 0
        admin.table.assert_not_called()

    def test_never_raises(self):
        with patch.object(sync, '_admin', side_effect=RuntimeError('db down')):
            assert sync.rename_class_groups('glow', 'A', 'B') == 0


# ── The PATCH route ──────────────────────────────────────────────────────────

def _role_client(role='org_admin'):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'role': role, 'org_role': None, 'org_roles': None}])
    return client


@contextmanager
def _patch_route(existing, updated):
    repo = MagicMock()
    repo.find_by_id.return_value = existing
    repo.update_sis_fields.return_value = updated
    with patch('database.get_supabase_admin_client', return_value=_role_client()), \
         patch('services.sis_service.resolve_org_id', return_value='org-1'), \
         patch('routes.sis.catalog.get_supabase_admin_client', return_value=MagicMock()), \
         patch('routes.sis.catalog.SisClassRepository', return_value=repo), \
         patch('services.class_group_sync_service.rename_class_groups') as rename:
        yield repo, rename


@pytest.mark.unit
class TestUpdateClassRoute:
    EXISTING = {'id': 'glow', 'organization_id': 'org-1', 'name': 'Math Minds: Beam'}

    def test_a_rename_renames_the_chats(self, client, auth_headers, mock_verify_token):
        with _patch_route(self.EXISTING, {**self.EXISTING, 'name': 'Math Minds: Glow'}) as (_, rename):
            resp = client.patch('/api/sis/classes/glow', headers=auth_headers,
                                json={'name': 'Math Minds: Glow'})
        assert resp.status_code == 200
        rename.assert_called_once_with('glow', 'Math Minds: Beam', 'Math Minds: Glow')

    def test_a_save_that_keeps_the_name_leaves_the_chats_alone(self, client, auth_headers, mock_verify_token):
        # The class editor sends every field, the name included, on each save.
        with _patch_route(self.EXISTING, self.EXISTING) as (_, rename):
            resp = client.patch('/api/sis/classes/glow', headers=auth_headers,
                                json={'name': 'Math Minds: Beam', 'capacity': 10})
        assert resp.status_code == 200
        rename.assert_not_called()

    def test_exclude_from_pay_saves(self, client, auth_headers, mock_verify_token):
        with _patch_route(self.EXISTING, {**self.EXISTING, 'exclude_from_pay': True}) as (repo, _):
            resp = client.patch('/api/sis/classes/glow', headers=auth_headers,
                                json={'exclude_from_pay': True})
        assert resp.status_code == 200
        assert repo.update_sis_fields.call_args[0][1] == {'exclude_from_pay': True}
        assert json.loads(resp.data)['class']['exclude_from_pay'] is True

    def test_exclude_from_pay_must_be_a_boolean(self, client, auth_headers, mock_verify_token):
        with _patch_route(self.EXISTING, self.EXISTING) as (repo, _):
            resp = client.patch('/api/sis/classes/glow', headers=auth_headers,
                                json={'exclude_from_pay': 'yes'})
        assert resp.status_code == 400
        repo.update_sis_fields.assert_not_called()


@pytest.mark.unit
class TestExcludeFromPayField:
    def test_is_a_writable_sis_field(self):
        """Not on the whitelist means the PATCH silently drops it."""
        assert 'exclude_from_pay' in SIS_CLASS_FIELDS

    def test_staff_see_it_and_families_do_not(self):
        cls = {'id': 'c1', 'name': 'Roster', 'exclude_from_pay': True}
        assert catalog._for_audience(dict(cls), 'staff')['exclude_from_pay'] is True
        assert 'exclude_from_pay' not in catalog._for_audience(dict(cls), 'family')
