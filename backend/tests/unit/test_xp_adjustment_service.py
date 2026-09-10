"""Changing what a completed task is worth, after it has already paid out.

By the time anyone wants to change this number, the XP has gone three places:
the task row, the student's pillar XP (credited the moment they completed it),
and the denormalized total on their user row. Writing only the first leaves a
profile showing XP for work that was re-valued, and the totals never reconcile.

The floor tests carry a real distinction. A reviewer trimming an over-asked
credit request is held to the platform floor, because a task is either worth
crediting or it is not. The SIS teacher override passes 0, because it has always
let a teacher zero out a task entered by mistake -- and taking that away while
extracting shared arithmetic would be a behaviour change smuggled in as a refactor.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from services.xp_adjustment_service import (
    XPAdjustmentError,
    adjust_task_xp,
    rescale_subjects,
)

STUDENT = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
TASK = {
    'id': 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'quest_id': 'q1',
    'pillar': 'stem',
    'xp_value': 200,
    'diploma_subjects': ['science'],
    'subject_xp_distribution': {'science': 120, 'math': 80},
}


class _Table:
    def __init__(self, rows, writes, name):
        self._rows = rows
        self._writes = writes
        self._name = name

    def __getattr__(self, attr):
        if attr == 'execute':
            return lambda: SimpleNamespace(data=self._rows, count=len(self._rows))
        if attr in ('update', 'insert'):
            def _write(payload):
                self._writes.append((self._name, attr, payload))
                return self
            return _write
        return lambda *a, **k: self


def _client(pillar_xp=500, audit_fails=False):
    writes = []
    tables = {
        'user_skill_xp': [{'id': 'sx1', 'xp_amount': pillar_xp}] if pillar_xp is not None else [],
        'sis_xp_adjustments': [],
        'user_quest_tasks': [],
    }
    client = MagicMock()

    def table(name):
        if name == 'sis_xp_adjustments' and audit_fails:
            broken = MagicMock()
            broken.insert.side_effect = RuntimeError('audit table is unhappy')
            return broken
        return _Table(tables.get(name, []), writes, name)

    client.table.side_effect = table
    client._writes = writes
    return client


def _adjust(client, new_xp=100, **kwargs):
    kwargs.setdefault('reason', 'The evidence shows less than this')
    kwargs.setdefault('source', 'credit_review')
    with patch('services.xp_service.XPService') as xp_service:
        result = adjust_task_xp(client, task=TASK, student_id=STUDENT,
                                new_xp=new_xp, adjusted_by='reviewer-1', **kwargs)
    return result, xp_service


def _writes_to(client, table, op='update'):
    return [p for t, o, p in client._writes if t == table and o == op]


@pytest.mark.unit
class TestTheTaskRow:
    def test_the_new_value_is_written(self):
        client = _client()
        _adjust(client, 100)
        assert _writes_to(client, 'user_quest_tasks')[0]['xp_value'] == 100

    def test_the_subject_split_is_rewritten_at_the_new_total(self):
        client = _client()
        result, _ = _adjust(client, 100)
        assert sum(result.subjects_after.values()) == 100
        assert set(result.subjects_after) == {'science', 'math'}

    def test_the_split_keeps_its_proportions(self):
        result, _ = _adjust(_client(), 100)
        assert result.subjects_after['science'] > result.subjects_after['math']


@pytest.mark.unit
class TestThePillarXPAlreadyCredited:
    def test_lowering_the_value_takes_the_difference_back(self):
        client = _client(pillar_xp=500)
        _adjust(client, 100)
        assert _writes_to(client, 'user_skill_xp')[0]['xp_amount'] == 400

    def test_it_never_goes_negative(self):
        """A negative row is worse than a slightly generous one."""
        client = _client(pillar_xp=50)
        _adjust(client, 100)
        assert _writes_to(client, 'user_skill_xp')[0]['xp_amount'] == 0

    def test_raising_the_value_adds_the_difference(self):
        client = _client(pillar_xp=500)
        _adjust(client, 300)
        assert _writes_to(client, 'user_skill_xp')[0]['xp_amount'] == 600

    def test_a_missing_pillar_row_is_created_only_when_owed(self):
        client = _client(pillar_xp=None)
        _adjust(client, 300)
        inserts = [p for t, o, p in client._writes
                   if t == 'user_skill_xp' and o == 'insert']
        assert inserts and inserts[0]['xp_amount'] == 100

    def test_the_denormalized_total_is_resynced(self):
        _, xp_service = _adjust(_client(), 100)
        xp_service.return_value.update_user_mastery.assert_called_once_with(STUDENT)

    def test_no_change_touches_no_pillar_xp(self):
        client = _client()
        result, _ = _adjust(client, 200)
        assert _writes_to(client, 'user_skill_xp') == []
        assert result.pillar_delta == 0


@pytest.mark.unit
class TestTheAuditRow:
    def test_it_records_who_changed_what_and_why(self):
        client = _client()
        _adjust(client, 100, completion_id='c1')
        row = [p for t, o, p in client._writes
               if t == 'sis_xp_adjustments' and o == 'insert'][0]
        assert row['xp_before'] == 200
        assert row['xp_after'] == 100
        assert row['adjusted_by'] == 'reviewer-1'
        assert row['source'] == 'credit_review'
        assert row['completion_id'] == 'c1'
        assert 'less than this' in row['reason']

    def test_a_platform_student_writes_a_null_org(self):
        client = _client()
        _adjust(client, 100, organization_id=None)
        row = [p for t, o, p in client._writes
               if t == 'sis_xp_adjustments' and o == 'insert'][0]
        assert row['organization_id'] is None

    def test_a_failed_audit_does_not_undo_the_adjustment(self):
        """The XP already moved. Raising here would report a false failure."""
        client = _client(audit_fails=True)
        result, _ = _adjust(client, 100)
        assert result.xp_after == 100
        assert result.audit_written is False


@pytest.mark.unit
class TestValidation:
    def test_a_reviewer_cannot_go_below_the_platform_floor(self):
        with pytest.raises(XPAdjustmentError):
            _adjust(_client(), 10)

    def test_a_teacher_correction_may_zero_a_task(self):
        """The floor is about what a task may be WORTH, not about a correction."""
        client = _client()
        result, _ = _adjust(client, 0, min_xp=0, source='sis_teacher')
        assert result.xp_after == 0

    def test_a_non_integer_is_refused(self):
        with pytest.raises(XPAdjustmentError):
            _adjust(_client(), '100')

    def test_a_boolean_is_refused(self):
        """True is an int in Python, and it is not an XP value."""
        with pytest.raises(XPAdjustmentError):
            _adjust(_client(), True)

    def test_a_reason_is_required(self):
        """Without one, an adjustment is indistinguishable from a data bug."""
        with pytest.raises(XPAdjustmentError):
            _adjust(_client(), 100, reason='   ')


@pytest.mark.unit
class TestRescalingSubjects:
    def test_it_sums_exactly_to_the_new_total(self):
        out = rescale_subjects({'science': 120, 'math': 80}, 100)
        assert sum(out.values()) == 100

    def test_everything_is_a_multiple_of_five(self):
        """The rest of the platform rounds this way; disagreeing produces a
        number nobody chose."""
        out = rescale_subjects({'science': 133, 'math': 67, 'health': 50}, 175)
        assert all(v % 5 == 0 for v in out.values())
        assert sum(out.values()) == 175

    def test_a_single_subject_takes_the_whole_total(self):
        assert rescale_subjects({'science': 200}, 75) == {'science': 75}

    def test_an_empty_split_stays_empty(self):
        assert rescale_subjects({}, 100) == {}

    def test_a_zero_total_produces_nothing(self):
        assert rescale_subjects({'science': 100}, 0) == {}
