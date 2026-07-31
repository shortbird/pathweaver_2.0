"""
"None" is not an allergy.

iCreate's class rosters flagged a red health Alert on ~55 students whose parents
had typed "None"/"NA"/"N/A" into the optional allergies box. A badge that fires
on students with nothing to report is worse than no badge — it trains teachers
to ignore the one that matters.
"""

import pytest

from utils.blank_values import clean, has_value


@pytest.mark.unit
class TestHasValue:
    @pytest.mark.parametrize('raw', [
        None, '', '   ', 'none', 'None', 'NONE', 'none.', 'no', 'No', 'N/A', 'n/a',
        'na', 'NA', 'n.a.', 'nope', 'nil', 'nothing', '-', '--', 'not applicable',
        'None Known', 'NKA', 'no allergies', 'no medications', '0',
    ])
    def test_ways_of_saying_nothing(self, raw):
        assert has_value(raw) is False

    @pytest.mark.parametrize('raw', [
        'Peanuts', 'gluten', 'no nuts', 'none except dairy', 'Seasonal Allergies',
        'EpiPen for nut allergy', 'Cashews and Pistachios - severe anaphylaxis',
        'Nonefood dye',  # a real word that merely starts with "none"
    ])
    def test_real_answers_survive(self, raw):
        assert has_value(raw) is True

    def test_recurses_into_lists(self):
        assert has_value(['none', 'n/a']) is False
        assert has_value(['none', 'peanuts']) is True

    def test_recurses_into_dicts(self):
        assert has_value({'a': 'none'}) is False
        assert has_value({'a': 'none', 'b': 'latex'}) is True


@pytest.mark.unit
class TestClean:
    def test_blank_becomes_none(self):
        assert clean('None') is None
        assert clean('  ') is None

    def test_real_value_is_stripped(self):
        assert clean('  Peanuts  ') == 'Peanuts'


@pytest.mark.unit
class TestRosterAlert:
    """The roster's has_alert flag is what actually reaches the teacher."""

    def _alert_for(self, allergies, medications):
        from utils import blank_values
        a = blank_values.clean(allergies)
        m = blank_values.clean(medications)
        return bool(a or m)

    def test_none_typed_by_a_parent_is_not_an_alert(self):
        assert self._alert_for('None', 'None') is False

    def test_a_real_allergy_is_an_alert(self):
        assert self._alert_for('Peanuts', 'None') is True

    def test_a_real_medication_is_an_alert(self):
        assert self._alert_for('N/A', 'EpiPen') is True
