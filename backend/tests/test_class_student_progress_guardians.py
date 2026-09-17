"""The per-student progress panel names the student's guardians.

Nicole Connole (iCreate, 2026-09-17, ticket 9c1b49a5): "It would be nice to
have a tab that would send me to messages with the parent and student. This
will allow me to send a more personalized message, like seeing if they need
help." The panel already had the reminder (a fixed list of what is open); a
conversation needs the parent's id, which nothing on the page carried. Parent
only, by decision: the student is not offered.
"""

import uuid as _uuid
from unittest.mock import Mock, patch

import pytest

import app  # noqa: F401 — import graph ordering
from routes.sis import class_quest_students as cq

CLASS_ID = str(_uuid.uuid4())
STUDENT = str(_uuid.uuid4())
CLASS_ROW = {'id': CLASS_ID, 'name': 'Earth Science', 'organization_id': str(_uuid.uuid4())}


def _call(parents, enrolled=True):
    view = cq.student_class_progress
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    admin = Mock()
    table = Mock()
    admin.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'in_', 'order'):
        getattr(table, chained).return_value = table
    # First read is the enrollment check, second the student's name row.
    table.execute.side_effect = [
        Mock(data=[{'id': 'enr-1'}] if enrolled else []),
        Mock(data=[{'first_name': 'Sam', 'last_name': 'Bird', 'display_name': None}]),
    ]
    notifier = Mock()
    notifier.get_parents_for_student.return_value = parents

    from flask import Flask
    flask_app = Flask(__name__)
    with flask_app.test_request_context('/progress'), \
         patch.object(cq, '_authorize', return_value=(CLASS_ROW, admin, None)), \
         patch.object(cq, '_student_work', return_value=[]), \
         patch('services.notification_service.NotificationService', return_value=notifier):
        resp = view('teacher-1', CLASS_ID, STUDENT)
    body = resp[0] if isinstance(resp, tuple) else resp
    status = resp[1] if isinstance(resp, tuple) else 200
    return status, body.get_json(), notifier


@pytest.mark.unit
def test_the_panel_carries_each_guardian_with_a_name_to_address_them_by():
    status, body, notifier = _call([
        {'id': 'p-1', 'first_name': 'Jane', 'last_name': 'Bird', 'display_name': None},
        {'id': 'p-2', 'first_name': None, 'last_name': None, 'display_name': 'Grandpa Joe'},
    ])
    assert status == 200
    assert body['guardians'] == [{'id': 'p-1', 'name': 'Jane Bird'}, {'id': 'p-2', 'name': 'Grandpa Joe'}]
    notifier.get_parents_for_student.assert_called_once_with(STUDENT)


@pytest.mark.unit
def test_a_student_with_no_guardian_on_file_gets_an_empty_list_not_an_error():
    status, body, _ = _call([])
    assert status == 200
    assert body['guardians'] == []
    assert body['student']['name'] == 'Sam Bird'


@pytest.mark.unit
def test_a_student_not_on_the_class_is_still_a_404_before_any_guardian_lookup():
    status, body, notifier = _call([{'id': 'p-1'}], enrolled=False)
    assert status == 404
    notifier.get_parents_for_student.assert_not_called()
