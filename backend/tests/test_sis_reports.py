"""
Unit tests for SIS reports: pure aggregators + route gating.
"""

import json
from contextlib import contextmanager
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
def staff(role='org_admin', org='org-1', org_role=None):
    with patch('database.get_supabase_admin_client',
               return_value=_admin_client_for_role(role, org_role)), \
         patch('services.sis_service.resolve_org_id', return_value=org):
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
        spy.assert_called_once_with('org-1', include_archived=True)


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
