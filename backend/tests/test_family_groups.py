"""
Family groups (services/sis_family_groups.py) and OpenEd as a funding source
(services/sis_payment_profile.py): the 53 Optio Academy families who came from
Hearthwood are in the "OpenEd" group, and OpenEd pays for them.
"""
from unittest.mock import patch

import pytest

from services import sis_family_groups as groups
from services import sis_payment_profile as profile
from services.crm_email_lists import build_directory, groups_by_user
from tests.crm_fakes import FakeSupabase

ORG = 'org-academy'
OTHER = 'org-other'


@pytest.fixture
def gdb():
    w = FakeSupabase()
    w.data['family_groups'] = []
    w.data['household_family_groups'] = []
    with patch('services.sis_family_groups._admin', return_value=w):
        yield w


@pytest.mark.unit
class TestGroups:
    def test_create_list_and_label_a_family(self, gdb):
        g = groups.create_group(ORG, '  OpenEd  ', 'admin-1')
        assert g['name'] == 'OpenEd'
        out = groups.set_household_groups(ORG, 'hh-1', [g['id'], g['id']], 'admin-1')
        assert out == [{'id': g['id'], 'name': 'OpenEd'}]
        assert groups.list_groups(ORG) == [{'id': g['id'], 'name': 'OpenEd', 'family_count': 1}]
        assert groups.groups_by_household(ORG) == {'hh-1': [{'id': g['id'], 'name': 'OpenEd'}]}

    def test_set_replaces_the_familys_groups(self, gdb):
        a = groups.create_group(ORG, 'OpenEd', 'u')
        b = groups.create_group(ORG, 'Scholarship', 'u')
        groups.set_household_groups(ORG, 'hh-1', [a['id'], b['id']], 'u')
        groups.set_household_groups(ORG, 'hh-1', [b['id']], 'u')
        assert [m['group_id'] for m in gdb.data['household_family_groups']] == [b['id']]
        groups.set_household_groups(ORG, 'hh-1', [], 'u')
        assert gdb.data['household_family_groups'] == []

    def test_names_are_unique_per_school_ignoring_case(self, gdb):
        groups.create_group(ORG, 'OpenEd', 'u')
        with pytest.raises(groups.GroupError):
            groups.create_group(ORG, 'opened', 'u')
        # Another school may use the same name.
        assert groups.create_group(OTHER, 'OpenEd', 'u')['name'] == 'OpenEd'
        with pytest.raises(groups.GroupError):
            groups.create_group(ORG, '   ', 'u')

    def test_another_schools_group_is_refused(self, gdb):
        theirs = groups.create_group(OTHER, 'OpenEd', 'u')
        with pytest.raises(groups.GroupError) as e:
            groups.set_household_groups(ORG, 'hh-1', [theirs['id']], 'u')
        assert e.value.status == 404
        with pytest.raises(groups.GroupError):
            groups.delete_group(ORG, theirs['id'])
        with pytest.raises(groups.GroupError):
            groups.rename_group(ORG, theirs['id'], 'Mine now')

    def test_roster_rows_carry_their_familys_group_names(self, gdb):
        g = groups.create_group(ORG, 'OpenEd', 'u')
        groups.set_household_groups(ORG, 'hh-1', [g['id']], 'u')
        roster = [{'household_id': 'hh-1'}, {'household_id': 'hh-2'}, {'household_id': None}]
        groups.attach_to_roster(ORG, roster)
        assert [r['household_groups'] for r in roster] == [['OpenEd'], [], []]


@pytest.mark.unit
class TestOpenEdFunding:
    def test_opened_is_a_funding_source_paid_by_a_funder(self):
        assert profile.funding_fields('opened') == {'funding_source': 'opened', 'ufa_private': False}
        assert profile.funder_of('opened') == 'OpenEd'
        assert profile.funder_of('ufa_private') == 'UFA'
        assert profile.funder_of('private_pay') is None
        assert profile.funder_of(None) is None
        assert 'opened' in profile.STAFF_ONLY_SOURCES

    def test_every_billing_surface_reads_the_one_list(self):
        from services import sis_billing_service, sis_tuition_service
        assert 'opened' in sis_billing_service.UFA_FUNDING_SOURCES
        assert sis_tuition_service.UFA_FUNDING_SOURCES is profile.FUNDER_PAID_SOURCES
        assert sis_billing_service._FUNDING_LABELS['opened'] == 'OpenEd'

    def test_no_registration_answer_derives_opened(self):
        # So a family's own edit can never set it, and must never clear it.
        for methods in (['Self-Pay'], ['Utah Fits All'], ['Something else']):
            assert profile.derive_funding_source({profile.METHOD_KEY: methods}) != 'opened'


@pytest.mark.unit
class TestDirectoryGroups:
    def test_everyone_in_the_family_carries_its_groups(self):
        people = build_directory(
            [{'id': 'pa', 'email': 'pa@x.com', 'first_name': 'Pa', 'role': 'parent'},
             {'id': 'kid', 'email': 'kid@x.com', 'first_name': 'Kid', 'role': 'student'},
             {'id': 'np', 'email': 'np@x.com', 'first_name': 'No', 'role': 'parent'}],
            {}, {}, set(),
            groups_by_user([{'household_id': 'hh-1', 'group_id': 'g-opened'}],
                           [{'household_id': 'hh-1', 'user_id': 'pa'},
                            {'household_id': 'hh-1', 'user_id': 'kid'},
                            {'household_id': 'hh-2', 'user_id': 'np'}]))
        by_id = {p['id']: p['group_ids'] for p in people}
        assert by_id == {'pa': ['g-opened'], 'kid': ['g-opened'], 'np': []}


@pytest.mark.unit
class TestFamilyEditKeepsOpenEd:
    """An OpenEd family who edits their stated payment method on
    /family/billing records the answer, but stays OpenEd: no answer implies
    OpenEd, and switching them to Self-Pay would offer them card checkout."""

    def _run(self, current_source):
        from services import sis_billing_service as billing
        writes = []

        class Households:
            def __init__(self, client=None):
                pass

            def members_for_households(self, ids):
                return [{'user_id': 'pa'}]

            def find_by_id(self, hid):
                return {'id': hid, 'funding_source': current_source}

            def update(self, hid, fields):
                writes.append(fields)

        class Registrations:
            def __init__(self, client=None):
                pass

            def latest_for_parents(self, org_id, ids):
                return []

            def update_answers(self, rid, answers):
                pass

        question = {'options': ['Self-Pay', 'Utah Fits All'], 'multi': False}
        with patch.object(billing, '_guardian_household_rows',
                          return_value=[{'id': 'hh-1', 'organization_id': ORG}]), \
             patch.object(billing, '_org_branding', return_value={ORG: {'funding_question': question}}), \
             patch.object(billing, '_admin'), \
             patch('repositories.household_repository.HouseholdRepository', Households), \
             patch('repositories.registration_repository.RegistrationRepository', Registrations):
            out = billing.set_stated_payment_methods('pa', 'hh-1', ['Self-Pay'])
        return out, writes

    def test_opened_survives_the_familys_own_edit(self):
        out, writes = self._run('opened')
        assert out['funding_source'] == 'opened'
        assert out['pay_through_ufa'] is True
        assert out['funder'] == 'OpenEd'
        assert writes == []

    def test_other_sources_still_follow_the_answer(self):
        out, writes = self._run('ufa')
        assert out['funding_source'] == 'private_pay'
        assert writes[0]['funding_source'] == 'private_pay'


@pytest.mark.unit
def test_paged_membership_reads_select_the_column_they_page_by():
    """fetch_all_rows orders by `id`. The membership table first shipped
    without one, every org-wide read raised, and the People page quietly
    showed no groups (2026-10-12)."""
    from repositories.crm_email_list_repository import CrmEmailListRepository
    from repositories.family_group_repository import FamilyGroupRepository

    class Query:
        def __init__(self, log):
            self.log = log

        def table(self, name):
            return self

        def select(self, columns):
            self.log.append(columns)
            return self

        def in_(self, *a):
            return self

    selected = []

    def fake_fetch(build_query, order_by='id', **kw):
        build_query()
        selected.append((selected_columns[-1], order_by))
        return []

    selected_columns = []
    client = Query(selected_columns)
    with patch('repositories.family_group_repository.fetch_all_rows', side_effect=fake_fetch), \
         patch('repositories.crm_email_list_repository.fetch_all_rows', side_effect=fake_fetch):
        FamilyGroupRepository(client=client).memberships(['g'])
        FamilyGroupRepository(client=client).all_memberships()
        CrmEmailListRepository(client=client).household_group_rows()
    assert len(selected) == 3
    for columns, order_by in selected:
        assert order_by in [c.strip() for c in columns.split(',')], columns
