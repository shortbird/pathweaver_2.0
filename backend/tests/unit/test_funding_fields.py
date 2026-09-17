"""One write path for a household's funding source (sis_payment_profile
.funding_fields / set_funding_source, M4 2026-09-17): the mirrors
`ufa_private` and `enrolled_private_school` derive from it, never on their own."""

from unittest.mock import MagicMock, patch

import pytest

from services import sis_payment_profile as profile


@pytest.mark.unit
class TestFundingFields:
    def test_ufa_private_implies_the_private_school(self):
        assert profile.funding_fields('ufa_private') == {
            'funding_source': 'ufa_private', 'ufa_private': True, 'enrolled_private_school': True}

    def test_other_sources_leave_the_school_of_record_alone(self):
        assert profile.funding_fields('ufa') == {'funding_source': 'ufa', 'ufa_private': False}
        assert profile.funding_fields('private_pay') == {'funding_source': 'private_pay', 'ufa_private': False}

    def test_clearing_clears_the_mirror(self):
        assert profile.funding_fields(None) == {'funding_source': None, 'ufa_private': False}
        assert profile.funding_fields('') == {'funding_source': None, 'ufa_private': False}

    def test_an_unknown_source_is_refused(self):
        with pytest.raises(ValueError):
            profile.funding_fields('bitcoin')

    def test_set_funding_source_writes_the_household(self):
        client = MagicMock()
        with patch.object(profile, '_admin', return_value=client):
            out = profile.set_funding_source('hh-1', 'ufa_private', extra={'payment_plan_preference': 'monthly'})
        assert out['enrolled_private_school'] is True and out['payment_plan_preference'] == 'monthly'
        client.table.assert_called_with('households')
        client.table.return_value.update.assert_called_with(out)
        client.table.return_value.update.return_value.eq.assert_called_with('id', 'hh-1')
