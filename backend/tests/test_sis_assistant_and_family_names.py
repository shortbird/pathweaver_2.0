"""
Two iCreate reports from 2026-08-04, both about a name on a screen not matching
who it actually is.

1. "Can we have a way to add an assistant? ... We would want to be able to add
   that class to their schedule in the teacher portal." The class form already
   had an "Assistant teacher(s)" field, and the catalog already listed them — but
   `advisor_class_ids`, which decides what a teacher sees in their portal AND
   what they're allowed to touch, only looked at primary_instructor_id and
   class_advisors. So naming an assistant did nothing for the assistant.

2. "When we have two families with the same last name, we need to have them
   identified differently than 'The Scott Family'. It caused some issues where
   the wrong kids were connected to the wrong parent!" Households are auto-named
   "<Last> Family" at registration, so the picker showed two identical rows.
"""

from unittest.mock import Mock, patch

import pytest

from services import sis_service


def _class_query_client(primary=(), assisting=(), advisors=()):
    """A client whose org_classes reads answer by filter: `.eq(primary_instructor_id)`
    returns `primary`, `.contains(assistant_instructor_ids)` returns `assisting`."""
    state = {}

    def table(name):
        t = Mock()
        t.select.return_value = t
        t.execute.return_value = Mock(data=list(advisors) if name == 'class_advisors' else [])

        def eq(col, _val):
            if col == 'primary_instructor_id':
                state['mode'] = 'primary'
                t.execute.return_value = Mock(data=list(primary))
            return t

        def contains(col, _val):
            if col == 'assistant_instructor_ids':
                state['mode'] = 'assisting'
                t.execute.return_value = Mock(data=list(assisting))
            return t

        t.eq.side_effect = eq
        t.contains.side_effect = contains
        return t

    client = Mock()
    client.table.side_effect = table
    return client


@pytest.mark.unit
class TestAssistantsReachTheirPortal:
    def _ids(self, **kw):
        client = _class_query_client(**kw)
        with patch('services.sis_service.get_supabase_admin_client', return_value=client):
            return sis_service.advisor_class_ids('kate', 'org-1')

    def test_a_class_you_assist_counts_as_yours(self):
        assert self._ids(assisting=[{'id': 'c-ukulele'}]) == ['c-ukulele']

    def test_teaching_and_assisting_both_come_back(self):
        ids = self._ids(primary=[{'id': 'c-art'}], assisting=[{'id': 'c-ukulele'}])
        assert set(ids) == {'c-art', 'c-ukulele'}

    def test_a_class_you_both_teach_and_assist_appears_once(self):
        assert self._ids(primary=[{'id': 'c-art'}], assisting=[{'id': 'c-art'}]) == ['c-art']

    def test_assisting_composes_with_class_advisors(self):
        ids = self._ids(assisting=[{'id': 'c-ukulele'}], advisors=[{'class_id': 'c-lego'}])
        assert set(ids) == {'c-ukulele', 'c-lego'}

    def test_someone_with_no_classes_still_gets_nothing(self):
        assert self._ids() == []


def _hh(hid, name, guardians=(), **over):
    row = {'id': hid, 'name': name,
           'members': [{'name': g, 'relationship': 'guardian', 'is_primary_guardian': i == 0}
                       for i, g in enumerate(guardians)]}
    row.update(over)
    return row


@pytest.mark.unit
class TestFamilyNamesAreTellableApart:
    def test_a_unique_family_name_is_left_alone(self):
        hhs = [_hh('h1', 'Scott Family', ['Dan Scott']), _hh('h2', 'Bowman Family', ['Ada Bowman'])]
        sis_service._disambiguate_household_names(hhs)
        assert [h['display_name'] for h in hhs] == ['Scott Family', 'Bowman Family']

    def test_colliding_names_are_split_by_their_guardians(self):
        hhs = [_hh('h1', 'Scott Family', ['Dan Scott', 'Marie Scott']),
               _hh('h2', 'Scott Family', ['Peter Scott'])]
        sis_service._disambiguate_household_names(hhs)
        assert hhs[0]['display_name'] == 'Scott Family (Dan & Marie)'
        assert hhs[1]['display_name'] == 'Scott Family (Peter)'

    def test_the_primary_guardian_leads_the_hint(self):
        h = _hh('h1', 'Scott Family')
        h['members'] = [
            {'name': 'Marie Scott', 'relationship': 'guardian', 'is_primary_guardian': False},
            {'name': 'Dan Scott', 'relationship': 'guardian', 'is_primary_guardian': True},
        ]
        hhs = [h, _hh('h2', 'Scott Family', ['Peter Scott'])]
        sis_service._disambiguate_household_names(hhs)
        assert hhs[0]['display_name'] == 'Scott Family (Dan & Marie)'

    def test_students_never_stand_in_for_a_guardian(self):
        """A kid's first name would read as the parent's — fall through instead."""
        h = _hh('h1', 'Scott Family')
        h['members'] = [{'name': 'Robin Scott', 'relationship': 'student'}]
        h['city'] = 'Provo'
        hhs = [h, _hh('h2', 'Scott Family', ['Peter Scott'])]
        sis_service._disambiguate_household_names(hhs)
        assert hhs[0]['display_name'] == 'Scott Family (Provo)'

    def test_address_is_the_last_resort_before_giving_up(self):
        hhs = [_hh('h1', 'Scott Family', address_line1='12 Oak St'),
               _hh('h2', 'Scott Family', ['Peter Scott'])]
        sis_service._disambiguate_household_names(hhs)
        assert hhs[0]['display_name'] == 'Scott Family (12 Oak St)'

    def test_nothing_to_tell_them_apart_leaves_the_name_undecorated(self):
        """Better an honest duplicate than 'Scott Family ()'."""
        hhs = [_hh('h1', 'Scott Family'), _hh('h2', 'Scott Family')]
        sis_service._disambiguate_household_names(hhs)
        assert [h['display_name'] for h in hhs] == ['Scott Family', 'Scott Family']

    def test_the_collision_check_ignores_case_and_padding(self):
        hhs = [_hh('h1', 'Scott Family ', ['Dan Scott']), _hh('h2', 'scott family', ['Peter Scott'])]
        sis_service._disambiguate_household_names(hhs)
        assert hhs[0]['display_name'] == 'Scott Family  (Dan)'
        assert hhs[1]['display_name'] == 'scott family (Peter)'
