"""
Unit tests for how a family's stated form of payment reaches staff.

iCreate's office could not see, anywhere they invoice from, whether a family was
on Utah Fits All: `households.funding_source` is staff-set and had never been
filled in for any of their 91 families, while the answer the families gave in
the registration funnel sat unread in `icreate_registrations.answers`.

These cover the reading of that answer, the conservative funding_source it
implies (this value gates card payment, so a multi-select must not silently turn
one on), and the registration step that now records both on the household.
"""

from unittest.mock import patch

import pytest

from services import sis_payment_profile as profile


@pytest.mark.unit
class TestReadAnswers:
    def test_multi_select_answer_is_a_list(self):
        read = profile.read_answers({'payment_intent': ['Self-Pay', 'Utah Fits All']})
        assert read['methods'] == ['Self-Pay', 'Utah Fits All']

    def test_single_string_answer_becomes_a_one_item_list(self):
        assert profile.read_answers({'payment_intent': 'Self-Pay'})['methods'] == ['Self-Pay']

    def test_ufa_private_follow_up_is_a_tristate(self):
        assert profile.read_answers({'ufa_private': 'Yes'})['ufa_private'] is True
        assert profile.read_answers({'ufa_private': 'No'})['ufa_private'] is False
        assert profile.read_answers({})['ufa_private'] is None

    def test_junk_answers_blob_reads_empty(self):
        assert profile.read_answers(None)['methods'] == []
        assert profile.read_answers('nonsense')['methods'] == []

    def test_blank_entries_are_dropped(self):
        assert profile.read_answers({'payment_intent': ['', '  ', 'OpenED']})['methods'] == ['OpenED']


@pytest.mark.unit
class TestNormalizePlan:
    @pytest.mark.parametrize('answer,expected', [
        ('Monthly payments', 'monthly'),
        ('I would like to pay in 10 installments', 'monthly'),
        ('Pay in full', 'in_full'),
        ('One-time payment', 'in_full'),
        ('monthly', 'monthly'),
        ('', None),
        (None, None),
        ('Undecided', None),
    ])
    def test_reads_the_wording_orgs_actually_use(self, answer, expected):
        assert profile.normalize_plan(answer) == expected


@pytest.mark.unit
class TestDeriveFundingSource:
    def test_ufa_alone_is_ufa(self):
        assert profile.derive_funding_source({'payment_intent': ['Utah Fits All']}) == 'ufa'

    def test_ufa_plus_the_private_school_follow_up_is_ufa_private(self):
        answers = {'payment_intent': ['Utah Fits All'], 'ufa_private': 'Yes'}
        assert profile.derive_funding_source(answers) == 'ufa_private'

    def test_ufa_answering_no_to_private_school_stays_plain_ufa(self):
        answers = {'payment_intent': ['Utah Fits All'], 'ufa_private': 'No'}
        assert profile.derive_funding_source(answers) == 'ufa'

    def test_self_pay_alone_is_private_pay(self):
        assert profile.derive_funding_source({'payment_intent': ['Self-Pay']}) == 'private_pay'

    def test_ufa_mixed_with_anything_else_is_other_not_ufa(self):
        # The gate matters: 'ufa' hides card payment on the family's billing
        # page. A family who ticked both must not lose the card.
        answers = {'payment_intent': ['Self-Pay', 'Utah Fits All']}
        assert profile.derive_funding_source(answers) == 'other'

    def test_scholarship_and_vendor_answers_are_other(self):
        answers = {'payment_intent': ['OpenED', 'Harmony Educational Services']}
        assert profile.derive_funding_source(answers) == 'other'

    def test_no_answer_derives_nothing(self):
        assert profile.derive_funding_source({}) is None
        assert profile.derive_funding_source({'payment_intent': []}) is None


@pytest.mark.unit
class TestProfilesForOrg:
    """The per-household map the Families list and tuition queue are built from."""

    def _run(self, regs, guardians=None):
        guardians = guardians or {'p1': 'h1', 'p2': 'h2'}
        with patch.object(profile, '_guardians_by_household', return_value=guardians), \
             patch.object(profile, 'fetch_all_rows', return_value=regs):
            return profile.profiles_for_org('org1')

    def test_maps_a_parents_answer_onto_their_household(self):
        out = self._run([{'parent_user_id': 'p1', 'created_at': '2026-07-01',
                          'answers': {'payment_intent': ['Utah Fits All']}}])
        assert out['h1']['methods'] == ['Utah Fits All']

    def test_latest_registration_wins(self):
        out = self._run([
            {'parent_user_id': 'p1', 'created_at': '2026-06-01',
             'answers': {'payment_intent': ['Self-Pay']}},
            {'parent_user_id': 'p1', 'created_at': '2026-08-01',
             'answers': {'payment_intent': ['Utah Fits All']}},
        ])
        assert out['h1']['methods'] == ['Utah Fits All']

    def test_an_older_answer_fills_only_what_the_newer_one_left_blank(self):
        # Re-registering a second child must not blank out the plan the family
        # gave the first time.
        out = self._run([
            {'parent_user_id': 'p1', 'created_at': '2026-08-01',
             'answers': {'payment_intent': ['Utah Fits All']}},
            {'parent_user_id': 'p1', 'created_at': '2026-06-01',
             'answers': {'payment_intent': ['Self-Pay'], 'payment_plan': 'Monthly payments'}},
        ])
        assert out['h1']['methods'] == ['Utah Fits All']
        assert out['h1']['plan'] == 'monthly'

    def test_registrations_by_someone_in_no_household_are_ignored(self):
        out = self._run([{'parent_user_id': 'stranger', 'created_at': '2026-08-01',
                          'answers': {'payment_intent': ['Self-Pay']}}])
        assert out == {}

    def test_registrations_that_answered_nothing_are_skipped(self):
        out = self._run([{'parent_user_id': 'p1', 'created_at': '2026-08-01',
                          'answers': {'media_consent': 'I consent'}}])
        assert out == {}

    def test_a_failed_read_degrades_to_empty_rather_than_erroring(self):
        # This decorates a page; it must never be what breaks the Families list.
        with patch.object(profile, '_guardians_by_household', side_effect=RuntimeError('boom')):
            assert profile.profiles_for_org('org1') == {}


@pytest.mark.unit
class TestAttachToHouseholds:
    def _attach(self, households, profiles):
        with patch.object(profile, 'profiles_for_org', return_value=profiles):
            profile.attach_to_households('org1', households)
        return households

    def test_decorates_each_household_with_what_the_family_said(self):
        [h] = self._attach(
            [{'id': 'h1'}],
            {'h1': {'methods': ['Utah Fits All'], 'ufa_private': True, 'plan': None}})
        assert h['stated_payment_methods'] == ['Utah Fits All']
        assert h['stated_ufa_private'] is True

    def test_a_household_that_never_registered_gets_empty_fields_not_missing_ones(self):
        [h] = self._attach([{'id': 'h1'}], {})
        assert h['stated_payment_methods'] == []
        assert h['payment_plan'] is None

    def test_staff_recorded_plan_outranks_the_registration_answer(self):
        # The family said "in full" on the form and later phoned to switch.
        [h] = self._attach(
            [{'id': 'h1', 'payment_plan_preference': 'monthly'}],
            {'h1': {'methods': [], 'ufa_private': None, 'plan': 'in_full'}})
        assert h['payment_plan'] == 'monthly'
        assert h['payment_plan_from_family'] == 'in_full'
