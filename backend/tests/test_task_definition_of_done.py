"""
A family-written task carries a Definition of Done, and its XP is sized.

Optio Academy reviews the work behind every credit it awards, and a
self-written task with no Definition of Done leaves the reviewer judging
"write a research paper" against whatever turned up. So a school with
feature_flags.require_success_criteria refuses such a task, the Definition of
Done locks once the task is sent for credit, and the AI's own XP size is kept
beside the family's claim for the reviewer (services/task_rules.py,
services/task_quality_service.py, services/task_sizing.py).
"""

import json
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask, g

import app  # noqa: F401 — import graph ordering
from services.task_quality_service import TaskQualityService, snap_xp
from services import task_rules
from utils.guardian_scope import StudentScope

KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
PARENT = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp'


def _unwrap(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


def _json(response):
    body, status = response if isinstance(response, tuple) else (response, 200)
    return body.get_json(), status


# ── the AI's answer is normalized, and the family's words win ────────────────

@pytest.mark.parametrize('raw,expected', [
    (200, 200), (190, 200), (130, 150), (110, 100), (60, 50), (10, 25),
    (1000, 200), ('75', 75), (None, 100), ('lots', 100),
])
def test_xp_snaps_to_a_size_the_pickers_offer(raw, expected):
    assert snap_xp(raw) == expected


def _validate(analysis, description='', existing=None):
    service = TaskQualityService.__new__(TaskQualityService)
    return service._validate_analysis_response(analysis, description, existing or [])


def test_family_lines_stay_first_and_unedited():
    result = _validate(
        {'success_criteria': ['You played 5 games', 'You wrote down your most common mistake',
                              'You tried a new opening'],
         'suggested_xp': 100},
        existing=['You played 5 games'],
    )
    assert result['success_criteria'][0] == 'You played 5 games'
    assert result['success_criteria'].count('You played 5 games') == 1
    assert len(result['success_criteria']) == 3


def test_the_ai_never_pushes_past_four_lines():
    result = _validate({'success_criteria': [f'Line {i}' for i in range(8)], 'suggested_xp': 50})
    assert len(result['success_criteria']) == 4


def test_a_written_description_is_never_replaced():
    result = _validate(
        {'description': 'AI rewrite', 'success_criteria': ['You did it'], 'suggested_xp': 50},
        description='My own words',
    )
    assert result['description'] == 'My own words'


def test_an_empty_description_is_filled():
    result = _validate({'description': 'Play and study.', 'success_criteria': ['You did it'],
                        'suggested_xp': 50})
    assert result['description'] == 'Play and study.'


def test_no_definition_of_done_at_all_is_an_error():
    with pytest.raises(ValueError):
        _validate({'success_criteria': [], 'suggested_xp': 50})


def test_bad_pillar_and_subjects_are_normalized():
    result = _validate({'success_criteria': ['You did it'], 'suggested_xp': 50,
                        'suggested_pillar': 'magic', 'diploma_subjects': 'Math'})
    assert result['suggested_pillar'] == 'stem'
    assert result['diploma_subjects'] == {}


# ── required where the school says so, and only for families ─────────────────

def _refusal(tasks, caller_role='student', flag=True):
    flask_app = Flask(__name__)
    with flask_app.app_context(), \
            patch.object(task_rules, 'requires_success_criteria', return_value=flag):
        return task_rules.missing_criteria_response(tasks, KID, caller_role)


def test_missing_definition_of_done_is_refused_where_required():
    refused = _refusal([{'title': 'Chess', 'success_criteria': []}])
    payload, status = _json(refused)
    assert status == 400
    assert payload['code'] == 'success_criteria_required'


def test_blank_lines_count_as_none():
    assert _refusal([{'title': 'Chess', 'success_criteria': ['  ', '']}]) is not None


def test_a_real_definition_of_done_passes():
    assert _refusal([{'title': 'Chess', 'success_criteria': ['You played 5 games']}]) is None


def test_optional_where_the_school_does_not_require_it():
    assert _refusal([{'title': 'Chess'}], flag=False) is None


def test_teachers_are_never_refused():
    assert _refusal([{'title': 'Chess'}], caller_role='advisor') is None


# ── the parent route: required, sized, and kept out of the task library ──────

def _parent_create(body, *, required):
    from routes import family_quests

    handed = {}

    def fake_persist(supabase, subject_service, child_id, quest_id, task, **kw):
        handed['task'] = task
        handed['kw'] = kw
        return {**task, 'id': 't-1'}

    sized = MagicMock()
    flask_app = Flask(__name__)
    with flask_app.test_request_context(
        '/api/family/quests/q-1/tasks', method='POST',
        data=json.dumps({'student_id': KID, **body}), content_type='application/json',
    ), patch.object(family_quests, 'verify_family_access'), \
            patch.object(family_quests, 'get_supabase_admin_client', return_value=MagicMock()), \
            patch('routes.quest_personalization.persist_accepted_task', side_effect=fake_persist), \
            patch('utils.xp_permissions.get_effective_role_for', return_value='parent'), \
            patch('services.task_rules.requires_success_criteria', return_value=required), \
            patch('services.task_sizing.size_family_tasks', sized), \
            patch('services.subject_classification_service.SubjectClassificationService', MagicMock()):
        g.student_scope = StudentScope(caller_id=PARENT, student_id=KID, via='parent')
        response = _unwrap(family_quests.create_task_for_dependent)(KID, 'q-1')
    payload, status = _json(response)
    return payload, status, handed, sized


def test_parent_task_without_definition_of_done_is_refused_where_required():
    payload, status, handed, sized = _parent_create({'title': 'Chess study'}, required=True)
    assert status == 400
    assert payload['code'] == 'success_criteria_required'
    assert 'task' not in handed
    sized.assert_not_called()


def test_parent_task_is_kept_out_of_the_shared_library_and_sized():
    payload, status, handed, sized = _parent_create(
        {'title': 'Chess study', 'success_criteria': ['You played 5 games'], 'xp_value': 200},
        required=True,
    )
    assert payload['success'] is True, payload
    assert handed['kw']['save_to_library'] is False
    sized.assert_called_once()
    assert sized.call_args[0][0] == KID


# ── editing: locked at submission, never cleared where required ──────────────

def _edit(body, *, task, locked=False, required=False, guide=False):
    from routes.tasks import crud

    repo = MagicMock()
    repo.find_by_id.return_value = task
    supabase = MagicMock()
    user_row = {'role': 'student', 'org_role': None, 'org_roles': None, 'organization_id': 'org-1'}
    supabase.table.return_value.select.return_value.eq.return_value.single.return_value \
        .execute.return_value.data = user_row
    # The in-flight credit check reads the latest completion: none in flight.
    supabase.table.return_value.select.return_value.eq.return_value.eq.return_value \
        .order.return_value.limit.return_value.execute.return_value.data = []
    supabase.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {**task, **body}]

    flask_app = Flask(__name__)
    with flask_app.test_request_context(
        f'/api/tasks/{task["id"]}', method='PUT',
        data=json.dumps(body), content_type='application/json',
    ), patch('repositories.task_repository.TaskRepository', return_value=repo), \
            patch.object(crud, 'get_supabase_admin_client', return_value=supabase), \
            patch('services.task_rules.criteria_locked', return_value=locked), \
            patch('services.task_rules.requires_success_criteria', return_value=required), \
            patch('utils.xp_permissions.is_xp_guide_user', return_value=guide):
        response = _unwrap(crud.update_task)(KID, task['id'])
    return _json(response), supabase


TASK = {'id': 't-1', 'user_id': KID, 'quest_id': 'q-1', 'xp_value': 100,
        'success_criteria': ['You played 5 games']}


def test_changing_a_locked_definition_of_done_is_refused():
    (payload, status), _ = _edit({'success_criteria': ['You played 1 game']}, task=TASK, locked=True)
    assert status == 409
    assert payload['code'] == 'success_criteria_locked'


def test_resending_the_same_definition_of_done_is_not_a_change():
    """The edit modal sends every field together; an unchanged list must not
    trip the lock and block a pillar edit."""
    (payload, status), supabase = _edit(
        {'success_criteria': ['You played 5 games'], 'pillar': 'stem'}, task=TASK, locked=True)
    assert status == 200, payload
    sent = supabase.table.return_value.update.call_args[0][0]
    assert 'success_criteria' not in sent


def test_a_teacher_may_change_a_locked_definition_of_done():
    (payload, status), supabase = _edit(
        {'success_criteria': ['You played 3 games']}, task=TASK, locked=True, guide=True)
    assert status == 200, payload
    sent = supabase.table.return_value.update.call_args[0][0]
    assert sent['success_criteria'] == ['You played 3 games']


def test_clearing_a_required_definition_of_done_is_refused():
    (payload, status), _ = _edit({'success_criteria': []}, task=TASK, required=True)
    assert status == 400
    assert payload['code'] == 'success_criteria_required'


def test_an_unlocked_definition_of_done_is_saved_sanitized():
    (payload, status), supabase = _edit(
        {'success_criteria': ['  You played 3 games  ', '']}, task=TASK)
    assert status == 200, payload
    sent = supabase.table.return_value.update.call_args[0][0]
    assert sent['success_criteria'] == ['You played 3 games']


# ── the lock itself ───────────────────────────────────────────────────────────

def test_lock_reads_any_completion_that_left_none():
    from repositories.task_repository import TaskRepository
    supabase = MagicMock()
    chain = supabase.table.return_value.select.return_value.eq.return_value.neq.return_value \
        .limit.return_value.execute
    chain.return_value.data = [{'id': 'c-1'}]
    with patch.object(TaskRepository, 'client', supabase):
        assert task_rules.criteria_locked('t-1') is True
    supabase.table.assert_called_with('quest_task_completions')
    supabase.table.return_value.select.return_value.eq.return_value.neq.assert_called_with(
        'diploma_status', 'none')

    chain.return_value.data = []
    with patch.object(TaskRepository, 'client', supabase):
        assert task_rules.criteria_locked('t-1') is False


def test_lock_fails_open_on_a_database_error():
    from repositories.task_repository import TaskRepository
    with patch.object(TaskRepository, 'has_credit_submission', side_effect=RuntimeError('db')):
        assert task_rules.criteria_locked('t-1') is False


# ── the reviewer is told who wrote the task ──────────────────────────────────

@pytest.mark.parametrize('task,expected', [
    ({'created_by_user_id': PARENT, 'is_manual': True}, 'parent'),
    ({'created_by_user_id': None, 'is_manual': True}, 'student'),
    ({'created_by_user_id': None, 'is_manual': False}, None),
    ({}, None),
])
def test_written_by(task, expected):
    from routes.credit_dashboard.items import _written_by
    assert _written_by(task) == expected


# ── sizing never reaches the model from a test run ───────────────────────────

def test_sizing_is_skipped_under_pytest():
    from services import task_sizing
    with patch.object(task_sizing.threading, 'Thread') as thread:
        assert task_sizing.size_in_background([{'id': 't-1', 'title': 'Chess'}]) is False
    thread.assert_not_called()


def test_sizing_respects_the_parents_ai_toggle():
    from services import task_sizing
    with patch('utils.ai_access.check_ai_access', return_value=(False, {}, 403)), \
            patch.object(task_sizing, 'size_in_background') as kick:
        assert task_sizing.size_family_tasks(KID, [{'id': 't-1', 'title': 'Chess'}]) is False
    kick.assert_not_called()


# ── 13+ write against diploma subjects; younger learners keep the pillars ────

@pytest.mark.parametrize('dob,expected', [
    ('2013-09-25', True),    # 13 today
    ('2013-09-26', False),   # 13 tomorrow
    ('2010-02-10', True),
    ('2019-05-22', False),
    (None, False),           # unknown age keeps the pillars
    ('not a date', False),
])
def test_pillars_hidden_from_thirteen(dob, expected):
    from datetime import date
    from repositories.user_repository import UserRepository
    with patch.object(UserRepository, 'find_by_id', return_value={'date_of_birth': dob}), \
            patch.object(task_rules, 'date') as fake_date:
        fake_date.today.return_value = date(2026, 9, 25)
        assert task_rules.pillars_hidden_by_age(KID) is expected


@pytest.mark.parametrize('hidden,expected', [(True, 'art'), (False, None)])
def test_subject_edit_without_pillar_rederives_it_for_13_plus(hidden, expected):
    """The edit forms show no pillar picker to a 13+ learner, so a subject
    change arrives without a pillar; the pillar follows the new subject. A
    younger learner's pillar is never touched this way."""
    with patch('services.task_rules.pillars_hidden_by_age', return_value=hidden), \
            patch('utils.org_features.user_org_has_feature', return_value=False):
        (payload, status), supabase = _edit({'diploma_subjects': ['Fine Arts']}, task=TASK)
    assert status == 200, payload
    sent = supabase.table.return_value.update.call_args[0][0]
    assert sent.get('pillar') == expected
