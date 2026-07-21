"""
Unit tests for the duplicate-student heuristic (services.sis_service).

The heuristic backs the add-member warning and the Families-page badge. It must
catch the iCreate re-registration pattern — the same child entered a second time,
often as a dependent with the name spelled differently (Zach/Zachary) or a DOB
off by a day — WITHOUT flagging twins/siblings who share a birthday.
"""

import pytest

from services.sis_service import likely_same_student, _mark_duplicate_members


def _s(first, last, dob=None):
    return {'first_name': first, 'last_name': last, 'date_of_birth': dob}


@pytest.mark.unit
class TestLikelySameStudent:
    def test_nickname_same_dob_is_duplicate(self):
        # The real Barlow case: original "Zach" vs funnel dependent "Zachary".
        assert likely_same_student(_s('Zach', 'Barlow', '2009-10-06'),
                                   _s('Zachary', 'Barlow', '2009-10-06')) is True

    def test_identical_name_one_day_dob_typo_is_duplicate(self):
        # The real Barlow case: "Olyvia" entered with DOB off by one day.
        assert likely_same_student(_s('Olyvia', 'Barlow', '2011-08-03'),
                                   _s('Olyvia', 'barlow', '2011-08-04')) is True

    def test_identical_name_year_dob_typo_is_duplicate(self):
        # The real Schaupp case: same first+last, DOB mistyped a year apart.
        assert likely_same_student(_s('Alivia', 'Schaupp', '2013-01-09'),
                                   _s('Alivia', 'Schaupp', '2014-01-09')) is True

    def test_identical_name_missing_dob_is_duplicate(self):
        assert likely_same_student(_s('Olyvia', 'Barlow', None),
                                   _s('Olyvia', 'Barlow', '2011-08-04')) is True

    def test_twins_same_dob_different_names_not_duplicate(self):
        # Same birthday, unrelated first names -> siblings, not a duplicate.
        assert likely_same_student(_s('Milo', 'Larson', '2019-05-04'),
                                   _s('Graham', 'Larson', '2019-05-04')) is False

    def test_nickname_but_different_dob_not_duplicate(self):
        # Prefix match only counts when the DOB matches exactly.
        assert likely_same_student(_s('Zach', 'Barlow', '2009-10-06'),
                                   _s('Zachary', 'Barlow', '2011-01-01')) is False

    def test_different_last_name_not_duplicate(self):
        assert likely_same_student(_s('Zach', 'Barlow', '2009-10-06'),
                                   _s('Zachary', 'Smith', '2009-10-06')) is False


@pytest.mark.unit
class TestMarkDuplicateMembers:
    def test_flags_both_sides_and_ignores_guardians(self):
        members = [
            {'user_id': 'g1', 'name': 'Lydia Barlow', 'relationship': 'guardian'},
            {'user_id': 'z1', 'name': 'Zach Barlow', 'relationship': 'student',
             'first_name': 'Zach', 'last_name': 'Barlow', 'date_of_birth': '2009-10-06'},
            {'user_id': 'z2', 'name': 'Zachary Barlow', 'relationship': 'student',
             'first_name': 'Zachary', 'last_name': 'Barlow', 'date_of_birth': '2009-10-06'},
            {'user_id': 'j1', 'name': 'Joseph Barlow', 'relationship': 'student',
             'first_name': 'Joseph', 'last_name': 'Barlow', 'date_of_birth': '2015-08-14'},
        ]
        _mark_duplicate_members(members)
        by_id = {m['user_id']: m for m in members}
        assert by_id['z1']['possible_duplicate'] is True
        assert by_id['z2']['possible_duplicate'] is True
        assert by_id['z1']['duplicate_with'][0]['user_id'] == 'z2'
        assert by_id['z2']['duplicate_with'][0]['user_id'] == 'z1'
        # Guardian and the unique sibling are never flagged.
        assert 'possible_duplicate' not in by_id['g1']
        assert 'possible_duplicate' not in by_id['j1']
