"""Moving a quest's credit to another subject (services/subject_credit_move_service.py).

Kristine Waechtler, 2026-10-02: Archery was credited as Electives and belongs
in PE. What this file pins:

  - approved credit moves: the approved split on the review round, and
    user_subject_xp's earned total, old subject down, new subject up
  - pending credit moves: the requested split the approval will take back out,
    and pending_xp, so approving later pays the new subject
  - the quest's tasks move too, so future work lands in the new subject --
    whatever form the keys are in ("Electives" and "electives" are one subject)
  - an interdisciplinary task moves only its from_subject share
  - an own-curriculum course changes subject only if it is this student's alone
  - a second run moves nothing; the ledger never goes negative and never gains
    credit the old subject did not hold
  - the family request and Optio's decision around it, with their gates
"""

from __future__ import annotations

import inspect
from unittest.mock import MagicMock, patch

import pytest

from tests.crm_fakes import FakeSupabase

STUDENT = '11111111-1111-4111-8111-111111111111'
PARENT = '22222222-2222-4222-8222-222222222222'
STRANGER = '33333333-3333-4333-8333-333333333333'
REVIEWER = '99999999-9999-4999-8999-999999999999'
QUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
OTHER_QUEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'


def _world(**tables):
    db = FakeSupabase()
    db.data.update({
        'quests': [{'id': QUEST, 'title': 'Archery', 'quest_type': 'optio',
                    'transcript_subject': None, 'created_by': None, 'metadata': {}}],
        'user_quests': [{'id': 'uq1', 'user_id': STUDENT, 'quest_id': QUEST}],
        'quest_task_completions': [],
        'diploma_review_rounds': [],
        'user_quest_tasks': [],
        'user_subject_xp': [],
        'subject_credit_moves': [],
        'subject_credit_move_requests': [],
    })
    for name, rows in tables.items():
        db.data[name] = rows
    return db


def _task(tid, split, diploma_subjects=None, quest=QUEST, xp=None):
    return {'id': tid, 'user_id': STUDENT, 'quest_id': quest,
            'xp_value': xp if xp is not None else sum(split.values()),
            'subject_xp_distribution': split,
            'diploma_subjects': diploma_subjects if diploma_subjects is not None else dict(split)}


def _completion(cid, tid, status, quest=QUEST):
    return {'id': cid, 'user_id': STUDENT, 'quest_id': quest,
            'user_quest_task_id': tid, 'diploma_status': status}


def _ledger(db):
    return {r['school_subject']: (r['xp_amount'], r['pending_xp']) for r in db.data['user_subject_xp']}


def _xp_row(subject, xp, pending=0):
    return {'id': f'usx-{subject}', 'user_id': STUDENT, 'school_subject': subject,
            'xp_amount': xp, 'pending_xp': pending}


def _move(db, from_subject='electives', to_subject='pe', **kw):
    from services.subject_credit_move_service import move_quest_subject_credit
    return move_quest_subject_credit(db, STUDENT, QUEST, from_subject, to_subject, REVIEWER, **kw)


# --------------------------------------------------------------------------
# The move
# --------------------------------------------------------------------------

def test_finalized_credit_moves_the_approved_split_and_the_earned_total():
    db = _world(
        user_quest_tasks=[_task('t1', {'electives': 150}), _task('t2', {'electives': 100})],
        quest_task_completions=[_completion('c1', 't1', 'finalized'), _completion('c2', 't2', 'finalized')],
        diploma_review_rounds=[
            {'id': 'r1', 'completion_id': 'c1', 'round_number': 1, 'reviewer_action': 'approved',
             'approved_subjects': {'electives': 150}, 'subject_suggestion': {'electives': 150}},
            # c2 predates approved splits: its task's split is what was paid.
        ],
        user_subject_xp=[_xp_row('electives', 400), _xp_row('pe', 50)],
    )

    result = _move(db, reason='Archery is PE')

    assert result.finalized_xp == 250 and result.pending_xp == 0
    assert db.data['diploma_review_rounds'][0]['approved_subjects'] == {'pe': 150}
    assert _ledger(db) == {'electives': (150, 0), 'pe': (300, 0)}
    # Future work on the quest lands in PE.
    assert all(t['subject_xp_distribution'] == {'pe': t['xp_value']} for t in db.data['user_quest_tasks'])
    audit = db.data['subject_credit_moves']
    assert len(audit) == 1
    assert audit[0]['finalized_xp'] == 250 and audit[0]['moved_by'] == REVIEWER
    assert audit[0]['reason'] == 'Archery is PE'


def test_pending_credit_moves_the_requested_split_and_pending_xp():
    db = _world(
        user_quest_tasks=[_task('t1', {'electives': 100})],
        quest_task_completions=[_completion('c1', 't1', 'pending_review')],
        diploma_review_rounds=[
            {'id': 'r1', 'completion_id': 'c1', 'round_number': 1, 'reviewer_action': None,
             'approved_subjects': None, 'subject_suggestion': {'electives': 100}},
        ],
        user_subject_xp=[_xp_row('electives', 0, pending=100)],
    )

    result = _move(db)

    assert result.pending_xp == 100 and result.finalized_xp == 0
    # The approval takes pending back out by this split, so it must say PE now.
    assert db.data['diploma_review_rounds'][0]['subject_suggestion'] == {'pe': 100}
    assert _ledger(db) == {'electives': (0, 0), 'pe': (0, 100)}

    from utils.subject_xp import get_subject_xp_distribution, pending_subjects_for_completion
    task = db.data['user_quest_tasks'][0]
    assert pending_subjects_for_completion(db, 'c1', task, 100) == {'pe': 100}
    assert get_subject_xp_distribution(task, 100) == {'pe': 100}


def test_interdisciplinary_task_moves_only_the_from_subject_share():
    db = _world(
        user_quest_tasks=[_task('t1', {'electives': 60, 'science': 40})],
        quest_task_completions=[_completion('c1', 't1', 'finalized')],
        diploma_review_rounds=[
            {'id': 'r1', 'completion_id': 'c1', 'round_number': 1, 'reviewer_action': 'approved',
             'approved_subjects': {'electives': 60, 'science': 40}, 'subject_suggestion': None},
        ],
        user_subject_xp=[_xp_row('electives', 60), _xp_row('science', 40)],
    )

    result = _move(db)

    assert result.finalized_xp == 60
    assert db.data['diploma_review_rounds'][0]['approved_subjects'] == {'pe': 60, 'science': 40}
    assert db.data['user_quest_tasks'][0]['subject_xp_distribution'] == {'pe': 60, 'science': 40}
    assert _ledger(db) == {'electives': (0, 0), 'science': (40, 0), 'pe': (60, 0)}


def test_display_name_keys_are_one_subject_and_merge_into_canonical_keys():
    db = _world(user_quest_tasks=[
        _task('t1', {'Electives': 100, 'PE': 50}, diploma_subjects={'Electives': 100, 'PE': 50}),
        _task('t2', {}, diploma_subjects=['Electives']),
        _task('t3', {'Career & Technical Education': 100}),
    ])

    _move(db)

    tasks = {t['id']: t for t in db.data['user_quest_tasks']}
    assert tasks['t1']['diploma_subjects'] == {'pe': 150}
    assert tasks['t1']['subject_xp_distribution'] == {'pe': 150}
    assert tasks['t2']['diploma_subjects'] == ['pe']
    # Nothing to move on t3: it is not rewritten.
    assert tasks['t3']['subject_xp_distribution'] == {'Career & Technical Education': 100}


def test_other_quests_are_untouched():
    db = _world(
        user_quest_tasks=[_task('t1', {'electives': 100}), _task('t9', {'electives': 100}, quest=OTHER_QUEST)],
        quest_task_completions=[_completion('c1', 't1', 'finalized'),
                                _completion('c9', 't9', 'finalized', quest=OTHER_QUEST)],
        user_subject_xp=[_xp_row('electives', 200)],
    )

    _move(db)

    assert _ledger(db) == {'electives': (100, 0), 'pe': (100, 0)}
    other = next(t for t in db.data['user_quest_tasks'] if t['id'] == 't9')
    assert other['subject_xp_distribution'] == {'electives': 100}


def test_a_second_run_moves_nothing():
    db = _world(
        user_quest_tasks=[_task('t1', {'electives': 100})],
        quest_task_completions=[_completion('c1', 't1', 'finalized')],
        diploma_review_rounds=[
            {'id': 'r1', 'completion_id': 'c1', 'round_number': 1, 'reviewer_action': 'approved',
             'approved_subjects': {'electives': 100}, 'subject_suggestion': None},
        ],
        user_subject_xp=[_xp_row('electives', 100)],
    )

    _move(db)
    again = _move(db)

    assert again.total_xp == 0 and not again.changed_anything
    assert _ledger(db) == {'electives': (0, 0), 'pe': (100, 0)}
    assert len(db.data['subject_credit_moves']) == 1


def test_a_short_ledger_is_clamped_and_never_gains_credit():
    db = _world(
        user_quest_tasks=[_task('t1', {'electives': 300})],
        quest_task_completions=[_completion('c1', 't1', 'finalized')],
        diploma_review_rounds=[
            {'id': 'r1', 'completion_id': 'c1', 'round_number': 1, 'reviewer_action': 'approved',
             'approved_subjects': {'electives': 300}, 'subject_suggestion': None},
        ],
        user_subject_xp=[_xp_row('electives', 120)],
    )

    result = _move(db)

    assert result.clamped == {'xp_amount': 180}
    assert _ledger(db) == {'electives': (0, 0), 'pe': (120, 0)}
    assert db.data['subject_credit_moves'][0]['clamped'] == {'xp_amount': 180}


def test_dry_run_writes_nothing():
    db = _world(
        user_quest_tasks=[_task('t1', {'electives': 100})],
        quest_task_completions=[_completion('c1', 't1', 'finalized')],
        user_subject_xp=[_xp_row('electives', 100)],
    )

    result = _move(db, dry_run=True)

    assert result.finalized_xp == 100
    assert _ledger(db) == {'electives': (100, 0)}
    assert db.data['user_quest_tasks'][0]['subject_xp_distribution'] == {'electives': 100}
    assert db.data['subject_credit_moves'] == []


def _own_course(created_by=STUDENT):
    return {'id': QUEST, 'title': 'Archery club', 'quest_type': 'class', 'transcript_subject': 'electives',
            'created_by': created_by, 'metadata': {'course_format': 'own_curriculum', 'course_length': 'semester'}}


def test_own_curriculum_course_changes_subject_when_it_is_the_students_alone():
    db = _world(quests=[_own_course()], user_quest_tasks=[_task('t1', {'electives': 1000})])

    result = _move(db)

    assert result.transcript_subject_changed
    assert db.data['quests'][0]['transcript_subject'] == 'pe'


@pytest.mark.parametrize('created_by,others,skipped', [
    (PARENT, [], 'not_this_students_quest'),
    (STUDENT, [{'id': 'uq2', 'user_id': STRANGER, 'quest_id': QUEST}], 'other_students_enrolled'),
])
def test_own_curriculum_course_shared_with_others_keeps_its_subject(created_by, others, skipped):
    db = _world(quests=[_own_course(created_by)],
                user_quests=[{'id': 'uq1', 'user_id': STUDENT, 'quest_id': QUEST}] + others,
                user_quest_tasks=[_task('t1', {'electives': 1000})])

    result = _move(db)

    assert not result.transcript_subject_changed
    assert result.transcript_subject_skipped == skipped
    assert db.data['quests'][0]['transcript_subject'] == 'electives'
    # The student's own tasks still move.
    assert db.data['user_quest_tasks'][0]['subject_xp_distribution'] == {'pe': 1000}


@pytest.mark.parametrize('from_subject,to_subject,code', [
    ('electives', 'electives', 'SAME_SUBJECT'),
    ('Electives', 'PE ', None),
    ('electives', 'underwater_basket', 'INVALID_SUBJECT'),
])
def test_subjects_are_validated(from_subject, to_subject, code):
    from services.subject_credit_move_service import SubjectMoveError
    db = _world()
    if code is None:
        assert _move(db, from_subject, to_subject).to_subject == 'pe'
        return
    with pytest.raises(SubjectMoveError) as e:
        _move(db, from_subject, to_subject)
    assert e.value.code == code


# --------------------------------------------------------------------------
# Requests and decisions
# --------------------------------------------------------------------------

def _requestable_world():
    return _world(
        users=[{'id': STUDENT, 'first_name': 'Ada', 'last_name': 'W'},
               {'id': PARENT, 'first_name': 'Kristine', 'last_name': 'W'}],
        user_quest_tasks=[_task('t1', {'electives': 250})],
        quest_task_completions=[_completion('c1', 't1', 'finalized')],
        user_subject_xp=[_xp_row('electives', 250)],
    )


def test_request_snapshots_the_xp_and_one_pending_request_per_quest():
    from services import subject_credit_move_service as svc
    db = _requestable_world()

    req = svc.create_move_request(db, STUDENT, QUEST, 'electives', 'pe', PARENT, reason='Archery is PE')

    assert req['xp'] == 250 and req['to_subject_name']
    assert db.data['subject_credit_move_requests'][0]['requested_by'] == PARENT
    # Nothing moved yet.
    assert _ledger(db) == {'electives': (250, 0)}
    assert svc.pending_requests_for_student(db, STUDENT)[0]['id'] == req['id']
    with pytest.raises(svc.SubjectMoveError) as e:
        svc.create_move_request(db, STUDENT, QUEST, 'electives', 'health', PARENT)
    assert e.value.code == 'ALREADY_REQUESTED'


def test_request_refuses_a_subject_with_no_credit_on_the_quest():
    from services import subject_credit_move_service as svc
    with pytest.raises(svc.SubjectMoveError) as e:
        svc.create_move_request(_requestable_world(), STUDENT, QUEST, 'math', 'pe', PARENT)
    assert e.value.code == 'NOTHING_TO_MOVE'


def test_cancel_only_reaches_this_students_pending_request():
    from services import subject_credit_move_service as svc
    db = _requestable_world()
    req = svc.create_move_request(db, STUDENT, QUEST, 'electives', 'pe', PARENT)

    with pytest.raises(svc.SubjectMoveError) as e:
        svc.cancel_move_request(db, req['id'], STRANGER, STRANGER)
    assert e.value.code == 'NOT_FOUND'

    assert svc.cancel_move_request(db, req['id'], STUDENT, PARENT)['status'] == 'cancelled'
    assert svc.pending_requests_for_student(db, STUDENT) == []


def test_approve_moves_the_credit_and_tells_the_family():
    from services import subject_credit_move_service as svc
    db = _requestable_world()
    req = svc.create_move_request(db, STUDENT, QUEST, 'electives', 'pe', PARENT)

    notifier = MagicMock()
    with patch('services.notification_service.NotificationService', return_value=notifier):
        out = svc.approve_move_request(db, req['id'], REVIEWER)

    assert out['request']['status'] == 'approved'
    assert out['move']['finalized_xp'] == 250
    assert _ledger(db) == {'electives': (0, 0), 'pe': (250, 0)}
    assert db.data['subject_credit_moves'][0]['request_id'] == req['id']
    kwargs = notifier.create_notification.call_args.kwargs
    assert kwargs['user_id'] == PARENT
    assert 'PE' in kwargs['title'] or 'Physical' in kwargs['title']

    with pytest.raises(svc.SubjectMoveError) as e:
        svc.approve_move_request(db, req['id'], REVIEWER)
    assert e.value.code == 'ALREADY_DECIDED'


def test_decline_needs_a_note_and_moves_nothing():
    from services import subject_credit_move_service as svc
    db = _requestable_world()
    req = svc.create_move_request(db, STUDENT, QUEST, 'electives', 'pe', PARENT)

    with pytest.raises(svc.SubjectMoveError) as e:
        svc.decline_move_request(db, req['id'], REVIEWER, '  ')
    assert e.value.code == 'NOTE_REQUIRED'

    notifier = MagicMock()
    with patch('services.notification_service.NotificationService', return_value=notifier):
        out = svc.decline_move_request(db, req['id'], REVIEWER, 'Archery here was a club, not PE.')

    assert out['request']['status'] == 'declined'
    assert _ledger(db) == {'electives': (250, 0)}
    assert 'Archery here was a club' in notifier.create_notification.call_args.kwargs['message']


def test_failed_move_puts_the_request_back_in_the_queue():
    from services import subject_credit_move_service as svc
    db = _requestable_world()
    req = svc.create_move_request(db, STUDENT, QUEST, 'electives', 'pe', PARENT)

    with patch.object(svc, 'move_quest_subject_credit', side_effect=RuntimeError('db down')):
        with pytest.raises(RuntimeError):
            svc.approve_move_request(db, req['id'], REVIEWER)

    assert db.data['subject_credit_move_requests'][0]['status'] == 'pending'


def test_queue_lists_names_titles_and_subjects():
    from services import subject_credit_move_service as svc
    db = _requestable_world()
    svc.create_move_request(db, STUDENT, QUEST, 'electives', 'pe', PARENT, reason='Archery is PE')

    items = svc.list_requests(db)

    assert len(items) == 1
    item = items[0]
    assert item['student_name'] == 'Ada W' and item['requested_by_name'] == 'Kristine W'
    assert item['quest_title'] == 'Archery' and item['xp'] == 250 and item['reason'] == 'Archery is PE'


# --------------------------------------------------------------------------
# Routes and their gates
# --------------------------------------------------------------------------

def _family_call(handler, caller, *args, json=None, guardians=(PARENT,)):
    """Run a family route below @require_auth, with @student_scope live and the
    guardian check answered from `guardians` (who is a parent of STUDENT)."""
    from flask import Flask

    import routes.quest.courses_and_credits as routes
    view = handler.__wrapped__  # @student_scope's wrapper; @require_auth is above it
    db = _requestable_world()
    app = Flask(__name__)

    def relationship(c, s):
        return {'via': 'parent'} if c in guardians and s == STUDENT else None

    with app.test_request_context('/', method='POST', json=json or {}):
        with patch.object(routes, 'get_supabase_admin_client', return_value=db), \
             patch('utils.guardian_scope.guardian_relationship', side_effect=relationship), \
             patch('utils.guardian_scope._log_delegated_read'):
            resp = view(caller, *args)
    body, status = resp if isinstance(resp, tuple) else (resp, 200)
    return body.get_json(), status, db


def test_family_route_parent_can_request_for_their_child():
    import routes.quest.courses_and_credits as routes
    body, status, db = _family_call(
        routes.request_subject_move, PARENT,
        json={'student_id': STUDENT, 'quest_id': QUEST, 'from_subject': 'electives', 'to_subject': 'pe'})

    assert status == 201
    assert body['data']['xp'] == 250
    row = db.data['subject_credit_move_requests'][0]
    assert row['student_id'] == STUDENT and row['requested_by'] == PARENT


def test_family_route_refuses_an_unrelated_user():
    from middleware.error_handler import AuthorizationError

    import routes.quest.courses_and_credits as routes
    with pytest.raises(AuthorizationError):
        _family_call(routes.request_subject_move, STRANGER,
                     json={'student_id': STUDENT, 'quest_id': QUEST,
                           'from_subject': 'electives', 'to_subject': 'pe'})


def test_reviewer_routes_are_superadmin_only():
    from flask import Flask

    import routes.credit_dashboard.subject_moves as routes
    app = Flask(__name__)
    parent_db = FakeSupabase({'users': [{'id': PARENT, 'role': 'parent', 'org_role': None, 'org_roles': None}]})
    from middleware.error_handler import AuthorizationError
    for handler, args in ((routes.list_subject_moves, ()),
                          (routes.approve_subject_move, ('x',)),
                          (routes.decline_subject_move, ('x',))):
        with app.test_request_context('/', method='POST', json={}):
            with patch('utils.auth.decorators.session_manager.get_effective_user_id', return_value=PARENT), \
                 patch('database.get_supabase_admin_client', return_value=parent_db), \
                 patch('utils.auth.decorators.apply_role_view', side_effect=lambda u, **k: u):
                with pytest.raises(AuthorizationError):
                    handler(*args)


def _reviewer_call(handler, *args, json=None, db=None):
    from flask import Flask

    import routes.credit_dashboard.subject_moves as routes
    app = Flask(__name__)
    view = inspect.unwrap(handler)
    with app.test_request_context('/', method='POST', json=json or {}):
        with patch.object(routes, 'get_supabase_admin_singleton', return_value=db), \
             patch('services.notification_service.NotificationService', return_value=MagicMock()):
            resp = view(REVIEWER, *args)
    body, status = resp if isinstance(resp, tuple) else (resp, 200)
    return body.get_json(), status


def test_reviewer_approves_and_declines_through_the_routes():
    from services import subject_credit_move_service as svc

    import routes.credit_dashboard.subject_moves as routes
    db = _requestable_world()
    req = svc.create_move_request(db, STUDENT, QUEST, 'electives', 'pe', PARENT)

    body, status = _reviewer_call(routes.list_subject_moves, db=db)
    assert status == 200 and [i['id'] for i in body['data']['items']] == [req['id']]

    body, status = _reviewer_call(routes.approve_subject_move, req['id'], db=db)
    assert status == 200 and body['data']['move']['finalized_xp'] == 250
    assert _ledger(db)['pe'] == (250, 0)

    db2 = _requestable_world()
    req2 = svc.create_move_request(db2, STUDENT, QUEST, 'electives', 'pe', PARENT)
    body, status = _reviewer_call(routes.decline_subject_move, req2['id'], json={}, db=db2)
    assert status == 400 and body['error']['code'] == 'NOTE_REQUIRED'
    body, status = _reviewer_call(routes.decline_subject_move, req2['id'], json={'note': 'Kept as elective.'}, db=db2)
    assert status == 200 and body['data']['request']['status'] == 'declined'

    body, status = _reviewer_call(routes.approve_subject_move, 'not-a-uuid', db=db2)
    assert status == 404
