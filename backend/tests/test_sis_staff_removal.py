"""Archiving and deleting a staff member.

iCreate, 2026-08-08: "I tried to remove Education@icreatecollab.com as a staff
member, but it says I can only archive her because there is the onboarding
template. This was just a test... When I agreed to archive, it gave me an
internal error."

Two failures in one attempt, and the suite could see neither:

  - archive_staff read `sis_staff_profiles.id`. That table is keyed by user_id
    and has no `id` column, so archiving raised 42703 for everybody, always.
    restore_staff — the undo — had the identical bug, so even a successful
    archive could not have been reversed. Every existing test patches
    archive_staff out rather than running it, which is exactly why a column
    name that never existed survived to production.

  - an onboarding checklist blocked deletion even with nothing filled in, which
    is what pushed them toward the archive that then crashed.

So these tests run the real functions against a table mock that fails on any
column the schema does not have.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_staff_service as staff


ORG = 'org-1'
STAFF = 'staff-1'

# sis_staff_profiles, per 20260722_sis_teacher_portal.sql: user_id is the
# primary key. No `id`. This is the whole bug.
PROFILE_COLUMNS = {
    'user_id', 'organization_id', 'position', 'staff_type', 'pay_type', 'payroll_id',
    'hourly_rate_cents', 'emergency_contact_name', 'emergency_contact_phone',
    'work_schedule', 'start_date', 'end_date', 'is_active', 'uses_time_clock',
    'created_at', 'updated_at', 'archived_at', 'archived_by',
}


class UndefinedColumn(Exception):
    """Postgres 42703, which is what the real client raised."""


def _profiles_table(rows, calls):
    """A sis_staff_profiles mock that rejects columns the table does not have,
    the way PostgREST does."""
    t = Mock()

    def _check(*columns):
        for c in columns:
            if c not in PROFILE_COLUMNS:
                raise UndefinedColumn(
                    f'column sis_staff_profiles.{c} does not exist')

    def _select(cols='*'):
        _check(*[c.strip() for c in cols.split(',')]) if cols != '*' else None
        return t

    def _eq(column, _value):
        _check(column)
        return t

    def _update(payload):
        _check(*payload.keys())
        calls.append(('update', payload))
        return t

    def _insert(payload):
        _check(*payload.keys())
        calls.append(('insert', payload))
        return t

    t.select.side_effect = _select
    t.eq.side_effect = _eq
    t.update.side_effect = _update
    t.insert.side_effect = _insert
    t.limit.return_value = t
    t.delete.return_value = t
    t.execute.return_value = Mock(data=rows)
    return t


def _passthrough(rows=None):
    t = Mock()
    for chained in ('select', 'eq', 'in_', 'limit', 'delete', 'update', 'insert', 'contains'):
        getattr(t, chained).return_value = t
    t.execute.return_value = Mock(data=rows or [])
    return t


def _client(profile_rows, calls, onboarding_rows=None):
    c = Mock()

    def _table(name):
        if name == 'sis_staff_profiles':
            return _profiles_table(profile_rows, calls)
        if name == 'sis_onboarding_assignments':
            return _passthrough(onboarding_rows or [])
        return _passthrough()

    c.table.side_effect = _table
    return c


PREVIEW = {'staff': {'id': STAFF, 'name': 'Education', 'is_placeholder': False},
           'classes': [], 'assisting': [], 'history': {}, 'can_delete': True, 'blocking': {}}


@pytest.mark.unit
class TestArchive:
    def test_archiving_an_existing_profile_updates_it(self):
        calls = []
        with patch.object(staff, '_admin', return_value=_client([{'user_id': STAFF}], calls)), \
             patch.object(staff, 'staff_removal_preview', return_value=dict(PREVIEW)):
            result = staff.archive_staff(ORG, STAFF, actor_id='admin-1')
        assert result['archived'] is True
        assert [c[0] for c in calls] == ['update']
        assert calls[0][1]['is_active'] is False
        assert calls[0][1]['archived_by'] == 'admin-1'

    def test_archiving_somebody_with_no_profile_row_inserts_one(self):
        """Staff created before the profiles table, or never given employment
        details, still have to be archivable."""
        calls = []
        with patch.object(staff, '_admin', return_value=_client([], calls)), \
             patch.object(staff, 'staff_removal_preview', return_value=dict(PREVIEW)):
            result = staff.archive_staff(ORG, STAFF, actor_id='admin-1')
        assert result['archived'] is True
        assert [c[0] for c in calls] == ['insert']
        assert calls[0][1]['user_id'] == STAFF
        assert calls[0][1]['organization_id'] == ORG

    def test_a_failed_preview_stops_before_writing(self):
        calls = []
        with patch.object(staff, '_admin', return_value=_client([], calls)), \
             patch.object(staff, 'staff_removal_preview',
                          return_value={'error': 'Staff member not found'}):
            result = staff.archive_staff(ORG, STAFF, actor_id='admin-1')
        assert result['error'] == 'Staff member not found'
        assert calls == []


@pytest.mark.unit
class TestRestore:
    def test_restore_clears_the_archive_fields(self):
        calls = []
        with patch.object(staff, '_admin', return_value=_client([{'user_id': STAFF}], calls)):
            result = staff.restore_staff(ORG, STAFF)
        assert result['restored'] is True
        assert calls[0][1] == {'is_active': True, 'archived_at': None, 'archived_by': None}

    def test_restoring_somebody_with_no_profile_is_not_found(self):
        calls = []
        with patch.object(staff, '_admin', return_value=_client([], calls)):
            assert staff.restore_staff(ORG, STAFF)['error'] == 'Staff member not found'
        assert calls == []


@pytest.mark.unit
class TestOnboardingDoesNotBlockDeletionUntilSomebodyFillsItIn:
    def _count(self, rows):
        with patch.object(staff, '_admin', return_value=_client([], [], onboarding_rows=rows)):
            return staff._onboarding_with_work(ORG, STAFF)

    def test_an_untouched_checklist_is_not_history(self):
        """The report: a template assigned for a test, nothing filled in.
        Deleting the user cascades it away, so there is nothing to orphan."""
        assert self._count([{'status': 'in_progress',
                             'items': [{'status': 'pending'}, {'status': 'pending'}]}]) == 0

    def test_no_assignments_at_all(self):
        assert self._count([]) == 0

    def test_a_completed_item_is_history(self):
        assert self._count([{'status': 'in_progress',
                             'items': [{'status': 'complete'}, {'status': 'pending'}]}]) == 1

    def test_an_approved_item_is_history(self):
        assert self._count([{'status': 'in_progress', 'items': [{'status': 'approved'}]}]) == 1

    def test_an_uploaded_document_is_history_even_if_unapproved(self):
        """A background check somebody sent in is real work whatever its
        review state — unassign() treats uploads the same way."""
        assert self._count([{'status': 'in_progress',
                             'items': [{'status': 'pending',
                                        'document_url': 'staff-docs/bg.pdf'}]}]) == 1

    def test_a_complete_checklist_with_no_required_items_is_history(self):
        assert self._count([{'status': 'complete', 'items': []}]) == 1

    def test_only_the_touched_ones_are_counted(self):
        assert self._count([
            {'status': 'in_progress', 'items': [{'status': 'pending'}]},
            {'status': 'complete', 'items': [{'status': 'complete'}]},
            {'status': 'in_progress', 'items': []},
        ]) == 1

    def test_the_history_probe_is_actually_wired_to_this_rule(self):
        """Testing the helper alone would still pass if _staff_history went on
        counting every assignment — which is the behaviour being fixed."""
        rows = [{'status': 'in_progress', 'items': [{'status': 'pending'}]}]
        with patch.object(staff, '_admin', return_value=_client([], [], onboarding_rows=rows)):
            history = staff._staff_history(ORG, STAFF)
        assert history['onboarding'] == 0, 'an untouched checklist must not block deletion'

    def test_a_broken_probe_does_not_block_removal(self):
        """These probes fail open by design — a missing table must not make
        somebody permanently undeletable. It logs a warning so it is visible."""
        client = Mock()
        client.table.side_effect = RuntimeError('relation does not exist')
        with patch.object(staff, '_admin', return_value=client):
            assert staff._onboarding_with_work(ORG, STAFF) == 0
