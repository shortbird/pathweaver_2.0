"""
A parent on a child's quest page reads the class handouts the child would see.

Family scope (2026-09-15) renders the child's own quest page for the parent,
and that page asks /api/sis/classes/by-quest/<quest_id>/materials. The gate on
that read is class membership -- teacher, assistant, co-teacher, org admin, or
enrolled student -- and a guardian is none of those, so every parent who opened
a class quest for their child got a 403 (Sentry OPTIO-WEB-1X).

With ?student_id= the read becomes the CHILD's: the guardian relationship is
the gate (the same one /parent/students/<id>/materials declares), the class is
resolved for the student, and the answer is visible rows only with can_manage
false -- a parent who is staff somewhere else gets no more here than the child
would.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import routes.sis.class_materials as materials


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
CHILD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
QUEST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
CLASS_ROW = {'id': 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'organization_id': 'org', 'name': 'Algebra'}


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


@pytest.fixture
def app():
    return Flask(__name__)


def _call(app, query, *, relationship, resolved_for):
    """Run the by-quest read as PARENT with `query`, recording which user the
    class was resolved for."""
    calls = []

    def resolve(user_id, quest_id):
        calls.append(user_id)
        if user_id in resolved_for:
            return CLASS_ROW, False, None
        return None, False, (materials.jsonify({'success': False, 'error': materials._FORBIDDEN}), 403)

    with app.test_request_context(f'/api/sis/classes/by-quest/{QUEST}/materials{query}'), \
            patch.object(materials, 'relationship_between', return_value=relationship), \
            patch.object(materials, '_resolve_class_for_quest', side_effect=resolve), \
            patch.object(materials, 'get_supabase_admin_client', return_value=MagicMock()), \
            patch.object(materials, '_list_materials', return_value=[]) as listed, \
            patch.object(materials, 'curriculum_materials_for_class', return_value=[]) as inherited, \
            patch.object(materials, '_serialize_many', return_value=[{'title': 'Syllabus'}]) as serialized:
        response = _innermost(materials.list_materials_by_quest)(PARENT, QUEST)
    if isinstance(response, tuple):
        body, status = response
    else:
        body, status = response, 200
    return body.get_json(), status, calls, listed, inherited, serialized


def test_a_guardian_reads_the_childs_handouts(app):
    body, status, calls, listed, inherited, serialized = _call(
        app, f'?student_id={CHILD}', relationship='parent', resolved_for={CHILD})
    assert status == 200
    assert body == {'success': True, 'can_manage': False, 'materials': [{'title': 'Syllabus'}]}
    # The class was resolved for the CHILD, not the parent.
    assert calls == [CHILD]
    # Visible rows only, and never the moderator view.
    assert listed.call_args.kwargs['visible_only'] is True
    assert inherited.call_args.kwargs['visible_only'] is True
    assert serialized.call_args.args[1] is False


def test_a_stranger_naming_a_student_is_refused_before_the_class_is_looked_up(app):
    body, status, calls, *_ = _call(
        app, f'?student_id={CHILD}', relationship=None, resolved_for={CHILD})
    assert status == 403
    assert body['success'] is False
    assert calls == []


def test_platform_staff_is_not_a_guardian_here(app):
    """relationship_between answers STAFF for Optio platform users. That is not
    the family claim this branch is for; staff read as themselves."""
    _, status, calls, *_ = _call(
        app, f'?student_id={CHILD}', relationship='staff', resolved_for={CHILD})
    assert status == 403
    assert calls == []


def test_without_a_student_the_read_is_the_callers_own(app):
    _, status, calls, *_ = _call(app, '', relationship='parent', resolved_for={PARENT})
    assert status == 200
    assert calls == [PARENT]


def test_a_malformed_student_id_is_a_400(app):
    body, status, calls, *_ = _call(app, '?student_id=not-a-uuid', relationship='parent', resolved_for={CHILD})
    assert status == 400
    assert calls == []
