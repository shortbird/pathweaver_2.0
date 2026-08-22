"""
The registration funnel records how the family said they will pay.

The household row is created a step before the payment question is asked, and
nothing ever came back to fill it in — so every iCreate family arrived at the
office with a blank funding source while their answer sat in the registration
row, unread by anything except the CLP page.

`_sync_household_payment` closes that loop. It only ever fills a BLANK field: a
staff decision on the Families page outranks a form answer, and re-submitting
the details step must not undo it.
"""

from unittest.mock import patch

import pytest

from routes.icreate_registration import _sync_household_payment

REG = {'id': 'reg1', 'organization_id': 'org1', 'parent_user_id': 'p1'}


class _Resp:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, table, admin):
        self.table, self.admin = table, admin
        self._op, self._payload = 'select', None

    def select(self, *a, **k):
        self._op = 'select'; return self

    def update(self, payload):
        self._op = 'update'; self._payload = payload; return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        if self._op == 'update':
            self.admin.updates.append((self.table, self._payload))
            return _Resp([])
        return _Resp(list(self.admin.selects.get(self.table, [])))


class _FakeAdmin:
    def __init__(self, household_row):
        self.selects = {'households': [household_row]}
        self.updates = []

    def table(self, name):
        return _Query(name, self)


def _sync(household_row, answers, household_id='h1'):
    admin = _FakeAdmin(household_row)
    with patch('routes.icreate_registration._existing_household_for_parent',
               return_value=household_id):
        _sync_household_payment(admin, REG, answers)
    return [p for t, p in admin.updates if t == 'households']


@pytest.mark.unit
class TestHouseholdPaymentSync:
    def test_blank_household_gets_the_funding_source_the_answers_imply(self):
        [update] = _sync({}, {'payment_intent': ['Utah Fits All']})
        assert update['funding_source'] == 'ufa'
        assert update['ufa_private'] is False

    def test_ufa_private_also_marks_them_enrolled_in_the_private_school(self):
        [update] = _sync({}, {'payment_intent': ['Utah Fits All'], 'ufa_private': 'Yes'})
        assert update['funding_source'] == 'ufa_private'
        assert update['ufa_private'] is True
        assert update['enrolled_private_school'] is True

    def test_a_staff_set_funding_source_is_never_overwritten(self):
        assert _sync({'funding_source': 'private_pay'},
                     {'payment_intent': ['Utah Fits All']}) == []

    def test_payment_plan_answer_is_recorded(self):
        [update] = _sync({}, {'payment_intent': ['Self-Pay'],
                              'payment_plan': 'Monthly payments'})
        assert update['payment_plan_preference'] == 'monthly'

    def test_a_staff_set_plan_is_never_overwritten(self):
        updates = _sync({'payment_plan_preference': 'in_full'},
                        {'payment_plan': 'Monthly payments'})
        assert updates == []

    def test_answers_that_imply_nothing_write_nothing(self):
        assert _sync({}, {'media_consent': 'I consent'}) == []

    def test_a_family_with_no_household_yet_is_a_no_op(self):
        assert _sync({}, {'payment_intent': ['Self-Pay']}, household_id=None) == []

    def test_a_database_failure_never_fails_the_registration(self):
        # The parent is mid-funnel; losing their registration over a decoration
        # would be far worse than a blank field on the Families page.
        with patch('routes.icreate_registration._existing_household_for_parent',
                   side_effect=RuntimeError('boom')):
            _sync_household_payment(_FakeAdmin({}), REG, {'payment_intent': ['Self-Pay']})
