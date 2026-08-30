"""
Adults can see the class discussion board, and a class can switch it off.

Gryffin, 2026-08-29: "is there a way that teachers and parents see a group
chat?" The board had been on every class quest page since July, any enrolled
student could post, and no adult surface rendered it: 80 posts in two days on
two boards before anyone with authority over the room could read one.

Three rules, all enforced in routes/sis/class_discussions.py:
1. A guardian of an actively enrolled student reads the board and nothing more
   (can_post=False).
2. org_classes.discussion_enabled=False refuses students and guardians (403, so
   the component hides) and blocks every post; moderators keep the history.
3. Only a moderator (teacher/admin) can flip the switch.
"""

import uuid as _uuid
from unittest.mock import Mock, patch

import pytest
from flask import Flask

import app  # noqa: F401 — import graph ordering
from routes.sis import class_discussions as cd

CLASS_ID = str(_uuid.uuid4())
TEACHER = str(_uuid.uuid4())
STUDENT = str(_uuid.uuid4())
PARENT = str(_uuid.uuid4())
STRANGER = str(_uuid.uuid4())

CLASS_ROW = {'id': CLASS_ID, 'organization_id': 'org-1', 'name': 'Earth Science',
             'primary_instructor_id': TEACHER, 'status': 'active', 'discussion_enabled': True}


class _Table:
    """Records the PostgREST chain so the resolver can tell the two
    class_enrollments reads apart (caller-as-student vs. caller's children)."""

    def __init__(self, name, resolver):
        self.name, self.resolver, self.calls = name, resolver, []

    def __getattr__(self, attr):
        def chained(*args, **kwargs):
            self.calls.append((attr, args))
            return self
        return chained

    def execute(self):
        return Mock(data=self.resolver(self.name, self.calls))


class _Admin:
    def __init__(self, resolver):
        self.resolver = resolver
        self.tables = []

    def table(self, name):
        t = _Table(name, self.resolver)
        self.tables.append(t)
        return t


def _resolver(student_enrolled=False, child_enrolled=False):
    def resolve(table, calls):
        if table == 'class_enrollments':
            eqs = {a[0]: a[1] for name, a in calls if name == 'eq' and len(a) == 2}
            if 'student_id' in eqs:
                return [{'id': 'e1'}] if student_enrolled else []
            if any(name == 'in_' for name, _ in calls):
                return [{'id': 'e2'}] if child_enrolled else []
        return []
    return resolve


def _not_admin():
    return patch.object(cd.sis_service, 'caller_is_admin', return_value=False)


def _children(*ids):
    return patch('utils.class_membership.children_of_parent', return_value=set(ids))


def _json(resp):
    body = resp[0] if isinstance(resp, tuple) else resp
    return body.get_json()


def _status(resp):
    return resp[1] if isinstance(resp, tuple) else 200


@pytest.mark.unit
class TestGuardianReadsOnly:
    def test_a_parent_of_an_enrolled_student_may_read_but_not_post(self):
        admin = _Admin(_resolver(child_enrolled=True))
        with _not_admin(), _children(STUDENT):
            assert cd._access(PARENT, CLASS_ROW, admin) == (True, False, False)

    def test_a_parent_whose_child_is_in_another_class_is_refused(self):
        admin = _Admin(_resolver(child_enrolled=False))
        with _not_admin(), _children(STUDENT):
            assert cd._access(PARENT, CLASS_ROW, admin) == (False, False, False)

    def test_an_adult_with_no_children_is_still_refused(self):
        admin = _Admin(_resolver())
        with _not_admin(), _children():
            assert cd._access(STRANGER, CLASS_ROW, admin) == (False, False, False)
        # No roster lookup was even attempted for the guardian rule.
        assert not any(name == 'in_' for t in admin.tables for name, _ in t.calls)

    def test_students_and_teachers_are_unchanged(self):
        with _not_admin(), _children():
            assert cd._access(TEACHER, CLASS_ROW, _Admin(_resolver())) == (True, True, True)
            assert cd._access(STUDENT, CLASS_ROW, _Admin(_resolver(student_enrolled=True))) \
                == (True, False, True)


@pytest.mark.unit
class TestTheSwitch:
    def setup_method(self):
        self.app = Flask(__name__)

    def test_off_refuses_a_student_with_a_403_so_the_board_hides(self):
        off = {**CLASS_ROW, 'discussion_enabled': False}
        with self.app.test_request_context():
            access, err = cd._board_state(off, is_moderator=False, can_post=True)
        assert access is None
        assert _status(err) == 403
        assert _json(err)['error'] == 'Discussion is off for this class.'

    def test_off_keeps_the_history_for_the_teacher_but_closes_the_composer(self):
        off = {**CLASS_ROW, 'discussion_enabled': False}
        with self.app.test_request_context():
            access, err = cd._board_state(off, is_moderator=True, can_post=True)
        assert err is None
        assert access == {'is_moderator': True, 'can_post': False, 'enabled': False}

    def test_on_is_the_default_when_the_column_is_missing(self):
        row = {k: v for k, v in CLASS_ROW.items() if k != 'discussion_enabled'}
        with self.app.test_request_context():
            access, err = cd._board_state(row, is_moderator=False, can_post=True)
        assert err is None
        assert access['enabled'] is True and access['can_post'] is True

    def test_a_guardian_never_gets_can_post_even_when_on(self):
        with self.app.test_request_context():
            access, _ = cd._board_state(CLASS_ROW, is_moderator=False, can_post=False)
        assert access['can_post'] is False


def _call(view, *args, json=None, access=None):
    view = getattr(view, '__wrapped__', view)
    flask_app = Flask(__name__)
    admin = Mock()
    chain = Mock()
    admin.table.return_value = chain
    for m in ('update', 'eq', 'select', 'limit', 'order', 'in_', 'is_'):
        getattr(chain, m).return_value = chain
    chain.execute.return_value = Mock(data=[])
    with flask_app.test_request_context('/x', method='POST', json=json or {}), \
         patch.object(cd, '_authorize_class', return_value=(CLASS_ROW, access, None)), \
         patch.object(cd, 'get_supabase_admin_client', return_value=admin), \
         patch.object(cd, '_build_thread', return_value=[]):
        resp = view(*args)
    return resp, admin


MODERATOR = {'is_moderator': True, 'can_post': True, 'enabled': True}
GUARDIAN = {'is_moderator': False, 'can_post': False, 'enabled': True}
STUDENT_OFF_BOARD = {'is_moderator': True, 'can_post': False, 'enabled': False}


@pytest.mark.unit
class TestRoutes:
    def test_the_board_tells_the_client_what_the_viewer_may_do(self):
        resp, _ = _call(cd.get_discussion, PARENT, CLASS_ID, access=GUARDIAN)
        body = _json(resp)
        assert _status(resp) == 200
        assert body['can_post'] is False
        assert body['is_moderator'] is False
        assert body['discussion_enabled'] is True

    def test_a_guardian_cannot_post(self):
        resp, admin = _call(cd.post_discussion, PARENT, CLASS_ID,
                            json={'body': 'hi'}, access=GUARDIAN)
        assert _status(resp) == 403
        assert _json(resp)['error'] == 'You can read this board but not post on it.'
        admin.table.assert_not_called()

    def test_nobody_posts_on_a_board_that_is_off(self):
        resp, _ = _call(cd.post_discussion, TEACHER, CLASS_ID,
                        json={'body': 'hi'}, access=STUDENT_OFF_BOARD)
        assert _status(resp) == 403
        assert _json(resp)['error'] == 'Discussion is off for this class.'

    def test_a_moderator_switches_the_board_off(self):
        resp, admin = _call(cd.update_discussion_settings, TEACHER, CLASS_ID,
                            json={'enabled': False}, access=MODERATOR)
        assert _status(resp) == 200
        assert _json(resp)['discussion_enabled'] is False
        admin.table.assert_called_with('org_classes')
        payload = admin.table.return_value.update.call_args[0][0]
        assert payload['discussion_enabled'] is False

    def test_a_student_cannot_touch_the_switch(self):
        student = {'is_moderator': False, 'can_post': True, 'enabled': True}
        resp, admin = _call(cd.update_discussion_settings, STUDENT, CLASS_ID,
                            json={'enabled': False}, access=student)
        assert _status(resp) == 403
        admin.table.assert_not_called()

    def test_the_switch_only_takes_a_real_boolean(self):
        resp, admin = _call(cd.update_discussion_settings, TEACHER, CLASS_ID,
                            json={'enabled': 'no'}, access=MODERATOR)
        assert _status(resp) == 400
        admin.table.assert_not_called()
