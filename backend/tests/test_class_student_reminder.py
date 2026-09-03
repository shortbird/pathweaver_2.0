"""
Reminding one student, and their guardians, about work that is still open.

Gryffin Learning Center, 2026-08-27: "You should be able to click on a name and
see what is done and what isn't, then you should be able to send a reminder of
what work they haven't completed and that should be sent to the parent and
student."

Neither existed. The class progress grid answered "how many tasks are done" but
never "which ones", and the only nudge anywhere on the platform was for unread
announcements.

These tests pin the two things that make the reminder trustworthy: it names the
work that is actually outstanding, and it refuses to send when there is none --
a reminder about nothing teaches a family to ignore the next one.
"""

import uuid as _uuid
from unittest.mock import Mock, patch

import pytest

import app  # noqa: F401 — import graph ordering
from routes.sis import class_quests as cq

# Real UUIDs: the route validates both ids before it does anything else.
CLASS_ID = str(_uuid.uuid4())
STUDENT = str(_uuid.uuid4())
MUM = str(_uuid.uuid4())
DAD = str(_uuid.uuid4())
CLASS_ROW = {'id': CLASS_ID, 'organization_id': 'org-1', 'name': 'Algebra'}


def _work(started=True, tasks=None, completed=False, title='Bridge Building'):
    return {
        'quest_id': 'q1', 'title': title, 'due_date': None,
        'started': started, 'completed': completed,
        'tasks': tasks if tasks is not None else [],
    }


def _call_remind(work, parents=(), enrolled=True):
    """Drive the view with the roster check and the work list stubbed."""
    view = getattr(cq.remind_student, '__wrapped__', cq.remind_student)
    admin = Mock()
    table = Mock()
    admin.table.return_value = table
    for chained in ('select', 'eq', 'limit', 'in_', 'order'):
        getattr(table, chained).return_value = table
    table.execute.return_value = Mock(data=[{'id': 'enr-1'}] if enrolled else [])

    notifier = Mock()
    notifier.get_parents_for_student.return_value = [{'id': p} for p in parents]

    from flask import Flask
    flask_app = Flask(__name__)
    with flask_app.test_request_context(f'/remind', method='POST', json={}), \
         patch.object(cq, '_authorize', return_value=(CLASS_ROW, admin, None)), \
         patch.object(cq, '_student_work', return_value=work), \
         patch('services.notification_service.NotificationService', return_value=notifier):
        resp = view('teacher-1', CLASS_ID, STUDENT)
    return resp, notifier


def _json(resp):
    body = resp[0] if isinstance(resp, tuple) else resp
    return body.get_json()


def _status(resp):
    return resp[1] if isinstance(resp, tuple) else 200


@pytest.mark.unit
class TestRemindStudent:
    def test_the_student_and_every_guardian_are_notified(self):
        work = [_work(tasks=[{'id': 't1', 'title': 'Sketch designs', 'done': False}])]
        resp, notifier = _call_remind(work, parents=[MUM, DAD])
        assert _json(resp)['notified'] == 3
        targets = [c.kwargs['user_id'] for c in notifier.create_notification.call_args_list]
        assert set(targets) == {STUDENT, MUM, DAD}

    def test_the_message_names_the_unfinished_work(self):
        work = [_work(tasks=[
            {'id': 't1', 'title': 'Sketch designs', 'done': False},
            {'id': 't2', 'title': 'Build it', 'done': True},
        ])]
        resp, notifier = _call_remind(work)
        message = notifier.create_notification.call_args.kwargs['message']
        assert 'Bridge Building' in message
        assert 'Sketch designs' in message
        assert 'Build it' not in message   # finished work is not nagged about

    def test_a_quest_never_started_is_called_out_as_such(self):
        resp, notifier = _call_remind([_work(started=False)])
        assert 'not started' in notifier.create_notification.call_args.kwargs['message']

    def test_nothing_outstanding_is_refused_rather_than_sent(self):
        """A reminder about nothing teaches a family to ignore the next one."""
        work = [_work(completed=True, tasks=[{'id': 't1', 'title': 'Done', 'done': True}])]
        resp, notifier = _call_remind(work)
        assert _status(resp) == 400
        notifier.create_notification.assert_not_called()

    def test_a_student_not_on_the_class_is_refused(self):
        resp, notifier = _call_remind([_work()], enrolled=False)
        assert _status(resp) == 404
        notifier.create_notification.assert_not_called()

    def test_one_failed_send_does_not_lose_the_others(self):
        """The student's own notification failing must not cost the guardian
        theirs, and vice versa."""
        work = [_work(tasks=[{'id': 't1', 'title': 'Sketch designs', 'done': False}])]
        view = getattr(cq.remind_student, '__wrapped__', cq.remind_student)
        admin = Mock()
        table = Mock()
        admin.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'in_', 'order'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=[{'id': 'enr-1'}])

        notifier = Mock()
        notifier.get_parents_for_student.return_value = [{'id': MUM}]
        notifier.create_notification.side_effect = [RuntimeError('nope'), None]

        from flask import Flask
        flask_app = Flask(__name__)
        with flask_app.test_request_context('/remind', method='POST', json={}), \
             patch.object(cq, '_authorize', return_value=(CLASS_ROW, admin, None)), \
             patch.object(cq, '_student_work', return_value=work), \
             patch('services.notification_service.NotificationService', return_value=notifier):
            resp = view('teacher-1', CLASS_ID, STUDENT)

        assert _json(resp)['notified'] == 1          # the guardian still got it
        assert notifier.create_notification.call_count == 2
