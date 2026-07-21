"""
Unit tests for the parent schedule-approval flow (sis_schedule_submission_service)
and its enforcement in sis_parent_service.

Flow (iCreate feedback 2026-07-21): a parent submits the finished Schedule
Builder week; submitting LOCKS self-service changes and notifies staff. Staff
approve (stays locked, status-only — billing happens outside Optio) or send it
back with a note (unlocks for the family).
"""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_schedule_submission_service as subs
from services import sis_parent_service as parent


def _chain(*datasets):
    m = MagicMock()
    for meth in ('select', 'insert', 'update', 'upsert', 'delete',
                 'eq', 'in_', 'is_', 'limit', 'order'):
        getattr(m, meth).return_value = m
    m.execute.side_effect = [MagicMock(data=d) for d in datasets]
    return m


def _client(tables):
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    return client


_SUBMITTED = {'id': 'sub1', 'organization_id': 'org1', 'student_user_id': 'stu1',
              'status': 'submitted', 'submitted_by': 'g1'}


@pytest.mark.unit
class TestSubmit:
    def test_submit_upserts_and_notifies_staff(self):
        saved = {**_SUBMITTED}
        chain = _chain([], [saved])  # current() finds nothing, then the upsert
        tables = {'sis_schedule_submissions': chain}
        with patch('services.sis_schedule_submission_service._admin', return_value=_client(tables)), \
             patch('services.sis_schedule_submission_service._notify_staff') as notify:
            out = subs.submit('org1', 'stu1', 'g1')
        assert out == {'submission': saved}
        payload = chain.upsert.call_args.args[0]
        assert payload['status'] == 'submitted'
        assert payload['submitted_by'] == 'g1'
        # A resubmit must clear the previous review.
        assert payload['reviewed_by'] is None and payload['review_note'] is None
        assert chain.upsert.call_args.kwargs['on_conflict'] == 'organization_id,student_user_id'
        notify.assert_called_once_with('org1', 'stu1')

    def test_submit_is_idempotent_while_locked(self):
        tables = {'sis_schedule_submissions': _chain([_SUBMITTED])}
        with patch('services.sis_schedule_submission_service._admin', return_value=_client(tables)), \
             patch('services.sis_schedule_submission_service._notify_staff') as notify:
            out = subs.submit('org1', 'stu1', 'g1')
        assert out['already'] is True
        notify.assert_not_called()

    def test_resubmit_after_send_back_goes_through(self):
        sent_back = {**_SUBMITTED, 'status': 'sent_back', 'review_note': 'Fix Tuesday'}
        chain = _chain([sent_back], [{**_SUBMITTED}])
        tables = {'sis_schedule_submissions': chain}
        with patch('services.sis_schedule_submission_service._admin', return_value=_client(tables)), \
             patch('services.sis_schedule_submission_service._notify_staff'):
            out = subs.submit('org1', 'stu1', 'g1')
        assert out['submission']['status'] == 'submitted'


@pytest.mark.unit
class TestReview:
    def _review(self, existing, action, note=None):
        updated = [{**existing, 'status': 'approved' if action == 'approve' else 'sent_back',
                    'review_note': note}] if existing else []
        chain = _chain([existing] if existing else [], updated)
        tables = {'sis_schedule_submissions': chain}
        with patch('services.sis_schedule_submission_service._admin', return_value=_client(tables)), \
             patch('services.sis_schedule_submission_service._notify_guardian') as notify:
            out = subs.review('org1', 'sub1', action, reviewed_by='staff1', note=note)
        return out, chain, notify

    def test_approve_marks_and_notifies_the_guardian(self):
        out, chain, notify = self._review(_SUBMITTED, 'approve')
        assert out['submission']['status'] == 'approved'
        assert chain.update.call_args.args[0]['reviewed_by'] == 'staff1'
        notify.assert_called_once()

    def test_send_back_stores_the_note(self):
        out, chain, _ = self._review(_SUBMITTED, 'send_back', note='Pick a Thursday class')
        assert out['submission']['status'] == 'sent_back'
        assert chain.update.call_args.args[0]['review_note'] == 'Pick a Thursday class'

    def test_rejects_unknown_actions(self):
        assert 'error' in subs.review('org1', 'sub1', 'delete', reviewed_by='staff1')

    def test_missing_submission_errors(self):
        out, _, _ = self._review(None, 'approve')
        assert out == {'error': 'Submission not found'}

    def test_already_reviewed_errors(self):
        out, _, _ = self._review({**_SUBMITTED, 'status': 'approved'}, 'approve')
        assert 'already' in out['error']


@pytest.mark.unit
class TestLockState:
    @pytest.mark.parametrize('status,locked', [
        ('submitted', True), ('approved', True), ('sent_back', False),
    ])
    def test_is_locked_by_status(self, status, locked):
        with patch('services.sis_schedule_submission_service.current',
                   return_value={'status': status}):
            assert subs.is_locked('org1', 'stu1') is locked

    def test_not_locked_without_a_submission(self):
        with patch('services.sis_schedule_submission_service.current', return_value=None):
            assert subs.is_locked('org1', 'stu1') is False


_MINE = [{'student_id': 'stu1', 'org_id': 'org1', 'household_id': 'h1', 'name': 'Stu One'}]


@pytest.mark.unit
class TestParentEnforcement:
    def _base_patches(self):
        return (
            patch('services.sis_parent_service.registerable_students', return_value=_MINE),
            patch('services.sis_parent_service._changes_locked', return_value=False),
        )

    def test_add_class_blocked_while_submitted(self):
        reg, lock = self._base_patches()
        with reg, lock, \
             patch('services.sis_schedule_submission_service.current',
                   return_value={'status': 'submitted'}):
            out = parent.add_class('g1', 'org1', 'stu1', 'c1')
        assert out.get('submission_locked') is True
        assert 'submitted for approval' in out['error']

    def test_drop_class_blocked_while_approved(self):
        reg, lock = self._base_patches()
        with reg, lock, \
             patch('services.sis_schedule_submission_service.current',
                   return_value={'status': 'approved'}):
            out = parent.drop_class('g1', 'org1', 'stu1', 'c1')
        assert out.get('submission_locked') is True
        assert 'approved' in out['error']

    def test_sent_back_unlocks_changes(self):
        reg, lock = self._base_patches()
        with reg, lock, \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_schedule_submission_service.current',
                   return_value={'status': 'sent_back'}), \
             patch('services.sis_parent_service.catalog.list_classes', return_value=[]):
            out = parent.add_class('g1', 'org1', 'stu1', 'c1')
        assert out == {'error': 'This class is not open for registration'}

    def test_submit_schedule_requires_classes(self):
        reg, lock = self._base_patches()
        tables = {'class_enrollments': _chain([])}
        with reg, lock, \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_parent_service._admin', return_value=_client(tables)):
            out = parent.submit_schedule('g1', 'org1', 'stu1')
        assert 'at least one class' in out['error']

    def test_submit_schedule_submits(self):
        reg, lock = self._base_patches()
        tables = {'class_enrollments': _chain([{'id': 'e1'}])}
        with reg, lock, \
             patch('services.sis_parent_service._family_gate', return_value=None), \
             patch('services.sis_parent_service._admin', return_value=_client(tables)), \
             patch('services.sis_schedule_submission_service.submit',
                   return_value={'submission': _SUBMITTED}) as do_submit:
            out = parent.submit_schedule('g1', 'org1', 'stu1')
        assert out['submission']['status'] == 'submitted'
        do_submit.assert_called_once_with('org1', 'stu1', 'g1')

    def test_submit_schedule_respects_family_hold(self):
        reg, lock = self._base_patches()
        hold = {'error': 'on hold', 'registration_hold': True}
        with reg, lock, \
             patch('services.sis_parent_service._family_gate', return_value=hold):
            out = parent.submit_schedule('g1', 'org1', 'stu1')
        assert out == hold


@pytest.mark.unit
class TestSchedulePayloadDegradation:
    """Pre-migration safety: with the submissions table missing, the builder
    must still load AND hide the Submit-for-approval button (approval_enabled
    False) instead of surfacing a button that can only error."""

    def _payload(self, current_side_effect):
        tables = {
            'class_enrollments': _chain([]),
            'sis_waitlist_entries': _chain([]),
            'users': _chain([{'sis_tuition_plan': None}]),
        }
        with patch('services.sis_parent_service._can_register', return_value=True), \
             patch('services.sis_parent_service.catalog.list_classes', return_value=[]), \
             patch('services.sis_parent_service._student_course_enrollments', return_value=[]), \
             patch('services.sis_parent_service._student_household', return_value=None), \
             patch('services.sis_parent_service._sis_settings', return_value={}), \
             patch('services.sis_exception_service.pending_class_ids', return_value=[]), \
             patch('services.sis_enrollment_waitlist_service.waiting_entry', return_value=None), \
             patch('services.sis_parent_service._optio_courses_enabled', return_value=True), \
             patch('services.sis_parent_service._first_day_of_school', return_value=None), \
             patch('services.sis_parent_service._changes_locked', return_value=False), \
             patch('services.sis_learning_day_service.get_selection', return_value=None), \
             patch('services.sis_schedule_submission_service.current',
                   side_effect=current_side_effect), \
             patch('services.sis_parent_service._admin', return_value=_client(tables)):
            return parent.student_schedule('g1', 'org1', 'stu1')

    def test_approval_enabled_by_default_when_lookup_works(self):
        out = self._payload(lambda *a: None)
        assert out['approval_enabled'] is True
        assert out['submission'] is None

    def test_missing_table_disables_approval_and_still_loads(self):
        out = self._payload(RuntimeError('relation does not exist'))
        assert out['approval_enabled'] is False
        assert out['submission'] is None
        assert 'classes' in out  # the builder payload itself survived
