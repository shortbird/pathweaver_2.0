"""SIS Submissions: a school may leave out work Bloomy already verified.

Ticket bc68a12e, Apogee Cache Valley's org admin: "Bloomy submissions are the
only ones that I'd prefer not to review." Since 0d5e9dec5 a Bloomy-synced
completion is born verified (subject_verified_at set, verified_by_advisor_id
NULL, verification_notes 'Verified by Bloomy'). The new school setting
feature_flags.sis_settings.skip_bloomy_in_inbox leaves those rows out of the
inbox list and its "new" count. It is off unless a school turns it on, so with
it off or absent every inbox is exactly what it was.
"""

from unittest.mock import MagicMock, Mock, patch

import pytest
from flask import Flask

import app  # noqa: F401 -- import graph ordering
from routes.sis import submissions
from repositories.sis_submission_repository import SisSubmissionRepository
from services.external_learning_verification import (
    SKIP_BLOOMY_IN_INBOX_KEY,
    platform_verified_fields,
    skips_bloomy_in_inbox,
    verified_by_platform,
)
from tests.test_sis_submissions_search_and_paging import ORG, TEACHER, _admin, _world


def _with_bloomy(world):
    """Completion 0 is Bloomy-synced; 1 was Bloomy's but a teacher approved
    it over the top; 2 is ordinary work."""
    rows = world['quest_task_completions']
    rows[0].update(platform_verified_fields('Bloomy', at='2026-10-14T09:00:00Z'))
    rows[1].update({'subject_verified_at': '2026-10-14T14:00:00Z',
                    'verified_by_advisor_id': TEACHER,
                    'verification_notes': 'Quick approved with AI distribution'})
    return world


def _flags(value=None, present=True):
    if not present:
        return {}
    return {'sis_settings': {SKIP_BLOOMY_IN_INBOX_KEY: value}}


def _list(world, flags):
    admin = _admin(world, [])
    with Flask(__name__).test_request_context('/api/sis/submissions?scope=new'), \
         patch.object(submissions, 'get_supabase_admin_client', return_value=admin), \
         patch.object(submissions.sis_service, 'org_or_error', return_value=(ORG, None)), \
         patch.object(submissions.sis_service, 'class_scope', return_value=None), \
         patch.object(submissions, '_school_students', return_value=None), \
         patch('modules.enabled.org_flags', return_value=flags), \
         patch.object(submissions, 'sign_in_place'), \
         patch.object(submissions, 'PortfolioService'):
        resp = submissions.list_submissions.__wrapped__(TEACHER)
    body = (resp[0] if isinstance(resp, tuple) else resp).get_json()
    return [s['completion_id'] for s in body['submissions']], body['counts']


def _count(world, flags):
    admin = _admin(world, [])
    with Flask(__name__).test_request_context('/'), \
         patch.object(submissions, 'get_supabase_admin_client', return_value=admin), \
         patch.object(submissions.sis_service, 'class_scope', return_value=None), \
         patch.object(submissions, '_school_students', return_value=None), \
         patch('modules.enabled.org_flags', return_value=flags):
        return submissions.new_count(TEACHER, ORG)


ALL = ['c-00000', 'c-00001', 'c-00002']


@pytest.mark.unit
class TestTheInbox:

    def test_on_leaves_out_what_bloomy_verified(self):
        ids, counts = _list(_with_bloomy(_world(3)), _flags(True))
        assert ids == ['c-00001', 'c-00002']
        assert counts['new'] == 2

    def test_on_the_new_count_agrees(self):
        assert _count(_with_bloomy(_world(3)), _flags(True)) == 2

    def test_on_keeps_bloomy_work_a_teacher_approved_over_the_top(self):
        """A teacher's approval writes their own id and note; from then on it
        is the teacher's verification, not Bloomy's."""
        ids, _ = _list(_with_bloomy(_world(3)), _flags(True))
        assert 'c-00001' in ids

    def test_off_keeps_everything(self):
        ids, counts = _list(_with_bloomy(_world(3)), _flags(False))
        assert ids == ALL and counts['new'] == 3
        assert _count(_with_bloomy(_world(3)), _flags(False)) == 3

    def test_missing_key_keeps_everything(self):
        assert _list(_with_bloomy(_world(3)), {'sis_settings': {}})[0] == ALL
        assert _list(_with_bloomy(_world(3)), _flags(present=False))[0] == ALL
        assert _count(_with_bloomy(_world(3)), _flags(present=False)) == 3

    def test_only_a_stored_true_turns_it_on(self):
        assert _list(_with_bloomy(_world(3)), _flags('true'))[0] == ALL


@pytest.mark.unit
class TestTheMarker:

    def test_what_the_bloomy_sync_writes_is_recognised(self):
        row = platform_verified_fields('Bloomy')
        assert verified_by_platform(row, 'Bloomy') is True

    def test_a_teacher_or_another_platform_is_not_bloomy(self):
        teacher = {**platform_verified_fields('Bloomy'), 'verified_by_advisor_id': 'teacher-1'}
        assert verified_by_platform(teacher, 'Bloomy') is False
        assert verified_by_platform(platform_verified_fields('Khan'), 'Bloomy') is False
        assert verified_by_platform({'verification_notes': 'Verified by Bloomy'}, 'Bloomy') is False
        assert verified_by_platform({}, 'Bloomy') is False

    def test_the_setting_reader(self):
        assert skips_bloomy_in_inbox(_flags(True)) is True
        assert skips_bloomy_in_inbox(_flags(False)) is False
        assert skips_bloomy_in_inbox(_flags('yes')) is False
        assert skips_bloomy_in_inbox({}) is False
        assert skips_bloomy_in_inbox(None) is False


@pytest.mark.unit
class TestTheRepositoryRead:
    """The marker lives in three columns; a select without them would make
    every row look unverified and the switch would silently do nothing."""

    @pytest.mark.parametrize('method,args', [
        ('completions_for', (['s1'], ['q1'])),
        ('completions_by', (['s1'],)),
    ])
    def test_the_inbox_reads_carry_the_verification_columns(self, method, args):
        client = MagicMock()
        query = client.table.return_value
        query.select.return_value = query
        query.in_.return_value = query
        query.order.return_value = query
        query.range.return_value = query
        query.execute.return_value = MagicMock(data=[])
        getattr(SisSubmissionRepository(client), method)(*args)
        selected = query.select.call_args[0][0]
        for column in ('subject_verified_at', 'verified_by_advisor_id', 'verification_notes',
                       'id', 'user_id', 'quest_id', 'user_quest_task_id', 'completed_at'):
            assert column in selected


# ── the settings write ───────────────────────────────────────────────────────

from tests.test_sis_settings_patch import ADMIN_ROW, _caller_client  # noqa: E402


def _repo(stored):
    repo = Mock()
    repo.find_by_id.return_value = {'id': 'org-1', 'feature_flags': stored}
    repo.update_organization.side_effect = lambda org_id, data: {'id': org_id, **data}
    return repo


@pytest.mark.unit
class TestTheSettingsWrite:

    def _patch(self, client, auth_headers, body, stored=None):
        repo = _repo(stored if stored is not None else {'sis_settings': {'rooms': [{'name': 'Kitchen'}]}})
        with patch('database.get_supabase_admin_client', return_value=_caller_client(ADMIN_ROW)), \
             patch('services.sis_service.get_user_org_context',
                   return_value={'role': 'org_admin', 'organization_id': 'org-1'}), \
             patch('services.sis_service.resolve_org_id', return_value='org-1'), \
             patch('services.sis_service.caller_sees_pay', return_value=True), \
             patch('modules.gate.module_enabled', return_value=True), \
             patch('repositories.organization_repository.OrganizationRepository', return_value=repo):
            resp = client.patch('/api/sis/settings?organization_id=org-1', headers=auth_headers, json=body)
        return resp, repo

    @pytest.mark.parametrize('value', [True, False])
    def test_an_admin_turns_it_on_and_off(self, client, auth_headers, mock_verify_token, value):
        resp, repo = self._patch(client, auth_headers, {'sis_settings': {SKIP_BLOOMY_IN_INBOX_KEY: value}})
        assert resp.status_code == 200, resp.get_json()
        written = repo.update_organization.call_args[0][1]['feature_flags']['sis_settings']
        assert written[SKIP_BLOOMY_IN_INBOX_KEY] is value
        assert written['rooms'] == [{'name': 'Kitchen'}]

    def test_a_value_that_is_not_on_or_off_is_refused(self, client, auth_headers, mock_verify_token):
        resp, repo = self._patch(client, auth_headers, {'sis_settings': {SKIP_BLOOMY_IN_INBOX_KEY: 'yes'}})
        assert resp.status_code == 400
        assert resp.get_json()['fields'] == ['sis_settings.' + SKIP_BLOOMY_IN_INBOX_KEY]
        repo.update_organization.assert_not_called()

    def test_a_null_clears_it(self, client, auth_headers, mock_verify_token):
        resp, repo = self._patch(client, auth_headers, {'sis_settings': {SKIP_BLOOMY_IN_INBOX_KEY: None}},
                                 stored={'sis_settings': {SKIP_BLOOMY_IN_INBOX_KEY: True}})
        assert resp.status_code == 200, resp.get_json()
        written = repo.update_organization.call_args[0][1]['feature_flags']['sis_settings']
        assert SKIP_BLOOMY_IN_INBOX_KEY not in written
