"""
Training links set for students -- the students half of ae16c5da.

"I would like to link to a video or document option in the 'for families' (and
students if it's not there too). For example, it'd be nice to be able to upload
the training from last friday without creating an entire quest." (iCreate,
Molly, 2026-09-22.)

The families half shipped first. Students waited on a migration:
org_resources.audience was CHECK-constrained to families/staff/all, and
20260922200100_org_resources_audience_students.sql adds 'students'. What these
tests hold down:

  - the two vocabularies translate both ways (student <-> students);
  - the student list carries student links and nothing else;
  - done and undone are the caller's own, and only a student can press them;
  - no family- or staff-facing reader of org_resources starts showing a
    student link (every library reader names its audiences explicitly);
  - the Training page's student tab and its report carry student links.
"""

from unittest.mock import Mock, patch

import pytest
from flask import Flask

import routes.sis.staff_training as training
import routes.sis.student_training as student_routes
from services import sis_service
from services import sis_training_service
from services import sis_parent_service as parent

from tests.test_sis_training_links import (
    ADMIN, LINK, ORG, OTHER_ORG, _FakeRepo, _call, _link, _links,
)

STUDENT = '77777777-7777-4777-8777-777777777777'
PARENT = '88888888-8888-4888-8888-888888888888'
OTHER_STUDENT = '99999999-9999-4999-8999-999999999999'
# Real UUIDs: owned_link validates every id that arrives from the browser.
S_LINK = 'a1111111-1111-4111-8111-111111111111'
F_LINK = 'a2222222-2222-4222-8222-222222222222'
T_LINK = 'a3333333-3333-4333-8333-333333333333'
ALL_LINK = 'a4444444-4444-4444-8444-444444444444'


def _ctx(roles, org=ORG):
    """get_user_org_context as the service reads it."""
    role = 'org_managed' if org else 'student'
    return {'id': 'x', 'role': role, 'org_role': roles[0] if roles else None,
            'org_roles': list(roles), 'organization_id': org}


def _student_call(view, user_id, repo, ctx, **kwargs):
    app = Flask(__name__)
    with patch.object(sis_training_service, '_repo', return_value=repo), \
         patch.object(sis_service, 'get_user_org_context', return_value=ctx), \
         app.test_request_context('/api/sis/student/training'):
        fn = view
        while hasattr(fn, '__wrapped__'):
            fn = fn.__wrapped__
        resp = fn(user_id, **kwargs)
    body = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return body, status


def _mixed_rows():
    return [
        _link(id=S_LINK, audience='students', title='Last Friday training'),
        _link(id=F_LINK, audience='families', title='Back to school night'),
        _link(id=T_LINK, audience='staff', title='Whole Brain Teaching'),
        _link(id=ALL_LINK, audience='all', title='An old all row'),
    ]


@pytest.mark.unit
class TestTheTwoVocabularies:
    def test_student_is_written_as_students(self):
        assert sis_training_service.resource_audience('student') == ('students', None)
        assert sis_training_service.resource_audience('students') == ('students', None)

    def test_students_reads_back_as_student(self):
        shaped = sis_training_service.shape_link(_link(audience='students'))
        assert shaped['audience'] == 'student'
        assert shaped['audiences'] == ['student']

    def test_the_other_audiences_are_unchanged(self):
        assert sis_training_service.resource_audience('family') == ('families', None)
        assert sis_training_service.resource_audience(None) == ('staff', None)
        assert sis_training_service.training_audience('all') == 'staff'

    def test_an_edit_can_move_a_link_to_students(self):
        fields, err = sis_training_service.link_fields_from(
            {'audience': 'student'}, ORG, partial=True)
        assert err is None
        assert fields == {'audience': 'students'}


@pytest.mark.unit
class TestTheStudentList:
    def test_only_student_links_are_on_it(self):
        """Not the family link, not the staff link, and not a legacy 'all'
        row: in the document library 'all' has only ever meant families and
        staff."""
        repo = _FakeRepo(rows=_mixed_rows())
        body, status = _student_call(student_routes.my_student_training, STUDENT, repo,
                                     _ctx(['student']))
        assert status == 200
        assert [t['id'] for t in body['training']] == [S_LINK]
        assert body['training'][0]['audience'] == 'student'
        assert body['training'][0]['my_done'] is None

    def test_it_says_when_the_student_has_done_one(self):
        repo = _FakeRepo(rows=_mixed_rows(), acks=[(S_LINK, STUDENT, 'v1')])
        body, _ = _student_call(student_routes.my_student_training, STUDENT, repo,
                                _ctx(['student']))
        assert body['training'][0]['my_done'] == {'done_at': 'now'}

    def test_a_non_student_gets_an_empty_list_not_an_error(self):
        """The card sits on every member's /school page and renders nothing
        when empty -- a teacher's or a parent's page must not show it."""
        repo = _FakeRepo(rows=_mixed_rows())
        body, status = _student_call(student_routes.my_student_training, PARENT, repo,
                                     _ctx(['parent']))
        assert status == 200
        assert body['training'] == []

    def test_a_student_with_no_school_gets_an_empty_list(self):
        repo = _FakeRepo(rows=_mixed_rows())
        body, _ = _student_call(student_routes.my_student_training, STUDENT, repo,
                                _ctx(['student'], org=None))
        assert body['training'] == []

    def test_it_reads_only_the_students_own_school(self):
        repo = _FakeRepo(rows=[_link(id='elsewhere', audience='students',
                                     organization_id=OTHER_ORG)])
        body, _ = _student_call(student_routes.my_student_training, STUDENT, repo,
                                _ctx(['student']))
        assert body['training'] == []


@pytest.mark.unit
class TestDoneAndUndone:
    def test_done_is_the_callers_own_mark(self):
        repo = _FakeRepo(rows=_mixed_rows())
        body, status = _student_call(student_routes.mark_my_student_training_done, STUDENT,
                                     repo, _ctx(['student']), training_id=S_LINK)
        assert status == 200
        assert repo.done == [(S_LINK, STUDENT, 'v1')]
        assert body['training']['my_done'] == {'done_at': 'now'}

    def test_and_it_can_be_taken_back(self):
        repo = _FakeRepo(rows=_mixed_rows())
        body, status = _student_call(student_routes.unmark_my_student_training_done, STUDENT,
                                     repo, _ctx(['student']), training_id=S_LINK)
        assert status == 200
        assert repo.undone == [(S_LINK, STUDENT)]
        assert body['training']['my_done'] is None

    @pytest.mark.parametrize('link_id', [F_LINK, T_LINK, ALL_LINK])
    def test_a_student_cannot_finish_somebody_elses_training(self, link_id):
        """A staff or family id is guessable. Marking one done as a student
        would put a student in the office's report on it."""
        repo = _FakeRepo(rows=_mixed_rows())
        _body, status = _student_call(student_routes.mark_my_student_training_done, STUDENT,
                                      repo, _ctx(['student']), training_id=link_id)
        assert status == 404
        assert repo.done == []

    def test_a_non_student_cannot_press_it(self):
        repo = _FakeRepo(rows=_mixed_rows())
        _body, status = _student_call(student_routes.mark_my_student_training_done, PARENT,
                                      repo, _ctx(['parent']), training_id=S_LINK)
        assert status == 404
        assert repo.done == []

    def test_another_schools_link_is_not_found(self):
        repo = _FakeRepo(rows=[_link(id=LINK, audience='students', organization_id=OTHER_ORG)])
        _body, status = _student_call(student_routes.mark_my_student_training_done, STUDENT,
                                      repo, _ctx(['student']), training_id=LINK)
        assert status == 404
        assert repo.done == []

    def test_a_parent_cannot_finish_a_student_link_on_the_family_route(self):
        student_link = {'id': 'L3', 'organization_id': 'org1', 'audience': 'students'}
        # is_guardian_or_staff, not _is_org_member, since 82485501 (2026-09-22).
        with patch.object(parent, 'is_guardian_or_staff', return_value=True), \
             patch.object(sis_training_service, 'owned_link', return_value=student_link), \
             patch.object(sis_training_service, 'set_link_done') as marked:
            assert parent.set_training_link_done('g1', 'org1', 'L3', True) is None
        marked.assert_not_called()


@pytest.mark.unit
class TestNoOtherReaderPicksItUp:
    """Every document-library reader names the audiences it wants. None of
    them may name 'students'; a student link on the family portal's library
    or a teacher's dashboard would be training in the wrong place."""

    def test_the_family_library_excludes_training_and_students(self):
        seen = {}
        q = Mock()
        for chained in ('select', 'order', 'limit'):
            getattr(q, chained).return_value = q

        def _eq(col, val):
            seen.setdefault('eq', {})[col] = val
            return q

        def _in(col, vals):
            seen.setdefault('in', {})[col] = list(vals)
            return q
        q.eq.side_effect = _eq
        q.in_.side_effect = _in
        q.execute.return_value = Mock(data=[])
        admin = Mock()
        admin.table.return_value = q
        with patch.object(parent, '_admin', return_value=admin), \
             patch.object(parent, '_is_org_member', return_value=True), \
             patch('utils.storage_urls.sign_in_place', lambda *_a, **_k: None):
            parent.org_resources('g1', 'org1')
        assert seen['eq']['is_training'] is False
        assert 'students' not in seen['in']['audience']

    def test_the_family_training_list_excludes_student_links(self):
        repo = _FakeRepo(rows=_mixed_rows())
        with patch.object(sis_training_service, '_repo', return_value=repo):
            links = sis_training_service.list_links(ORG, PARENT, audience='family')
        assert [l['id'] for l in links] == [F_LINK, ALL_LINK]

    def test_the_staff_training_list_excludes_student_links(self):
        repo = _FakeRepo(rows=_mixed_rows())
        body, _ = _call(training.list_training, ADMIN, repo, query='?audience=staff')
        assert S_LINK not in [l['id'] for l in _links(body)]


@pytest.mark.unit
class TestTheTrainingPagesStudentTab:
    def test_the_student_tab_lists_student_links(self):
        repo = _FakeRepo(rows=_mixed_rows())
        body, _ = _call(training.list_training, ADMIN, repo, query='?audience=student')
        assert [l['id'] for l in _links(body)] == [S_LINK]

    def test_the_student_report_counts_student_acks(self):
        repo = _FakeRepo(rows=_mixed_rows(), acks=[(S_LINK, STUDENT, 'v1')])
        students = [
            {'id': STUDENT, 'name': 'Sam', 'roles': ['student'], 'age': 13},
            {'id': OTHER_STUDENT, 'name': 'Other kid', 'roles': ['student'], 'age': None},
        ]
        with patch.object(training, '_org_students', return_value=students):
            body, _ = _call(training.training_progress, ADMIN, repo, query='?audience=student')
        assert [c['id'] for c in body['training']] == [S_LINK]
        rows = {r['user_id']: r for r in body['staff']}
        assert rows[STUDENT]['cells'][0] == {
            'kind': 'link', 'id': S_LINK, 'applies': True,
            'completed': True, 'done_at': 'now'}
        # A link carries no age window, so it applies to every student,
        # including one whose date of birth is not on file.
        assert rows[OTHER_STUDENT]['cells'][0]['applies'] is True
        assert rows[OTHER_STUDENT]['cells'][0]['completed'] is False
        assert rows[STUDENT]['required_completed'] == 1
