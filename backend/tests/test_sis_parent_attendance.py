"""A family can see what the school recorded.

Every attendance route was ADMIN_ROLES + org_staff, so a parent could REPORT an
absence and never find out what came of it -- including whether the absence they
phoned in had been marked excused, which is the whole reason they phoned. The
answer existed; only staff could read it.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_parent_service as parent
from services import sis_attendance_service as attendance

ORG = 'org-1'
GUARDIAN = 'guardian-1'
KID = 'kid-1'
OTHER_KID = 'someone-elses-kid'

RECORDS = [
    {'id': 'a1', 'date': '2026-09-09', 'status': 'present', 'class_id': 'c1'},
    {'id': 'a2', 'date': '2026-09-08', 'status': 'absent', 'class_id': 'c1'},
    {'id': 'a3', 'date': '2026-09-08', 'status': 'excused', 'class_id': 'c2'},
]


def _registerable(*student_ids):
    return [{'student_id': sid, 'org_id': ORG} for sid in student_ids]


@pytest.mark.unit
class TestWhoMayRead:
    def test_a_guardian_reads_their_own_child(self):
        with patch.object(parent, 'registerable_students',
                          return_value=_registerable(KID)), \
                patch.object(attendance, 'student_history',
                             return_value={'records': RECORDS, 'summary': {}}):
            result = parent.student_attendance(GUARDIAN, ORG, KID)
        assert result['records'] == RECORDS

    def test_somebody_else_s_child_is_refused(self):
        with patch.object(parent, 'registerable_students',
                          return_value=_registerable(KID)), \
                patch.object(attendance, 'student_history') as history:
            result = parent.student_attendance(GUARDIAN, ORG, OTHER_KID)
        assert 'error' in result
        history.assert_not_called()

    def test_a_child_at_another_school_is_refused(self):
        """registerable_students carries the org, so a guardian with children at
        two schools cannot read one child's record through the other's org."""
        with patch.object(parent, 'registerable_students',
                          return_value=[{'student_id': KID, 'org_id': 'other-org'}]), \
                patch.object(attendance, 'student_history') as history:
            result = parent.student_attendance(GUARDIAN, ORG, KID)
        assert 'error' in result
        history.assert_not_called()


@pytest.mark.unit
class TestWhatComesBack:
    def test_one_class_can_be_asked_for(self):
        with patch.object(parent, 'registerable_students',
                          return_value=_registerable(KID)), \
                patch.object(attendance, 'student_history',
                             return_value={'records': [], 'summary': {}}) as history:
            parent.student_attendance(GUARDIAN, ORG, KID, class_id='c1')
        assert history.call_args.kwargs['class_id'] == 'c1'

    def test_the_summary_comes_with_it(self):
        summary = {'counts': {'present': 1}, 'total': 1, 'attendance_rate': 1.0}
        with patch.object(parent, 'registerable_students',
                          return_value=_registerable(KID)), \
                patch.object(attendance, 'student_history',
                             return_value={'records': RECORDS, 'summary': summary}):
            result = parent.student_attendance(GUARDIAN, ORG, KID)
        assert result['summary'] == summary


@pytest.mark.unit
class TestTheHistoryIsPaged:
    """A student with six classes meeting most days passes 1000 rows inside a
    school year, and PostgREST truncates at exactly that with nothing in the
    response to say so. The attendance RATE would quietly start describing only
    the most recent part of the year. No error, no symptom -- the number just
    becomes wrong."""

    def _client(self):
        client = Mock()
        table = Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'order', 'range', 'limit'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=RECORDS)
        return client, table

    def test_it_goes_through_the_paging_helper(self):
        client, _ = self._client()
        with patch.object(attendance, '_admin', return_value=client), \
                patch('utils.db_fetch.fetch_all_rows', return_value=RECORDS) as fetch:
            attendance.student_history(ORG, KID)
        fetch.assert_called_once()

    def test_a_class_filter_reaches_the_query(self):
        client, table = self._client()
        with patch.object(attendance, '_admin', return_value=client):
            attendance.student_history(ORG, KID, class_id='c1')
        assert ('class_id', 'c1') in [c[0] for c in table.eq.call_args_list]

    def test_no_class_filter_asks_for_every_class(self):
        client, table = self._client()
        with patch.object(attendance, '_admin', return_value=client):
            attendance.student_history(ORG, KID)
        assert 'class_id' not in [c[0][0] for c in table.eq.call_args_list]
