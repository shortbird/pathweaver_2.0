"""Weekly goals: the week boundary, the freedom rule, and what a save writes."""

from datetime import date

import pytest

from services import sis_weekly_goal_service as svc
from services.sis_weekly_goal_service import (
    FREEDOM_EARNED, FREEDOM_NOT_EARNED, WeeklyGoalError, WeeklyGoalService,
    freedom_for, week_start_of,
)

ORG = 'org-1'
STUDENT = 'stu-1'
COACH = 'coach-1'
SUBJECTS = ['Reading', 'Math', 'Fitness']


def _week(goals, valid=0, checked=True):
    return {'goals': goals, 'valid_complaints': valid,
            'checked_in_at': '2026-10-01T00:00:00Z' if checked else None}


class TestWeekStart:
    def test_any_day_maps_to_its_monday(self):
        assert week_start_of('2026-10-01') == date(2026, 9, 28)  # a Thursday
        assert week_start_of('2026-09-28') == date(2026, 9, 28)
        assert week_start_of(date(2026, 10, 4)) == date(2026, 9, 28)  # Sunday

    def test_garbage_is_a_400_not_a_500(self):
        with pytest.raises(WeeklyGoalError):
            week_start_of('next week')


class TestFreedom:
    def test_all_set_goals_done_and_no_valid_complaint_earns_it(self):
        row = _week([{'goal': 'Ch 3', 'completed': True},
                     {'goal': '', 'completed': None}])
        assert freedom_for(row) == FREEDOM_EARNED

    def test_one_missed_goal_loses_it(self):
        row = _week([{'goal': 'Ch 3', 'completed': True},
                     {'goal': 'Lesson 12', 'completed': False}])
        assert freedom_for(row) == FREEDOM_NOT_EARNED

    def test_a_valid_complaint_loses_it_even_with_every_goal_done(self):
        row = _week([{'goal': 'Ch 3', 'completed': True}], valid=1)
        assert freedom_for(row) == FREEDOM_NOT_EARNED

    def test_undecided_before_the_check_in(self):
        assert freedom_for(_week([{'goal': 'Ch 3', 'completed': True}], checked=False)) is None

    def test_undecided_when_no_goal_was_set(self):
        assert freedom_for(_week([{'goal': '', 'completed': None}])) is None
        assert freedom_for(None) is None


class FakeRepo:
    def __init__(self, existing=None, student_org=ORG, role='student'):
        self.existing = existing
        self.saved = None
        self.student = {'id': STUDENT, 'organization_id': student_org, 'role': role}

    def user_row(self, user_id):
        return self.student

    def org_row(self, org_id):
        return {'id': ORG, 'feature_flags': {'sis_settings': {'goal_subjects': SUBJECTS}}}

    def get(self, org_id, student_id, week_start):
        return self.existing

    def upsert(self, payload):
        self.saved = payload
        return payload


@pytest.fixture(autouse=True)
def _fixed_clock(monkeypatch):
    monkeypatch.setattr(svc, 'now_iso', lambda: '2026-10-01T12:00:00Z')


class TestSave:
    def test_monday_goals_are_stamped_and_ordered_by_the_org_subjects(self):
        repo = FakeRepo()
        out = WeeklyGoalService(repo).save(ORG, STUDENT, '2026-09-30', {
            'goals': [{'subject': 'Math', 'goal': 'Lesson 12'},
                      {'subject': 'Reading', 'goal': 'Ch 3'},
                      {'subject': 'Basket weaving', 'goal': 'dropped'}],
        }, COACH)
        assert repo.saved['week_start'] == '2026-09-28'
        assert [g['subject'] for g in out['goals']] == SUBJECTS
        assert [g['goal'] for g in out['goals']] == ['Ch 3', 'Lesson 12', '']
        assert out['goals_set_by'] == COACH
        assert out['checked_in_at'] is None
        assert out['freedom'] is None

    def test_thursday_check_in_decides_every_unanswered_goal(self):
        existing = {'goals': [{'subject': 'Reading', 'goal': 'Ch 3', 'completed': None},
                              {'subject': 'Math', 'goal': 'Lesson 12', 'completed': None},
                              {'subject': 'Fitness', 'goal': '', 'completed': None}],
                    'goals_set_by': 'monday-coach', 'goals_set_at': '2026-09-28T09:00:00Z'}
        repo = FakeRepo(existing)
        out = WeeklyGoalService(repo).save(ORG, STUDENT, '2026-09-28', {
            'goals': [{'subject': 'Reading', 'goal': 'Ch 3', 'completed': True},
                      {'subject': 'Math', 'goal': 'Lesson 12'},
                      {'subject': 'Fitness', 'goal': ''}],
            'check_in': True,
        }, COACH)
        assert [g['completed'] for g in out['goals']] == [True, False, None]
        assert out['checked_in_by'] == COACH
        # The goals did not change, so Monday's coach keeps the credit.
        assert out['goals_set_by'] == 'monday-coach'
        assert out['freedom'] == FREEDOM_NOT_EARNED

    def test_valid_complaints_cannot_exceed_complaints(self):
        with pytest.raises(WeeklyGoalError):
            WeeklyGoalService(FakeRepo()).save(ORG, STUDENT, '2026-09-28', {
                'complaints': 1, 'valid_complaints': 2}, COACH)

    def test_negative_counts_are_refused(self):
        with pytest.raises(WeeklyGoalError):
            WeeklyGoalService(FakeRepo()).save(ORG, STUDENT, '2026-09-28', {
                'complaints': -1}, COACH)

    def test_a_student_of_another_school_is_not_found(self):
        with pytest.raises(LookupError):
            WeeklyGoalService(FakeRepo(student_org='other')).save(
                ORG, STUDENT, '2026-09-28', {}, COACH)

    def test_a_staff_member_is_not_a_student(self):
        with pytest.raises(LookupError):
            WeeklyGoalService(FakeRepo(role='advisor')).save(
                ORG, STUDENT, '2026-09-28', {}, COACH)
