"""
A student reads the handouts their own teacher shared with their class.

The other half of iCreate 3e37d8b8 / f1787a98. The guardian's door was built
first (test_class_materials_for_guardian.py) because the teacher had posted to
the PARENT chat -- but the student's door was narrower than anyone realised.

Students could reach class materials ONLY through ClassCurriculum on a quest
page. Musical Theater on 2026-09-10 had two materials, twenty-six enrolled
students and ZERO quests, so there was no page in the product that rendered
them, and the teacher's "the dance videos are under class materials" was false
for every student in the class as well as every parent.

So the student reads through the same enrollment-shaped route the guardian
does, with no quest anywhere in it.

What this file pins:
  - the caller's OWN classes, grouped, with the class name
  - a staged row (visible_to_students false) is unreachable here too
  - nobody can widen the scope, because the scope is the caller's id
  - archived classes are dropped, and an empty class is not a heading
"""

import inspect
from unittest.mock import Mock, patch

from flask import Flask

import routes.sis.class_materials as materials


ORG = '11111111-1111-4111-8111-111111111111'
STUDENT = '22222222-2222-4222-8222-222222222222'
THEATER = '33333333-3333-4333-8333-333333333333'
UKELELE = '44444444-4444-4444-8444-444444444444'
LAST_YEAR = '55555555-5555-4555-8555-555555555555'


class _Table:
    """Rows for one table, remembering the equality filters asked of it.

    The filters matter: `visible_to_students` is the only thing between a
    student and a teacher's staged casting notes, and a stub that ignored
    filters would pass whether the route applied it or not.
    """

    def __init__(self, rows, calls):
        self._rows, self._calls, self._eq = rows, calls, {}

    def select(self, *_a, **_k):
        return self

    def eq(self, field, value):
        self._eq[field] = value
        return self

    def in_(self, field, values):
        self._eq[field] = values
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        self._calls.append(dict(self._eq))
        rows = self._rows
        for field, value in self._eq.items():
            if isinstance(value, list):
                rows = [r for r in rows if r.get(field) in value]
            else:
                rows = [r for r in rows if r.get(field) == value]
        return Mock(data=rows)


def _client(tables, calls):
    client = Mock()
    client.table.side_effect = lambda name: _Table(
        tables.get(name, []), calls.setdefault(name, []))
    return client


# What ClassRepository.get_student_enrollments returns: the enrollment with its
# class embedded. Last Year Art is archived -- the enrollment survived the
# archive, which is why the route checks the CLASS's status.
ENROLLMENTS = [
    {'class_id': THEATER, 'status': 'active',
     'org_classes': {'id': THEATER, 'name': 'Musical Theater', 'status': 'active'}},
    {'class_id': UKELELE, 'status': 'active',
     'org_classes': {'id': UKELELE, 'name': 'Ukelele Jam', 'status': 'active'}},
    {'class_id': LAST_YEAR, 'status': 'active',
     'org_classes': {'id': LAST_YEAR, 'name': 'Last Year Art', 'status': 'archived'}},
]

MATERIALS = [
    {'id': 'm1', 'class_id': THEATER, 'kind': 'link', 'title': 'Dance Videos',
     'url': 'https://example.com/dance', 'visible_to_students': True,
     'created_by': 'teacher'},
    {'id': 'm2', 'class_id': THEATER, 'kind': 'link', 'title': 'Music Tracks',
     'url': 'https://example.com/tracks', 'visible_to_students': True,
     'created_by': 'teacher'},
    {'id': 'm3', 'class_id': THEATER, 'kind': 'file', 'title': 'Casting notes',
     'url': 'https://example.com/casting', 'visible_to_students': False,
     'created_by': 'teacher'},
]


def _call(*, inherited=(), enrollments=ENROLLMENTS):
    """Drive the route with a stubbed DB.

    Two decorators unwrapped, not three: this route has no relationship gate to
    satisfy because it takes no id. That IS the authorization, and the test
    below pins it.
    """
    calls = {}
    fn = inspect.unwrap(materials.list_my_materials)
    app = Flask(__name__)
    repo = Mock()
    repo.get_student_enrollments.return_value = enrollments
    with app.test_request_context():
        with patch.object(materials, 'get_supabase_admin_client',
                          return_value=_client({'class_materials': MATERIALS}, calls)), \
             patch.object(materials, 'ClassRepository', return_value=repo), \
             patch.object(materials, 'curriculum_materials_for_class',
                          return_value=list(inherited)), \
             patch.object(materials, 'sign_in_place',
                          side_effect=lambda rows, fields: rows) as sign:
            resp = fn(STUDENT)
    body, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return body.get_json(), status, calls, repo, sign


def test_a_student_gets_their_own_handouts_grouped_by_class():
    body, status, _calls, _repo, _sign = _call()

    assert status == 200
    theater = [c for c in body['classes'] if c['class_id'] == THEATER]
    assert len(theater) == 1
    assert theater[0]['class_name'] == 'Musical Theater'
    assert {m['title'] for m in theater[0]['materials']} == {
        'Dance Videos', 'Music Tracks'}


def test_the_scope_is_the_callers_own_id():
    """There is no parameter to widen. The enrollments read is asked about the
    caller and nobody else, which is what makes this route safe without a
    relationship gate."""
    _body, _status, _calls, repo, _sign = _call()
    repo.get_student_enrollments.assert_called_once()
    assert repo.get_student_enrollments.call_args[0][0] == STUDENT


def test_a_staged_row_is_never_sent_to_a_student_either():
    """Same rule as the family side, and the same reason: a teacher stages a
    casting decision expecting the class not to read it."""
    body, _status, calls, _repo, _sign = _call()

    titles = {m['title'] for c in body['classes'] for m in c['materials']}
    assert 'Casting notes' not in titles
    assert all(q.get('visible_to_students') is True
               for q in calls['class_materials'])


def test_nothing_is_manageable_from_the_student_side():
    body, _status, _calls, _repo, _sign = _call()
    assert all(m['can_delete'] is False
               for c in body['classes'] for m in c['materials'])


def test_a_class_with_no_quest_still_shows_its_materials():
    """The whole point. Nothing in this route knows what a quest is."""
    body, _status, _calls, _repo, _sign = _call()
    assert THEATER in {c['class_id'] for c in body['classes']}


def test_last_years_class_is_not_in_the_list():
    body, _status, _calls, _repo, _sign = _call()
    assert LAST_YEAR not in {c['class_id'] for c in body['classes']}


def test_a_class_that_shared_nothing_is_not_an_empty_heading():
    body, _status, _calls, _repo, _sign = _call()
    assert UKELELE not in {c['class_id'] for c in body['classes']}


def test_somebody_with_no_enrollments_gets_an_empty_list_not_an_error():
    """A guardian, a teacher or an admin hitting this has no enrollments. That
    is an empty answer, not a fault."""
    body, status, _calls, _repo, _sign = _call(enrollments=[])
    assert status == 200
    assert body['classes'] == []


def test_every_class_is_signed_in_one_call():
    _body, _status, _calls, _repo, sign = _call()
    assert sign.call_count == 1
