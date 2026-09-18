"""
PATCH /api/sis/settings: one key at a time, merged on the server.

Thirteen settings cards used to read organizations.feature_flags, spread it,
change one key and PUT the whole thing back, so the rooms card and the parent
digest card open in two tabs erased each other's saves (M8a,
docs/sis/CONSOLIDATION_PLAN.md). The merge here is what makes that impossible:
a patch names only what it changes, and everything else is whatever is stored
at the moment of the write.

The guards are the ones the admin console's PUT always ran, shared through
services.org_settings_service; test_org_settings_front_office covers them for
the PUT, and the coordinator cases below prove the PATCH door refuses the
same things.
"""

from unittest.mock import Mock, patch

import pytest

from services.org_settings_service import merge_patch

STORED = {
    'sis_settings': {
        'rooms': [{'name': 'Kitchen'}],
        'time_blocks': [{'start': '09:30', 'end': '10:30'}],
        'optio_course_tuition_cents': 25000,
        'parent_weekly_digest': {'enabled': True, 'day': 5, 'hour': 16},
    },
    'registration': {
        'enabled': True,
        'questions': [{'key': 'media_consent'}],
        'registration_fee_cents': 12500,
    },
    'icreate_registration': {
        'enabled': True,
        'questions': [{'key': 'media_consent'}],
        'registration_fee_cents': 12500,
    },
    'modules': {'kiosk': False},
    'sis_enabled': True,
}


@pytest.mark.unit
class TestTheMerge:

    def test_one_key_changes_and_nothing_else_moves(self):
        out = merge_patch(STORED, {'sis_settings': {'rooms': [{'name': 'Art Studio'}]}})
        assert out['sis_settings']['rooms'] == [{'name': 'Art Studio'}]
        assert out['sis_settings']['time_blocks'] == STORED['sis_settings']['time_blocks']
        assert out['sis_settings']['parent_weekly_digest'] == STORED['sis_settings']['parent_weekly_digest']
        assert out['registration'] == STORED['registration']
        assert out['modules'] == {'kiosk': False}

    def test_two_cards_saving_in_turn_both_survive(self):
        """The failure the PUT had: the second tab's spread held the first
        tab's stale value and wrote it back. A merge on the stored blob has no
        stale value to write."""
        after_rooms = merge_patch(STORED, {'sis_settings': {'rooms': [{'name': 'Art Studio'}]}})
        after_digest = merge_patch(after_rooms, {'sis_settings': {'parent_weekly_digest': {'enabled': False}}})
        assert after_digest['sis_settings']['rooms'] == [{'name': 'Art Studio'}]
        assert after_digest['sis_settings']['parent_weekly_digest'] == {'enabled': False}

    def test_a_null_removes_the_key(self):
        out = merge_patch(STORED, {'sis_settings': {'rooms': None}})
        assert 'rooms' not in out['sis_settings']
        assert 'time_blocks' in out['sis_settings']

    def test_a_top_level_flag_replaces(self):
        out = merge_patch(STORED, {'hide_pillars': True})
        assert out['hide_pillars'] is True
        assert out['sis_enabled'] is True

    def test_the_registration_config_keeps_its_legacy_mirror_in_step(self):
        """The browser never writes icreate_registration again; a row that
        still carries it gets the same value from utils.registration_config,
        so the read fallback cannot disagree with the canonical key."""
        out = merge_patch(STORED, {'registration': {'registration_fee_cents': 9000}})
        assert out['registration']['registration_fee_cents'] == 9000
        assert out['registration']['questions'] == [{'key': 'media_consent'}]
        assert out['icreate_registration'] == out['registration']

    def test_a_row_without_the_legacy_key_never_gains_one(self):
        stored = {k: v for k, v in STORED.items() if k != 'icreate_registration'}
        out = merge_patch(stored, {'registration': {'enabled': False}})
        assert 'icreate_registration' not in out
        assert out['registration']['enabled'] is False

    def test_the_stored_blob_is_not_mutated(self):
        before = {**STORED, 'sis_settings': dict(STORED['sis_settings'])}
        merge_patch(STORED, {'sis_settings': {'rooms': None}, 'hide_pillars': True})
        assert STORED['sis_settings'] == before['sis_settings']
        assert 'hide_pillars' not in STORED


def _caller_client(role_row):
    client = Mock()
    table = Mock()
    for chained in ('select', 'eq', 'limit', 'single', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[role_row])
    client.table.return_value = table
    return client


ADMIN_ROW = {'id': 'molly', 'role': 'org_managed', 'org_role': 'org_admin',
             'org_roles': ['org_admin'], 'is_org_admin': True,
             'organization_id': 'org-1', 'email': 'molly@icreate.test'}
COORDINATOR_ROW = {'id': 'kate', 'role': 'org_managed', 'org_role': 'campus_coordinator',
                   'org_roles': ['campus_coordinator'], 'is_org_admin': False,
                   'organization_id': 'org-1', 'email': 'kate@icreate.test'}


def _repo():
    repo = Mock()
    repo.find_by_id.return_value = {'id': 'org-1', 'feature_flags': STORED}
    repo.update_organization.side_effect = lambda org_id, data: {'id': org_id, **data}
    return repo


@pytest.mark.unit
class TestTheRoute:

    def _patch(self, client, auth_headers, row, body, sees_pay=True):
        repo = _repo()
        with patch('database.get_supabase_admin_client', return_value=_caller_client(row)), \
             patch('services.sis_service.get_user_org_context',
                   return_value={'role': row['org_role'], 'organization_id': 'org-1'}), \
             patch('services.sis_service.resolve_org_id', return_value='org-1'), \
             patch('services.sis_service.caller_sees_pay', return_value=sees_pay), \
             patch('modules.gate.module_enabled', return_value=True), \
             patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
            resp = client.patch('/api/sis/settings?organization_id=org-1', headers=auth_headers, json=body)
        return resp, repo

    def test_an_admin_changes_one_key_and_gets_the_whole_blob_back(self, client, auth_headers, mock_verify_token):
        resp, repo = self._patch(client, auth_headers, ADMIN_ROW,
                                 {'sis_settings': {'rooms': [{'name': 'Art Studio'}]}})
        assert resp.status_code == 200, resp.get_json()
        written = repo.update_organization.call_args[0][1]['feature_flags']
        assert written['sis_settings']['rooms'] == [{'name': 'Art Studio'}]
        assert written['sis_settings']['optio_course_tuition_cents'] == 25000
        assert written['modules'] == {'kiosk': False}
        assert resp.get_json()['feature_flags']['sis_settings']['rooms'] == [{'name': 'Art Studio'}]

    def test_a_coordinator_changes_a_room_but_not_a_price(self, client, auth_headers, mock_verify_token):
        resp, repo = self._patch(client, auth_headers, COORDINATOR_ROW,
                                 {'sis_settings': {'rooms': [{'name': 'Art Studio'}]}}, sees_pay=False)
        assert resp.status_code == 200, resp.get_json()
        written = repo.update_organization.call_args[0][1]['feature_flags']
        assert written['sis_settings']['rooms'] == [{'name': 'Art Studio'}]
        assert written['sis_settings']['optio_course_tuition_cents'] == 25000

        resp, repo = self._patch(client, auth_headers, COORDINATOR_ROW,
                                 {'sis_settings': {'optio_course_tuition_cents': 0}}, sees_pay=False)
        assert resp.status_code == 403
        repo.update_organization.assert_not_called()

    def test_a_coordinator_cannot_set_the_stripe_key(self, client, auth_headers, mock_verify_token):
        resp, repo = self._patch(client, auth_headers, COORDINATOR_ROW,
                                 {'registration': {'stripe_secret_key': 'sk_live_' + 'a' * 30}}, sees_pay=False)
        assert resp.status_code == 403
        repo.update_organization.assert_not_called()

    def test_the_stripe_key_never_lands_in_the_blob(self, client, auth_headers, mock_verify_token):
        with patch('services.org_settings_service.set_org_secret') as diverted:
            resp, repo = self._patch(client, auth_headers, ADMIN_ROW,
                                     {'registration': {'stripe_secret_key': 'sk_live_' + 'a' * 30}})
        assert resp.status_code == 200, resp.get_json()
        written = repo.update_organization.call_args[0][1]['feature_flags']
        assert 'stripe_secret_key' not in written['registration']
        assert 'stripe_secret_key' not in written['icreate_registration']
        diverted.assert_called_once()
        assert diverted.call_args[0][2] == 'sk_live_' + 'a' * 30

    def test_a_key_the_settings_screens_do_not_own_is_refused(self, client, auth_headers, mock_verify_token):
        resp, repo = self._patch(client, auth_headers, ADMIN_ROW, {'modules': {'kiosk': True}})
        assert resp.status_code == 400
        assert 'modules' in resp.get_json()['error']
        repo.update_organization.assert_not_called()

    def test_an_empty_body_is_a_400_not_a_no_op_write(self, client, auth_headers, mock_verify_token):
        resp, repo = self._patch(client, auth_headers, ADMIN_ROW, {})
        assert resp.status_code == 400
        repo.update_organization.assert_not_called()

    def test_a_teacher_is_refused(self, client, auth_headers, mock_verify_token):
        teacher = {**ADMIN_ROW, 'id': 't', 'org_role': 'advisor', 'org_roles': ['advisor'], 'is_org_admin': False}
        resp, repo = self._patch(client, auth_headers, teacher, {'sis_settings': {'rooms': []}})
        assert resp.status_code == 403
        repo.update_organization.assert_not_called()

    def test_time_blocks_become_rows_and_leave_the_blob(self, client, auth_headers, mock_verify_token):
        """The blocks are sis_time_blocks rows (M8b): the card's PATCH writes
        them through save_time_blocks and the blob's legacy key is removed by
        the same call, so the rows are the one place."""
        rows = [{'id': 'b1', 'label': '', 'start': '09:30', 'end': '10:30', 'sort': 0}]
        with patch('services.sis_catalog_service.save_time_blocks', return_value={'blocks': rows}) as save:
            resp, repo = self._patch(client, auth_headers, ADMIN_ROW,
                                     {'sis_settings': {'time_blocks': [{'start': '09:30', 'end': '10:30', 'label': ''}]}})
        assert resp.status_code == 200, resp.get_json()
        save.assert_called_once_with('org-1', [{'start': '09:30', 'end': '10:30', 'label': ''}])
        assert resp.get_json()['blocks'] == rows
        written = repo.update_organization.call_args[0][1]['feature_flags']
        assert 'time_blocks' not in written['sis_settings']
        assert written['sis_settings']['rooms'] == [{'name': 'Kitchen'}]

    def test_a_bad_block_is_refused_before_anything_is_written(self, client, auth_headers, mock_verify_token):
        resp, repo = self._patch(client, auth_headers, ADMIN_ROW,
                                 {'sis_settings': {'time_blocks': [{'start': '10:30', 'end': '09:30'}]}})
        assert resp.status_code == 400
        assert "can't end before it starts" in resp.get_json()['error']
        repo.update_organization.assert_not_called()
