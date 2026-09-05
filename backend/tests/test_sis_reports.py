"""
Unit tests for SIS reports: pure aggregators + route gating.
"""

import json
from contextlib import contextmanager
from datetime import date
from unittest.mock import Mock, patch

import pytest

from services import sis_reports_service as reports


class TestAggregators:
    def test_revenue(self):
        invoices = [
            {'status': 'paid', 'total_cents': 10000, 'amount_paid_cents': 10000},
            {'status': 'partial', 'total_cents': 8000, 'amount_paid_cents': 3000},
            {'status': 'sent', 'total_cents': 5000, 'amount_paid_cents': 0},
        ]
        out = reports.aggregate_revenue(invoices)
        assert out['invoice_count'] == 3
        assert out['billed_cents'] == 23000
        assert out['collected_cents'] == 13000
        assert out['outstanding_cents'] == 10000
        assert out['by_status'] == {'paid': 1, 'partial': 1, 'sent': 1}

    def test_revenue_empty(self):
        out = reports.aggregate_revenue([])
        assert out['billed_cents'] == 0
        assert out['outstanding_cents'] == 0

    def test_enrollment(self):
        rows = [{'status': 'enrolled'}, {'status': 'enrolled'}, {'status': 'applicant'}]
        out = reports.aggregate_enrollment(rows)
        assert out['total'] == 3
        assert out['by_status'] == {'enrolled': 2, 'applicant': 1}


class TestStudentsInClasses:
    """iCreate, 2026-08-18: "we have 7 students and 1 enrolled ... this is
    incorrect of course."

    Both numbers came off school_enrollments — 7 rows, 4 withdrawn and 2
    graduated — while 188 children sat in their classes. This is the count that
    answers the question they were actually asking, and the thing it must get
    right is that a child in four classes is one student.
    """

    def _paged(self, classes, enrollments):
        """Patch fetch_all_rows to answer the two reads in call order."""
        answers = iter([classes, enrollments])
        return patch('services.sis_reports_service.fetch_all_rows',
                     side_effect=lambda *a, **k: next(answers))

    def test_a_student_in_several_classes_counts_once(self):
        with self._paged(
            [{'id': 'c1'}, {'id': 'c2'}],
            [{'id': 'e1', 'student_id': 's1'}, {'id': 'e2', 'student_id': 's1'},
             {'id': 'e3', 'student_id': 's2'}],
        ):
            assert reports.students_in_classes('org-1') == 2

    def test_no_classes_short_circuits_before_the_enrollment_read(self):
        """An empty `in_` list matches everything in PostgREST, so this must
        not fall through to a query that would count the whole table."""
        with patch('services.sis_reports_service.fetch_all_rows', return_value=[]) as f:
            assert reports.students_in_classes('org-1') == 0
            assert f.call_count == 1

    def test_a_row_with_no_student_is_not_counted(self):
        with self._paged([{'id': 'c1'}], [{'id': 'e1', 'student_id': None}]):
            assert reports.students_in_classes('org-1') == 0


@pytest.mark.unit
class TestPaymentsReport:
    """iCreate, 2026-08-20: "is there a way to do a report on method of payment?"

    The method has been on every payment row since the ledger existed; nothing
    read it back except one invoice at a time.
    """

    PAYMENTS = [
        {'id': 'p1', 'invoice_id': 'i1', 'amount_cents': 73000, 'method': 'scholarship',
         'external_ref': None, 'note': 'Board approved', 'recorded_at': '2026-08-12T10:00:00Z',
         'recorded_by': 'molly'},
        {'id': 'p2', 'invoice_id': 'i2', 'amount_cents': 36500, 'method': 'check',
         'external_ref': '1042', 'note': None, 'recorded_at': '2026-08-14T10:00:00Z',
         'recorded_by': 'molly'},
        {'id': 'p3', 'invoice_id': 'i2', 'amount_cents': 36500, 'method': None,
         'external_ref': None, 'note': None, 'recorded_at': '2026-08-15T10:00:00Z',
         'recorded_by': None},
    ]
    INVOICES = [
        {'id': 'i1', 'invoice_number': 'INV-1', 'household_id': 'h1',
         'student_user_id': 's1', 'due_date': '2026-08-01'},
        {'id': 'i2', 'invoice_number': 'INV-2', 'household_id': 'h2',
         'student_user_id': None, 'due_date': '2026-08-01'},
    ]

    def _report(self, payments=None):
        pages = {
            'sis_payment_records': payments if payments is not None else self.PAYMENTS,
            'sis_invoices': self.INVOICES,
            'households': [{'id': 'h1', 'name': 'Swenson'}, {'id': 'h2', 'name': 'Candland'}],
            'users': [{'id': 's1', 'first_name': 'Ryder', 'last_name': 'Swenson',
                       'display_name': None, 'email': None},
                      {'id': 'molly', 'first_name': 'Molly', 'last_name': 'C',
                       'display_name': 'Molly', 'email': None}],
        }
        # fetch_all_rows is handed a builder; the table it was built from is what
        # decides which page comes back.
        def fake_fetch(builder):
            probe = Mock()
            table_name = {'holder': None}

            def _table(name):
                table_name['holder'] = name
                t = Mock()
                for chained in ('select', 'eq', 'in_', 'order', 'limit'):
                    getattr(t, chained).return_value = t
                return t
            probe.table.side_effect = _table
            with patch('services.sis_reports_service._admin', return_value=probe):
                builder()
            return pages.get(table_name['holder'], [])

        with patch('services.sis_reports_service.fetch_all_rows', side_effect=fake_fetch):
            return reports.payments_report('org-1')

    def test_no_payments_is_an_empty_report_not_an_error(self):
        assert self._report(payments=[])['rows'] == []

    def test_every_payment_is_a_row_newest_first(self):
        rows = self._report()['rows']
        assert [r['recorded_at'] for r in rows] == ['2026-08-15', '2026-08-14', '2026-08-12']

    def test_a_row_carries_the_family_the_invoice_and_the_method(self):
        row = next(r for r in self._report()['rows'] if r['invoice'] == 'INV-1')
        assert row['family'] == 'Swenson'
        assert row['student'] == 'Ryder Swenson'
        assert row['method'] == 'Scholarship'
        assert row['amount'] == '$730.00'
        assert row['recorded_by'] == 'Molly C'

    def test_a_payment_with_no_method_says_so_rather_than_going_blank(self):
        """Blank would read as a missing row; it is a payment nobody labelled."""
        assert any(r['method'] == 'Not recorded' for r in self._report()['rows'])

    def test_the_split_by_method_is_the_point_of_the_report(self):
        totals = {t['method']: t for t in self._report()['totals']}
        assert totals['Scholarship']['cents'] == 73000
        assert totals['Check']['count'] == 1
        # Biggest first: the answer to "where is the money coming from".
        assert self._report()['totals'][0]['method'] == 'Scholarship'


def _admin_client_for_role(role, org_role=None):
    client = Mock()
    table = Mock()
    client.table.return_value = table
    for chained in ('select', 'eq', 'limit'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{
        'role': role, 'org_role': org_role,
        'org_roles': [org_role] if org_role else None,
    }])
    return client


@contextmanager
def staff(role='org_admin', org='org-1', org_role=None, sees_money=True):
    # caller_sees_pay reads the caller's org context from the database; the
    # class report asks it whether to include the price columns.
    with patch('database.get_supabase_admin_client',
               return_value=_admin_client_for_role(role, org_role)), \
         patch('services.sis_service.resolve_org_id', return_value=org), \
         patch('services.sis_service.caller_sees_pay', return_value=sees_money):
        yield


@pytest.mark.unit
class TestReportRoutes:
    def test_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/reports/revenue', headers=auth_headers)
        assert resp.status_code == 403

    def test_revenue_success(self, client, auth_headers, mock_verify_token):
        rpt = {'invoice_count': 1, 'billed_cents': 9000, 'collected_cents': 0, 'outstanding_cents': 9000, 'by_status': {'sent': 1}}
        with staff(), patch('routes.sis.reports.reports.revenue_report', return_value=rpt):
            resp = client.get('/api/sis/reports/revenue?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['report']['outstanding_cents'] == 9000

    def test_payments_are_refused_to_a_campus_coordinator(self, client, auth_headers, mock_verify_token):
        """Same tier as revenue, for the same reason: it is the money."""
        with staff(role='org_managed', org_role='campus_coordinator'):
            resp = client.get('/api/sis/reports/payments?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 403

    def test_payments_success(self, client, auth_headers, mock_verify_token):
        rpt = {'rows': [{'method': 'Check', 'amount': '$365.00'}],
               'totals': [{'method': 'Check', 'count': 1, 'cents': 36500, 'amount': '$365.00'}],
               'total_cents': 36500}
        with staff(), patch('routes.sis.reports.reports.payments_report', return_value=rpt):
            resp = client.get('/api/sis/reports/payments?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['report']['total_cents'] == 36500

    def test_payments_csv_carries_the_same_rows(self, client, auth_headers, mock_verify_token):
        rpt = {'rows': [{'recorded_at': '2026-08-14', 'family': 'Candland', 'student': '',
                         'invoice': 'INV-2', 'method': 'Check', 'amount': '$365.00',
                         'reference': '1042', 'note': '', 'recorded_by': 'Molly'}],
               'totals': [], 'total_cents': 36500}
        with staff(), patch('routes.sis.reports.reports.payments_report', return_value=rpt):
            resp = client.get('/api/sis/reports/payments?organization_id=org-1&format=csv',
                              headers=auth_headers)
        assert resp.status_code == 200
        body = resp.data.decode()
        assert 'Method' in body and 'Check' in body and '1042' in body

    def test_revenue_is_refused_to_a_campus_coordinator(self, client, auth_headers, mock_verify_token):
        """iCreate, 2026-08-21. The coordinator role is org_admin minus the
        money, and this route was on the admin tier — so the school's billed,
        collected and outstanding totals were theirs to read."""
        with staff(role='org_managed', org_role='campus_coordinator'):
            resp = client.get('/api/sis/reports/revenue?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 403

    def test_a_coordinator_still_gets_the_operational_reports(self, client, auth_headers, mock_verify_token):
        """The subtraction is financial, not scope-based: enrollment and
        attendance are how a coordinator runs the campus."""
        rpt = {'total': 3, 'by_status': {'enrolled': 3}, 'active_classes': 2}
        with staff(role='org_managed', org_role='campus_coordinator'), \
                patch('routes.sis.reports.reports.enrollment_report', return_value=rpt):
            resp = client.get('/api/sis/reports/enrollment?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200

    def test_enrollment_success(self, client, auth_headers, mock_verify_token):
        rpt = {'total': 3, 'by_status': {'enrolled': 3}, 'active_classes': 2}
        with staff(), patch('routes.sis.reports.reports.enrollment_report', return_value=rpt):
            resp = client.get('/api/sis/reports/enrollment?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['report']['total'] == 3

    def test_attendance_success(self, client, auth_headers, mock_verify_token):
        rpt = {'overall': {'attendance_rate': 0.9, 'counts': {}, 'total': 10}, 'per_class': []}
        with staff(), patch('routes.sis.reports.reports.attendance_report', return_value=rpt):
            resp = client.get('/api/sis/reports/attendance?organization_id=org-1', headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['report']['overall']['attendance_rate'] == 0.9


CLASSES = [
    {
        'id': 'c1', 'name': 'Pottery', 'description': 'Hand building and the wheel',
        'location': 'Studio A', 'price_cents': 24000, 'supply_fee': 35,
        'supply_budget_per_student': 12.5, 'min_age': 8, 'max_age': 12,
        'billing_type': 'flat', 'billing_cadence': 'semester',
        'capacity': 12, 'enrolled_count': 9, 'spots_left': 3, 'waitlist_count': 2,
        'status': 'active', 'registration_status': 'open', 'internal_notes': 'Kiln shared',
        'primary_instructor': {'id': 't1', 'name': 'Ruth Stewart'},
        'assistant_instructors': [{'id': 't2', 'name': 'Sam Aide'}],
        'meetings': [{'day_of_week': 3, 'start_time': '13:00:00', 'end_time': '14:30:00'},
                     {'day_of_week': 1, 'start_time': '09:00:00', 'end_time': '10:00:00'}],
    },
    {
        'id': 'c2', 'name': 'Choir', 'capacity': None, 'enrolled_count': 0,
        'status': 'active', 'registration_status': 'closed', 'meetings': [],
    },
]


class TestClassReportRows:
    def rows(self, curriculum=None, materials=None):
        return reports.build_class_rows(CLASSES, curriculum or {}, materials or {})

    def test_every_field_key_is_present(self):
        row = self.rows()[0]
        assert set(row) == set(reports.CLASS_REPORT_KEYS)

    def test_formats_schedule_money_and_people(self):
        # Sorted by name, so Choir comes first.
        choir, pottery = self.rows()
        assert choir['name'] == 'Choir'
        assert pottery['teacher'] == 'Ruth Stewart'
        assert pottery['assistants'] == 'Sam Aide'
        assert pottery['days'] == 'Mon Wed'            # day order, not entry order
        assert pottery['time'] == '9:00am-10:00am'
        assert pottery['ages'] == '8-12'
        assert pottery['tuition'] == '$240.00'         # cents
        assert pottery['supply_fee'] == '$35.00'       # dollars
        assert pottery['materials_allowance'] == '$12.50'
        assert pottery['billing'] == 'flat semester'
        assert pottery['registration'] == 'Open'
        assert pottery['room'] == 'Studio A'

    def test_missing_values_render_blank_not_none(self):
        choir = self.rows()[0]
        assert choir['teacher'] == ''
        assert choir['time'] == ''
        assert choir['tuition'] == ''
        assert choir['capacity'] == ''       # unlimited, not 0
        assert choir['enrolled'] == 0
        assert choir['registration'] == 'Closed'

    def test_curriculum_and_extra_materials(self):
        pottery = self.rows(curriculum={'c1': ['Clay 101']},
                            materials={'c1': ['Glaze guide', 'Supply list']})[1]
        assert pottery['curriculum_attached'] == 'Yes'
        assert pottery['curriculum'] == 'Clay 101'
        assert pottery['extra_materials'] == 'Glaze guide; Supply list'
        assert self.rows()[1]['curriculum_attached'] == 'No'

    def test_archived_class_reports_as_archived(self):
        row = reports.build_class_rows(
            [{'id': 'c3', 'name': 'Old', 'status': 'archived', 'registration_status': 'open'}], {}, {})[0]
        assert row['registration'] == 'Archived'


@pytest.mark.unit
class TestClassReportRoute:
    REPORT = {
        'fields': reports.CLASS_REPORT_FIELDS,
        'rows': reports.build_class_rows(CLASSES, {'c1': ['Clay 101']}, {}),
    }

    def test_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/reports/classes', headers=auth_headers)
        assert resp.status_code == 403

    def test_defaults_when_no_fields_asked_for(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.reports.reports.class_report', return_value=self.REPORT):
            resp = client.get('/api/sis/reports/classes?organization_id=org-1', headers=auth_headers)
        body = json.loads(resp.data)
        assert resp.status_code == 200
        assert body['report']['selected'] == reports.CLASS_REPORT_DEFAULTS
        # Every field comes back whatever the selection, so the UI can re-shape
        # the table without another round trip.
        assert set(body['report']['rows'][0]) == set(reports.CLASS_REPORT_KEYS)

    def test_selection_keeps_canonical_order_and_drops_unknown_keys(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.reports.reports.class_report', return_value=self.REPORT):
            resp = client.get('/api/sis/reports/classes?organization_id=org-1'
                              '&fields=tuition,nonsense,name', headers=auth_headers)
        assert json.loads(resp.data)['report']['selected'] == ['name', 'tuition']

    def test_csv_writes_the_selected_columns(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.reports.reports.class_report', return_value=self.REPORT):
            resp = client.get('/api/sis/reports/classes?organization_id=org-1'
                              '&fields=name,curriculum_attached&format=csv', headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers['Content-Disposition'] == 'attachment; filename=classes.csv'
        lines = resp.data.decode().strip().splitlines()
        assert lines[0] == 'Class,Curriculum attached?'
        assert lines[1] == 'Choir,No'
        assert lines[2] == 'Pottery,Yes'

    def test_include_archived_is_passed_through(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.reports.reports.class_report',
                            return_value=self.REPORT) as spy:
            client.get('/api/sis/reports/classes?organization_id=org-1&include_archived=true',
                       headers=auth_headers)
        spy.assert_called_once_with('org-1', include_archived=True, sees_money=True)


@pytest.mark.unit
class TestRosterReport:
    """iCreate asked for rosters-in-a-spreadsheet four separate times (Perch
    ff701e99, 0334366b, 90b91553, 00877fea). One class shipped on 2026-08-18;
    this is the rest — several classes in one sheet, waitlist optional.

    What is worth pinning: the report never silently returns a partial roster,
    and pulling health columns is audited the way opening the teacher roster is.
    """

    CLASSES = [{'id': 'c1', 'name': 'Pottery', 'primary_instructor': {'name': 'Ruth Stewart'}},
               {'id': 'c2', 'name': 'Guitar Jam', 'primary_instructor': None}]

    def _run(self, *, enrollments, waitlist=None, users=None, include_waitlist=False,
             fields=None, log=None):
        """Patch the paged reads in call order and run the report."""
        answers = [
            enrollments,
            *([waitlist or []] if include_waitlist else []),
            list((users or {}).values()),
            [],   # household_members (students)
        ]
        it = iter(answers)

        def _fetch(*a, **k):
            try:
                return next(it)
            except StopIteration:
                return []

        with patch('services.sis_catalog_service.list_classes', return_value=self.CLASSES), \
                patch('services.sis_reports_service.fetch_all_rows', side_effect=_fetch), \
                patch('services.sis_reports_service._org_today',
                      return_value=__import__('datetime').date(2026, 8, 19)), \
                patch('services.sis_reports_service._log_roster_access') as logger_mock:
            out = reports.roster_report('org-1', ['c1', 'c2'], accessor_id='admin-1',
                                        accessor_role='org_admin',
                                        include_waitlist=include_waitlist, fields=fields)
        if log is not None:
            log.append(logger_mock)
        return out

    def test_rows_from_several_classes_land_in_one_report(self):
        out = self._run(
            enrollments=[{'id': 'e1', 'class_id': 'c1', 'student_id': 's1', 'enrolled_at': '2026-08-01'},
                         {'id': 'e2', 'class_id': 'c2', 'student_id': 's2', 'enrolled_at': '2026-08-02'}],
            users={'s1': {'id': 's1', 'first_name': 'Nora', 'last_name': 'Candland'},
                   's2': {'id': 's2', 'first_name': 'Ryder', 'last_name': 'Swenson'}})
        assert [r['class_name'] for r in out['rows']] == ['Guitar Jam', 'Pottery']
        assert {r['name'] for r in out['rows']} == {'Nora Candland', 'Ryder Swenson'}
        assert all(r['status'] == 'Enrolled' for r in out['rows'])

    def test_a_student_in_two_classes_gets_a_row_in_each(self):
        """One row per student PER CLASS — this is a roster, not a headcount."""
        out = self._run(
            enrollments=[{'id': 'e1', 'class_id': 'c1', 'student_id': 's1', 'enrolled_at': None},
                         {'id': 'e2', 'class_id': 'c2', 'student_id': 's1', 'enrolled_at': None}],
            users={'s1': {'id': 's1', 'first_name': 'Nora', 'last_name': 'Candland'}})
        assert len(out['rows']) == 2

    def test_the_waitlist_is_left_out_unless_asked_for(self):
        out = self._run(
            enrollments=[{'id': 'e1', 'class_id': 'c1', 'student_id': 's1', 'enrolled_at': None}],
            waitlist=[{'id': 'w1', 'class_id': 'c1', 'student_user_id': 's2',
                       'status': 'waiting', 'created_at': '2026-08-05'}],
            users={'s1': {'id': 's1', 'first_name': 'Nora', 'last_name': 'Candland'}})
        assert len(out['rows']) == 1

    def test_waitlisted_students_are_labelled_not_mixed_in(self):
        out = self._run(
            include_waitlist=True,
            enrollments=[{'id': 'e1', 'class_id': 'c1', 'student_id': 's1', 'enrolled_at': None}],
            waitlist=[{'id': 'w1', 'class_id': 'c1', 'student_user_id': 's2',
                       'status': 'waiting', 'created_at': '2026-08-05'}],
            users={'s1': {'id': 's1', 'first_name': 'Nora', 'last_name': 'Candland'},
                   's2': {'id': 's2', 'first_name': 'Ryder', 'last_name': 'Swenson'}})
        by_name = {r['name']: r['status'] for r in out['rows']}
        assert by_name == {'Nora Candland': 'Enrolled', 'Ryder Swenson': 'Waiting'}
        # Enrolled students come first within a class; a roster reads that way.
        assert out['rows'][0]['status'] == 'Enrolled'

    def test_no_classes_selected_returns_nothing_rather_than_everything(self):
        with patch('services.sis_catalog_service.list_classes', return_value=self.CLASSES):
            out = reports.roster_report('org-1', [], accessor_id='a', accessor_role='org_admin')
        assert out['rows'] == []

    def test_unknown_field_keys_are_ignored_not_echoed(self):
        out = self._run(
            fields=['name', 'ssn', 'class_name'],
            enrollments=[{'id': 'e1', 'class_id': 'c1', 'student_id': 's1', 'enrolled_at': None}],
            users={'s1': {'id': 's1', 'first_name': 'Nora', 'last_name': 'Candland'}})
        assert out['selected'] == ['class_name', 'name']

    def test_the_field_list_ships_with_the_report(self):
        """So the picker cannot offer a column the CSV does not know."""
        out = self._run(
            enrollments=[{'id': 'e1', 'class_id': 'c1', 'student_id': 's1', 'enrolled_at': None}],
            users={'s1': {'id': 's1', 'first_name': 'Nora', 'last_name': 'Candland'}})
        assert out['fields'] is reports.ROSTER_REPORT_FIELDS

    def test_pulling_health_columns_is_access_logged(self):
        log = []
        self._run(
            fields=['name', 'allergies'], log=log,
            enrollments=[{'id': 'e1', 'class_id': 'c1', 'student_id': 's1', 'enrolled_at': None}],
            users={'s1': {'id': 's1', 'first_name': 'Nora', 'last_name': 'Candland'}})
        log[0].assert_called_once()

    def test_a_report_without_health_columns_is_not_logged(self):
        log = []
        self._run(
            fields=['name', 'class_name'], log=log,
            enrollments=[{'id': 'e1', 'class_id': 'c1', 'student_id': 's1', 'enrolled_at': None}],
            users={'s1': {'id': 's1', 'first_name': 'Nora', 'last_name': 'Candland'}})
        log[0].assert_not_called()

    def test_every_read_is_paged(self):
        """A multi-class export is exactly where PostgREST's silent 1000-row
        cap bites, and a roster that loses its tail is worse than one that
        fails. If somebody swaps a fetch_all_rows for .execute(), this notices."""
        import inspect

        source = inspect.getsource(reports.roster_report) + inspect.getsource(reports._household_context)
        assert '.execute()' not in source
        assert source.count('fetch_all_rows') >= 3


class TestMeetingSlot:
    """A meeting is named in the school's vocabulary — the block(s) it fills —
    falling back to raw times when no block matches."""

    BLOCKS = [
        {'label': '', 'start': '09:30', 'end': '10:30'},
        {'label': '', 'start': '10:30', 'end': '11:30'},
        {'label': '', 'start': '11:30', 'end': '12:30'},
        {'label': 'Open studio', 'start': '13:00', 'end': '14:00'},
    ]

    def slot(self, start, end, blocks=None, **kw):
        return reports._meeting_slot(
            {'start_time': start, 'end_time': end},
            self.BLOCKS if blocks is None else blocks, **kw)

    def test_one_block(self):
        assert self.slot('10:30', '11:30') == 'Block 2'

    def test_a_labelled_block_uses_its_label(self):
        assert self.slot('13:00', '14:00') == 'Open studio'

    def test_a_span_of_unlabelled_blocks_collapses(self):
        assert self.slot('09:30', '12:30') == 'Blocks 1-3'

    def test_a_span_including_a_labelled_block_names_each(self):
        assert self.slot('11:30', '14:00') == 'Block 3 + Open studio'

    def test_partial_overlap_still_counts(self):
        assert self.slot('10:00', '11:00') == 'Blocks 1-2'

    def test_outside_every_block_falls_back_to_times(self):
        assert self.slot('16:00', '17:00') == '4:00pm-5:00pm'

    def test_with_times_appends_the_meeting_times_to_a_block_name(self):
        """A block name alone means nothing to anyone who hasn't memorized the
        school's block grid — the master list asks for the times alongside."""
        assert self.slot('10:30', '11:30', with_times=True) == 'Block 2 (10:30am-11:30am)'
        assert self.slot('13:00', '14:00', with_times=True) == 'Open studio (1:00pm-2:00pm)'
        assert self.slot('09:30', '12:30', with_times=True) == 'Blocks 1-3 (9:30am-12:30pm)'

    def test_with_times_does_not_double_up_the_fallback(self):
        assert self.slot('16:00', '17:00', with_times=True) == '4:00pm-5:00pm'

    def test_no_blocks_configured_falls_back_to_times(self):
        assert self.slot('09:30:00', '10:30:00', blocks=[]) == '9:30am-10:30am'

    def test_no_times_is_blank(self):
        assert self.slot(None, '10:30') == ''


@pytest.mark.unit
class TestStudentScheduleReport:
    """iCreate (Molly), 2026-08-21: "a student report of a master list of all
    students showing which days/class blocks they come."

    Worth pinning: every student gets a row (including the ones with no
    classes), day columns are only the days classes meet (Monday-first), and a
    class with no scheduled meeting shows up as unscheduled rather than
    silently making its students look like they never come.
    """

    # iCreate's real block grid: Lunch is a break, so teaching blocks are 1-5.
    TIME_BLOCKS = [
        {'label': '', 'start': '09:30', 'end': '10:30'},
        {'label': '', 'start': '10:30', 'end': '11:30'},
        {'label': '', 'start': '11:30', 'end': '12:30'},
        {'label': 'Lunch', 'start': '12:30', 'end': '13:00'},
        {'label': '', 'start': '13:00', 'end': '14:00'},
        {'label': '', 'start': '14:00', 'end': '15:00'},
    ]
    CLASSES = [
        {'id': 'c1', 'name': 'Pottery', 'meetings': [
            {'day_of_week': 2, 'start_time': '09:30', 'end_time': '10:30'}]},
        {'id': 'c2', 'name': 'Guitar Jam', 'meetings': [
            {'day_of_week': 2, 'start_time': '10:30', 'end_time': '11:30'},
            {'day_of_week': 4, 'start_time': '10:30', 'end_time': '11:30'}]},
        {'id': 'c3', 'name': 'Full Day', 'meetings': [
            {'day_of_week': 3, 'start_time': '09:30', 'end_time': '15:00'}]},
        {'id': 'c4', 'name': 'Chess Club', 'meetings': []},
    ]
    ROSTER = [
        {'student_id': 's1', 'name': 'Nora Candland', 'is_student': True,
         'household_name': 'Candland', 'date_of_birth': '2013-06-01'},
        {'student_id': 's2', 'name': 'Ryder Swenson', 'is_student': True,
         'household_name': 'Swenson', 'date_of_birth': '2019-12-31'},
        # No DOB on file: the row still belongs on a master list.
        {'student_id': 's3', 'name': 'Ada Byron', 'is_student': True,
         'household_name': None},
        {'student_id': 'staff-1', 'name': 'Molly C', 'is_student': False},
    ]
    TODAY = date(2026, 8, 22)
    ENROLLMENTS = [
        {'class_id': 'c1', 'student_id': 's1'},
        {'class_id': 'c2', 'student_id': 's1'},
        {'class_id': 'c3', 'student_id': 's2'},
        {'class_id': 'c4', 'student_id': 's2'},
    ]

    def _run(self, classes=None, enrollments=None, blocks=None, roster=None):
        with patch('services.sis_reports_service._org_today', return_value=self.TODAY), \
                patch('services.sis_catalog_service.list_classes',
                      return_value=self.CLASSES if classes is None else classes), \
                patch('services.sis_catalog_service.schedule_settings',
                      return_value={'time_blocks': self.TIME_BLOCKS if blocks is None else blocks}), \
                patch('services.sis_service.get_roster',
                      return_value=self.ROSTER if roster is None else roster), \
                patch('services.sis_reports_service.fetch_all_rows',
                      return_value=self.ENROLLMENTS if enrollments is None else enrollments):
            return reports.student_schedule_report('org-1')

    def test_day_columns_are_the_days_classes_meet_monday_first(self):
        out = self._run()
        assert [d['label'] for d in out['days']] == ['Tue', 'Wed', 'Thu']

    def test_each_day_cell_names_the_blocks_with_times_in_time_order(self):
        """Cells carry the block name AND the times — iCreate's office reads
        this list without the block grid in front of them."""
        out = self._run()
        nora = next(r for r in out['rows'] if r['student'] == 'Nora Candland')
        assert nora['by_day']['2'] == ('Block 1 (9:30am-10:30am): Pottery; '
                                       'Block 2 (10:30am-11:30am): Guitar Jam')
        assert nora['by_day']['3'] == ''
        assert nora['by_day']['4'] == 'Block 2 (10:30am-11:30am): Guitar Jam'
        assert nora['days'] == 'Tue Thu'
        assert nora['family'] == 'Candland'

    def test_a_class_spanning_the_day_reads_as_one_span_skipping_lunch(self):
        out = self._run()
        ryder = next(r for r in out['rows'] if r['student'] == 'Ryder Swenson')
        assert ryder['by_day']['3'] == 'Blocks 1-5 (9:30am-3:00pm): Full Day'
        assert ryder['days'] == 'Wed'

    def test_an_unscheduled_class_is_reported_not_dropped(self):
        out = self._run()
        ryder = next(r for r in out['rows'] if r['student'] == 'Ryder Swenson')
        assert ryder['unscheduled'] == 'Chess Club'
        assert out['has_unscheduled'] is True

    def test_a_student_with_no_classes_still_gets_a_row(self):
        """A master list that drops the kids who never come hides exactly what
        it exists to show."""
        out = self._run()
        ada = next(r for r in out['rows'] if r['student'] == 'Ada Byron')
        assert ada['days'] == ''
        assert all(v == '' for v in ada['by_day'].values())

    def test_every_row_carries_the_student_age(self):
        """iCreate (Molly), 2026-08-22: ages on the master list. Counted
        against the school's own today, and blank — not zero, not an error —
        for a student whose birthday nobody has entered yet."""
        out = self._run()
        ages = {r['student']: r['age'] for r in out['rows']}
        assert ages['Nora Candland'] == '13'
        assert ages['Ryder Swenson'] == '6'  # birthday still to come this year
        assert ages['Ada Byron'] == ''

    def test_staff_are_not_students(self):
        out = self._run()
        assert 'Molly C' not in {r['student'] for r in out['rows']}

    def test_rows_sort_by_student_name(self):
        out = self._run()
        names = [r['student'] for r in out['rows']]
        assert names == sorted(names, key=str.lower)

    def test_no_blocks_configured_falls_back_to_times(self):
        out = self._run(blocks=[])
        nora = next(r for r in out['rows'] if r['student'] == 'Nora Candland')
        assert nora['by_day']['2'] == '9:30am-10:30am: Pottery; 10:30am-11:30am: Guitar Jam'

    def test_no_classes_reads_nothing_and_lists_everyone(self):
        """An empty `in_` list matches everything in PostgREST, so the
        enrollment read must be skipped entirely."""
        with patch('services.sis_reports_service._org_today', return_value=self.TODAY), \
                patch('services.sis_catalog_service.list_classes', return_value=[]), \
                patch('services.sis_catalog_service.schedule_settings',
                      return_value={'time_blocks': []}), \
                patch('services.sis_service.get_roster', return_value=self.ROSTER), \
                patch('services.sis_reports_service.fetch_all_rows') as fetch:
            out = reports.student_schedule_report('org-1')
        fetch.assert_not_called()
        assert len(out['rows']) == 3
        assert out['days'] == []

    def test_the_enrollment_read_is_paged(self):
        import inspect

        source = inspect.getsource(reports.student_schedule_report)
        assert '.execute()' not in source
        assert 'fetch_all_rows' in source


@pytest.mark.unit
class TestStudentScheduleRoute:
    REPORT = {
        'days': [{'key': '2', 'label': 'Tue'}, {'key': '4', 'label': 'Thu'}],
        'has_unscheduled': False,
        'rows': [{'student': 'Nora Candland', 'age': '13', 'family': 'Candland',
                  'days': 'Tue Thu',
                  'by_day': {'2': 'Block 1 (9:30am-10:30am): Pottery',
                             '4': 'Block 2 (10:30am-11:30am): Guitar Jam'},
                  'unscheduled': ''}],
    }

    def test_forbidden_for_student(self, client, auth_headers, mock_verify_token):
        with patch('database.get_supabase_admin_client', return_value=_admin_client_for_role('student')):
            resp = client.get('/api/sis/reports/student-schedule', headers=auth_headers)
        assert resp.status_code == 403

    def test_a_coordinator_can_run_it(self, client, auth_headers, mock_verify_token):
        """Operational, not money — the front office is who wants this list."""
        with staff(role='org_managed', org_role='campus_coordinator'), \
                patch('routes.sis.reports.reports.student_schedule_report',
                      return_value=self.REPORT):
            resp = client.get('/api/sis/reports/student-schedule?organization_id=org-1',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert json.loads(resp.data)['report']['rows'][0]['days'] == 'Tue Thu'

    def test_csv_puts_each_day_in_its_own_column(self, client, auth_headers, mock_verify_token):
        with staff(), patch('routes.sis.reports.reports.student_schedule_report',
                            return_value=self.REPORT):
            resp = client.get('/api/sis/reports/student-schedule?organization_id=org-1&format=csv',
                              headers=auth_headers)
        assert resp.status_code == 200
        assert resp.headers['Content-Disposition'] == 'attachment; filename=student-schedule.csv'
        lines = resp.data.decode().strip().splitlines()
        assert lines[0] == 'Student,Age,Family,Days,Tue,Thu'
        assert lines[1] == ('Nora Candland,13,Candland,Tue Thu,'
                            'Block 1 (9:30am-10:30am): Pottery,'
                            'Block 2 (10:30am-11:30am): Guitar Jam')

    def test_csv_adds_the_unscheduled_column_only_when_needed(self, client, auth_headers, mock_verify_token):
        rpt = {**self.REPORT, 'has_unscheduled': True,
               'rows': [dict(self.REPORT['rows'][0], unscheduled='Chess Club')]}
        with staff(), patch('routes.sis.reports.reports.student_schedule_report',
                            return_value=rpt):
            resp = client.get('/api/sis/reports/student-schedule?organization_id=org-1&format=csv',
                              headers=auth_headers)
        lines = resp.data.decode().strip().splitlines()
        assert lines[0].endswith(',Unscheduled classes')
        assert lines[1].endswith(',Chess Club')


@pytest.mark.unit
class TestClassReportCoordinatorRedaction:
    """A campus coordinator runs the class report but not its price columns.
    The route intersects the requested selection with what came back, so asking
    for a redacted column by name cannot pull it through the CSV either."""

    def _coordinator_report(self):
        from services import sis_reports_service as svc
        fields = [f for f in svc.CLASS_REPORT_FIELDS
                  if f['key'] not in svc.CLASS_REPORT_MONEY_KEYS]
        rows = [{k: v for k, v in r.items() if k not in svc.CLASS_REPORT_MONEY_KEYS}
                for r in svc.build_class_rows(CLASSES, {}, {})]
        return {'fields': fields, 'rows': rows}

    def test_asking_for_tuition_by_name_does_not_return_it(self, client, auth_headers, mock_verify_token):
        with staff(org_role='campus_coordinator', sees_money=False), \
             patch('routes.sis.reports.reports.class_report', return_value=self._coordinator_report()):
            resp = client.get('/api/sis/reports/classes?organization_id=org-1&fields=name,tuition',
                              headers=auth_headers)
        body = json.loads(resp.data)
        assert resp.status_code == 200
        assert 'tuition' not in body['report']['selected']
        assert 'tuition' not in body['report']['rows'][0]

    def test_the_csv_cannot_carry_a_redacted_column(self, client, auth_headers, mock_verify_token):
        with staff(org_role='campus_coordinator', sees_money=False), \
             patch('routes.sis.reports.reports.class_report', return_value=self._coordinator_report()):
            resp = client.get(
                '/api/sis/reports/classes?organization_id=org-1&fields=name,tuition,supply_fee&format=csv',
                headers=auth_headers)
        assert resp.status_code == 200
        header = resp.data.decode().splitlines()[0]
        assert 'Tuition' not in header and 'Supply fee' not in header


@pytest.mark.unit
class TestDayRostersReport:
    """iCreate (Molly), 2026-08-22: a sheet per day, block by block, naming the
    class, its room and who is in it — "so that any staff member could look at
    it for that particular hour and easily know where any given child should be
    directed to go to class"."""

    CLASSES = [
        {'id': 'c1', 'name': 'Pottery', 'location': 'Art room',
         'primary_instructor': {'name': 'Ana Rogers'},
         'meetings': [{'day_of_week': 2, 'start_time': '09:30', 'end_time': '10:25',
                       'location': 'Kiln shed'}]},
        {'id': 'c2', 'name': 'Choir', 'location': 'Hall',
         'primary_instructor': {'name': 'Camille Wood'},
         'meetings': [{'day_of_week': 2, 'start_time': '09:30', 'end_time': '10:25'},
                      {'day_of_week': 4, 'start_time': '09:30', 'end_time': '10:25'}]},
        {'id': 'c3', 'name': 'Retired', 'status': 'archived', 'meetings': [
            {'day_of_week': 2, 'start_time': '09:30', 'end_time': '10:25'}]},
    ]
    ROSTER = [
        {'student_id': 's1', 'name': 'Ada Lovelace', 'is_student': True, 'household_name': 'Lovelace'},
        {'student_id': 's2', 'name': 'Bo Diddley', 'is_student': True, 'household_name': 'Diddley'},
        {'student_id': 'staff1', 'name': 'A Teacher', 'is_student': False},
    ]
    ENROLLMENTS = [
        {'class_id': 'c1', 'student_id': 's1'},
        {'class_id': 'c2', 'student_id': 's2'},
        {'class_id': 'c2', 'student_id': 'staff1'},
    ]

    def _report(self, day=None):
        from services import sis_reports_service as svc
        with patch('services.sis_catalog_service.list_classes', return_value=self.CLASSES), \
             patch('services.sis_catalog_service.schedule_settings',
                   return_value={'time_blocks': [{'start': '09:30', 'end': '10:25'}]}), \
             patch.object(svc, 'fetch_all_rows', return_value=self.ENROLLMENTS), \
             patch('services.sis_service.get_roster', return_value=self.ROSTER):
            return svc.day_rosters_report('org-1', day=day)

    def test_days_come_back_named_and_monday_first(self):
        days = self._report()['days']
        assert [d['label'] for d in days] == ['Tuesday', 'Thursday']

    def test_a_class_is_listed_under_its_block_with_its_roster(self):
        tuesday = self._report()['days'][0]
        pottery = next(c for sl in tuesday['slots'] for c in sl['classes'] if c['name'] == 'Pottery')
        assert [s['name'] for s in pottery['students']] == ['Ada Lovelace']

    def test_the_meetings_own_room_wins_over_the_classs(self):
        """A class can sit in a different room on a different day, and this is
        read in a corridor."""
        tuesday = self._report()['days'][0]
        pottery = next(c for sl in tuesday['slots'] for c in sl['classes'] if c['name'] == 'Pottery')
        assert pottery['room'] == 'Kiln shed'

    def test_a_class_with_no_meeting_room_falls_back_to_its_own(self):
        thursday = self._report()['days'][1]
        choir = next(c for sl in thursday['slots'] for c in sl['classes'] if c['name'] == 'Choir')
        assert choir['room'] == 'Hall'

    def test_staff_on_a_roster_are_not_counted_as_students(self):
        tuesday = self._report()['days'][0]
        choir = next(c for sl in tuesday['slots'] for c in sl['classes'] if c['name'] == 'Choir')
        assert [s['name'] for s in choir['students']] == ['Bo Diddley']

    def test_archived_classes_are_left_out(self):
        names = {c['name'] for d in self._report()['days']
                 for sl in d['slots'] for c in sl['classes']}
        assert 'Retired' not in names

    def test_one_day_can_be_asked_for_on_its_own(self):
        days = self._report(day=4)['days']
        assert [d['label'] for d in days] == ['Thursday']

    def test_the_csv_is_one_row_per_student_per_class(self):
        from services import sis_reports_service as svc
        rows = svc.day_rosters_csv_rows(self._report(day=2))
        assert ['Tuesday', 'Block 1', '9:30am-10:25am', 'Choir', 'Hall',
                'Camille Wood', 'Bo Diddley', 'Diddley'] in rows


@pytest.mark.unit
class TestBlockRostersReport:
    """iCreate (Marika), 2026-08-24: the day roster pivoted once more — one
    sheet per block, classes across the page, ages beside the names, "great for
    Tuesdays and Thursdays Blocks 1-5"."""

    TODAY = date(2026, 8, 24)
    BLOCKS = {'time_blocks': [
        {'start': '09:30', 'end': '10:30', 'label': ''},
        {'start': '10:30', 'end': '11:30', 'label': ''},
        {'start': '11:30', 'end': '12:30', 'label': ''},
        {'start': '12:30', 'end': '13:00', 'label': 'Lunch'},
        {'start': '13:00', 'end': '14:00', 'label': ''},
    ]}
    CLASSES = [
        {'id': 'c1', 'name': 'Pottery', 'location': 'Art room',
         'primary_instructor': {'name': 'Ana Rogers'},
         'meetings': [{'day_of_week': 2, 'start_time': '09:30', 'end_time': '10:30',
                       'location': 'Kiln shed'}]},
        # 9:30-12:30 — the case that sent her to Excel: this spans blocks 1-3,
        # and its children are in the building at 9:30.
        {'id': 'c2', 'name': 'Kinder Nature', 'location': 'Story room',
         'primary_instructor': {'name': 'Camille Wood'},
         'meetings': [{'day_of_week': 2, 'start_time': '09:30', 'end_time': '12:30'}]},
        {'id': 'c3', 'name': 'Retired', 'status': 'archived', 'meetings': [
            {'day_of_week': 2, 'start_time': '09:30', 'end_time': '10:30'}]},
        # Outside every configured block — must still appear somewhere.
        {'id': 'c4', 'name': 'Early Birds', 'location': 'The Commons',
         'meetings': [{'day_of_week': 2, 'start_time': '08:00', 'end_time': '09:00'}]},
    ]
    ROSTER = [
        {'student_id': 's1', 'name': 'Ada Lovelace', 'is_student': True,
         'date_of_birth': '2013-06-01'},
        {'student_id': 's2', 'name': 'Bo Diddley', 'is_student': True,
         'date_of_birth': '2019-12-31'},
        {'student_id': 'staff1', 'name': 'A Teacher', 'is_student': False},
    ]
    ENROLLMENTS = [
        {'class_id': 'c1', 'student_id': 's1'},
        {'class_id': 'c2', 'student_id': 's2'},
        {'class_id': 'c2', 'student_id': 'staff1'},
    ]

    def _report(self, day=None):
        from services import sis_reports_service as svc
        with patch('services.sis_catalog_service.list_classes', return_value=self.CLASSES), \
             patch('services.sis_catalog_service.schedule_settings', return_value=self.BLOCKS), \
             patch('services.sis_reports_service._org_today', return_value=self.TODAY), \
             patch.object(svc, 'fetch_all_rows', return_value=self.ENROLLMENTS), \
             patch('services.sis_service.get_roster', return_value=self.ROSTER):
            return svc.block_rosters_report('org-1', day=day)

    def _block(self, label, day=2):
        days = self._report(day=day)['days']
        return next(b for b in days[0]['blocks'] if b['label'] == label)

    def test_blocks_are_numbered_past_the_lunch_break(self):
        """'Block 4' is the fourth TEACHING block, not the fourth row of the
        org's time_blocks — lunch does not get a number."""
        labels = [b['label'] for b in self._report(day=2)['days'][0]['blocks']]
        assert 'Lunch' not in labels
        assert [l for l in labels if l.startswith('Block')] == ['Block 1', 'Block 2', 'Block 3']

    def test_a_class_appears_under_every_block_it_spans(self):
        for label in ('Block 1', 'Block 2', 'Block 3'):
            assert 'Kinder Nature' in {c['name'] for c in self._block(label)['classes']}

    def test_students_carry_their_age(self):
        pottery = next(c for c in self._block('Block 1')['classes'] if c['name'] == 'Pottery')
        assert pottery['students'] == [{'name': 'Ada Lovelace', 'age': '13'}]

    def test_the_meetings_own_room_wins_over_the_classs(self):
        pottery = next(c for c in self._block('Block 1')['classes'] if c['name'] == 'Pottery')
        assert pottery['room'] == 'Kiln shed'

    def test_staff_on_a_roster_are_not_counted_as_students(self):
        kinder = next(c for c in self._block('Block 1')['classes'] if c['name'] == 'Kinder Nature')
        assert [s['name'] for s in kinder['students']] == ['Bo Diddley']

    def test_archived_classes_are_left_out(self):
        names = {c['name'] for d in self._report()['days']
                 for b in d['blocks'] for c in b['classes']}
        assert 'Retired' not in names

    def test_a_class_outside_every_block_still_gets_a_page(self):
        """Dropping it would hide children from the sheet that exists to find
        them, so its own times become a block of one — and it sorts first."""
        blocks = self._report(day=2)['days'][0]['blocks']
        assert blocks[0]['label'] == '8:00am-9:00am'
        assert [c['name'] for c in blocks[0]['classes']] == ['Early Birds']

    def test_a_blocks_student_count_does_not_double_count(self):
        assert self._block('Block 1')['student_count'] == 2

    def test_the_csv_is_a_grid_of_classes_across_and_students_down(self):
        from services import sis_reports_service as svc
        rows = svc.block_rosters_csv_rows(self._report(day=2))
        assert ['Tuesday - Block 1 (9:30am-10:30am)'] in rows
        i = rows.index(['Tuesday - Block 1 (9:30am-10:30am)'])
        assert rows[i + 1] == ['Kinder Nature', '', '', 'Pottery', '', '']
        assert rows[i + 2] == ['Story room', '', '', 'Kiln shed', '', '']
        assert rows[i + 3] == ['Student', 'Age', '', 'Student', 'Age', '']
        assert rows[i + 4] == ['Bo Diddley', '6', '', 'Ada Lovelace', '13', '']

    def test_the_csv_wraps_to_a_new_band_past_three_classes(self):
        from services import sis_reports_service as svc
        report = {'days': [{'label': 'Tuesday', 'blocks': [{
            'label': 'Block 1', 'time': '9:30am-10:30am',
            'classes': [{'name': f'C{n}', 'room': 'R', 'students': []} for n in range(4)]}]}]}
        rows = svc.block_rosters_csv_rows(report)
        assert ['C0', '', '', 'C1', '', '', 'C2', '', ''] in rows
        assert ['C3', '', ''] in rows


@pytest.mark.unit
class TestDayDepartures:
    """iCreate, 2026-08-26 (1fc5012b): "Can we get a way to know who is leaving
    halfdays, etc."

    Nothing in the platform records a half day, and asking the office to type
    one in per child per week would be a second source of truth to keep right.
    Every student's schedule already says when their last class finishes, which
    is the same answer, derived.
    """

    CLASSES = [
        # A full Tuesday: morning + afternoon.
        {'id': 'am', 'name': 'Morning Maths',
         'meetings': [{'day_of_week': 2, 'start_time': '09:00', 'end_time': '12:30'}]},
        {'id': 'pm', 'name': 'Afternoon Art',
         'meetings': [{'day_of_week': 2, 'start_time': '13:00', 'end_time': '15:00'}]},
        # Thursday finishes early for everybody.
        {'id': 'thu', 'name': 'Thursday Club',
         'meetings': [{'day_of_week': 4, 'start_time': '09:00', 'end_time': '12:30'}]},
    ]
    ROSTER = [
        {'student_id': 's1', 'name': 'Ada Lovelace', 'is_student': True, 'household_name': 'Lovelace'},
        {'student_id': 's2', 'name': 'Bo Diddley', 'is_student': True, 'household_name': 'Diddley'},
        {'student_id': 'staff1', 'name': 'A Teacher', 'is_student': False},
    ]
    # Ada goes home at lunch; Bo stays all day. The teacher is not a departure.
    ENROLLMENTS = [
        {'class_id': 'am', 'student_id': 's1'},
        {'class_id': 'am', 'student_id': 's2'},
        {'class_id': 'pm', 'student_id': 's2'},
        {'class_id': 'thu', 'student_id': 's1'},
        {'class_id': 'am', 'student_id': 'staff1'},
    ]

    def _report(self, day=None, classes=None, enrollments=None):
        from services import sis_reports_service as svc
        with patch('services.sis_catalog_service.list_classes',
                   return_value=classes or self.CLASSES), \
             patch('services.sis_catalog_service.schedule_settings',
                   return_value={'time_blocks': []}), \
             patch.object(svc, 'fetch_all_rows',
                          return_value=enrollments or self.ENROLLMENTS), \
             patch('services.sis_service.get_roster', return_value=self.ROSTER):
            return svc.day_rosters_report('org-1', day=day)

    def _tuesday(self, **kw):
        return next(d for d in self._report(**kw)['days'] if d['label'] == 'Tuesday')

    def test_it_says_when_each_student_goes_home(self):
        by_name = {d['name']: d for d in self._tuesday()['departures']}
        assert by_name['Ada Lovelace']['leaves_at'] == '12:30pm'
        assert by_name['Bo Diddley']['leaves_at'] == '3:00pm'

    def test_the_half_day_child_is_flagged_and_the_all_day_one_is_not(self):
        by_name = {d['name']: d for d in self._tuesday()['departures']}
        assert by_name['Ada Lovelace']['early'] is True
        assert by_name['Bo Diddley']['early'] is False

    def test_the_earliest_leaver_is_first(self):
        """Read in the order the office will be handing children over."""
        assert [d['name'] for d in self._tuesday()['departures']] == [
            'Ada Lovelace', 'Bo Diddley']

    def test_a_students_latest_class_decides_it_not_their_first(self):
        """Bo is in the morning class too; being enrolled in something that ends
        at midday does not make him a midday leaver."""
        bo = next(d for d in self._tuesday()['departures'] if d['name'] == 'Bo Diddley')
        assert bo['leaves_at'] == '3:00pm'

    def test_staff_are_not_departures(self):
        names = [d['name'] for d in self._tuesday()['departures']]
        assert 'A Teacher' not in names

    def test_a_day_that_ends_early_for_everyone_flags_nobody(self):
        """"Early" is relative to the day, not to a fixed clock time — a Friday
        that finishes at one o'clock has nobody leaving early."""
        thursday = next(d for d in self._report()['days'] if d['label'] == 'Thursday')
        assert [d['early'] for d in thursday['departures']] == [False]

    def test_the_family_name_rides_along_for_the_pickup_list(self):
        ada = next(d for d in self._tuesday()['departures'] if d['name'] == 'Ada Lovelace')
        assert ada['family'] == 'Lovelace'

    def test_a_class_with_no_end_time_does_not_break_the_day(self):
        classes = [{'id': 'x', 'name': 'Open Studio',
                    'meetings': [{'day_of_week': 2, 'start_time': '09:00', 'end_time': None}]}]
        day = self._report(classes=classes,
                           enrollments=[{'class_id': 'x', 'student_id': 's1'}])
        assert day['days'][0]['departures'] == []
