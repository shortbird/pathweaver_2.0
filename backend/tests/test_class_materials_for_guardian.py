"""
A parent reads the handouts their student's teacher shared with the class.

iCreate, Musical Theater, 2026-09-09. The teacher posted to the PARENT chat:
"there are links to the dance videos and music tracks under class materials for
this class." The materials were on the class, both ticked visible_to_students,
and no parent could open either one.

Nothing was broken. The surface did not exist. Every materials read the platform
had ran through class_materials._access, which answers "are you IN this class?"
-- teacher, named assistant, co-teacher, admin of the org, or an actively
enrolled student. A guardian is none of those and never will be, so widening
_access was the wrong repair; the family reads through their own route, gated on
the family relationship instead of class participation.

What this file pins:
  - a guardian gets their student's classes, grouped, with the class name
  - a staged row (visible_to_students false) is NOT reachable through it, which
    is the whole reason a teacher is willing to stage one
  - archived classes are dropped, matching the student's own class list
  - a class with nothing shared does not become an empty heading
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

    The filters matter here: `visible_to_students` is the only thing standing
    between a parent and a teacher's staged answer key, and a stub that ignores
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
# class embedded. Last Year Art is archived — the enrollment survived the
# archive, which is exactly why the route has to check the CLASS's status.
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

    The three decorators are unwrapped rather than satisfied. @require_auth,
    @require_module and @require_relationship_to are each tested where they
    live; re-testing them here would only assert that functools.wraps works,
    and would hide what this file is about behind session setup.
    """
    calls = {}
    fn = inspect.unwrap(materials.list_materials_for_student)
    app = Flask(__name__)
    repo = Mock()
    repo.get_student_enrollments.return_value = enrollments
    with app.test_request_context():
        with patch.object(materials, 'get_supabase_admin_client',
                          return_value=_client({'class_materials': MATERIALS}, calls)), \
             patch.object(materials, 'ClassRepository', return_value=repo), \
             patch.object(materials, 'curriculum_materials_for_class',
                          return_value=list(inherited)) as inherit, \
             patch.object(materials, 'sign_in_place',
                          side_effect=lambda rows, fields: rows) as sign:
            resp = fn(STUDENT, STUDENT)
    body, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return body.get_json(), status, calls, inherit, sign


def test_a_guardian_gets_the_handouts_grouped_by_class():
    body, status, _calls, _inherit, _sign = _call()

    assert status == 200
    theater = [c for c in body['classes'] if c['class_id'] == THEATER]
    assert len(theater) == 1
    assert theater[0]['class_name'] == 'Musical Theater'
    assert {m['title'] for m in theater[0]['materials']} == {
        'Dance Videos', 'Music Tracks'}


def test_a_staged_row_is_never_sent_to_a_parent():
    """The one rule that has to hold. A curriculum is where answer keys and
    casting decisions live, and visible_to_students defaulting closed is what
    makes it safe to hang a family-facing list off a class at all."""
    body, _status, calls, _inherit, _sign = _call()

    titles = {m['title'] for c in body['classes'] for m in c['materials']}
    assert 'Casting notes' not in titles
    # Filtered in the query, not trusted to the client: a hidden row never
    # leaves the database on this route.
    assert all(q.get('visible_to_students') is True
               for q in calls['class_materials'])


def test_the_curriculum_read_is_the_student_visible_one_too():
    _body, _status, _calls, inherit, _sign = _call()
    assert inherit.call_args_list
    for call in inherit.call_args_list:
        assert call.kwargs['visible_only'] is True


def test_nothing_is_deletable_from_the_family_side():
    body, _status, _calls, _inherit, _sign = _call()
    assert all(m['can_delete'] is False
               for c in body['classes'] for m in c['materials'])


def test_last_years_class_is_not_in_the_list():
    """Archived sections are dropped for the same reason the student's own class
    list drops them: they are last year's, and their handouts are noise."""
    body, _status, _calls, _inherit, _sign = _call()
    assert LAST_YEAR not in {c['class_id'] for c in body['classes']}


def test_a_class_that_shared_nothing_is_not_an_empty_heading():
    body, _status, _calls, _inherit, _sign = _call()
    assert UKELELE not in {c['class_id'] for c in body['classes']}


def test_every_class_is_signed_in_one_call():
    """A round trip per class would be one per class on a page that loads them
    all. The flat list is signed once, after the grouping is built."""
    inherited = [{'id': 'i1', 'kind': 'file', 'title': 'ALD Parent Guide.pdf',
                  'url': 'https://example.com/guide.pdf',
                  'curriculum_title': 'ALD'}]
    body, _status, _calls, _inherit, sign = _call(inherited=inherited)

    assert sign.call_count == 1
    signed = sign.call_args[0][0]
    assert len(signed) == sum(len(c['materials']) for c in body['classes'])
    # The curriculum's own documents ride the same signing pass as the class's.
    assert 'ALD Parent Guide.pdf' in {m['title'] for m in signed}


def test_a_family_with_no_classes_gets_an_empty_list_not_an_error():
    body, status, _calls, _inherit, _sign = _call(enrollments=[])
    assert status == 200
    assert body == {'success': True, 'classes': []}


def test_a_bad_student_id_is_refused_before_any_lookup():
    fn = inspect.unwrap(materials.list_materials_for_student)
    app = Flask(__name__)
    admin, repo = Mock(), Mock()
    with app.test_request_context():
        with patch.object(materials, 'get_supabase_admin_client', return_value=admin), \
             patch.object(materials, 'ClassRepository', return_value=repo):
            body, status = fn(STUDENT, 'not-a-uuid')
    assert status == 400
    admin.table.assert_not_called()
    repo.get_student_enrollments.assert_not_called()
