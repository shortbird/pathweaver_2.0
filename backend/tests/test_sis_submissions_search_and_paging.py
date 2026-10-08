"""The SIS Submissions list: search, paging, and no silent truncation.

iCreate, ticket 0e6cb0fc (2026-09-23), from a teacher: "It would be nice to
have a search bar to be able to find a past reviewed task easily." The
Reviewed list stopped at the newest 50 with no search and no way further back.
GET /api/sis/submissions now takes ?q= (student name, task title or quest
title), filters BEFORE the page is cut, and reports `total` for Load more.

Found alongside it: the completions read and the sis_submission_reviews read
were unpaged. PostgREST cuts a response at 1,000 rows without a word
(CLAUDE.md, "Never count rows in Python"), and the completions read was ordered
oldest-first, so the rows it dropped were the NEWEST submissions.

The fake below behaves like the server: it applies the filters, honours
.order()/.range(), and never returns more than the row cap, paged or not.
"""

import re
from urllib.parse import urlencode
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import app  # noqa: F401 -- import graph ordering
from routes.sis import submissions
from repositories import sis_submission_repository as repo_module

ORG = 'org-1'
TEACHER = 'teacher-1'
CLASS = 'class-1'
CAP = 1000


class FakeQuery:
    def __init__(self, rows, calls, name):
        self._rows, self._calls, self._name = rows, calls, name
        self._filters, self._order, self._range = [], None, None

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters.append(lambda r: r.get(col) == val)
        return self

    def in_(self, col, vals):
        vals = set(vals)
        self._filters.append(lambda r: r.get(col) in vals)
        return self

    def ilike(self, col, pattern):
        # SQL LIKE -> regex, honouring backslash escapes.
        out, i = '', 0
        while i < len(pattern):
            ch = pattern[i]
            if ch == '\\' and i + 1 < len(pattern):
                out += re.escape(pattern[i + 1])
                i += 2
                continue
            out += '.*' if ch == '%' else '.' if ch == '_' else re.escape(ch)
            i += 1
        rx = re.compile(f'^{out}$', re.I | re.S)
        self._filters.append(lambda r: bool(rx.match(r.get(col) or '')))
        return self

    def order(self, col, **_k):
        self._order = col
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        rows = [r for r in self._rows if all(f(r) for f in self._filters)]
        if self._order:
            rows.sort(key=lambda r: (r.get(self._order) is None, r.get(self._order) or ''))
        if self._range:
            rows = rows[self._range[0]:self._range[1] + 1]
        page = rows[:CAP]   # the server's silent cap
        self._calls.append((self._name, self._range, len(page)))
        return MagicMock(data=page)


def _admin(tables, calls):
    admin = MagicMock()
    admin.table.side_effect = lambda name: FakeQuery(tables.get(name, []), calls, name)
    return admin


def _world(n_completions=3, reviewed=()):
    """One class, two students, two quests; completion i is dated day i."""
    students = [
        {'id': 's-ada', 'first_name': 'Ada', 'last_name': 'Lovelace', 'display_name': 'Ada Lovelace'},
        {'id': 's-bob', 'first_name': 'Bob', 'last_name': 'Builder', 'display_name': None},
    ]
    quests = [{'id': 'q-cells', 'title': 'Cells Quest'}, {'id': 'q-poems', 'title': 'Poetry 100%'}]
    completions, tasks = [], []
    for i in range(n_completions):
        sid = students[i % 2]['id']
        qid = quests[i % 2]['id']
        tid = f't-{i:05d}'
        tasks.append({'id': tid, 'user_id': sid, 'quest_id': qid, 'title': f'Task number {i}',
                      'description': None, 'pillar': 'stem', 'xp_value': 10})
        completions.append({'id': f'c-{i:05d}', 'user_id': sid, 'quest_id': qid,
                            'user_quest_task_id': tid,
                            # zero-padded so string order is date order
                            'completed_at': f'2026-{1 + i // 5000:02d}-01T00:00:{i % 60:02d}.{i:06d}Z'})
    reviews = [{'id': f'r-{i:05d}', 'organization_id': ORG, 'completion_id': f'c-{i:05d}',
                'reviewed_by': TEACHER, 'action': 'accepted', 'reviewed_at': '2026-09-01'}
               for i in reviewed]
    return {
        'org_classes': [{'id': CLASS, 'name': 'Biology', 'organization_id': ORG}],
        'class_enrollments': [{'id': f'e-{s["id"]}', 'class_id': CLASS, 'student_id': s['id'],
                               'status': 'active'} for s in students],
        'class_quests': [{'id': f'cq-{q["id"]}', 'class_id': CLASS, 'quest_id': q['id']}
                         for q in quests],
        'quest_task_completions': completions,
        'sis_submission_reviews': reviews,
        'users': students + [{'id': TEACHER, 'display_name': 'Nicole Connole'}],
        'quests': quests,
        'user_quest_tasks': tasks,
    }


def _list(tables, school=None, **params):
    """`school`: the current students of a school that runs individual
    students (its inbox holds all their work), or None for one that does not."""
    calls = []
    admin = _admin(tables, calls)
    qs = urlencode(params)
    with Flask(__name__).test_request_context(f'/api/sis/submissions?{qs}'), \
         patch.object(submissions, 'get_supabase_admin_client', return_value=admin), \
         patch.object(submissions.sis_service, 'org_or_error', return_value=(ORG, None)), \
         patch.object(submissions.sis_service, 'class_scope', return_value=None), \
         patch.object(submissions, '_school_students', return_value=school), \
         patch.object(submissions, 'sign_in_place'), \
         patch.object(submissions, 'PortfolioService'):
        resp = submissions.list_submissions.__wrapped__(TEACHER)
    body = (resp[0] if isinstance(resp, tuple) else resp).get_json()
    return body, calls


def _ids(body):
    return [s['completion_id'] for s in body['submissions']]


@pytest.mark.unit
class TestSearch:

    def test_by_student_name(self):
        body, _ = _list(_world(6, reviewed=range(6)), scope='reviewed', q='bob')
        assert body['total'] == 3
        assert {s['student']['name'] for s in body['submissions']} == {'Bob Builder'}

    def test_by_last_name_alone(self):
        body, _ = _list(_world(6, reviewed=range(6)), scope='reviewed', q='LOVELACE')
        assert body['total'] == 3
        assert {s['student']['id'] for s in body['submissions']} == {'s-ada'}

    def test_by_task_title(self):
        body, _ = _list(_world(12, reviewed=range(12)), scope='reviewed', q='number 11')
        assert _ids(body) == ['c-00011']

    def test_by_quest_title(self):
        body, _ = _list(_world(6, reviewed=range(6)), scope='reviewed', q='cells')
        assert body['total'] == 3
        assert {s['quest_title'] for s in body['submissions']} == {'Cells Quest'}

    def test_a_percent_sign_is_the_character_not_a_wildcard(self):
        body, _ = _list(_world(4, reviewed=range(4)), scope='reviewed', q='100%')
        assert {s['quest_id'] for s in body['submissions']} == {'q-poems'}
        # "%" alone must not match every task title in the database: only the
        # quest whose title holds the character matches.
        body, _ = _list(_world(4, reviewed=range(4)), scope='reviewed', q='%')
        assert {s['quest_id'] for s in body['submissions']} == {'q-poems'}

    def test_no_match_is_an_empty_page_but_the_badges_stay(self):
        body, _ = _list(_world(4, reviewed=range(2)), scope='reviewed', q='zebra')
        assert body['submissions'] == [] and body['total'] == 0
        assert body['counts'] == {'new': 2, 'reviewed': 2}

    def test_the_search_runs_before_the_page_is_cut(self):
        """The match sits past the first page of the unsearched list."""
        body, _ = _list(_world(120, reviewed=range(120)), scope='reviewed', q='number 3', limit=5)
        # Task number 3 and 30-39: eleven matches, newest first.
        assert body['total'] == 11
        assert _ids(body)[0] == 'c-00039'
        assert len(body['submissions']) == 5


@pytest.mark.unit
class TestPaging:

    def test_offset_and_total_walk_the_reviewed_list_newest_first(self):
        tables = _world(7, reviewed=range(7))
        first, _ = _list(tables, scope='reviewed', limit=3, offset=0)
        second, _ = _list(tables, scope='reviewed', limit=3, offset=3)
        last, _ = _list(tables, scope='reviewed', limit=3, offset=6)
        assert first['total'] == second['total'] == last['total'] == 7
        assert _ids(first) == ['c-00006', 'c-00005', 'c-00004']
        assert _ids(second) == ['c-00003', 'c-00002', 'c-00001']
        assert _ids(last) == ['c-00000']

    def test_new_stays_oldest_first(self):
        body, _ = _list(_world(5, reviewed=[1]), scope='new')
        assert _ids(body) == ['c-00000', 'c-00002', 'c-00003', 'c-00004']


@pytest.mark.unit
class TestNoSilentTruncation:

    def test_more_than_a_thousand_submissions_all_arrive(self):
        tables = _world(1500)
        body, calls = _list(tables, scope='new', limit=200, offset=1400)
        assert body['counts']['new'] == 1500
        assert body['total'] == 1500
        # The newest submission is on the last page -- the row the unpaged,
        # oldest-first read used to drop.
        assert _ids(body)[-1] == 'c-01499'
        completion_reads = [c for c in calls if c[0] == 'quest_task_completions']
        assert all(r is not None for _, r, _ in completion_reads), 'completions must be read in pages'
        assert len(completion_reads) >= 2

    def test_more_than_a_thousand_reviews_are_all_known(self):
        tables = _world(1200, reviewed=range(1200))
        body, calls = _list(tables, scope='reviewed', limit=1)
        assert body['counts'] == {'new': 0, 'reviewed': 1200}
        assert _ids(body) == ['c-01199']
        review_reads = [c for c in calls if c[0] == 'sis_submission_reviews']
        assert all(r is not None for _, r, _ in review_reads), 'reviews must be read in pages'

    def test_the_route_reads_through_fetch_all_rows(self):
        tables = _world(3)
        seen = []
        real = repo_module.fetch_all_rows

        def spy(build, **kw):
            seen.append(build()._name)
            return real(build, **kw)

        with patch.object(repo_module, 'fetch_all_rows', side_effect=spy):
            _list(tables, scope='new', q='ada')
        # The two reads that used to be unpaged, and the three search reads.
        assert {'quest_task_completions', 'sis_submission_reviews',
                'users', 'quests', 'user_quest_tasks'} <= set(seen)


@pytest.mark.unit
class TestOneStudent:
    """?student_id= narrows the inbox to one student, for their own page
    (2026-10-08). It narrows the caller's scope and never widens it."""

    def test_only_that_students_work(self):
        body, _ = _list(_world(6), scope='new', student_id='s-ada')
        assert {s['student']['id'] for s in body['submissions']} == {'s-ada'}
        assert body['total'] == 3

    def test_a_student_outside_the_callers_scope_gets_nothing(self):
        body, _ = _list(_world(6), scope='new', student_id='s-stranger')
        assert body['submissions'] == []


@pytest.mark.unit
class TestWholeSchool:
    """A school that runs individual students reviews ALL of its students'
    work (Tanner, 2026-10-08), not only class work and quests given by name:
    a quest a student picked up on their own reaches the inbox too."""

    @staticmethod
    def _own_quest(world):
        world['quests'].append({'id': 'q-own', 'title': 'My own quest'})
        world['user_quest_tasks'].append({'id': 't-own', 'user_id': 's-ada', 'quest_id': 'q-own',
                                          'title': 'Built a birdhouse', 'description': None,
                                          'pillar': 'art', 'xp_value': 25})
        world['quest_task_completions'].append({'id': 'c-own', 'user_id': 's-ada', 'quest_id': 'q-own',
                                                'user_quest_task_id': 't-own',
                                                'completed_at': '2026-02-01T00:00:00Z'})
        return world

    def test_work_on_a_quest_no_class_holds_reaches_the_inbox(self):
        body, _ = _list(self._own_quest(_world(2)), school={'s-ada', 's-bob'}, scope='new')
        assert 'c-own' in _ids(body)
        own = next(s for s in body['submissions'] if s['completion_id'] == 'c-own')
        assert own['class_name'] is None

    def test_without_the_module_it_stays_out(self):
        body, _ = _list(self._own_quest(_world(2)), school=None, scope='new')
        assert 'c-own' not in _ids(body)

    def test_a_class_filter_still_means_that_class_only(self):
        body, _ = _list(self._own_quest(_world(2)), school={'s-ada', 's-bob'}, scope='new',
                        class_id=CLASS)
        assert 'c-own' not in _ids(body)


@pytest.mark.unit
class TestReviewScopeWholeSchool:
    """Accepting a submission checks it is in scope; at a whole-school inbox a
    current student's own-quest work is."""

    def _scope(self, school):
        world = TestWholeSchool._own_quest(_world(2))
        admin = _admin(world, [])
        with Flask(__name__).test_request_context('/'), \
             patch.object(submissions, 'get_supabase_admin_client', return_value=admin), \
             patch.object(submissions.sis_service, 'class_scope', return_value=None), \
             patch.object(submissions, '_individual_pairs', return_value=set()), \
             patch.object(submissions, '_school_students', return_value=school):
            return submissions._completion_in_scope(TEACHER, ORG, 'c-own')

    def test_in_scope_at_a_whole_school(self):
        completion, err = self._scope({'s-ada'})
        assert err is None and completion['id'] == 'c-own'

    def test_out_of_scope_otherwise(self):
        completion, err = self._scope(None)
        assert completion is None and err[1] == 404


@pytest.mark.unit
class TestNewCount:
    """The School Dashboard's "Work to review" is the inbox's own 'new' count,
    through the same scope (_inbox), so the two can never disagree."""

    def _count(self, world, school=None):
        admin = _admin(world, [])
        with Flask(__name__).test_request_context('/'), \
             patch.object(submissions, 'get_supabase_admin_client', return_value=admin), \
             patch.object(submissions.sis_service, 'class_scope', return_value=None), \
             patch.object(submissions, '_school_students', return_value=school):
            return submissions.new_count(TEACHER, ORG)

    def test_counts_what_is_not_reviewed(self):
        assert self._count(_world(5, reviewed=[0, 1])) == 3

    def test_a_whole_school_counts_own_quest_work_too(self):
        world = TestWholeSchool._own_quest(_world(2))
        assert self._count(world) == 2
        assert self._count(TestWholeSchool._own_quest(_world(2)), school={'s-ada', 's-bob'}) == 3
