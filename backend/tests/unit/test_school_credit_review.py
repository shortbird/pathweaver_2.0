"""The school stage of credit review, after Tanner's rule of 2026-10-15.

1. Org admins, campus coordinators and teachers approve (and send back) their
   school's credit requests. A teacher only for the students they teach.
2. Who makes the final call follows the student's transcript
   (utils.accreditation.resolve_transcript_accreditation):
     - the school's own transcript ('self' / 'none'): the school's approval
       FINALIZES the credit, the school may set the XP, and no superadmin is
       told;
     - Optio's accreditation ('optio', including an Optio Academy enrollment
       at an org that is itself 'none'): the approval hands the request to
       Optio at 'pending_review', and the XP stays Optio's call (403).
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
STUDENT_ID = '11111111-1111-1111-1111-111111111111'
OTHER_STUDENT_ID = '12121212-1212-1212-1212-121212121212'
TASK_ID = '22222222-2222-2222-2222-222222222222'
QUEST_ID = '33333333-3333-3333-3333-333333333333'
ORG_ID = '77777777-7777-7777-7777-777777777777'
SUPERADMIN_ID = '99999999-9999-9999-9999-999999999999'
ADMIN_ID = '88888888-8888-8888-8888-888888888888'
COORD_ID = '66666666-6666-6666-6666-666666666666'
TEACHER_ID = '55555555-5555-5555-5555-555555555555'
PARENT_TEACHER_ID = '44444444-4444-4444-4444-444444444444'


def _org_user(uid, *roles):
    return {'id': uid, 'role': 'org_managed', 'org_role': roles[0],
            'org_roles': list(roles), 'organization_id': ORG_ID,
            'display_name': 'Ms. Reviewer'}


USERS = {
    SUPERADMIN_ID: {'id': SUPERADMIN_ID, 'role': 'superadmin', 'org_role': None,
                    'org_roles': None, 'organization_id': None},
    ADMIN_ID: _org_user(ADMIN_ID, 'org_admin'),
    COORD_ID: _org_user(COORD_ID, 'campus_coordinator'),
    TEACHER_ID: _org_user(TEACHER_ID, 'advisor'),
    # A parent who also teaches: the singular org_role says 'parent'.
    PARENT_TEACHER_ID: _org_user(PARENT_TEACHER_ID, 'parent', 'advisor'),
    STUDENT_ID: _org_user(STUDENT_ID, 'student'),
    OTHER_STUDENT_ID: _org_user(OTHER_STUDENT_ID, 'student'),
}


class _Query:
    """A PostgREST builder stand-in that remembers its filters and writes."""

    def __init__(self, db, name):
        self.db, self.name = db, name
        self.filters, self.single_call = {}, False

    def __getattr__(self, attr):
        return lambda *a, **k: self

    def eq(self, col, val):
        self.filters[col] = val
        return self

    def in_(self, col, vals):
        self.filters[col] = list(vals)
        return self

    def single(self):
        self.single_call = True
        return self

    def update(self, row):
        self.db.writes.setdefault(self.name, []).append(row)
        return self

    def insert(self, row):
        self.db.writes.setdefault(self.name, []).append(row)
        return self

    def execute(self):
        rows = self.db.rows_for(self)
        if self.single_call:
            return SimpleNamespace(data=rows[0] if rows else None, count=None)
        return SimpleNamespace(data=rows, count=len(rows))


class _DB:
    def __init__(self, accreditation='none', status='pending_org_approval'):
        self.writes = {}
        self.accreditation = accreditation
        self.completion = {
            'id': COMPLETION_ID, 'user_id': STUDENT_ID, 'quest_id': QUEST_ID,
            'diploma_status': status, 'user_quest_task_id': TASK_ID,
            'credit_requested_at': '2026-10-01T00:00:00+00:00',
        }
        self.task = {'id': TASK_ID, 'quest_id': QUEST_ID, 'pillar': 'stem',
                     'title': 'Bridge', 'diploma_subjects': ['math'],
                     'subject_xp_distribution': {'math': 100}, 'xp_value': 100}

    def table(self, name):
        return _Query(self, name)

    def rows_for(self, q):
        if q.name == 'users':
            wanted = q.filters.get('id')
            if isinstance(wanted, list):
                return [USERS[i] for i in wanted if i in USERS
                        and USERS[i].get('organization_id') == q.filters.get('organization_id')]
            if wanted:
                row = USERS.get(wanted)
                return [row] if row else []
            if q.filters.get('role') == 'superadmin':
                return [USERS[SUPERADMIN_ID]]
            return []
        if q.name == 'quest_task_completions':
            return [self.completion]
        if q.name == 'user_quest_tasks':
            return [self.task]
        if q.name == 'diploma_review_rounds':
            return [{'id': 'round-1'}]
        if q.name == 'organizations':
            return [{'id': ORG_ID, 'accreditation_source': self.accreditation}]
        return []

    def last(self, table):
        return (self.writes.get(table) or [{}])[-1]


@pytest.fixture
def notify():
    with patch('services.notification_service.NotificationService') as ns:
        ns.return_value.create_notification = MagicMock()
        yield ns.return_value.create_notification


@pytest.fixture(autouse=True)
def _xp_helpers():
    with patch('routes.tasks.xp_helpers.finalize_subject_xp', return_value=100), \
         patch('routes.tasks.xp_helpers.remove_pending_subject_xp', return_value=None):
        yield


def _post(client, db, reviewer_id, action='org-approve', body=None, *,
          academy=False, teaches=()):
    with patch('routes.credit_dashboard.org_admin_actions.get_supabase_admin_singleton',
               return_value=db), \
         patch('database.get_supabase_admin_client', return_value=db), \
         patch('services.academy_enrollment_service.is_academy_student',
               return_value=academy), \
         patch('utils.class_membership.students_taught_by', return_value=set(teaches)), \
         patch('utils.session_manager.session_manager.get_effective_user_id',
               return_value=reviewer_id):
        return client.post(f'/api/credit-dashboard/items/{COMPLETION_ID}/{action}',
                           json=body or {})


def _superadmin_pinged(notify):
    return any(c.kwargs.get('notification_type') == 'org_approved_credit'
               for c in notify.call_args_list)


class TestTheSchoolsOwnTranscript:
    def test_the_school_approval_finalizes_the_credit(self, client, notify):
        db = _DB(accreditation='none')
        resp = _post(client, db, ADMIN_ID, body={'feedback': 'Lovely work'})

        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()['data']
        assert data['diploma_status'] == 'finalized'
        assert data['final_reviewer'] == 'school'
        done = db.last('quest_task_completions')
        assert done['diploma_status'] == 'finalized'
        assert done['credit_reviewer_id'] == ADMIN_ID
        assert done['finalized_at']
        assert db.last('user_quest_tasks')['latest_feedback'] == 'Lovely work'

    def test_the_round_names_the_school_reviewer_in_both_seats(self, client, notify):
        db = _DB(accreditation='self')
        _post(client, db, ADMIN_ID)
        rnd = db.writes['diploma_review_rounds'][0]
        assert rnd['org_reviewer_id'] == ADMIN_ID
        assert rnd['reviewer_id'] == ADMIN_ID
        assert rnd['reviewer_action'] == 'approved'

    def test_no_superadmin_is_told(self, client, notify):
        _post(client, _DB(accreditation='none'), ADMIN_ID)
        assert not _superadmin_pinged(notify)

    def test_the_school_may_set_the_xp(self, client, notify):
        db = _DB(accreditation='none')
        adjusted = SimpleNamespace(xp_after=50, subjects_after={'math': 50})
        with patch('routes.credit_dashboard.school_review.apply_reviewer_xp',
                   return_value=(adjusted, None)) as apply_xp:
            resp = _post(client, db, ADMIN_ID, body={'xp_value': 50})
        assert resp.status_code == 200, resp.get_json()
        apply_xp.assert_called_once()
        assert resp.get_json()['data']['diploma_status'] == 'finalized'


class TestOptiosAccreditation:
    def test_an_optio_org_hands_the_request_to_optio(self, client, notify):
        db = _DB(accreditation='optio')
        resp = _post(client, db, ADMIN_ID)

        assert resp.status_code == 200, resp.get_json()
        data = resp.get_json()['data']
        assert data['diploma_status'] == 'pending_review'
        assert data['final_reviewer'] == 'optio'
        assert db.last('quest_task_completions')['diploma_status'] == 'pending_review'
        assert 'reviewer_id' not in db.writes['diploma_review_rounds'][0]
        assert _superadmin_pinged(notify)

    def test_an_academy_student_at_a_none_org_goes_to_optio(self, client, notify):
        db = _DB(accreditation='none')
        resp = _post(client, db, ADMIN_ID, academy=True)
        data = resp.get_json()['data']
        assert data['diploma_status'] == 'pending_review'
        assert data['final_reviewer'] == 'optio'

    def test_the_xp_stays_optios_call(self, client, notify):
        db = _DB(accreditation='optio')
        with patch('routes.credit_dashboard.school_review.apply_reviewer_xp') as apply_xp:
            resp = _post(client, db, ADMIN_ID, body={'xp_value': 50})
        assert resp.status_code == 403
        assert resp.get_json()['error']['code'] == 'XP_ADJUST_FORBIDDEN'
        apply_xp.assert_not_called()
        assert 'quest_task_completions' not in db.writes


class TestWhoMayReview:
    def test_a_coordinator_may_approve(self, client, notify):
        resp = _post(client, _DB(), COORD_ID)
        assert resp.status_code == 200, resp.get_json()
        assert resp.get_json()['data']['diploma_status'] == 'finalized'

    def test_a_teacher_may_approve_a_student_they_teach(self, client, notify):
        resp = _post(client, _DB(), TEACHER_ID, teaches={STUDENT_ID})
        assert resp.status_code == 200, resp.get_json()

    def test_a_parent_who_teaches_counts_as_the_teacher(self, client, notify):
        resp = _post(client, _DB(), PARENT_TEACHER_ID, teaches={STUDENT_ID})
        assert resp.status_code == 200, resp.get_json()

    def test_a_teacher_may_not_approve_another_classes_student(self, client, notify):
        db = _DB()
        resp = _post(client, db, TEACHER_ID, teaches={OTHER_STUDENT_ID})
        assert resp.status_code == 403
        assert 'students you teach' in resp.get_json()['error']['message']
        assert 'quest_task_completions' not in db.writes

    def test_a_teacher_may_send_back_a_student_they_teach(self, client, notify):
        db = _DB()
        resp = _post(client, db, TEACHER_ID, 'org-grow-this',
                     body={'feedback': 'Show the measurements'}, teaches={STUDENT_ID})
        assert resp.status_code == 200, resp.get_json()
        assert db.last('quest_task_completions')['diploma_status'] == 'grow_this'

    def test_a_teacher_may_not_send_back_another_classes_student(self, client, notify):
        db = _DB()
        resp = _post(client, db, TEACHER_ID, 'org-grow-this',
                     body={'feedback': 'No'}, teaches=set())
        assert resp.status_code == 403
        assert 'students you teach' in resp.get_json()['error']['message']

    def test_the_superadmin_still_finalizes_in_one_click(self, client, notify):
        db = _DB(accreditation='optio')
        resp = _post(client, db, SUPERADMIN_ID)
        data = resp.get_json()['data']
        assert data['diploma_status'] == 'finalized'
        assert data['collapsed'] is True
        assert data['final_reviewer'] == 'optio'
        assert not _superadmin_pinged(notify)


class TestTheQueueSaysWhoDecides:
    def test_each_student_is_tagged_with_the_final_reviewer(self):
        from routes.credit_dashboard.school_review import final_reviewers_for

        class Repo:
            def org_accreditation_rows(self, ids):
                return {'org-none': {'accreditation_source': 'none'},
                        'org-optio': {'accreditation_source': 'optio'},
                        'org-self': {'accreditation_source': 'self'}}

            def academy_enrolled_ids(self, ids):
                return {'s-academy'}

        with patch('routes.credit_dashboard.school_review._repo', return_value=Repo()):
            out = final_reviewers_for(object(), {
                's-none': 'org-none', 's-self': 'org-self',
                's-optio': 'org-optio', 's-academy': 'org-none',
            })
        assert out == {'s-none': 'school', 's-self': 'school',
                       's-optio': 'optio', 's-academy': 'optio'}
