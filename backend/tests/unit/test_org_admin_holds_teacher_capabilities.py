"""An org admin holds every capability a teacher holds.

Horizon, 2026-09-11: the school's director (org_admin, no advisor role) created
her own classes, then wrote "it feels like we've lost the ability to make
quests ourselves". Every teacher surface was hidden from her or refused her:
the SIS nav hid My Classes from admins, the check-in and notes routes admitted
'advisor' alone, the transcript read needed an assignment row an admin never
has, and the quest-edit rule fell through to "not an advisor, no".

These pin the backend half. The web half is pinned in sisShell.test.jsx,
sidebarSignals.test.jsx and schoolAdminHome.test.jsx.
"""

import re
from pathlib import Path
from unittest.mock import Mock, patch

import pytest

ROUTES = Path(__file__).resolve().parents[2] / 'routes'


def _client_answering(rows_by_table):
    """A supabase double whose .table(name)...execute() returns rows_by_table[name].

    `.single()` answers one row (a dict) the way PostgREST does, not the list.
    """
    client = Mock()

    def table(name):
        rows = rows_by_table.get(name, [])
        t = Mock()
        for chained in ('select', 'eq', 'limit', 'in_', 'is_', 'neq', 'order'):
            getattr(t, chained).return_value = t
        t.execute.return_value = Mock(data=rows)
        one = Mock()
        one.execute.return_value = Mock(data=(rows[0] if rows else None))
        t.single.return_value = one
        t.maybe_single.return_value = one
        return t

    client.table.side_effect = table
    return client


@pytest.mark.unit
class TestTheGatesAdmitOrgAdmin:
    """The two files that used to say @require_role('advisor', 'superadmin')."""

    @pytest.mark.parametrize('filename', ['advisor_checkins.py', 'advisor_notes.py'])
    def test_no_advisor_only_gate_remains(self, filename):
        src = (ROUTES / filename).read_text(encoding='utf-8')
        gates = re.findall(r"@require_role\(([^)]*)\)", src)
        assert gates, f'{filename} lost its role gates'
        for gate in gates:
            if "'advisor'" in gate:
                assert "'org_admin'" in gate, (
                    f"{filename}: @require_role({gate}) admits teachers but not org admins")


@pytest.mark.unit
class TestCheckinRelationship:
    def _repo(self, caller_row, same_org=True):
        from repositories.checkin_repository import CheckinRepository
        repo = CheckinRepository.__new__(CheckinRepository)
        repo.supabase = _client_answering({'users': [caller_row], 'advisor_student_assignments': []})
        repo._verify_same_organization = Mock(return_value=same_org)
        return repo

    def test_org_admin_needs_no_assignment_row(self):
        repo = self._repo({'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': None})
        assert repo.verify_advisor_student_relationship('admin-1', 'student-1') is True

    def test_org_admin_read_from_the_roles_array(self):
        repo = self._repo({'role': 'org_managed', 'org_role': None, 'org_roles': ['org_admin', 'parent']})
        assert repo.verify_advisor_student_relationship('admin-1', 'student-1') is True

    def test_org_admin_is_still_bounded_by_their_school(self):
        repo = self._repo({'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': None}, same_org=False)
        assert repo.verify_advisor_student_relationship('admin-1', 'student-1') is False

    def test_a_teacher_without_an_assignment_is_still_refused(self):
        repo = self._repo({'role': 'org_managed', 'org_role': 'advisor', 'org_roles': None})
        assert repo.verify_advisor_student_relationship('teacher-1', 'student-1') is False


@pytest.mark.unit
class TestQuestEditRule:
    def _can_edit(self, quest, user_row):
        from routes.admin.quest_management.crud import _quest_edit_rights
        client = _client_answering({'users': [user_row]})
        return _quest_edit_rights(client, 'u1', quest)

    def test_org_admin_edits_their_own_quest_that_has_no_org(self):
        # The teacher rule: your own quest, in your own school (or in none).
        quest = {'id': 'q1', 'organization_id': None, 'created_by': 'u1', 'is_active': True}
        user = {'id': 'u1', 'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': None,
                'organization_id': 'org-1'}
        assert self._can_edit(quest, user) == (True, False)

    def test_org_admin_still_cannot_edit_another_persons_quest_outside_their_school(self):
        quest = {'id': 'q1', 'organization_id': 'org-2', 'created_by': 'someone', 'is_active': True}
        user = {'id': 'u1', 'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': None,
                'organization_id': 'org-1'}
        with patch('services.sis_service.advisor_class_ids', return_value=[]):
            assert self._can_edit(quest, user) == (False, False)


@pytest.mark.unit
class TestTranscriptRead:
    def test_org_admin_reads_a_transcript_in_their_school(self, client, auth_headers, mock_verify_token):
        admin_row = {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': None,
                     'is_org_admin': True, 'organization_id': 'org-1'}
        db = _client_answering({'users': [admin_row]})
        with patch('database.get_supabase_admin_client', return_value=db), \
             patch('utils.auth.org_scope.caller_can_access_user', return_value=True), \
             patch('services.credit_mapping_service.CreditMappingService.generate_transcript',
                   return_value={'credits': []}):
            resp = client.get('/api/credits/transcript/00000000-0000-4000-8000-000000000009', headers=auth_headers)
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()['transcript'] == {'credits': []}

    def test_org_admin_is_refused_outside_their_school(self, client, auth_headers, mock_verify_token):
        admin_row = {'role': 'org_managed', 'org_role': 'org_admin', 'org_roles': None,
                     'is_org_admin': True, 'organization_id': 'org-1'}
        db = _client_answering({'users': [admin_row]})
        with patch('database.get_supabase_admin_client', return_value=db), \
             patch('utils.auth.org_scope.caller_can_access_user', return_value=False), \
             patch('services.credit_mapping_service.CreditMappingService.generate_transcript',
                   return_value={'credits': []}) as gen:
            resp = client.get('/api/credits/transcript/00000000-0000-4000-8000-000000000009', headers=auth_headers)
        assert resp.status_code in (403, 401)
        gen.assert_not_called()
