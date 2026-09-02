"""
Who a family's billing email actually reaches.

One function, _guardian_emails_for_household, decides the recipients for every
piece of money mail the SIS sends: the invoice email, the overdue reminder
sweep, the autopay link, and the monthly-tuition card-setup link. When it
returns nothing the school is not told — the invoice email reports `emailed: 0`
and the reminder sweep simply skips the family — so a household it cannot
resolve is a family that quietly never hears from the school again.

Optio Academy walked into that on 2026-09-02. The Hanna household held two
students and no guardian member: the office had approved both parents as
parent_student_links, but never separately recorded either as a guardian OF THE
HOUSEHOLD. Monthly tuition was set up for $1,000 a student, the office pressed
the button to email the setup link, and got "This family has no guardian email
on file" for two parents whose verified links were sitting one table away.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_billing_service as billing


HH = 'f1c1d9bb-0f30-4a2f-b0f6-3f4b9f2a1d55'


class _FakeTable:
    """Records the filters applied, so a query can answer from a fixture."""

    def __init__(self, rows_for):
        self._rows_for = rows_for
        self._filters = {}

    def select(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def in_(self, col, vals):
        self._filters[col] = list(vals)
        return self

    def execute(self):
        return Mock(data=self._rows_for(self._filters))


def _client(*, members, links, users, primary=None):
    """A Supabase stand-in holding one household's worth of rows."""
    def table(name):
        if name == 'household_members':
            return _FakeTable(lambda f: members)
        if name == 'households':
            return _FakeTable(lambda f: [{'primary_contact_user_id': primary}])
        if name == 'parent_student_links':
            return _FakeTable(lambda f: [
                r for r in links
                if r['student_user_id'] in f.get('student_user_id', [])
                and r.get('status') == f.get('status', 'approved')
            ])
        if name == 'users':
            return _FakeTable(lambda f: [u for u in users if u['id'] in f.get('id', [])])
        raise AssertionError(f'unexpected table {name}')

    client = Mock()
    client.table.side_effect = table
    return client


def _resolve(**kwargs):
    with patch.object(billing, '_admin', return_value=_client(**kwargs)):
        return billing._guardian_emails_for_household(
            HH, billing._household_primary_contact(HH))


PAIGE = {'id': 'p-paige', 'first_name': 'Paige', 'last_name': 'Hanna',
         'email': 'paige@example.com'}
JOHNNY = {'id': 'p-johnny', 'first_name': 'Johnny', 'last_name': 'Hanna',
          'email': 'johnny@example.com'}
CAROLYN = {'id': 'p-carolyn', 'first_name': 'Carolyn', 'last_name': 'Waite',
           'email': 'carolyn@example.com'}


@pytest.mark.unit
class TestGuardianResolution:
    def test_a_recorded_guardian_is_the_answer(self):
        found = _resolve(
            members=[{'user_id': 'p-carolyn', 'relationship': 'guardian'},
                     {'user_id': 's-emory', 'relationship': 'student'}],
            links=[], users=[CAROLYN])
        assert [g['email'] for g in found] == ['carolyn@example.com']

    def test_the_students_approved_parents_stand_in_when_nobody_is_recorded(self):
        # The Hanna case: two students, no guardian member, two verified parents.
        found = _resolve(
            members=[{'user_id': 's-banks', 'relationship': 'student'},
                     {'user_id': 's-conrad', 'relationship': 'student'}],
            links=[{'student_user_id': 's-banks', 'parent_user_id': 'p-paige',
                    'status': 'approved'},
                   {'student_user_id': 's-conrad', 'parent_user_id': 'p-johnny',
                    'status': 'approved'}],
            users=[PAIGE, JOHNNY])
        assert sorted(g['email'] for g in found) == ['johnny@example.com',
                                                     'paige@example.com']

    def test_a_parent_deliberately_left_off_stays_off(self):
        # A recorded guardian is the office naming who pays. The fallback must
        # not quietly re-add the second parent they chose to exclude — an ex
        # spouse who is not billed should not start receiving the bills.
        found = _resolve(
            members=[{'user_id': 'p-paige', 'relationship': 'guardian'},
                     {'user_id': 's-banks', 'relationship': 'student'}],
            links=[{'student_user_id': 's-banks', 'parent_user_id': 'p-johnny',
                    'status': 'approved'}],
            users=[PAIGE, JOHNNY])
        assert [g['email'] for g in found] == ['paige@example.com']

    def test_the_primary_contact_alone_suppresses_the_fallback(self):
        found = _resolve(
            members=[{'user_id': 's-banks', 'relationship': 'student'}],
            links=[{'student_user_id': 's-banks', 'parent_user_id': 'p-johnny',
                    'status': 'approved'}],
            users=[PAIGE, JOHNNY], primary='p-paige')
        assert [g['email'] for g in found] == ['paige@example.com']

    def test_the_same_parent_of_two_children_is_emailed_once(self):
        found = _resolve(
            members=[{'user_id': 's-banks', 'relationship': 'student'},
                     {'user_id': 's-conrad', 'relationship': 'student'}],
            links=[{'student_user_id': 's-banks', 'parent_user_id': 'p-paige',
                    'status': 'approved'},
                   {'student_user_id': 's-conrad', 'parent_user_id': 'p-paige',
                    'status': 'approved'}],
            users=[PAIGE])
        assert len(found) == 1

    def test_an_unapproved_link_is_not_a_guardian(self):
        found = _resolve(
            members=[{'user_id': 's-banks', 'relationship': 'student'}],
            links=[{'student_user_id': 's-banks', 'parent_user_id': 'p-johnny',
                    'status': 'pending'}],
            users=[JOHNNY])
        assert found == []

    def test_a_household_of_students_with_no_links_resolves_to_nobody(self):
        # Still empty — but now that is a real "nobody to email", which the
        # monthly-tuition screen shows as the school's blocker rather than the
        # family's.
        found = _resolve(
            members=[{'user_id': 's-banks', 'relationship': 'student'}],
            links=[], users=[])
        assert found == []

    def test_the_order_is_stable_whatever_the_database_returns(self):
        # _pay_link_guardian takes the first of these as the payer when no
        # primary contact is set, so an arbitrary order means the parent named
        # on screen and the parent the card lands under can disagree.
        rows = [{'student_user_id': 's-banks', 'parent_user_id': 'p-paige', 'status': 'approved'},
                {'student_user_id': 's-banks', 'parent_user_id': 'p-johnny', 'status': 'approved'}]
        members = [{'user_id': 's-banks', 'relationship': 'student'}]
        forward = _resolve(members=members, links=rows, users=[PAIGE, JOHNNY])
        backward = _resolve(members=members, links=rows, users=[JOHNNY, PAIGE])
        assert [g['name'] for g in forward] == [g['name'] for g in backward]
        assert forward[0]['name'] == 'Johnny Hanna'

    def test_a_parent_with_no_email_is_not_a_recipient(self):
        found = _resolve(
            members=[{'user_id': 's-banks', 'relationship': 'student'}],
            links=[{'student_user_id': 's-banks', 'parent_user_id': 'p-ghost',
                    'status': 'approved'}],
            users=[{'id': 'p-ghost', 'first_name': 'No', 'last_name': 'Mail',
                    'email': None}])
        assert found == []


@pytest.mark.unit
class TestPayLinkGuardian:
    """The card-setup checkout names one guardian to bill. It reads the same
    resolver, so the fallback has to carry it too — otherwise the setup link
    sends fine and then dead-ends on 'Only a parent or guardian can set up
    automatic payments'."""

    def test_the_fallback_can_open_a_checkout(self):
        with patch.object(billing, '_admin', return_value=_client(
                members=[{'user_id': 's-banks', 'relationship': 'student'}],
                links=[{'student_user_id': 's-banks', 'parent_user_id': 'p-paige',
                        'status': 'approved'}],
                users=[dict(PAIGE, is_dependent=False)])):
            guardian = billing._pay_link_guardian({'household_id': HH})
        assert guardian['email'] == 'paige@example.com'

    def test_a_dependent_never_becomes_the_payer(self):
        # A child should never hold a parent link, but a tokenless path must not
        # be the way around the refusal to make a Stripe customer of a minor.
        with patch.object(billing, '_admin', return_value=_client(
                members=[{'user_id': 's-banks', 'relationship': 'student'}],
                links=[{'student_user_id': 's-banks', 'parent_user_id': 'p-kid',
                        'status': 'approved'}],
                users=[{'id': 'p-kid', 'first_name': 'Small', 'last_name': 'Child',
                        'email': 'kid@example.com', 'is_dependent': True}])):
            assert billing._pay_link_guardian({'household_id': HH}) is None
