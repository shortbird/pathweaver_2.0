"""GET /api/quests/<id>: who stamps "opened", and the teacher's accept on a task.

iCreate, ticket 7cf5d330 (2026-09-23): "We'd want to see 'opened' 'assigned'
'done' & engagement metric". Assigning a class quest creates every student's
enrollment at once, so the quest page now stamps user_quests.first_opened_at /
last_opened_at -- for the student, and for their parent in family scope; never
for platform staff or a masquerading admin. The columns arrive in migration
20260923120000_user_quests_opened_at, applied after this code, so a missing
column must never break the page.

iCreate, ticket 650aa9b9 (2026-09-23): "When I accept a task, the parent is
notified of which one, but then it doesn't show up on the task that it has been
accepted. Can we show somewhere on the task that I have accepted it, for the
parents to see?" Each completed task now carries `review`.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from flask import Flask

from repositories.quest_view_repository import QuestViewRepository
from routes.quest import detail


STUDENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
STAFF = 'ssssssss-ssss-4sss-8sss-ssssssssssss'
QUEST = 'qqqqqqqq-qqqq-4qqq-8qqq-qqqqqqqqqqqq'
UQ = 'uq-1'
NOW = datetime(2026, 9, 23, 15, 0, tzinfo=timezone.utc)


class _Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.cols = ''
        self.payload = None
        self.filters = {}

    def select(self, cols='*', **_k):
        self.cols = cols
        return self

    def update(self, payload):
        self.payload = payload
        return self

    def eq(self, col, val):
        self.filters[col] = val
        return self

    def in_(self, col, vals):
        self.filters[col] = list(vals)
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def single(self):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if self.payload is not None:
            self.db['_writes'].append((self.name, self.payload, dict(self.filters)))
            return MagicMock(data=[self.payload])
        if self.name == 'user_quests' and 'opened_at' in self.cols and self.db.get('_no_column'):
            raise Exception('column user_quests.first_opened_at does not exist')
        if self.name == 'sis_submission_reviews':
            self.db['_review_lookups'].append(self.filters.get('completion_id'))
            if self.db.get('_reviews_fail'):
                raise Exception('relation unavailable')
        result = MagicMock()
        result.data = self.db.get(self.name, [])
        return result


def _db(*, completed=True, reviews=None, opened=None, **flags):
    return {
        '_writes': [], '_review_lookups': [], **flags,
        'quests': {
            'id': QUEST, 'title': 'Volcanoes', 'quest_type': 'optio', 'metadata': {},
            'created_by': 'someone', 'is_public': True, 'course_quests': [],
        },
        'user_quests': [{
            'id': UQ, 'user_id': STUDENT, 'quest_id': QUEST, 'is_active': True,
            'completed_at': None, 'personalization_completed': True, 'created_at': None,
            'first_opened_at': opened, 'last_opened_at': opened,
        }],
        'user_quest_tasks': [
            {'id': 't1', 'title': 'Sketch the cone', 'pillar': 'stem', 'xp_value': 25,
             'diploma_subjects': None, 'order_index': 0, 'source_template_task_id': None},
            {'id': 't2', 'title': 'Build it', 'pillar': 'stem', 'xp_value': 25,
             'diploma_subjects': None, 'order_index': 1, 'source_template_task_id': None},
        ],
        'quest_task_completions': [
            {'id': 'comp-1', 'user_quest_task_id': 't1', 'evidence_text': 'done',
             'evidence_url': None, 'completed_at': '2026-09-20T10:00:00+00:00'},
        ] if completed else [],
        'sis_submission_reviews': reviews or [],
        'sis_staff_training': [],
    }


def _call(db, caller, student_id=None, *, masquerade=False, relationship=None):
    app = Flask(__name__)
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(db, name)
    query = f'?student_id={student_id}' if student_id else ''
    target = student_id or caller
    with app.test_request_context(f'/api/quests/{QUEST}{query}') as ctx, \
            patch.object(detail, 'get_supabase_admin_client', return_value=client), \
            patch.object(detail, 'resolve_student_scope', return_value=target), \
            patch.object(detail, 'guardian_capabilities', return_value={'student_id': target}), \
            patch.object(detail, 'guardian_relationship', return_value=relationship), \
            patch('routes.quest_types.get_template_tasks', return_value=[]), \
            patch('routes.quest_types.get_sample_tasks_for_quest', return_value=[]), \
            patch('routes.quest_types.get_course_tasks_for_quest', return_value=[]), \
            patch('services.quest_resource_service.list_for_quest',
                  return_value={'quest': [], 'by_task': {}}), \
            patch('services.interest_tracks_service.InterestTracksService.get_quest_moments',
                  return_value={'success': True, 'moments': []}):
        if masquerade:
            ctx.request.masquerade_admin_id = STAFF
        response = detail.get_quest_detail.__wrapped__(caller, QUEST)
    if isinstance(response, tuple):
        return response[0].get_json(), response[1]
    return response.get_json(), 200


def _opened_writes(db):
    return [w for w in db['_writes'] if w[0] == 'user_quests']


# ── 7cf5d330: who stamps "opened" ───────────────────────────────────────────

def test_the_student_opening_their_quest_stamps_first_and_last_opened():
    db = _db()
    _, status = _call(db, STUDENT)
    assert status == 200
    [(_, payload, filters)] = _opened_writes(db)
    assert set(payload) == {'first_opened_at', 'last_opened_at'}
    assert filters == {'id': UQ}


def test_a_parent_in_family_scope_stamps_it_for_the_child():
    db = _db()
    _, status = _call(db, PARENT, STUDENT, relationship={'via': 'parent', 'first_name': 'Colby'})
    assert status == 200
    assert len(_opened_writes(db)) == 1


def test_platform_staff_reading_through_the_scope_does_not_stamp_it():
    """A teacher's grid must not say "Opened" because the office looked."""
    db = _db()
    _, status = _call(db, STAFF, STUDENT, relationship={'via': 'superadmin', 'first_name': 'Colby'})
    assert status == 200
    assert _opened_writes(db) == []


def test_an_admin_masquerading_as_the_student_does_not_stamp_it():
    db = _db()
    _, status = _call(db, STUDENT, masquerade=True)
    assert status == 200
    assert _opened_writes(db) == []


def test_a_second_open_keeps_first_opened_at():
    opened = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    db = _db(opened=opened)
    _call(db, STUDENT)
    [(_, payload, _)] = _opened_writes(db)
    assert 'first_opened_at' not in payload
    assert 'last_opened_at' in payload


def test_the_page_still_loads_when_the_opened_columns_do_not_exist_yet():
    db = _db(_no_column=True)
    payload, status = _call(db, STUDENT)
    assert status == 200
    assert payload['quest']['quest_tasks'][0]['title'] == 'Sketch the cone'
    assert _opened_writes(db) == []


def test_record_opened_sets_first_once_and_moves_last_at_most_hourly():
    db = _db(opened=None)
    client = MagicMock()
    client.table.side_effect = lambda name: _Query(db, name)
    repo = QuestViewRepository(client)

    assert set(repo.record_opened(UQ, now=NOW)) == {'first_opened_at', 'last_opened_at'}

    first = (NOW - timedelta(days=1)).isoformat()
    db['user_quests'][0].update({'first_opened_at': first,
                                 'last_opened_at': (NOW - timedelta(minutes=10)).isoformat()})
    assert repo.record_opened(UQ, now=NOW) == {}          # refreshed ten minutes ago

    db['user_quests'][0]['last_opened_at'] = (NOW - timedelta(hours=2)).isoformat()
    assert repo.record_opened(UQ, now=NOW) == {'last_opened_at': NOW.isoformat()}


# ── 650aa9b9: the teacher's accept, on the task ─────────────────────────────

def test_an_accepted_task_carries_who_accepted_it_and_when():
    """650aa9b9: 'Can we show somewhere on the task that I have accepted it,
    for the parents to see?'"""
    db = _db(reviews=[{
        'completion_id': 'comp-1', 'action': 'accepted', 'reviewed_at': '2026-09-21T09:00:00+00:00',
        'reviewer': {'first_name': 'Nicole', 'last_name': 'Connole', 'display_name': None},
    }])
    payload, status = _call(db, PARENT, STUDENT, relationship={'via': 'parent', 'first_name': 'C'})
    assert status == 200
    tasks = {t['id']: t for t in payload['quest']['quest_tasks']}
    assert tasks['t1']['review'] == {
        'action': 'accepted', 'reviewed_at': '2026-09-21T09:00:00+00:00',
        'reviewer_name': 'Nicole Connole',
    }
    assert db['_review_lookups'] == [['comp-1']]


def test_a_completed_task_nobody_reviewed_has_review_none():
    payload, _ = _call(_db(reviews=[]), STUDENT)
    tasks = {t['id']: t for t in payload['quest']['quest_tasks']}
    assert tasks['t1']['review'] is None
    assert tasks['t2']['review'] is None


def test_with_no_completions_there_is_no_review_lookup_at_all():
    db = _db(completed=False)
    payload, _ = _call(db, STUDENT)
    assert all(t['review'] is None for t in payload['quest']['quest_tasks'])
    assert db['_review_lookups'] == []


def test_a_failed_review_lookup_leaves_the_page_working():
    payload, status = _call(_db(_reviews_fail=True), STUDENT)
    assert status == 200
    assert all(t['review'] is None for t in payload['quest']['quest_tasks'])


def test_a_reviewer_with_no_name_on_file_reads_as_your_teacher():
    client = MagicMock()
    db = _db(reviews=[{'completion_id': 'comp-1', 'action': 'accepted',
                       'reviewed_at': '2026-09-21T09:00:00+00:00', 'reviewer': None}])
    client.table.side_effect = lambda name: _Query(db, name)
    out = QuestViewRepository(client).reviews_for_completions(['comp-1', None, 'comp-1'])
    assert out['comp-1']['reviewer_name'] == 'Your teacher'
