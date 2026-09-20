"""
A child re-added by first name and birthday alone is the same child.

Lynette Thunstrom, iCreate, 2026-09-19. Her app was on the bundle from before
2026-09-15 and still asked /api/dependents/my-dependents, a route that no
longer exists; the path fell through to /<dependent_id>, whose UUID check
answered 400, and the Family tab showed no children. She typed "Daxton",
"Rivers" and "Zayah" with their birthdays back in, no last name, and the
guard let all three through: "daxton" is not "daxton evans", and the org
probe filtered last_name to the empty string. Six children by 04:38.

What this file pins:
  - a managed child with the same first name and birthday is a duplicate,
    whatever was or was not typed as a last name
  - the org-wide probe drops the last-name filter when none was typed
  - a different birthday is still a different child
"""

from unittest.mock import Mock, patch

import routes.dependents as dependents


PARENT = 'parent-1'
DOB = '2014-12-12'


class _Probe:
    """The org-wide query, remembering the filters asked of it."""

    def __init__(self, rows, filters):
        self._rows, self.filters = rows, filters

    def select(self, *_a, **_k):
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def ilike(self, field, value):
        self.filters[field] = value
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        return Mock(data=self._rows)


def _admin(mine, org_rows=(), filters=None):
    filters = filters if filters is not None else {}
    calls = {'n': 0}

    def table(name):
        calls['n'] += 1
        # First read: this parent's managed children. Second: the parent's
        # org. Third: the org-wide probe.
        if calls['n'] == 1:
            return _Probe(mine, {})
        if calls['n'] == 2:
            return _Probe([{'organization_id': 'org-1'}], {})
        return _Probe(list(org_rows), filters)

    admin = Mock()
    admin.table.side_effect = table
    return admin


DAXTON = {'id': 'kid-daxton', 'display_name': None, 'first_name': 'Daxton',
          'last_name': 'Evans', 'date_of_birth': DOB}


def test_first_name_and_birthday_alone_find_the_managed_child():
    with patch.object(dependents, 'get_supabase_admin_client', return_value=_admin([DAXTON])):
        dup = dependents._existing_child_match(PARENT, 'Daxton', '', DOB)
    assert dup['id'] == 'kid-daxton'


def test_case_and_whitespace_do_not_defeat_it():
    with patch.object(dependents, 'get_supabase_admin_client', return_value=_admin([DAXTON])):
        dup = dependents._existing_child_match(PARENT, '  daxton ', None, DOB)
    assert dup['id'] == 'kid-daxton'


def test_a_different_birthday_is_a_different_child():
    filters = {}
    with patch.object(dependents, 'get_supabase_admin_client',
                      return_value=_admin([DAXTON], filters=filters)):
        dup = dependents._existing_child_match(PARENT, 'Daxton', '', '2016-01-01')
    assert dup is None


def test_the_org_probe_drops_the_last_name_filter_when_none_was_typed():
    filters = {}
    with patch.object(dependents, 'get_supabase_admin_client',
                      return_value=_admin([], org_rows=[{'id': 'teen-1'}], filters=filters)):
        dup = dependents._existing_child_match(PARENT, 'Daxton', '', DOB)
    assert dup['id'] == 'teen-1'
    assert filters['first_name'] == 'daxton'
    assert 'last_name' not in filters


def test_the_org_probe_keeps_the_last_name_filter_when_one_was_typed():
    filters = {}
    with patch.object(dependents, 'get_supabase_admin_client',
                      return_value=_admin([], org_rows=[], filters=filters)):
        dependents._existing_child_match(PARENT, 'Daxton', 'Evans', DOB)
    assert filters['last_name'] == 'evans'
