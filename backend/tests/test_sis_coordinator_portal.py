"""
The campus coordinator portal build (iCreate requirements, 2026-08-09 —
docs/icreate/CAMPUS_COORDINATOR_PORTAL_GAP_ANALYSIS_2026-08-09.md).

Three systems under test:

1. Role-scoped visibility — resources and training rows can carry
   `visible_to_roles`; non-admin staff only see rows that target a role they
   hold (NULL targets everyone). Admins and superadmins always see everything,
   because they manage the content.

2. Attendance accountability — marking a student absent with no guardian
   report creates an open 'unaccounted' alert ("student not accounted for")
   and notifies the front office; a guardian-reported absence stays quiet.
   Resolving an alert records what actually happened, and the two resolutions
   that contradict the roll (late, mismarked) correct it.

3. The internal task system — sis_form_submissions grows priority, due date,
   working statuses, assignment with notification, and comments.
"""

from unittest.mock import Mock, patch

import pytest


ORG = 'org-1'


def _stub_client(responses):
    """Admin client stub: one shared table mock; each .execute() pops the next
    scripted response (mirrors test_sis_teacher_onboarding)."""
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'neq', 'limit', 'update', 'delete', 'insert',
                    'upsert', 'in_', 'order', 'is_', 'not_', 'contains'):
        getattr(table, chained).return_value = table
    table.execute.side_effect = [Mock(data=d) for d in responses] + [Mock(data=[])] * 20
    return client, table


# ── 1. Role-scoped visibility ────────────────────────────────────────────────

@pytest.mark.unit
class TestRoleVisibility:
    ROWS = [
        {'id': 'r1', 'title': 'Everyone', 'visible_to_roles': None},
        {'id': 'r2', 'title': 'Coordinators only',
         'visible_to_roles': ['campus_coordinator']},
        {'id': 'r3', 'title': 'Teachers only', 'visible_to_roles': ['advisor']},
        {'id': 'r4', 'title': 'Office', 'visible_to_roles': ['org_admin', 'campus_coordinator']},
    ]

    def _filter(self, ctx, rows=None):
        from services import sis_service
        with patch('services.sis_service.get_user_org_context', return_value=ctx):
            return [r['id'] for r in
                    sis_service.filter_role_visible('u1', list(rows or self.ROWS))]

    def test_a_teacher_sees_untargeted_and_teacher_rows_only(self):
        ctx = {'role': 'org_managed', 'org_roles': ['advisor']}
        assert self._filter(ctx) == ['r1', 'r3']

    def test_an_admin_sees_everything(self):
        ctx = {'role': 'org_managed', 'org_roles': ['org_admin']}
        assert self._filter(ctx) == ['r1', 'r2', 'r3', 'r4']

    def test_a_coordinator_sees_everything_too(self):
        """Coordinators manage the library (ADMIN_ROLES) — hiding rows from the
        person who curates them would just make the admin list lie."""
        ctx = {'role': 'org_managed', 'org_roles': ['campus_coordinator']}
        assert self._filter(ctx) == ['r1', 'r2', 'r3', 'r4']

    def test_a_superadmin_sees_everything(self):
        ctx = {'role': 'superadmin'}
        assert self._filter(ctx) == ['r1', 'r2', 'r3', 'r4']

    def test_the_valid_role_targets_are_the_staff_roles(self):
        from utils.sis_roles import TARGETABLE_STAFF_ROLES, clean_visible_roles
        assert set(TARGETABLE_STAFF_ROLES) == {'org_admin', 'campus_coordinator', 'advisor'}
        assert clean_visible_roles(None) == (None, None)
        assert clean_visible_roles([]) == (None, None)
        assert clean_visible_roles(['advisor', 'advisor']) == (['advisor'], None)
        roles, err = clean_visible_roles(['bananas'])
        assert roles is None and err

    def test_targeted_required_read_only_nags_the_targeted_roles(self):
        """A coordinator checklist must not nag every teacher to acknowledge it."""
        from routes.sis import resources as resources_route
        staff = [
            {'id': 't1', 'name': 'Teach', 'roles': ['advisor']},
            {'id': 'cc1', 'name': 'Kate', 'roles': ['campus_coordinator']},
        ]
        notified = []
        with patch('services.sis_service.list_org_staff', return_value=staff), \
             patch('services.sis_notifications.notify',
                   side_effect=lambda uid, *a, **k: notified.append(uid)):
            resources_route._notify_staff_required_read(
                ORG, 'Opening checklist', visible_to_roles=['campus_coordinator'])
        assert notified == ['cc1']


# ── 2. Attendance accountability ─────────────────────────────────────────────

@pytest.mark.unit
class TestUnaccountedAlerts:
    def _record(self, *, prior, planned_covered, entries):
        from services import sis_attendance_service as att
        client, table = _stub_client([prior, [{}]])  # prior select, upsert
        alerts_created = []
        notified = []

        def _capture_alerts(org_id, class_id, on_date, student_ids):
            alerts_created.extend(student_ids)
            return len(student_ids)

        with patch('services.sis_attendance_service._admin',
                   return_value=client), \
             patch('services.sis_planned_absence_service.for_class_date',
                   return_value=planned_covered), \
             patch('services.sis_attendance_service._record_unaccounted',
                   side_effect=_capture_alerts), \
             patch('services.sis_attendance_service._notify_admins_of_absences',
                   side_effect=lambda o, c, d, ids: notified.extend(ids) or len(ids)):
            att.record(ORG, 'c1', '2026-08-10', entries, recorded_by='t1')
        return alerts_created, notified

    def test_an_unexcused_absence_raises_an_alert_and_notifies(self):
        alerts, notified = self._record(
            prior=[], planned_covered={},
            entries=[{'student_user_id': 's1', 'status': 'absent'}])
        assert alerts == ['s1']
        assert notified == ['s1']

    def test_a_guardian_reported_absence_stays_quiet(self):
        """iCreate: "If the student has already been excused: no alert." """
        alerts, notified = self._record(
            prior=[], planned_covered={'s1': {'scope': 'day'}},
            entries=[{'student_user_id': 's1', 'status': 'absent'}])
        assert alerts == []
        assert notified == []

    def test_an_excused_mark_never_alerts(self):
        alerts, notified = self._record(
            prior=[], planned_covered={},
            entries=[{'student_user_id': 's1', 'status': 'excused'}])
        assert alerts == []
        assert notified == []

    def test_a_re_save_does_not_re_alert(self):
        alerts, notified = self._record(
            prior=[{'student_user_id': 's1', 'status': 'absent'}], planned_covered={},
            entries=[{'student_user_id': 's1', 'status': 'absent'}])
        assert alerts == []


@pytest.mark.unit
class TestAlertResolution:
    ALERT = {'id': 'a1', 'organization_id': ORG, 'student_user_id': 's1',
             'class_id': 'c1', 'date': '2026-08-10', 'alert_type': 'unaccounted',
             'status': 'open'}

    def _resolve(self, resolution, responses=None):
        from services import sis_attendance_service as att
        client, table = _stub_client(responses if responses is not None
                                     else [[self.ALERT], [dict(self.ALERT, status='resolved')], [{}]])
        with patch('services.sis_attendance_service._admin',
                   return_value=client):
            result = att.resolve_alert(ORG, 'a1', resolution, 'note', actor_id='cc1')
        return result, table

    def test_resolving_records_the_outcome(self):
        result, table = self._resolve('elsewhere_on_campus')
        assert not result.get('error')
        fields = table.update.call_args_list[0][0][0]
        assert fields['status'] == 'resolved'
        assert fields['resolution'] == 'elsewhere_on_campus'
        assert fields['resolved_by'] == 'cc1'

    def test_late_resolution_corrects_the_roll(self):
        """"Actually they were late" must fix the attendance record too — a
        resolved alert over a wrong roll would keep the daily report wrong."""
        _result, table = self._resolve('late')
        updates = [c[0][0] for c in table.update.call_args_list]
        assert any(u.get('status') == 'late' for u in updates)

    def test_mismarked_resolution_flips_the_roll_to_present(self):
        _result, table = self._resolve('mismarked')
        updates = [c[0][0] for c in table.update.call_args_list]
        assert any(u.get('status') == 'present' for u in updates)

    def test_an_unknown_resolution_is_rejected(self):
        from services import sis_attendance_service as att
        result = att.resolve_alert(ORG, 'a1', 'vanished', None, actor_id='cc1')
        assert result.get('error')

    def test_alert_routes_are_admin_gated(self):
        import inspect
        from routes.sis import attendance as attendance_route
        src = inspect.getsource(attendance_route)
        assert 'def attendance_alerts(' in src
        assert 'def resolve_attendance_alert(' in src
        for view in ('attendance_alerts', 'resolve_attendance_alert'):
            lines = src.split('\n')
            for i, line in enumerate(lines):
                if line.startswith(f'def {view}('):
                    decorators = '\n'.join(lines[max(0, i - 4):i])
                    assert 'ADMIN_ROLES' in decorators, view


# ── 3. The internal task system ──────────────────────────────────────────────

@pytest.mark.unit
class TestMyTasksAreTasks:
    """The coordinator's My tasks card read the request queue until requests
    became tasks (iCreate meeting 2026-09-23). It reads the same list My
    tasks shows now; the task behaviour itself is covered in
    test_sis_task_center.py."""

    def test_the_dashboard_reads_the_task_list(self):
        from services import sis_coordinator_service as coordinator
        with patch('services.sis_tasks_service.open_tasks_for',
                   return_value=[{'id': 't1', 'title': 'Printer in Room 3'}]) as mine:
            out = coordinator._my_open_tasks(ORG, 'me')
        mine.assert_called_once_with(ORG, 'me')
        assert out == [{'id': 't1', 'title': 'Printer in Room 3'}]


# ── Coordinator dashboard ────────────────────────────────────────────────────

@pytest.mark.unit
class TestCoordinatorDashboard:
    def test_quick_links_filter_by_role(self):
        from services.sis_coordinator_service import filter_quick_links
        links = [
            {'label': 'Opening checklist', 'url': '/resources', 'roles': ['campus_coordinator']},
            {'label': 'Billing', 'url': '/billing', 'roles': ['org_admin']},
            {'label': 'Calendar', 'url': '/calendar'},
        ]
        cc = [l['label'] for l in filter_quick_links(links, ['campus_coordinator'])]
        assert cc == ['Opening checklist', 'Calendar']
        admin = [l['label'] for l in filter_quick_links(links, ['org_admin'])]
        assert admin == ['Billing', 'Calendar']

    def test_malformed_quick_links_are_dropped(self):
        from services.sis_coordinator_service import filter_quick_links
        links = [{'label': 'No url'}, {'url': '/x'}, 'not-a-dict',
                 {'label': 'Ok', 'url': '/ok'}]
        assert [l['label'] for l in filter_quick_links(links, ['advisor'])] == ['Ok']

    def test_the_attendance_board_math(self):
        from services.sis_coordinator_service import board_from
        records = [
            {'status': 'present'}, {'status': 'present'}, {'status': 'absent'},
            {'status': 'late'}, {'status': 'excused'},
        ]
        board = board_from(records, reported_out=2, open_alerts=[{'id': 'a1'}])
        assert board['recorded'] == {'present': 2, 'absent': 1, 'late': 1, 'excused': 1}
        assert board['reported_out'] == 2
        assert board['open_alert_count'] == 1

    def test_the_dashboard_route_is_admin_gated(self):
        import inspect
        from routes.sis import coordinator as coordinator_route
        src = inspect.getsource(coordinator_route)
        lines = src.split('\n')
        for i, line in enumerate(lines):
            if line.startswith('def coordinator_dashboard('):
                decorators = '\n'.join(lines[max(0, i - 4):i])
                assert 'ADMIN_ROLES' in decorators
                return
        raise AssertionError('coordinator_dashboard view not found')
