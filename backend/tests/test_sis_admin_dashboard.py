"""
The School Dashboard aggregator.

The dashboard fans out over a dozen subsystems and hands the result to whoever
opened the console. Two things about that are worth pinning down, and neither is
"does it add up the numbers":

  1. **Who sees what.** GET /api/sis/dashboard is ADMIN_ROLES, which includes
     campus coordinators — the one role the SIS exists to keep away from the
     money and from employment paperwork. So the finance block must be ABSENT
     from a coordinator's payload (not null, not zero, not hidden by the
     browser), and their signature count must be computed without HR batches.

  2. **One broken subsystem costs one tile.** A dashboard that 500s because the
     billing service is unhappy is worse than no dashboard: it takes down
     attendance, requests and the roster with it.
"""

from datetime import datetime, timezone
from unittest.mock import Mock, patch

import pytest

from services import sis_dashboard_service as dash


ORG = 'org-1'
ADMIN = 'admin-1'
COORDINATOR = 'kate'

SNAPSHOT = {'organization': {'id': ORG, 'name': 'Org'}, 'total_students': 12,
            'active_last_7_days': 5, 'households': 7,
            'enrollment_status': {'enrolled': 10, 'applicant': 2}}


def _table_mock(counts, rows):
    """A Supabase table stub: every chained call returns self, execute() returns
    the row list and exact count configured for that table name."""
    def _table(name):
        t = Mock()
        for chained in ('select', 'eq', 'in_', 'gte', 'lt', 'order', 'limit', 'not_', 'is_'):
            getattr(t, chained).return_value = t
        t.execute.return_value = Mock(data=rows.get(name, []), count=counts.get(name, 0))
        return t
    admin = Mock()
    admin.table.side_effect = _table
    return admin


def _run(*, roles=('org_admin',), sees_pay=True, settings=None, counts=None, rows=None,
         alerts=None, requests=None, batches=None, assignments=None,
         unassigned=None, prior_enabled=False, prior_counts=None,
         invoices=None, invoices_error=None, tuition=0, overrides=None):
    """Build a dashboard with every subsystem stubbed.

    `overrides` is a dict of {attribute: patch} applied last, for the tests that
    need one source to explode.
    """
    org_row = {'id': ORG, 'name': 'Org', 'slug': 'org',
               'feature_flags': {'sis_settings': settings or {}}}
    rows = dict(rows or {})
    rows.setdefault('organizations', [org_row])
    admin = _table_mock(counts or {}, rows)

    patches = {
        '_admin': patch.object(dash, '_admin', return_value=admin),
        '_org_now': patch.object(dash, '_org_now',
                                 return_value=datetime(2026, 8, 14, 9, 0, tzinfo=timezone.utc)),
        'get_dashboard': patch.object(dash.sis_service, 'get_dashboard', return_value=SNAPSHOT),
        'roles': patch.object(dash.sis_service, 'caller_org_roles', return_value=list(roles)),
        'sees_pay': patch.object(dash.sis_service, 'caller_sees_pay', return_value=sees_pay),
        'unassigned': patch.object(dash.sis_service, 'unassigned_students',
                                   return_value=unassigned or []),
        'alerts': patch.object(dash.attendance, 'open_alerts', return_value=alerts or []),
        'forms': patch.object(dash.forms, 'list_all', return_value=requests or []),
        'batches': patch.object(dash.onboarding, 'list_signature_batches',
                                return_value=batches or []),
        'assignments': patch.object(dash.onboarding, 'list_assignments',
                                    return_value=assignments or []),
        'schedule': patch.object(dash.coordinator, '_today_org_schedule', return_value=[]),
    }
    patches.update(overrides or {})

    with patch('services.sis_prior_learning_service.enabled_for_org',
               return_value=prior_enabled), \
         patch('services.sis_prior_learning_service.queue_counts',
               return_value=prior_counts or {}), \
         patch('services.sis_billing_service.outstanding_invoices',
               return_value=invoices or [], side_effect=invoices_error), \
         patch('services.sis_tuition_service.pending_count', return_value=tuition):
        started = [p.start() for p in patches.values()]
        try:
            caller = COORDINATOR if 'org_admin' not in roles else ADMIN
            return dash.get_admin_dashboard(ORG, caller)
        finally:
            for p in patches.values():
                p.stop()
            del started


def _batch(total, signed):
    return {'batch_id': 'b1', 'total_count': total, 'signed_count': signed}


@pytest.mark.unit
class TestTheMoneyStaysWithFinance:
    """The whole reason the payload is assembled per caller."""

    def test_a_coordinator_gets_no_finance_key_at_all(self):
        """Not null, not zeroes — absent. A key with a null value still tells a
        coordinator that a finance section exists and invites a client to render
        an empty money card on the page that role exists to keep money off."""
        data = _run(roles=('campus_coordinator',), sees_pay=False,
                    invoices=[{'amount_due_cents': 50000, 'days_overdue': 9}], tuition=3)
        assert 'finance' not in data

    def test_an_org_admin_gets_the_finance_block(self):
        data = _run(invoices=[{'amount_due_cents': 50000, 'days_overdue': 9},
                              {'amount_due_cents': 2500, 'days_overdue': 0}],
                    tuition=3)
        assert data['finance']['invoices'] == {
            'open_count': 2, 'overdue_count': 1, 'overdue_cents': 50000,
            'outstanding_cents': 52500, 'max_days_overdue': 9,
        }
        assert data['finance']['tuition_queue'] == 3

    def test_hiding_the_billing_module_empties_finance_without_removing_it(self):
        """An org that doesn't bill through Optio still has an admin who could
        see money — the block is empty because there is nothing to bill, not
        because of who is asking."""
        data = _run(settings={'hidden_modules': ['billing']}, tuition=3)
        assert data['finance'] == {}


@pytest.mark.unit
class TestHrPaperworkFollowsTheCaller:
    def test_an_admin_counts_hr_batches(self):
        with patch.object(dash.onboarding, 'list_signature_batches',
                          return_value=[_batch(4, 1)]) as batches:
            data = _run(roles=('org_admin',), overrides={
                'batches': patch.object(dash.onboarding, 'list_signature_batches',
                                        new=batches)})
        assert data['attention']['signatures_pending'] == 3
        assert batches.call_args.kwargs['include_hr'] is True

    def test_a_coordinator_counts_only_what_they_could_open(self):
        """Counting contracts a coordinator cannot read gives them a number they
        can never work down — and leaks how much HR paperwork is in flight."""
        with patch.object(dash.onboarding, 'list_signature_batches',
                          return_value=[_batch(2, 0)]) as batches:
            data = _run(roles=('campus_coordinator',), sees_pay=False, overrides={
                'batches': patch.object(dash.onboarding, 'list_signature_batches',
                                        new=batches)})
        assert data['attention']['signatures_pending'] == 2
        assert batches.call_args.kwargs['include_hr'] is False


@pytest.mark.unit
class TestTheQueues:
    def test_requests_split_into_unassigned_and_overdue(self):
        requests = [
            {'status': 'submitted', 'assigned_to': None, 'due_date': None},
            {'status': 'in_progress', 'assigned_to': 'kate', 'due_date': '2026-08-01'},
            {'status': 'waiting', 'assigned_to': None, 'due_date': '2026-09-01'},
            # Resolved work is not waiting on anybody, however old it is.
            {'status': 'resolved', 'assigned_to': None, 'due_date': '2026-01-01'},
        ]
        data = _run(requests=requests)
        assert data['attention']['requests_unassigned'] == 2
        assert data['attention']['requests_overdue'] == 1

    def test_a_checklist_counts_until_its_last_item_is_done(self):
        data = _run(assignments=[
            {'done_count': 1, 'total_count': 3},
            {'done_count': 4, 'total_count': 4},
        ])
        assert data['attention']['onboarding_incomplete'] == 1

    def test_enrollment_queues_come_from_exact_counts(self):
        data = _run(counts={'sis_age_exception_requests': 2,
                            'sis_enrollment_waitlist': 11})
        assert data['attention']['age_exceptions'] == 2
        assert data['attention']['waitlist_waiting'] == 11

    def test_students_with_no_family_are_counted(self):
        data = _run(unassigned=[{'id': 's1'}, {'id': 's2'}])
        assert data['attention']['students_no_family'] == 2


@pytest.mark.unit
class TestOptInModulesStayOut:
    def test_prior_learning_is_absent_until_the_org_turns_it_on(self):
        data = _run(prior_enabled=False, prior_counts={'submitted': 5})
        assert 'prior_learning_pending' not in data['attention']

    def test_prior_learning_counts_the_unreviewed_half_of_the_queue(self):
        data = _run(prior_enabled=True, prior_counts={
            'submitted': 4, 'under_review': 2, 'accepted': 9, 'rejected': 1})
        assert data['attention']['prior_learning_pending'] == 6

    def test_goals_only_count_for_goals_mode_orgs(self):
        assert 'goals_pending' not in _run(counts={'sis_student_goals': 3})['attention']
        data = _run(settings={'post_registration_flow': 'goals'},
                    counts={'sis_student_goals': 3})
        assert data['attention']['goals_pending'] == 3

    def test_a_hidden_module_is_never_queried(self):
        """Absent, not zero: an org with attendance turned off has no answer to
        'how many students are unaccounted for', and the tile should not exist."""
        with patch.object(dash.attendance, 'open_alerts') as alerts:
            data = _run(settings={'hidden_modules': ['attendance', 'tasks']},
                        overrides={'alerts': patch.object(dash.attendance,
                                                          'open_alerts', new=alerts)})
        assert 'attendance_alerts' not in data['attention']
        assert 'requests_unassigned' not in data['attention']
        assert 'signatures_pending' not in data['attention']
        assert 'attendance' not in data['today']
        alerts.assert_not_called()


@pytest.mark.unit
class TestOneBrokenSubsystemCostsOneTile:
    def test_a_failing_source_does_not_take_the_page_down(self):
        boom = patch.object(dash.attendance, 'open_alerts',
                            side_effect=RuntimeError('attendance is down'))
        data = _run(unassigned=[{'id': 's1'}], overrides={'alerts': boom})
        # The broken queue reports NOTHING, not zero: a dashboard that says
        # "no students unaccounted for" because the query fell over is worse
        # than one that says nothing at all.
        assert 'attendance_alerts' not in data['attention']
        # Every other source is intact.
        assert data['attention']['students_no_family'] == 1
        assert data['snapshot'] == SNAPSHOT

    def test_a_failing_count_never_reports_an_empty_queue(self):
        boom = patch.object(dash.forms, 'list_all', side_effect=RuntimeError('down'))
        data = _run(overrides={'forms': boom})
        assert 'requests_unassigned' not in data['attention']
        assert 'requests_overdue' not in data['attention']

    def test_a_failing_finance_service_still_renders_the_dashboard(self):
        data = _run(invoices_error=RuntimeError('billing is down'), tuition=2)
        assert data['finance']['invoices'] is None
        assert data['finance']['tuition_queue'] == 2

    def test_a_failing_snapshot_leaves_the_queues_standing(self):
        broken = patch.object(dash.sis_service, 'get_dashboard',
                              side_effect=RuntimeError('roster is down'))
        data = _run(counts={'sis_enrollment_waitlist': 4},
                    overrides={'get_dashboard': broken})
        assert data['snapshot'] is None
        assert data['attention']['waitlist_waiting'] == 4


@pytest.mark.unit
class TestTheRestOfThePayload:
    def test_an_empty_school_is_all_zeroes_and_no_errors(self):
        data = _run()
        assert data['attention'] == {
            'attendance_alerts': 0, 'requests_unassigned': 0, 'requests_overdue': 0,
            'signatures_pending': 0, 'onboarding_incomplete': 0, 'age_exceptions': 0,
            'waitlist_waiting': 0, 'students_no_family': 0,
        }

    def test_settings_are_echoed_so_the_frontend_filters_with_sismodules(self):
        data = _run(settings={'hidden_modules': ['clp', 'billing'],
                              'prior_learning_enabled': True,
                              'post_registration_flow': 'goals'})
        assert data['settings'] == {
            'hidden_modules': ['billing', 'clp'],
            'prior_learning_enabled': True,
            'post_registration_flow': 'goals',
        }

    def test_upcoming_events_hide_admin_only_ones_from_a_coordinator(self):
        events = [{'id': 'e1', 'title': 'Assembly', 'audience': 'school'},
                  {'id': 'e2', 'title': 'Board budget review', 'audience': 'admin'}]
        seen = _run(roles=('campus_coordinator',), sees_pay=False,
                    rows={'sis_events': events})['events']
        assert [e['id'] for e in seen] == ['e1']
        assert len(_run(rows={'sis_events': events})['events']) == 2
