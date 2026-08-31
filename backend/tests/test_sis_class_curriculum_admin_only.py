"""
Curriculum on a class is admin-only; teachers bring quests.

iCreate, 2026-08-31: teachers had an "Add curriculum" button on their class tab
and were creating whole curriculum entries with it. The school wants curriculum
defined by the office: teachers add QUESTS (class_quests, unchanged), which
attach to the class's curriculum via to-curriculum — but the curriculum entries
themselves are created, edited, and detached only by an admin.

The behaviour worth pinning is the gate itself: a teacher with full class access
(who passes _class_access as is_teacher) must be refused on every mutation, and
nothing may be written before the refusal.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.curriculum as curriculum


ORG = '11111111-1111-4111-8111-111111111111'
CLASS = '66666666-6666-4666-8666-666666666666'
CURR = '22222222-2222-4222-8222-222222222222'
TEACHER = '77777777-7777-4777-8777-777777777777'
ADMIN = '88888888-8888-4888-8888-888888888888'

CLASS_ROW = {'id': CLASS, 'organization_id': ORG, 'primary_instructor_id': TEACHER}


class _FakeTable:
    def __init__(self, name, rows, log):
        self.name = name
        self._rows = rows
        self._log = log

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def delete(self):
        self._log.append(('delete', self.name))
        return self

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        return self

    def update(self, payload):
        self._log.append(('update', self.name, payload))
        return self

    def execute(self):
        return Mock(data=self._rows)


def _run(route, args, body, *, as_admin, tables=None):
    """Drive a route function with _class_access stubbed to a teacher or an
    admin. Returns (json, status, write_log)."""
    log = []
    client = Mock()
    client.table.side_effect = lambda name: _FakeTable(name, (tables or {}).get(name, []), log)
    access = (CLASS_ROW, not as_admin, as_admin)
    with patch.object(curriculum, '_admin', return_value=client), \
         patch.object(curriculum, '_class_access', return_value=access), \
         patch.object(curriculum, '_attached_to_class', return_value=True), \
         patch.object(curriculum, '_owned',
                      return_value={'id': CURR, 'organization_id': ORG, 'created_by': TEACHER}), \
         patch.object(curriculum, 'request', Mock(get_json=lambda silent=True: body, args={})):
        from flask import Flask
        app = Flask(__name__)
        with app.app_context():
            fn = route.__wrapped__ if hasattr(route, '__wrapped__') else route
            resp = fn(ADMIN if as_admin else TEACHER, *args)
    body_json = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return body_json, status, log


def _writes(log):
    return [e for e in log if e[0] in ('insert', 'update', 'delete')]


@pytest.mark.unit
class TestTeachersAreRefused:
    def test_a_teacher_cannot_create_curriculum(self):
        out, status, log = _run(curriculum.create_class_curriculum, (CLASS,),
                                {'title': 'Saxon Math'}, as_admin=False)
        assert status == 403
        assert 'administrator' in out['error']
        # The refusal has to point at what they CAN do instead.
        assert 'quest' in out['error'].lower()
        assert _writes(log) == []

    def test_a_teacher_cannot_edit_even_an_entry_they_created(self):
        """created_by used to grant teachers edit rights; it no longer does."""
        out, status, log = _run(curriculum.update_class_curriculum, (CLASS, CURR),
                                {'title': 'New title'}, as_admin=False)
        assert status == 403
        assert _writes(log) == []

    def test_a_teacher_cannot_detach_curriculum(self):
        out, status, log = _run(curriculum.remove_class_curriculum, (CLASS, CURR),
                                {}, as_admin=False)
        assert status == 403
        assert _writes(log) == []


@pytest.mark.unit
class TestAdminsStillCan:
    def test_an_admin_creates_and_attaches_in_one_step(self):
        tables = {'sis_curriculum': [{'id': CURR, 'title': 'Saxon Math'}]}
        out, status, log = _run(curriculum.create_class_curriculum, (CLASS,),
                                {'title': 'Saxon Math'}, as_admin=True, tables=tables)
        assert status == 201
        inserted = {e[1] for e in log if e[0] == 'insert'}
        assert inserted == {'sis_curriculum', 'sis_curriculum_classes'}

    def test_an_admin_detach_only_detaches(self):
        """The library entry must survive being removed from its last class —
        deleting outright is the library page's job."""
        out, status, log = _run(curriculum.remove_class_curriculum, (CLASS, CURR),
                                {}, as_admin=True)
        assert status == 200
        assert ('delete', 'sis_curriculum_classes') in log
        assert ('delete', 'sis_curriculum') not in log


@pytest.mark.unit
class TestTheReadKeepsTeachersInformed:
    def test_a_teacher_still_reads_the_curriculum_but_is_not_admin(self):
        """can_manage keeps the staff conveniences (share-to-class, course edit
        links); is_admin is what gates the add/edit/remove UI."""
        out, status, _ = _run(curriculum.class_curriculum, (CLASS,), {}, as_admin=False)
        assert status == 200
        assert out['can_manage'] is True
        assert out['is_admin'] is False
