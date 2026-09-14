"""
Who hears about a new comment on a student's work.

Three audiences, decided independently and never told twice: the student, their
parents, and everyone already in the thread. The third did not exist until
2026-09-14 -- Optio could ask a student "What are the ingredients?" under their
post, the student could (once can_comment_on_student let them) answer, and the
answer reached nobody.

Also pins the regression behind the rewrite: the student's own notification
used to sit inside `if parents:`, so a student with no linked parent was never
told anyone had commented on their work. Three of three such comments in
production had no notification behind them.
"""

import pytest

import app  # noqa: F401 -- import graph ordering
from routes.observer import comments as comments_module
from routes.observer.comments import send_comment_notifications_async, thread_participants

STUDENT = 'student-1'
OPTIO = 'root-1'
PARENT = 'parent-1'
TEACHER = 'teacher-1'
COMPLETION = 'completion-1'

USERS = {
    STUDENT: {'display_name': 'Jane', 'first_name': 'Jane', 'last_name': 'Doe',
              'role': 'student', 'email': 'jane@example.com', 'organization_id': 'org-1'},
    OPTIO: {'display_name': 'Tanner Bowman', 'first_name': 'Tanner', 'last_name': 'Bowman',
            'role': 'superadmin', 'email': 'tanner@example.com', 'organization_id': None},
    PARENT: {'display_name': 'Mom', 'first_name': 'Mom', 'last_name': 'Doe',
             'role': 'parent', 'email': 'mom@example.com', 'organization_id': None},
    TEACHER: {'display_name': 'Ms Frizzle', 'first_name': 'Ms', 'last_name': 'Frizzle',
              'role': 'org_managed', 'email': 'friz@example.com', 'organization_id': 'org-1'},
}


class _Result:
    def __init__(self, data):
        self.data = data


class _UsersQuery:
    def __init__(self):
        self._id = None

    def select(self, *a, **k):
        return self

    def eq(self, col, value):
        if col == 'id':
            self._id = value
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        row = USERS.get(self._id)
        return _Result([row] if row else [])


class _CommentsQuery:
    """observer_comments rows filtered by whichever thread column is asked for."""

    def __init__(self, rows):
        self._rows = rows
        self._filters = {}

    def select(self, *a, **k):
        return self

    def eq(self, col, value):
        self._filters[col] = value
        return self

    def order(self, *a, **k):
        return self

    def execute(self):
        return _Result([r for r in self._rows
                        if all(r.get(c) == v for c, v in self._filters.items())])


class _Db:
    def __init__(self, comments=()):
        self.comments = list(comments)

    def table(self, name):
        if name == 'users':
            return _UsersQuery()
        if name == 'observer_comments':
            return _CommentsQuery(self.comments)
        raise AssertionError(f'unexpected table {name}')


class _FakeNotificationService:
    """Records every notify_* call; get_parents_for_student is set per test."""
    instance: '_FakeNotificationService | None' = None
    parents: list = []
    comments: list = []

    def __init__(self):
        self.supabase = _Db(self.comments)
        self.calls = []
        _FakeNotificationService.instance = self

    def get_parents_for_student(self, student_id):
        return list(self.parents)

    def notify_student_comment(self, **kw):
        self.calls.append(('student', kw['student_id'], kw))

    def notify_parent_observer_comment(self, **kw):
        self.calls.append(('parent', kw['parent_user_id'], kw))

    def notify_comment_reply(self, **kw):
        self.calls.append(('reply', kw['recipient_id'], kw))


@pytest.fixture
def notify(monkeypatch):
    """Run the fan-out synchronously against the fake; returns the recorded calls."""
    def _run(*, author, comments=(), parents=(), text='hello', completion=COMPLETION, learning_event=None):
        _FakeNotificationService.parents = list(parents)
        _FakeNotificationService.comments = list(comments)
        monkeypatch.setattr(comments_module, 'NotificationService', _FakeNotificationService)
        send_comment_notifications_async(
            STUDENT, author, text,
            task_completion_id=completion, learning_event_id=learning_event,
        )
        return _FakeNotificationService.instance.calls
    return _run


def _thread(*author_ids):
    return [{'observer_id': a, 'task_completion_id': COMPLETION} for a in author_ids]


def test_a_students_reply_reaches_the_person_who_asked(notify):
    """Optio asked; Jane answered on her own post. Optio hears, Jane does not."""
    calls = notify(author=STUDENT, comments=_thread(OPTIO, STUDENT),
                   parents=[{'id': PARENT, 'organization_id': None}], text='flour, eggs, milk')
    assert [(kind, who) for kind, who, _ in calls] == [('reply', OPTIO)]
    kw = calls[0][2]
    assert kw['author_is_student'] is True
    assert kw['student_name'] == 'Jane'
    assert kw['comment_preview'] == 'flour, eggs, milk'


def test_a_students_reply_does_not_ping_their_parents(notify):
    """"Jane commented on Jane's work" is not feedback a parent needs."""
    calls = notify(author=STUDENT, comments=_thread(STUDENT),
                   parents=[{'id': PARENT, 'organization_id': None}])
    assert calls == []


def test_a_student_with_no_parents_is_still_told(notify):
    """The regression: the student branch used to live inside `if parents:`."""
    calls = notify(author=OPTIO, comments=_thread(OPTIO), parents=[])
    assert [(kind, who) for kind, who, _ in calls] == [('student', STUDENT)]


def test_a_comment_by_staff_reaches_student_parents_and_prior_commenters(notify):
    calls = notify(author=OPTIO, comments=_thread(TEACHER, OPTIO),
                   parents=[{'id': PARENT, 'organization_id': None}])
    assert sorted((kind, who) for kind, who, _ in calls) == sorted([
        ('student', STUDENT), ('parent', PARENT), ('reply', TEACHER),
    ])
    reply = next(kw for kind, _, kw in calls if kind == 'reply')
    assert reply['author_is_student'] is False
    assert reply['organization_id'] == 'org-1'


def test_nobody_is_told_twice(notify):
    """A parent who already commented on the thread gets the parent
    notification and not a second one as a thread participant; the author
    never hears about their own comment."""
    calls = notify(author=OPTIO, comments=_thread(PARENT, OPTIO),
                   parents=[{'id': PARENT, 'organization_id': None}])
    recipients = [who for _, who, _ in calls]
    assert recipients.count(PARENT) == 1
    assert OPTIO not in recipients
    assert [kind for kind, who, _ in calls if who == PARENT] == ['parent']


def test_platform_staff_are_named_optio_as_the_thread_names_them(notify):
    calls = notify(author=OPTIO, comments=_thread(TEACHER))
    names = {kw.get('observer_name') or kw.get('author_name') for _, _, kw in calls}
    assert names == {'Optio'}


def test_other_authors_are_named_as_themselves(notify):
    calls = notify(author=TEACHER, comments=_thread(OPTIO))
    names = {kw.get('observer_name') or kw.get('author_name') for _, _, kw in calls}
    assert names == {'Ms Frizzle'}


def test_a_comment_with_no_thread_fans_out_to_nobody_extra(notify):
    """Quest-only comments carry neither a completion nor a learning event."""
    calls = notify(author=OPTIO, comments=_thread(TEACHER), completion=None, learning_event=None)
    assert [(kind, who) for kind, who, _ in calls] == [('student', STUDENT)]


def test_learning_event_threads_resolve_the_same_way(notify):
    comments = [{'observer_id': OPTIO, 'learning_event_id': 'le-1'}]
    calls = notify(author=STUDENT, comments=comments, completion=None, learning_event='le-1')
    assert [(kind, who) for kind, who, _ in calls] == [('reply', OPTIO)]


def test_thread_participants_are_distinct_and_in_first_appearance_order():
    db = _Db(_thread(OPTIO, STUDENT, OPTIO, TEACHER, STUDENT))
    assert thread_participants(db, task_completion_id=COMPLETION) == [OPTIO, STUDENT, TEACHER]
    assert thread_participants(db) == []
