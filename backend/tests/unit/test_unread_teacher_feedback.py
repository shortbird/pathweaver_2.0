"""Unread teacher feedback on the quest page and the quest cards.

Horizon, ticket 4ea811d6 (2026-10-07): "Teacher feedback lands in chat or the
inbox with a small badge, and students miss it. A banner or pop-up attached to
the quest itself would make sure they see it."

"Unread" is the student's own unread message_received notification rows whose
metadata.completion_id is a completion in the quest -- the row a teacher's post
on the credit thread writes (routes/credit_messages.py). These tests pin:

  * GET /api/quests/<id> carries `unread_feedback_count`, `latest_feedback` and
    per task `unread_feedback` / `feedback_count` / `completion_id`; 0 when
    there is none; the student's own replies, other people's rows, read rows,
    group-chat rows and other quests' completions never count; one
    notifications read per request whatever the number of tasks.
  * /api/quests/my-active and /api/users/dashboard carry a per-quest count.
  * POST /api/credit/<completion_id>/messages/read marks only the caller's own
    rows, and refuses a completion that is not the caller's.
"""

from unittest.mock import MagicMock, patch

from flask import Flask, g

from routes import credit_messages
from routes.quest import completion as completion_routes
from routes.quest import detail
from routes.users import dashboard as dashboard_routes
from services import task_feedback_service


STUDENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
OTHER_STUDENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
TEACHER = 'tttttttt-tttt-4ttt-8ttt-tttttttttttt'
QUEST = 'qqqqqqqq-qqqq-4qqq-8qqq-qqqqqqqqqqqq'
OTHER_QUEST = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp'

#: Tables the fake filters for real. The rest return their rows as stored,
#: like the harness in test_quest_detail_opened_and_reviews.
FILTERED = {'notifications', 'credit_review_messages', 'quest_task_completions'}


def _value(row, col):
    if col.startswith('metadata->>'):
        return (row.get('metadata') or {}).get(col.split('->>', 1)[1])
    return row.get(col)


class _Not:
    def __init__(self, query):
        self.query = query

    def is_(self, col, _null):
        self.query.filters.append(lambda r: _value(r, col) is not None)
        return self.query


class _Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.cols = ''
        self.payload = None
        self.filters = []
        self.single_row = False

    @property
    def not_(self):
        return _Not(self)

    def select(self, cols='*', **_k):
        self.cols = cols
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: _value(r, col) == val)
        return self

    def in_(self, col, vals):
        vals = list(vals)
        self.filters.append(lambda r: _value(r, col) in vals)
        return self

    def is_(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def range(self, *_a):
        return self

    def limit(self, *_a, **_k):
        return self

    def single(self):
        return self

    def maybe_single(self):
        self.single_row = True
        return self

    def execute(self):
        self.db['_calls'].append(self.name)
        rows = self.db.get(self.name, [])
        if self.name in FILTERED:
            rows = [r for r in rows if all(f(r) for f in self.filters)]
        if self.payload is not None:
            for r in rows:
                r.update(self.payload)
            return MagicMock(data=list(rows))
        if self.single_row and isinstance(rows, list):
            return MagicMock(data=rows[0] if rows else None)
        if 'completion_id:metadata->>completion_id' in self.cols:
            rows = [{'id': r['id'], 'completion_id': _value(r, 'metadata->>completion_id')}
                    for r in rows]
        return MagicMock(data=rows)


def _client(db):
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(db, name)
    return client


def _note(nid, completion_id, *, user=STUDENT, read=False, kind='message_received'):
    meta = {'completion_id': completion_id} if completion_id else {'group_id': 'chat-1'}
    return {'id': nid, 'user_id': user, 'type': kind, 'is_read': read, 'metadata': meta}


LONG_NOTE = ('Your sketch shows the cone well, but label the magma chamber and the vent. '
             'Then add one sentence about why the slope is steep on this kind of volcano, '
             'and resubmit.')


def _db(*, notifications=None, messages=None):
    return {
        '_calls': [],
        'quests': {
            'id': QUEST, 'title': 'Volcanoes', 'quest_type': 'optio', 'metadata': {},
            'created_by': 'someone', 'is_public': True, 'course_quests': [],
        },
        'user_quests': [{
            'id': 'uq-1', 'user_id': STUDENT, 'quest_id': QUEST, 'is_active': True,
            'completed_at': None, 'personalization_completed': True, 'created_at': None,
            'first_opened_at': None, 'last_opened_at': None,
        }],
        'user_quest_tasks': [
            {'id': 't1', 'title': 'Sketch the cone', 'pillar': 'stem', 'xp_value': 25,
             'diploma_subjects': None, 'order_index': 0, 'source_template_task_id': None},
            {'id': 't2', 'title': 'Build it', 'pillar': 'stem', 'xp_value': 25,
             'diploma_subjects': None, 'order_index': 1, 'source_template_task_id': None},
            {'id': 't3', 'title': 'Write it up', 'pillar': 'communication', 'xp_value': 25,
             'diploma_subjects': None, 'order_index': 2, 'source_template_task_id': None},
        ],
        'quest_task_completions': [
            {'id': 'comp-1', 'user_id': STUDENT, 'quest_id': QUEST, 'user_quest_task_id': 't1',
             'task_id': 't1', 'evidence_text': 'x', 'evidence_url': None, 'completed_at': None},
            {'id': 'comp-2', 'user_id': STUDENT, 'quest_id': QUEST, 'user_quest_task_id': 't2',
             'task_id': 't2', 'evidence_text': 'y', 'evidence_url': None, 'completed_at': None},
            # The same student's work on a different quest.
            {'id': 'comp-other', 'user_id': STUDENT, 'quest_id': OTHER_QUEST,
             'user_quest_task_id': 'tx', 'task_id': 'tx', 'evidence_text': 'z',
             'evidence_url': None, 'completed_at': None},
            # Another student's work, which a stray notification id must never credit.
            {'id': 'comp-theirs', 'user_id': OTHER_STUDENT, 'quest_id': QUEST,
             'user_quest_task_id': 'ty', 'task_id': 'ty', 'evidence_text': 'w',
             'evidence_url': None, 'completed_at': None},
        ],
        'notifications': notifications if notifications is not None else [],
        'credit_review_messages': messages if messages is not None else [],
        'users': [{'id': TEACHER, 'display_name': 'Dallin Bird'}],
        'sis_submission_reviews': [],
        'sis_staff_training': [],
    }


def _busy_db():
    """Two unread notes on t1, one already read on t2, plus every row that must not count."""
    return _db(
        notifications=[
            _note('n1', 'comp-1'),
            _note('n2', 'comp-1'),
            _note('n3', 'comp-2', read=True),
            _note('n4', 'comp-other'),                 # another quest
            _note('n5', 'comp-1', user=TEACHER),       # the teacher's "new reply" row
            _note('n6', None),                         # a group chat message
        ],
        messages=[
            {'id': 'm1', 'completion_id': 'comp-1', 'author_id': TEACHER, 'author_role': 'advisor',
             'body': 'Good start.', 'created_at': '2026-10-05T10:00:00+00:00'},
            {'id': 'm2', 'completion_id': 'comp-1', 'author_id': TEACHER, 'author_role': 'advisor',
             'body': LONG_NOTE, 'created_at': '2026-10-06T10:00:00+00:00'},
            # The student's own reply is the newest message and must not be the preview.
            {'id': 'm3', 'completion_id': 'comp-1', 'author_id': STUDENT, 'author_role': 'student',
             'body': 'Ok I will fix it', 'created_at': '2026-10-07T10:00:00+00:00'},
            # A parent replying for the child is the family's side too.
            {'id': 'm4', 'completion_id': 'comp-1', 'author_id': PARENT, 'author_role': 'parent',
             'body': 'Thanks!', 'created_at': '2026-10-07T11:00:00+00:00'},
            {'id': 'm5', 'completion_id': 'comp-2', 'author_id': TEACHER, 'author_role': 'advisor',
             'body': 'Nice build.', 'created_at': '2026-10-04T10:00:00+00:00'},
        ],
    )


def _get_detail(db, caller, student_id=None):
    app = Flask(__name__)
    target = student_id or caller
    query = f'?student_id={student_id}' if student_id else ''
    with app.test_request_context(f'/api/quests/{QUEST}{query}'), \
            patch.object(detail, 'get_supabase_admin_client', return_value=_client(db)), \
            patch.object(detail, 'resolve_student_scope', return_value=target), \
            patch.object(detail, 'guardian_capabilities', return_value={'student_id': target}), \
            patch.object(detail, 'guardian_relationship',
                         return_value={'via': 'parent', 'first_name': 'C'} if student_id else None), \
            patch('routes.quest_types.get_template_tasks', return_value=[]), \
            patch('routes.quest_types.get_sample_tasks_for_quest', return_value=[]), \
            patch('routes.quest_types.get_course_tasks_for_quest', return_value=[]), \
            patch('services.quest_resource_service.list_for_quest',
                  return_value={'quest': [], 'by_task': {}}), \
            patch('services.interest_tracks_service.InterestTracksService.get_quest_moments',
                  return_value={'success': True, 'moments': []}):
        response = detail.get_quest_detail.__wrapped__(caller, QUEST)
    if isinstance(response, tuple):
        return response[0].get_json()['quest'], response[1]
    return response.get_json()['quest'], 200


def _tasks(quest):
    return {t['id']: t for t in quest['quest_tasks']}


# ── GET /api/quests/<id> ────────────────────────────────────────────────────

def test_the_quest_counts_only_the_students_unread_notes_on_this_quest():
    """4ea811d6: two unread notes on t1. The read row, the other quest's
    completion, the teacher's own row and the group chat row do not count."""
    quest, status = _get_detail(_busy_db(), STUDENT)
    assert status == 200
    assert quest['unread_feedback_count'] == 2
    tasks = _tasks(quest)
    assert tasks['t1']['unread_feedback'] == 2
    assert tasks['t2']['unread_feedback'] == 0
    assert tasks['t3']['unread_feedback'] == 0


def test_each_task_carries_its_completion_and_teacher_message_count():
    """The web and mobile thread opens from completion_id; feedback_count counts
    only teacher messages, never the student's or a parent's replies."""
    tasks = _tasks(_get_detail(_busy_db(), STUDENT)[0])
    assert tasks['t1']['completion_id'] == 'comp-1'
    assert tasks['t1']['feedback_count'] == 2
    assert tasks['t2']['completion_id'] == 'comp-2'
    assert tasks['t2']['feedback_count'] == 1
    assert tasks['t3']['completion_id'] is None
    assert tasks['t3']['feedback_count'] == 0


def test_the_banner_preview_is_the_newest_teacher_note_signed_with_their_name():
    latest = _get_detail(_busy_db(), STUDENT)[0]['latest_feedback']
    assert latest['task_id'] == 't1'
    assert latest['task_title'] == 'Sketch the cone'
    assert latest['completion_id'] == 'comp-1'
    assert latest['author_name'] == 'Dallin Bird'
    assert latest['preview'].startswith('Your sketch shows the cone well')
    assert latest['preview'].endswith('...')
    assert len(latest['preview']) <= task_feedback_service.PREVIEW_CHARS + 3


def test_optios_own_review_is_signed_optio_in_the_banner():
    db = _db(notifications=[_note('n1', 'comp-2')], messages=[
        {'id': 'm1', 'completion_id': 'comp-2', 'author_id': TEACHER,
         'author_role': 'superadmin', 'body': 'Strong work.', 'created_at': '2026-10-06T10:00:00+00:00'},
    ])
    latest = _get_detail(db, STUDENT)[0]['latest_feedback']
    assert latest['author_name'] == 'Optio'
    assert latest['task_id'] == 't2'
    assert latest['preview'] == 'Strong work.'


def test_no_unread_feedback_is_zero_everywhere_and_no_banner():
    quest, status = _get_detail(_db(), STUDENT)
    assert status == 200
    assert quest['unread_feedback_count'] == 0
    assert quest['latest_feedback'] is None
    assert all(t['unread_feedback'] == 0 for t in quest['quest_tasks'])


def test_the_students_own_reply_alone_is_not_feedback():
    """A thread holding only the student's message: nothing to show, nothing new."""
    db = _db(messages=[{'id': 'm1', 'completion_id': 'comp-1', 'author_id': STUDENT,
                        'author_role': 'student', 'body': 'Question?',
                        'created_at': '2026-10-06T10:00:00+00:00'}])
    quest = _get_detail(db, STUDENT)[0]
    assert quest['unread_feedback_count'] == 0
    assert _tasks(quest)['t1']['feedback_count'] == 0


def test_a_parent_in_family_scope_is_not_told_the_childs_notes_are_new():
    """The unread rows are the child's bell; the parent's visit is not the child
    reading them. The thread still shows (feedback_count) for the parent."""
    quest, status = _get_detail(_busy_db(), PARENT, STUDENT)
    assert status == 200
    assert quest['unread_feedback_count'] == 0
    assert quest['latest_feedback'] is None
    assert _tasks(quest)['t1']['feedback_count'] == 2


def test_one_notifications_read_per_request_whatever_the_task_count():
    db = _busy_db()
    _get_detail(db, STUDENT)
    assert db['_calls'].count('notifications') == 1
    assert db['_calls'].count('credit_review_messages') == 1


# ── quest lists ─────────────────────────────────────────────────────────────

def test_my_active_carries_unread_feedback_count_per_quest():
    db = _busy_db()
    db['user_quests'] = [
        {'id': 'uq-1', 'quest_id': QUEST, 'started_at': '2026-10-01', 'quests': {'id': QUEST, 'title': 'Volcanoes'}},
        {'id': 'uq-2', 'quest_id': OTHER_QUEST, 'started_at': '2026-10-01',
         'quests': {'id': OTHER_QUEST, 'title': 'Rivers'}},
    ]
    db['user_quest_tasks'] = []
    app = Flask(__name__)
    with app.test_request_context('/api/quests/my-active'), \
            patch.object(completion_routes, 'get_supabase_admin_client', return_value=_client(db)):
        response = completion_routes.get_user_active_quests.__wrapped__(STUDENT)
    quests = {q['id']: q for q in response.get_json()['quests']}
    assert quests[QUEST]['unread_feedback_count'] == 2
    assert quests[OTHER_QUEST]['unread_feedback_count'] == 1


def test_a_notification_naming_another_students_completion_credits_no_quest():
    db = _db(notifications=[_note('n1', 'comp-theirs')])
    assert task_feedback_service.unread_counts_by_quest(_client(db), STUDENT) == {}


def test_the_dashboard_cards_carry_the_count_for_the_student_only():
    db = _busy_db()
    data = {'active_quests': [{'quest_id': QUEST, 'quests': {'id': QUEST}},
                              {'quest_id': 'quiet', 'quests': {'id': 'quiet'}}]}
    app = Flask(__name__)
    with app.app_context():
        g.student_scope = MagicMock(delegated=False)
        dashboard_routes._attach_unread_feedback(_client(db), STUDENT, data)
    assert [q['unread_feedback_count'] for q in data['active_quests']] == [2, 0]

    data = {'active_quests': [{'quest_id': QUEST, 'quests': {'id': QUEST}}]}
    with app.app_context():
        g.student_scope = MagicMock(delegated=True)     # a parent in family scope
        dashboard_routes._attach_unread_feedback(_client(db), STUDENT, data)
    assert data['active_quests'][0]['unread_feedback_count'] == 0


# ── POST /api/credit/<completion_id>/messages/read ──────────────────────────

def _mark_read(db, caller, completion_id):
    app = Flask(__name__)
    with app.test_request_context(f'/api/credit/{completion_id}/messages/read', method='POST'), \
            patch.object(credit_messages, 'get_supabase_admin_client', return_value=_client(db)):
        response = credit_messages.mark_credit_messages_read.__wrapped__(caller, completion_id)
    if isinstance(response, tuple):
        return response[0].get_json(), response[1]
    return response.get_json(), 200


def test_opening_the_thread_marks_only_the_callers_rows_on_that_completion():
    db = _busy_db()
    body, status = _mark_read(db, STUDENT, 'comp-1')
    assert status == 200
    assert body['marked'] == 2
    state = {n['id']: n['is_read'] for n in db['notifications']}
    assert state == {'n1': True, 'n2': True, 'n3': True,
                     'n4': False,   # another quest's completion stays unread
                     'n5': False,   # the teacher's own row is not the student's to clear
                     'n6': False}   # a group chat row is untouched
    # And the banner is gone on the next load.
    assert _get_detail(db, STUDENT)[0]['unread_feedback_count'] == 0


def test_another_students_completion_is_refused_and_nothing_changes():
    db = _db(notifications=[_note('n1', 'comp-theirs', user=OTHER_STUDENT)])
    body, status = _mark_read(db, STUDENT, 'comp-theirs')
    assert status == 403
    assert db['notifications'][0]['is_read'] is False


def test_a_parent_cannot_clear_the_childs_unread_feedback():
    db = _busy_db()
    _, status = _mark_read(db, PARENT, 'comp-1')
    assert status == 403
    assert not db['notifications'][0]['is_read']


def test_an_unknown_completion_is_not_found():
    _, status = _mark_read(_db(), STUDENT, 'nope')
    assert status == 404
