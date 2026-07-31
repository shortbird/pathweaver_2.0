"""
The CLP meeting screen's open requests, directory lenses, and what approving a
schedule settles.

iCreate, 2026-07-31:
  - "What happens when we hit Approve Schedule? Does it take students off the
     waitlisted classes? Cuz it should!"
  - "Can we get a list somewhere that shows who all has completed their CLP?
     And a list of everyone who needs their schedule approved still?"
  - "If someone's schedule is approved, then I think it should also remove the
     age exception requests."
  - "It would be helpful to have any waitlist or age exceptions that parents
     have requested listed here somewhere."

Waitlist places are deliberately NOT dropped on approval — an approved schedule
doesn't say the family stopped wanting the seat, and dropping them would lose
their position. They're reported back instead, and actionable on the screen.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_clp_service as clp
from services import sis_exception_service as exceptions
from services import sis_schedule_submission_service as submissions


def _table_client(by_table):
    """A supabase-py stand-in whose execute() answer depends on the table name.

    Every builder it hands out is kept on `client.builders[name]` so a test can
    assert what was done to a given table, not just what was read.
    """
    client = Mock()
    client.builders = {}

    def _table(name):
        t = Mock()
        for chained in ('select', 'eq', 'in_', 'limit', 'order', 'update', 'upsert', 'delete', 'range'):
            getattr(t, chained).return_value = t
        t.execute.side_effect = lambda: Mock(data=list(by_table.get(name, [])))
        client.builders.setdefault(name, []).append(t)
        return t

    client.table.side_effect = _table
    return client


@pytest.mark.unit
class TestOpenRequests:
    def test_lists_waitlist_and_pending_exceptions_with_class_names(self):
        client = _table_client({'sis_waitlist_entries': [
            {'id': 'w1', 'class_id': 'c1', 'status': 'waiting', 'position': 2,
             'offer_expires_at': None},
        ]})
        with patch('services.sis_clp_service._admin', return_value=client), \
             patch('services.sis_exception_service.list_requests', return_value=[
                 {'id': 'x1', 'student_user_id': 's1', 'class_id': 'c2',
                  'class_name': 'Pottery', 'message': 'She is 7', 'created_at': 'now'},
                 {'id': 'x2', 'student_user_id': 'OTHER', 'class_id': 'c3',
                  'class_name': 'Chess', 'message': None, 'created_at': 'now'},
             ]):
            out = clp.open_requests('org-1', 's1', [{'class_id': 'c1', 'name': 'Lego Lab'}])
        assert out['waitlist'][0]['class_name'] == 'Lego Lab'
        assert out['waitlist'][0]['position'] == 2
        # Another student's request must never leak into this meeting screen.
        assert [r['request_id'] for r in out['age_exceptions']] == ['x1']

    def test_a_broken_lookup_still_renders_the_screen(self):
        client = Mock()
        client.table.side_effect = RuntimeError('boom')
        with patch('services.sis_clp_service._admin', return_value=client), \
             patch('services.sis_exception_service.list_requests', side_effect=RuntimeError('boom')):
            assert clp.open_requests('org-1', 's1') == {'waitlist': [], 'age_exceptions': []}


@pytest.mark.unit
class TestExceptionsClosedOnApproval:
    def test_requests_are_closed_against_what_the_schedule_says(self):
        """In the class → approved; not in the class → declined."""
        client = _table_client({
            'sis_age_exception_requests': [{'id': 'x1', 'class_id': 'c1'},
                                           {'id': 'x2', 'class_id': 'c2'}],
            'class_enrollments': [{'class_id': 'c1'}],
        })
        with patch('services.sis_exception_service._admin', return_value=client):
            out = exceptions.resolve_on_schedule_approval('org-1', 's1', 'admin-1')
        assert out == {'approved': 1, 'declined': 1}

    def test_no_pending_requests_is_a_no_op(self):
        client = _table_client({'sis_age_exception_requests': []})
        with patch('services.sis_exception_service._admin', return_value=client):
            assert exceptions.resolve_on_schedule_approval('org-1', 's1', 'admin-1') == {
                'approved': 0, 'declined': 0}

    def test_a_failure_never_breaks_the_approval(self):
        client = Mock()
        client.table.side_effect = RuntimeError('boom')
        with patch('services.sis_exception_service._admin', return_value=client):
            assert exceptions.resolve_on_schedule_approval('org-1', 's1', 'admin-1') == {
                'approved': 0, 'declined': 0}


@pytest.mark.unit
class TestApprovalReportsWhatIsLeft:
    def test_approval_closes_exceptions_and_reports_open_waitlists(self):
        client = _table_client({'sis_waitlist_entries': [{'id': 'w1'}, {'id': 'w2'}]})
        with patch('services.sis_schedule_submission_service._admin', return_value=client), \
             patch('services.sis_exception_service.resolve_on_schedule_approval',
                   return_value={'approved': 1, 'declined': 0}):
            out = submissions._settle_open_requests('org-1', 's1', 'admin-1')
        assert out['age_exceptions_closed'] == {'approved': 1, 'declined': 0}
        # Reported, NOT dropped — the family keeps its place in line.
        assert out['waitlist_still_open'] == 2

    def test_nothing_outstanding_reports_nothing(self):
        client = _table_client({'sis_waitlist_entries': []})
        with patch('services.sis_schedule_submission_service._admin', return_value=client), \
             patch('services.sis_exception_service.resolve_on_schedule_approval',
                   return_value={'approved': 0, 'declined': 0}):
            assert submissions._settle_open_requests('org-1', 's1', 'admin-1') == {}

    def test_the_waitlist_is_never_cleared_by_an_approval(self):
        """Guard against a future 'helpful' change: approval must not delete."""
        client = _table_client({'sis_waitlist_entries': [{'id': 'w1'}]})
        with patch('services.sis_schedule_submission_service._admin', return_value=client), \
             patch('services.sis_exception_service.resolve_on_schedule_approval',
                   return_value={'approved': 0, 'declined': 0}):
            submissions._settle_open_requests('org-1', 's1', 'admin-1')
        builders = client.builders.get('sis_waitlist_entries') or []
        assert builders, 'the waitlist should have been read'
        for b in builders:
            assert b.delete.called is False
            assert b.update.called is False


@pytest.mark.unit
class TestDirectoryCounts:
    def test_directory_carries_clp_and_approval_state_with_counts(self):
        roster = [
            {'student_id': 's1', 'name': 'A A', 'is_student': True, 'enrollment_status': 'enrolled',
             'household_id': 'h1', 'household_name': 'A Family', 'last_name': 'A'},
            {'student_id': 's2', 'name': 'B B', 'is_student': True, 'enrollment_status': 'enrolled',
             'household_id': 'h1', 'household_name': 'A Family', 'last_name': 'B'},
            {'student_id': 's3', 'name': 'C C', 'is_student': True, 'enrollment_status': 'withdrawn',
             'household_id': None, 'household_name': None, 'last_name': 'C'},
            {'student_id': 'p1', 'name': 'Parent', 'is_student': False, 'enrollment_status': None},
        ]
        with patch('services.sis_service.get_roster', return_value=roster), \
             patch('services.sis_clp_service.finished_student_ids', return_value={'s1'}), \
             patch('services.sis_clp_service._schedule_status_by_student',
                   return_value={'s1': 'approved', 's2': 'submitted'}):
            out = clp.clp_directory('org-1')
        by_id = {s['student_id']: s for s in out['students']}
        assert by_id['s1']['clp_finished'] is True
        assert by_id['s2']['schedule_status'] == 'submitted'
        # Withdrawn students and parents never reach a CLP directory.
        assert set(by_id) == {'s1', 's2'}
        assert out['counts'] == {'total': 2, 'clp_finished': 1, 'clp_todo': 1,
                                 'awaiting_approval': 1, 'submitted': 1, 'approved': 1}

    def test_never_submitted_counts_as_awaiting_approval(self):
        """A CLP schedule is usually built live and never goes through the
        family's builder — so 'no submission' still needs an approval."""
        roster = [{'student_id': 's9', 'name': 'Z', 'is_student': True,
                   'enrollment_status': 'enrolled', 'household_id': None,
                   'household_name': None, 'last_name': 'Z'}]
        with patch('services.sis_service.get_roster', return_value=roster), \
             patch('services.sis_clp_service.finished_student_ids', return_value=set()), \
             patch('services.sis_clp_service._schedule_status_by_student', return_value={}):
            out = clp.clp_directory('org-1')
        assert out['students'][0]['schedule_status'] is None
        assert out['counts']['awaiting_approval'] == 1
