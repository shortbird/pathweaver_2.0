"""
Who may edit a quest.

iCreate, 2026-08-27: "I am logged in as a teacher and made changes to a quest.
When I saved, it said I am not authorized to make changes to the quest. Is it
because I originally created the quest while logged in as an administrator?"

It was. The rule was `created_by == you` and nothing else, so the teacher of a
class could not edit the coursework attached to their own class as soon as
somebody else had typed it in. A class they teach now counts too.

The rule also read `org_role` by hand, which silently excluded campus
coordinators and anyone carrying their admin role in `org_roles`.
"""

from unittest.mock import Mock

import pytest

from routes.admin.quest_management.crud import _quest_edit_rights


class _Table:
    """One table's worth of a Supabase double: every chained call returns self,
    execute() returns whatever was registered for that table."""

    def __init__(self, rows):
        self._rows = rows

    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def in_(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def execute(self): return Mock(data=self._rows)


def _supabase(users=None, class_quests=None):
    tables = {'users': _Table(users or []), 'class_quests': _Table(class_quests or [])}
    client = Mock()
    client.table.side_effect = lambda name: tables[name]
    return client


ORG = 'org-1'
OTHER_ORG = 'org-2'


def _user(**over):
    return {'id': 'u1', 'role': 'org_managed', 'org_role': 'advisor',
            'org_roles': None, 'organization_id': ORG, **over}


def _quest(**over):
    return {'id': 'q1', 'organization_id': ORG, 'created_by': 'someone-else', **over}


@pytest.mark.unit
class TestFrontOffice:
    def test_a_superadmin_can_edit_and_publish_anything(self):
        db = _supabase(users=[_user(role='superadmin', org_role=None, organization_id=None)])
        assert _quest_edit_rights(db, 'u1', _quest()) == (True, True)

    def test_an_org_admin_can_edit_and_publish_in_their_own_org(self):
        db = _supabase(users=[_user(org_role='org_admin')])
        assert _quest_edit_rights(db, 'u1', _quest()) == (True, True)

    def test_a_campus_coordinator_counts_as_front_office(self):
        """Reading org_role against the literal 'org_admin' left coordinators out;
        the tier in utils/sis_roles.py is the whole point of that module."""
        db = _supabase(users=[_user(org_role='campus_coordinator')])
        assert _quest_edit_rights(db, 'u1', _quest()) == (True, True)

    def test_an_admin_role_carried_in_org_roles_counts_too(self):
        db = _supabase(users=[_user(org_role=None, org_roles=['org_admin', 'parent'])])
        assert _quest_edit_rights(db, 'u1', _quest()) == (True, True)

    def test_an_org_admin_cannot_reach_another_org(self):
        db = _supabase(users=[_user(org_role='org_admin')])
        assert _quest_edit_rights(db, 'u1', _quest(organization_id=OTHER_ORG)) == (False, False)


@pytest.mark.unit
class TestTeachers:
    def test_a_teacher_can_edit_their_own_quest(self):
        db = _supabase(users=[_user()])
        assert _quest_edit_rights(db, 'u1', _quest(created_by='u1')) == (True, False)

    def test_a_teacher_can_edit_a_quest_on_a_class_they_teach(self, monkeypatch):
        """The reported bug: an admin wrote it, the teacher owns the class."""
        from services import sis_service
        monkeypatch.setattr(sis_service, 'advisor_class_ids', lambda *_: ['c1'])
        db = _supabase(users=[_user()], class_quests=[{'class_id': 'c1'}])
        assert _quest_edit_rights(db, 'u1', _quest()) == (True, False)

    def test_a_teacher_cannot_edit_a_quest_on_a_class_they_do_not_teach(self, monkeypatch):
        from services import sis_service
        monkeypatch.setattr(sis_service, 'advisor_class_ids', lambda *_: ['c1'])
        db = _supabase(users=[_user()], class_quests=[])
        assert _quest_edit_rights(db, 'u1', _quest()) == (False, False)

    def test_a_teacher_with_no_classes_at_all(self, monkeypatch):
        from services import sis_service
        monkeypatch.setattr(sis_service, 'advisor_class_ids', lambda *_: [])
        db = _supabase(users=[_user()])
        assert _quest_edit_rights(db, 'u1', _quest()) == (False, False)

    def test_publishing_is_never_a_teachers_to_toggle(self, monkeypatch):
        from services import sis_service
        monkeypatch.setattr(sis_service, 'advisor_class_ids', lambda *_: ['c1'])
        db = _supabase(users=[_user()], class_quests=[{'class_id': 'c1'}])
        assert _quest_edit_rights(db, 'u1', _quest())[1] is False

    def test_an_active_quest_is_still_editable_by_its_author(self):
        """The old rule also demanded `not is_active`, which no creation path
        ever produced — so a teacher's own quest was frozen the moment it saved."""
        db = _supabase(users=[_user()])
        assert _quest_edit_rights(db, 'u1', _quest(created_by='u1', is_active=True))[0] is True


@pytest.mark.unit
class TestEveryoneElse:
    def test_a_student_may_not_edit(self):
        db = _supabase(users=[_user(org_role='student')])
        assert _quest_edit_rights(db, 'u1', _quest(created_by='u1')) == (False, False)

    def test_an_unknown_user_may_not_edit(self):
        db = _supabase(users=[])
        assert _quest_edit_rights(db, 'u1', _quest()) == (False, False)
