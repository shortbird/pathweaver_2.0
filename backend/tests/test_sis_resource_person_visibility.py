"""
A resource shared with a named person, not just a role.

iCreate, 2026-09-01 (cf671ff2): "Can we share a resource with just a specific
person so they can have that link they have pinned in their portal? For example,
it would be nice to share the spreadsheet where all the purchase responses were
recorded."

`visible_to_roles` answers "which KIND of staff", which is the wrong question
for a link belonging to one person doing one job. The two narrowings are ORed:
ticking a role must not narrow away somebody named by hand, and naming somebody
must not narrow away the role.
"""

from unittest.mock import patch

import pytest

from services import sis_service


KATRINE = 'katrine'
TEACHER = 'a-teacher'


def _visible(rows, user_id, roles, is_admin=False):
    with patch.object(sis_service, 'caller_is_admin', return_value=is_admin), \
         patch.object(sis_service, 'caller_org_roles', return_value=roles):
        return [r['id'] for r in sis_service.filter_role_visible(user_id, rows)]


UNTARGETED = {'id': 'open'}
ROLE_ONLY = {'id': 'coords', 'visible_to_roles': ['campus_coordinator']}
PERSON_ONLY = {'id': 'katrines', 'visible_to_user_ids': [KATRINE]}
BOTH = {'id': 'both', 'visible_to_roles': ['campus_coordinator'],
        'visible_to_user_ids': [KATRINE]}
ALL_ROWS = [UNTARGETED, ROLE_ONLY, PERSON_ONLY, BOTH]


@pytest.mark.unit
class TestPersonVisibility:
    def test_a_person_named_by_hand_sees_it(self):
        assert 'katrines' in _visible(ALL_ROWS, KATRINE, ['advisor'])

    def test_nobody_else_does(self):
        assert 'katrines' not in _visible(ALL_ROWS, TEACHER, ['advisor'])

    def test_a_role_row_still_works_untouched(self):
        assert 'coords' in _visible(ALL_ROWS, TEACHER, ['campus_coordinator'])
        assert 'coords' not in _visible(ALL_ROWS, TEACHER, ['advisor'])

    def test_the_two_narrowings_are_ored_not_anded(self):
        """A row naming Katrine AND ticking Coordinators reaches both. ANDing
        them would mean ticking a second box quietly narrowed the first."""
        assert 'both' in _visible(ALL_ROWS, KATRINE, ['advisor'])          # named
        assert 'both' in _visible(ALL_ROWS, TEACHER, ['campus_coordinator'])  # role
        assert 'both' not in _visible(ALL_ROWS, TEACHER, ['advisor'])      # neither

    def test_an_untargeted_row_still_reaches_everyone(self):
        assert 'open' in _visible(ALL_ROWS, TEACHER, ['advisor'])

    def test_an_empty_list_is_not_a_narrowing(self):
        """A row whose arrays were cleared is back to reaching everyone, the
        same as NULL — otherwise emptying the picker would hide the row."""
        rows = [{'id': 'cleared', 'visible_to_roles': [], 'visible_to_user_ids': []}]
        assert _visible(rows, TEACHER, ['advisor']) == ['cleared']

    def test_the_office_still_sees_everything_it_curates(self):
        """An admin list that hides what it manages just lies."""
        assert _visible(ALL_ROWS, 'molly', [], is_admin=True) == [
            'open', 'coords', 'katrines', 'both']
