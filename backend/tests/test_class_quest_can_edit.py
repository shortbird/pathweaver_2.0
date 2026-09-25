"""The learning app's class Quests tab offers the editor only where a save
would be allowed (iCreate teacher training, 2026-09-25).

The Edit pencil showed on every quest in a class, and a teacher filled in the
form on an office-made quest before the save answered "Not authorized".
Each class quest now carries `can_edit`, from the same rule the save uses.
"""

from unittest.mock import Mock, patch

import pytest

from routes.classes.quests import _mark_editable


def _client(user):
    c = Mock()
    for chained in ('table', 'select', 'in_'):
        getattr(c, chained).return_value = c
    c.execute.return_value = Mock(data=[user])
    return c


TEACHER = {'id': 't1', 'role': 'org_managed', 'org_role': 'advisor',
           'org_roles': ['advisor'], 'organization_id': 'org-1'}
ADMIN = {**TEACHER, 'id': 'a1', 'org_role': 'org_admin', 'org_roles': ['org_admin']}


def _rows():
    return [
        {'quest_id': 'mine', 'quests': {'id': 'mine', 'organization_id': 'org-1', 'created_by': 't1'}},
        {'quest_id': 'office', 'quests': {'id': 'office', 'organization_id': 'org-1', 'created_by': 'a1'}},
        {'quest_id': 'library', 'quests': {'id': 'library', 'organization_id': None, 'created_by': 'x'}},
        {'quest_id': 'gone', 'quests': None},
    ]


@pytest.mark.unit
def test_a_teacher_may_edit_only_the_quest_they_wrote():
    rows = _rows()
    with patch('routes.classes.quests.get_supabase_admin_client', return_value=_client(TEACHER)):
        _mark_editable('t1', rows)
    assert {r['quest_id']: r['can_edit'] for r in rows} == {
        'mine': True, 'office': False, 'library': False, 'gone': False}


@pytest.mark.unit
def test_the_office_may_edit_every_school_quest_but_not_the_library():
    rows = _rows()
    with patch('routes.classes.quests.get_supabase_admin_client', return_value=_client(ADMIN)):
        _mark_editable('a1', rows)
    assert {r['quest_id']: r['can_edit'] for r in rows} == {
        'mine': True, 'office': True, 'library': False, 'gone': False}
