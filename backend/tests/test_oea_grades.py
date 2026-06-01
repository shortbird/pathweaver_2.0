"""
Unit tests for OEA GPA + pathway-progress math (backend/utils/oea_grades.py).
Pure functions, no DB — exercises the grading rules from PRD V2 section 4.4/4.6.
"""

import pytest

from utils.oea_grades import compute_gpa, compute_progress


def _credit(requirement_key, credits=1, status='complete', letter_grade=None, is_weighted=False):
    return {
        'requirement_key': requirement_key,
        'credits': credits,
        'status': status,
        'letter_grade': letter_grade,
        'is_weighted': is_weighted,
    }


@pytest.mark.unit
class TestComputeGpa:

    def test_empty_is_null(self):
        g = compute_gpa([])
        assert g == {'unweighted': None, 'weighted': None, 'graded_credits': 0.0}

    def test_ignores_in_progress_and_ungraded(self):
        g = compute_gpa([
            _credit('math', status='in_progress', letter_grade=None),
            _credit('science', status='complete', letter_grade=None),
        ])
        assert g['unweighted'] is None and g['graded_credits'] == 0.0

    def test_honors_weighting_adds_one(self):
        # One plain A (4.0) + one honors A (5.0 weighted), 1 credit each.
        g = compute_gpa([
            _credit('math', letter_grade='A'),
            _credit('science', letter_grade='A', is_weighted=True),
        ])
        assert g['unweighted'] == 4.0      # (4 + 4) / 2
        assert g['weighted'] == 4.5        # (4 + 5) / 2
        assert g['graded_credits'] == 2.0

    def test_credit_weighted_average(self):
        # A over 3 credits + C over 1 credit -> (4*3 + 2*1)/4 = 3.5
        g = compute_gpa([
            _credit('math', credits=3, letter_grade='A'),
            _credit('cte', credits=1, letter_grade='C'),
        ])
        assert g['unweighted'] == 3.5

    def test_f_counts_as_zero(self):
        g = compute_gpa([
            _credit('math', letter_grade='A'),
            _credit('science', letter_grade='F'),
        ])
        assert g['unweighted'] == 2.0      # (4 + 0) / 2


@pytest.mark.unit
class TestComputeProgress:

    def test_unknown_pathway_is_none(self):
        assert compute_progress('nope', []) is None

    def test_open_balanced_partial(self):
        # open_balanced: foundation math3/LA3/sci3/soc3 (=12), elective electives 12.
        credits = [
            _credit('math', credits=3, letter_grade='A'),          # foundation met
            _credit('student_choice', credits=2, letter_grade='B'),  # 2 of 12 elective
            _credit('science', credits=1, status='in_progress'),     # in progress
        ]
        p = compute_progress('open_balanced', credits)
        assert p['total_required'] == 24
        assert p['foundation_earned'] == 3.0
        assert p['elective_earned'] == 2.0
        assert p['total_earned'] == 5.0
        assert p['total_in_progress'] == 1.0
        assert p['is_complete'] is False
        math_req = next(r for r in p['requirements'] if r['key'] == 'math')
        assert math_req['is_met'] is True

    def test_earned_is_capped_per_requirement(self):
        # 5 math credits on a 3-credit Math slot count as 3 toward the requirement.
        p = compute_progress('open_balanced', [_credit('math', credits=5, letter_grade='A')])
        math_req = next(r for r in p['requirements'] if r['key'] == 'math')
        assert math_req['earned'] == 3.0
        assert p['foundation_earned'] == 3.0

    def test_complete_when_all_requirements_met(self):
        credits = [
            _credit('math', credits=3, letter_grade='A'),
            _credit('language_arts', credits=3, letter_grade='A'),
            _credit('science', credits=3, letter_grade='A'),
            _credit('social_studies', credits=3, letter_grade='A'),
            _credit('student_choice', credits=12, letter_grade='A'),
        ]
        p = compute_progress('open_balanced', credits)
        assert p['total_earned'] == 24.0
        assert p['percent_complete'] == 100.0
        assert p['is_complete'] is True
