"""
Prior learning -> transcript conversion.

Everything here is a number that ends up on a high-school transcript, so the
properties under test are the ones where being wrong is expensive and quiet:

1. Credits convert at 2000 XP per credit — a full-year class is 1.0/2000, a
   semester 0.5/1000.
2. Converting the same record twice is refused. Double credit is invisible
   afterwards: the row just reads 2.0 where it should read 1.0.
3. Merging into an existing school row ADDS to it and syncs only the delta, so
   a second record from one school can't erase or re-award the first.
4. Course line items must add up to the subject credit they explain, or the
   transcript prints a total that disagrees with itself.
"""

from unittest.mock import Mock, patch

import pytest

from services import transfer_credit_service as credit


@pytest.mark.unit
class TestCreditArithmetic:
    def test_a_full_year_class_is_one_credit_worth_2000_xp(self):
        assert credit.credits_to_xp(1.0) == 2000

    def test_a_half_year_class_is_half_a_credit_worth_1000_xp(self):
        assert credit.credits_to_xp(0.5) == 1000

    def test_xp_converts_back_to_credits(self):
        assert credit.xp_to_credits(3000) == 1.5

    def test_an_empty_box_is_not_an_award(self):
        assert credit.validate_subject_credits({'math': 0}) == {}

    def test_an_absurd_credit_value_is_refused_by_name(self):
        with pytest.raises(ValueError, match='too high'):
            credit.validate_subject_credits({'math': 100})

    def test_a_subject_the_transcript_never_heard_of_is_refused(self):
        with pytest.raises(ValueError, match='Invalid subject'):
            credit.validate_subject_credits({'underwater_basket_weaving': 1.0})


@pytest.mark.unit
class TestCourseNames:
    def test_courses_must_sum_to_the_subject_credit(self):
        with pytest.raises(ValueError, match='must equal the subject total'):
            credit.clean_course_names(
                {'social_studies': [{'name': 'US History', 'credits': 0.5}]},
                {'social_studies': 2000},  # 1.0 credit, but the course says 0.5
            )

    def test_a_matching_split_is_kept(self):
        out = credit.clean_course_names(
            {'social_studies': [{'name': 'US History', 'credits': 0.5},
                                {'name': 'Government', 'credits': 0.5}]},
            {'social_studies': 2000},
        )
        assert len(out['social_studies']) == 2

    def test_courses_for_a_subject_with_no_credit_are_refused(self):
        with pytest.raises(ValueError, match='no credit'):
            credit.clean_course_names({'math': [{'name': 'Algebra', 'credits': 1.0}]}, {})


class _Chain:
    """Records the row handed to insert()/update() and answers execute() with a
    fixed result, so a test can assert on what would have been written."""

    def __init__(self, insert_into, update_into, returns):
        self._insert_into = insert_into
        self._update_into = update_into
        self._returns = returns

    def insert(self, row):
        if self._insert_into is not None:
            self._insert_into.update(row)
        return self

    def update(self, row):
        if self._update_into is not None:
            self._update_into.update(row)
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        return Mock(data=self._returns)


def _capturing_client(insert_into=None, update_into=None, returns=None):
    client = Mock()
    client.table.return_value = _Chain(insert_into, update_into, returns or [])
    return client


RECORD = {'id': 'rec-1', 'student_user_id': 'stu-1', 'provider': 'Cava Academy'}
AWARD = {
    'school_name': 'Cava Academy',
    'subject_credits': {'social_studies': 1.0},
    'course_names': {'social_studies': [{'name': 'US History', 'credits': 1.0}]},
}


@pytest.mark.unit
class TestConversion:
    def test_a_record_already_on_the_transcript_is_refused(self):
        with patch.object(credit, 'already_converted',
                          return_value={'id': 'tc-1', 'school_name': 'Cava Academy'}):
            result = credit.convert_prior_learning(RECORD, AWARD, 'admin-1')
        assert result['status'] == 409
        assert result['transfer_credit_id'] == 'tc-1'

    def test_a_new_school_creates_a_row_and_syncs_the_full_xp(self):
        inserted = {}
        client = _capturing_client(insert_into=inserted, returns=[{'id': 'tc-new'}])

        with patch.object(credit, 'already_converted', return_value=None), \
             patch.object(credit, 'row_for_school', return_value=None), \
             patch.object(credit, '_admin', return_value=client), \
             patch.object(credit, 'sync_xp', return_value={'success': True}) as sync:
            result = credit.convert_prior_learning(RECORD, AWARD, 'admin-1')

        assert result['action'] == 'created'
        assert inserted['subject_xp'] == {'social_studies': 2000}
        assert inserted['prior_learning_record_ids'] == ['rec-1']
        # Nothing existed before, so the whole award is the delta.
        sync.assert_called_once_with('stu-1', {'social_studies': 2000}, {})

    def test_a_second_record_from_one_school_adds_to_that_row(self):
        """The merge case: 1.0 already on file, another 1.0 arrives. The row must
        read 2.0 and the sync must be handed the OLD value, or the delta logic
        re-awards the first record's XP a second time."""
        existing = {
            'id': 'tc-1',
            'subject_xp': {'social_studies': 2000},
            'course_names': {'social_studies': [{'name': 'Government', 'credits': 1.0}]},
            'prior_learning_record_ids': ['rec-0'],
            'notes': None,
        }
        updated = {}
        client = _capturing_client(update_into=updated, returns=[{'id': 'tc-1'}])

        with patch.object(credit, 'already_converted', return_value=None), \
             patch.object(credit, 'row_for_school', return_value=existing), \
             patch.object(credit, '_admin', return_value=client), \
             patch.object(credit, 'sync_xp', return_value={'success': True}) as sync:
            result = credit.convert_prior_learning(RECORD, AWARD, 'admin-1')

        assert result['action'] == 'merged'
        assert updated['subject_xp'] == {'social_studies': 4000}
        assert updated['prior_learning_record_ids'] == ['rec-0', 'rec-1']
        # Both schools' courses survive the merge.
        assert len(updated['course_names']['social_studies']) == 2
        sync.assert_called_once_with(
            'stu-1', {'social_studies': 4000}, {'social_studies': 2000})

    def test_an_award_with_no_credit_is_refused(self):
        with patch.object(credit, 'already_converted', return_value=None):
            result = credit.convert_prior_learning(
                RECORD, {**AWARD, 'subject_credits': {}, 'course_names': {}}, 'admin-1')
        assert 'at least one subject' in result['error'].lower()

    def test_an_unnamed_school_is_refused(self):
        with patch.object(credit, 'already_converted', return_value=None):
            result = credit.convert_prior_learning(
                {'id': 'r', 'student_user_id': 's'},  # no provider to fall back on
                {**AWARD, 'school_name': ''}, 'admin-1')
        assert 'school' in result['error'].lower()
