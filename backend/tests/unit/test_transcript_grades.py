"""Grades and GPA on the Optio transcript (utils/transcript_grades.py)."""

import pytest

from services import transfer_credit_service as credit
from utils.transcript_grades import compute_gpa, course_grade, normalize_grade


def _transfer(subject, credits, courses=None):
    return {'subjects': {subject: {'credits': credits}},
            'course_names': {subject: courses} if courses else {}}


class TestGrades:
    def test_a_lowercase_grade_is_accepted(self):
        assert normalize_grade(' b ') == 'B'

    def test_blank_means_no_grade(self):
        assert normalize_grade('') is None
        assert normalize_grade(None) is None

    def test_a_grade_off_the_scale_is_refused(self):
        with pytest.raises(ValueError):
            normalize_grade('A+')

    def test_an_ungraded_transfer_course_prints_as_an_a(self):
        assert course_grade({'name': 'Algebra 1', 'credits': 1.0}) == 'A'


class TestGpa:
    def test_nothing_completed_has_no_gpa(self):
        assert compute_gpa({}, [], []) is None

    def test_optio_credit_is_all_as(self):
        earned = {'math': {'credits': 1.5}}
        classes = [{'credits': 0.5, 'grade': 'A'}]
        assert compute_gpa(earned, classes, []) == 4.0

    def test_parent_entered_grades_are_weighted_by_credit(self):
        transfer = [_transfer('math', 1.5, [
            {'name': 'Algebra 1', 'credits': 1.0, 'grade': 'B'},
            {'name': 'Statistics', 'credits': 0.5, 'grade': 'C'},
        ])]
        earned = {'science': {'credits': 1.0}}
        # (3*1 + 2*0.5 + 4*1) / 2.5
        assert compute_gpa(earned, [], transfer) == 3.2

    def test_a_transfer_subject_with_no_course_breakdown_counts_as_an_a(self):
        assert compute_gpa({}, [], [_transfer('math', 1.0)]) == 4.0


class TestCourseNamesKeepGrades:
    def test_the_grade_survives_cleaning(self):
        out = credit.clean_course_names(
            {'math': [{'name': 'Algebra 1', 'credits': 1.0, 'grade': 'b'}]},
            {'math': 2000},
        )
        assert out == {'math': [{'name': 'Algebra 1', 'credits': 1.0, 'grade': 'B'}]}

    def test_a_course_with_no_grade_stays_ungraded(self):
        out = credit.clean_course_names(
            {'math': [{'name': 'Algebra 1', 'credits': 1.0}]}, {'math': 2000},
        )
        assert 'grade' not in out['math'][0]

    def test_a_bad_grade_is_refused(self):
        with pytest.raises(ValueError):
            credit.clean_course_names(
                {'math': [{'name': 'Algebra 1', 'credits': 1.0, 'grade': 'Z'}]},
                {'math': 2000},
            )
