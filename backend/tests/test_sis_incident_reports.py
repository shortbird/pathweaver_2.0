"""
Incident reports come back as a staff tool that writes a task.

Katrine Myers (iCreate campus coordinator), 2026-09-24, ticket
a26d9daf-27b3-489e-9412-558c7ed02d55:

    "Reporting an incident used to be in task manager. I don't see it there
    anymore. Cameron Stobbe is the second child to get his finger smashed in
    the big glass doors. I need to get that in an incident report."

The built-in incident form was retired with the other forms on 2026-09-23
(9296270f). Creating a task is ADMIN_ROLES only and a step is a checkbox, so
the teachers who filed four of the five incident reports on record had no way
to file one. Pinned here: any staff member files, nobody else does, the report
goes only to the school's own front office, only the school's own students can
be named on it, and what lands is ONE task with the answers as labelled lines.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_incident_report_service as incidents
from services import sis_onboarding_service as onboarding

ORG = 'org-icreate'
OTHER_ORG = 'org-elsewhere'
REPORTER = 'test-user-123'          # what mock_verify_token signs in as
KATRINE = 'coord-katrine'
ADMIN = 'admin-molly'
TEACHER2 = 'teacher-2'
CAMERON = 'student-cameron'
CLARK = 'student-clark'
FOREIGN_KID = 'student-elsewhere'
FOREIGN_COORD = 'coord-elsewhere'

USERS = {
    REPORTER: {'id': REPORTER, 'organization_id': ORG, 'role': 'org_managed',
               'org_role': 'advisor', 'org_roles': ['advisor'],
               'first_name': 'Jamie', 'last_name': 'Teacher', 'email': 'jamie@example.com'},
    KATRINE: {'id': KATRINE, 'organization_id': ORG, 'role': 'org_managed',
              'org_role': 'campus_coordinator', 'org_roles': ['campus_coordinator'],
              'first_name': 'Katrine', 'last_name': 'Myers', 'email': 'katrine@example.com'},
    ADMIN: {'id': ADMIN, 'organization_id': ORG, 'role': 'org_managed',
            'org_role': 'org_admin', 'org_roles': ['org_admin'],
            'first_name': 'Molly', 'last_name': 'Christensen', 'email': 'molly@example.com'},
    TEACHER2: {'id': TEACHER2, 'organization_id': ORG, 'role': 'org_managed',
               'org_role': 'advisor', 'org_roles': ['advisor'],
               'first_name': 'Other', 'last_name': 'Teacher', 'email': 't2@example.com'},
    CAMERON: {'id': CAMERON, 'organization_id': ORG, 'role': 'org_managed',
              'org_role': 'student', 'org_roles': ['student'],
              'first_name': 'Cameron', 'last_name': 'Stobbe', 'email': 'cam@example.com'},
    CLARK: {'id': CLARK, 'organization_id': ORG, 'role': 'student',
            'org_role': None, 'org_roles': None,
            'first_name': 'Clark', 'last_name': 'Bailey', 'email': 'clark@example.com'},
    FOREIGN_KID: {'id': FOREIGN_KID, 'organization_id': OTHER_ORG, 'role': 'org_managed',
                  'org_role': 'student', 'org_roles': ['student'],
                  'first_name': 'Far', 'last_name': 'Away', 'email': 'far@example.com'},
    FOREIGN_COORD: {'id': FOREIGN_COORD, 'organization_id': OTHER_ORG, 'role': 'org_managed',
                    'org_role': 'campus_coordinator', 'org_roles': ['campus_coordinator'],
                    'first_name': 'Else', 'last_name': 'Where', 'email': 'else@example.com'},
}

GOOD = {
    'student_ids': [CAMERON],
    'occurred_at': '2026-09-24T10:30',
    'location': 'The big glass doors',
    'what_happened': 'Cameron got his finger smashed in the big glass doors.',
    'injury': 'Right index finger, bruised',
    'response': 'Ice pack and a popsicle',
    'parent_notified': 'yes',
    'parent_notified_detail': 'Called his mom at 10:45',
    'witnesses': 'Clark Bailey',
    'recipient_id': KATRINE,
}


def _fake_users(ids):
    return {i: USERS[i] for i in ids if i in USERS}


def _db():
    """An admin client whose inserts are recorded; every read is empty."""
    inserted = []

    def _table(name):
        t = Mock()
        for meth in ('select', 'eq', 'in_', 'order', 'limit'):
            getattr(t, meth).return_value = t
        t.execute.return_value = Mock(data=[])

        def _insert(row):
            inserted.append((name, row))
            ins = Mock()
            ins.execute.return_value = Mock(data=[{**row, 'id': f'task-{len(inserted)}'}])
            return ins
        t.insert.side_effect = _insert
        return t

    admin = Mock()
    admin.table.side_effect = _table
    return admin, inserted


def _file(data, stored_default=None, reporter=REPORTER):
    """file_report with the database stubbed. Returns (result, inserted, notify, email)."""
    admin, inserted = _db()
    with patch.object(incidents, '_users', side_effect=_fake_users), \
         patch.object(incidents, 'stored_default', return_value=stored_default), \
         patch.object(onboarding, '_admin', return_value=admin), \
         patch.object(onboarding, 'assert_recipients_in_org') as in_org, \
         patch.object(onboarding, 'email_assignment') as email, \
         patch.object(onboarding.sis_access_gate, 'clear_cache'), \
         patch.object(onboarding.sis_notifications, 'notify') as notify:
        result = incidents.file_report(ORG, reporter, data)
    notify.in_org = in_org
    return result, [row for name, row in inserted if name == 'sis_onboarding_assignments'], notify, email


# ── The task it writes ───────────────────────────────────────────────────────

@pytest.mark.unit
class TestTheTaskItWrites:
    def test_one_task_for_the_office_person_assigned_by_the_reporter(self):
        """The ticket's report, filed by a teacher, lands on Katrine."""
        result, rows, notify, email = _file(GOOD)
        assert 'error' not in result
        assert len(rows) == 1
        row = rows[0]
        assert row['organization_id'] == ORG
        assert row['user_id'] == KATRINE
        assert row['assigned_by'] == REPORTER
        assert row['audience'] == 'staff' and row['kind'] == 'task'
        assert row['template_name'] == 'Incident report: Cameron Stobbe'
        assert result['task']['title'] == 'Incident report: Cameron Stobbe'
        assert result['recipient_name'] == 'Katrine Myers'

    def test_the_answers_are_labelled_lines_in_the_description(self):
        """Same "Label: value" style as the release migration's migrated
        reports (Where:, When:, About:)."""
        _, rows, _, _ = _file(GOOD)
        lines = rows[0]['description'].split('\n\n')
        assert lines == [
            'What happened: Cameron got his finger smashed in the big glass doors.',
            'About: Cameron Stobbe',
            'When: Thu Sep 24, 2026, 10:30 AM',
            'Where: The big glass doors',
            'Injury: Right index finger, bruised',
            'First aid / response: Ice pack and a popsicle',
            'Parent/guardian notified: Yes -- Called his mom at 10:45',
            'Witnesses: Clark Bailey',
            'Reported by: Jamie Teacher',
        ]

    def test_blank_optional_answers_leave_no_empty_label(self):
        _, rows, _, _ = _file({'what_happened': 'Scratch on the playground',
                               'occurred_at': '2026-09-24T14:05', 'recipient_id': KATRINE})
        desc = rows[0]['description']
        assert rows[0]['template_name'] == 'Incident report'
        for label in ('Injury:', 'Witnesses:', 'About:', 'Where:', 'Parent/guardian notified:'):
            assert label not in desc
        assert 'When: Thu Sep 24, 2026, 2:05 PM' in desc

    def test_several_students_are_all_named(self):
        _, rows, _, _ = _file({**GOOD, 'student_ids': [CAMERON, CLARK]})
        assert rows[0]['template_name'] == 'Incident report: Cameron Stobbe, Clark Bailey'
        assert 'About: Cameron Stobbe, Clark Bailey' in rows[0]['description']

    def test_the_assignee_gets_the_normal_task_notification(self):
        """No new pipeline: assign_task's own notice and email."""
        _, _, notify, email = _file(GOOD)
        assert notify.call_args.args[0] == KATRINE
        assert notify.call_args.args[1] == 'New task'
        assert notify.call_args.kwargs['link'].startswith('/tasks?task=')
        email.assert_called_once()
        assert email.call_args.args[0] == KATRINE

    def test_markup_is_stripped_and_line_breaks_kept(self):
        _, rows, _, _ = _file({**GOOD, 'what_happened': '<b>Line one</b>\n\n\n<i>Line</i>   two'})
        assert 'What happened: Line one\n\nLine two' in rows[0]['description']
        assert '<' not in rows[0]['description']


# ── What is refused, with nothing written ────────────────────────────────────

@pytest.mark.unit
class TestRefusals:
    def test_missing_what_happened_is_refused(self):
        result, rows, notify, _ = _file({**GOOD, 'what_happened': '   '})
        assert result['status'] == 400 and 'what happened' in result['error'].lower()
        assert rows == [] and not notify.called

    def test_missing_or_garbled_time_is_refused(self):
        for bad in ('', 'yesterday'):
            result, rows, _, _ = _file({**GOOD, 'occurred_at': bad})
            assert result['status'] == 400 and rows == []

    def test_a_recipient_from_another_school_is_refused(self):
        result, rows, notify, _ = _file({**GOOD, 'recipient_id': FOREIGN_COORD})
        assert result['status'] == 400 and rows == [] and not notify.called

    def test_a_teacher_is_not_a_recipient(self):
        """Reports go to the front office, not to another teacher."""
        result, rows, _, _ = _file({**GOOD, 'recipient_id': TEACHER2})
        assert result['status'] == 400 and rows == []

    def test_a_student_from_another_school_is_refused(self):
        result, rows, notify, _ = _file({**GOOD, 'student_ids': [CAMERON, FOREIGN_KID]})
        assert result['status'] == 400 and 'student' in result['error']
        assert rows == [] and not notify.called

    def test_a_staff_member_is_not_a_student(self):
        result, rows, _, _ = _file({**GOOD, 'student_ids': [TEACHER2]})
        assert result['status'] == 400 and rows == []


# ── The school's default office person ───────────────────────────────────────

@pytest.mark.unit
class TestDefaultRecipient:
    def test_the_setting_is_used_when_no_recipient_is_passed(self):
        data = {k: v for k, v in GOOD.items() if k != 'recipient_id'}
        result, rows, _, _ = _file(data, stored_default=ADMIN)
        assert 'error' not in result
        assert rows[0]['user_id'] == ADMIN

    def test_a_recipient_on_the_form_beats_the_setting(self):
        _, rows, _, _ = _file(GOOD, stored_default=ADMIN)
        assert rows[0]['user_id'] == KATRINE

    def test_with_no_setting_the_reporter_must_pick(self):
        data = {k: v for k, v in GOOD.items() if k != 'recipient_id'}
        result, rows, _, _ = _file(data, stored_default=None)
        assert result['status'] == 400 and 'office' in result['error']
        assert rows == []

    def test_a_stale_setting_is_no_default(self):
        """A default who has since become a teacher is not handed reports."""
        data = {k: v for k, v in GOOD.items() if k != 'recipient_id'}
        result, rows, _, _ = _file(data, stored_default=TEACHER2)
        assert result['status'] == 400 and rows == []

    def test_form_options_offer_the_office_and_the_default(self):
        staff = [
            {'id': ADMIN, 'name': 'Molly Christensen', 'roles': ['org_admin'], 'is_placeholder': False},
            {'id': KATRINE, 'name': 'Katrine Myers', 'roles': ['campus_coordinator'], 'is_placeholder': False},
            {'id': TEACHER2, 'name': 'Other Teacher', 'roles': ['advisor'], 'is_placeholder': False},
            {'id': 'ph', 'name': 'Placeholder', 'roles': ['org_admin'], 'is_placeholder': True},
        ]
        with patch.object(incidents.sis_service, 'list_org_staff', return_value=staff), \
             patch.object(incidents, 'stored_default', return_value=KATRINE), \
             patch.object(incidents.onboarding, 'list_recipients',
                          return_value=[{'id': CAMERON, 'name': 'Cameron Stobbe'}]) as students:
            out = incidents.form_options(ORG)
        assert [p['id'] for p in out['recipients']] == [KATRINE, ADMIN]
        assert out['recipients'][0]['role_labels'] == ['Campus Coordinator']
        assert out['default_recipient_id'] == KATRINE
        assert out['students'] == [{'id': CAMERON, 'name': 'Cameron Stobbe'}]
        students.assert_called_once_with(ORG, 'student')


# ── The routes: who may file ─────────────────────────────────────────────────

def _role_client(role, org_role=None):
    """An admin client that answers require_role's users read."""
    admin = Mock()
    table = Mock()
    admin.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'in_'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'role': role, 'org_role': org_role, 'org_roles': [org_role] if org_role else None}])
    return admin


def _post(client, headers, role, org_role=None, body=None):
    with patch('database.get_supabase_admin_client', return_value=_role_client(role, org_role)), \
         patch('modules.gate.check_module', return_value=None), \
         patch('services.sis_service.resolve_org_id', return_value=ORG), \
         patch.object(incidents, 'file_report',
                      wraps=lambda org, uid, data: {'task': {'id': 't1'}, 'recipient_name': 'K'}) as filed:
        resp = client.post('/api/sis/incident-reports', json=body or GOOD, headers=headers)
    return resp, filed


@pytest.mark.unit
class TestWhoMayFile:
    def test_a_teacher_can_file(self, client, auth_headers, mock_verify_token):
        resp, filed = _post(client, auth_headers, 'org_managed', 'advisor')
        assert resp.status_code == 201
        assert resp.get_json()['task']['id'] == 't1'
        assert filed.call_args.args[:2] == (ORG, REPORTER)

    def test_a_coordinator_can_file(self, client, auth_headers, mock_verify_token):
        resp, _ = _post(client, auth_headers, 'org_managed', 'campus_coordinator')
        assert resp.status_code == 201

    def test_a_student_is_refused_and_nothing_is_written(self, client, auth_headers, mock_verify_token):
        resp, filed = _post(client, auth_headers, 'student')
        assert resp.status_code == 403
        filed.assert_not_called()

    def test_a_parent_is_refused_and_nothing_is_written(self, client, auth_headers, mock_verify_token):
        resp, filed = _post(client, auth_headers, 'parent')
        assert resp.status_code == 403
        filed.assert_not_called()

    def test_the_reports_i_filed_are_mine_only(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client',
                   return_value=_role_client('org_managed', 'advisor')), \
             patch('modules.gate.check_module', return_value=None), \
             patch('services.sis_service.resolve_org_id', return_value=ORG), \
             patch.object(incidents, 'filed_by', return_value=[{'id': 't1'}]) as mine:
            resp = client.get('/api/sis/incident-reports/mine', headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()['reports'] == [{'id': 't1'}]
        mine.assert_called_once_with(ORG, REPORTER)


# ── The setting ──────────────────────────────────────────────────────────────

def _patch_settings(client, headers, role, org_role, recipient):
    with patch('database.get_supabase_admin_client', return_value=_role_client(role, org_role)), \
         patch('modules.gate.check_module', return_value=None), \
         patch('services.sis_service.resolve_org_id', return_value=ORG), \
         patch('services.sis_service.get_user_org_context', return_value={'role': role}), \
         patch('services.sis_service.caller_sees_pay', return_value=True), \
         patch.object(incidents, '_users', side_effect=_fake_users), \
         patch('routes.sis.settings.patch_feature_flags',
               side_effect=lambda org, patch_, **kw: {'sis_settings': patch_['sis_settings']}) as saved:
        resp = client.patch('/api/sis/settings', headers=headers,
                            json={'sis_settings': {incidents.SETTING_KEY: recipient}})
    return resp, saved


@pytest.mark.unit
class TestTheSetting:
    def test_an_admin_saves_the_default_office_person(self, client, auth_headers, mock_verify_token):
        resp, saved = _patch_settings(client, auth_headers, 'org_managed', 'org_admin', KATRINE)
        assert resp.status_code == 200
        assert resp.get_json()['feature_flags']['sis_settings'][incidents.SETTING_KEY] == KATRINE
        assert saved.call_args.args[1] == {'sis_settings': {incidents.SETTING_KEY: KATRINE}}

    def test_clearing_it_is_allowed(self, client, auth_headers, mock_verify_token):
        resp, saved = _patch_settings(client, auth_headers, 'org_managed', 'org_admin', None)
        assert resp.status_code == 200
        saved.assert_called_once()

    def test_a_teacher_cannot_set_it(self, client, auth_headers, mock_verify_token):
        resp, saved = _patch_settings(client, auth_headers, 'org_managed', 'advisor', KATRINE)
        assert resp.status_code == 403
        saved.assert_not_called()

    def test_the_default_must_be_this_schools_front_office(self, client, auth_headers, mock_verify_token):
        for bad in (TEACHER2, FOREIGN_COORD, 'nobody'):
            resp, saved = _patch_settings(client, auth_headers, 'org_managed', 'org_admin', bad)
            assert resp.status_code == 400
            saved.assert_not_called()

    def test_the_stored_default_is_read_back(self):
        org = {'feature_flags': {'sis_settings': {incidents.SETTING_KEY: KATRINE}}}
        repo = Mock()
        repo.find_by_id.return_value = org
        with patch('repositories.organization_repository.OrganizationRepository', return_value=repo), \
             patch.object(incidents, '_admin'), \
             patch.object(incidents, '_users', side_effect=_fake_users):
            assert incidents.stored_default(ORG) == KATRINE
            assert incidents.default_recipient_id(ORG) == KATRINE


# ── Found again later ────────────────────────────────────────────────────────

@pytest.mark.unit
def test_filed_by_reads_the_reporters_incident_tasks():
    rows = [{'id': 't1', 'organization_id': ORG, 'user_id': KATRINE, 'assigned_by': REPORTER,
             'template_name': 'Incident report: Cameron Stobbe', 'audience': 'staff',
             'kind': 'task', 'status': 'in_progress', 'items': [{'key': 'i', 'title': 'x',
                                                                  'status': 'pending'}]}]
    repo = Mock()
    repo.filed_by.return_value = rows
    with patch('repositories.sis_task_repository.SisTaskRepository', return_value=repo), \
         patch.object(incidents, '_admin'), \
         patch.object(incidents, '_users', side_effect=_fake_users):
        out = incidents.filed_by(ORG, REPORTER)
    repo.filed_by.assert_called_once_with(ORG, REPORTER, 'Incident report')
    assert out[0]['title'] == 'Incident report: Cameron Stobbe'
    assert out[0]['user_name'] == 'Katrine Myers'
    assert out[0]['assigned_by_name'] == 'Jamie Teacher'
