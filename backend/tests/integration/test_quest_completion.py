"""Integration tests for task completion and XP.

XP is the platform's ledger: it drives levels, badges, and the 1000-XP class
credit target. These check that completing a task credits the right pillar
exactly once, and that a replayed completion cannot mint more.

Ported 2026-08-13 -- see backend/tests/integration/README.md.
"""

import uuid

import pytest

pytestmark = pytest.mark.requires_db


@pytest.fixture
def enrolled(db, student, make_quest):
    """A student enrolled in a quest, with one task ready to complete.

    Mirrors the real row shape: user_quest_tasks hangs off a user_quests row
    (user_quest_id is NOT NULL), which is what enrolment creates.
    """
    quest = make_quest(title='XP Quest')

    user_quest = {
        'id': str(uuid.uuid4()),
        'user_id': student['id'],
        'quest_id': quest['id'],
        'is_active': True,
    }
    db.table('user_quests').insert(user_quest).execute()

    def _task(pillar='stem', xp_value=100, **fields):
        row = {
            'id': str(uuid.uuid4()),
            'user_id': student['id'],
            'quest_id': quest['id'],
            'user_quest_id': user_quest['id'],
            'title': 'Build something',
            'pillar': pillar,
            'xp_value': xp_value,
        }
        row.update(fields)
        db.table('user_quest_tasks').insert(row).execute()
        return row

    return {'student': student, 'quest': quest, 'user_quest': user_quest, 'task': _task}


def _complete(client, headers, task_id, **body):
    """POST a completion.

    This endpoint reads request.form, not JSON -- it accepts file uploads for
    image/document evidence -- so the body goes as form data. Sending JSON gets
    "Evidence type is required" because request.form is empty.
    """
    payload = {'evidence_type': 'text', 'text_content': 'Here is what I made.'}
    payload.update(body)
    # Content-Type must come from the form encoding, not the JSON default the
    # auth_headers_for helper sets.
    form_headers = {k: v for k, v in headers.items() if k.lower() != 'content-type'}
    return client.post(f'/api/tasks/{task_id}/complete', headers=form_headers, data=payload)


def _xp_for(db, user_id, pillar):
    rows = db.table('user_skill_xp').select('xp_amount') \
        .eq('user_id', user_id).eq('pillar', pillar).execute().data
    return rows[0]['xp_amount'] if rows else 0


@pytest.mark.integration
@pytest.mark.critical
def test_completing_a_task_records_the_completion(client, db, enrolled, auth_headers_for):
    task = enrolled['task']()
    student = enrolled['student']

    response = _complete(client, auth_headers_for(student['id']), task['id'])

    assert response.status_code == 200, response.get_data(as_text=True)
    completions = db.table('quest_task_completions').select('user_id, task_id') \
        .eq('user_id', student['id']).execute().data
    assert len(completions) == 1
    assert completions[0]['task_id'] == task['id']


@pytest.mark.integration
@pytest.mark.critical
def test_completing_a_task_credits_its_own_pillar(client, db, enrolled, auth_headers_for):
    """XP lands on the task's pillar. Mis-crediting silently skews the whole
    diploma picture, and nothing downstream would notice."""
    task = enrolled['task'](pillar='stem', xp_value=100)
    student = enrolled['student']

    _complete(client, auth_headers_for(student['id']), task['id'])

    assert _xp_for(db, student['id'], 'stem') == 100
    assert _xp_for(db, student['id'], 'wellness') == 0


@pytest.mark.integration
@pytest.mark.critical
def test_a_task_cannot_be_completed_twice_for_double_xp(client, db, enrolled, auth_headers_for):
    """Replaying the request is the cheapest way to farm XP, so the second one
    must not add to the ledger."""
    task = enrolled['task'](pillar='stem', xp_value=100)
    student = enrolled['student']
    headers = auth_headers_for(student['id'])

    first = _complete(client, headers, task['id'])
    assert first.status_code == 200

    _complete(client, headers, task['id'])

    completions = db.table('quest_task_completions').select('id') \
        .eq('user_id', student['id']).eq('task_id', task['id']).execute().data
    assert len(completions) == 1, 'the task was completed twice'
    assert _xp_for(db, student['id'], 'stem') == 100, 'XP was awarded twice'


@pytest.mark.integration
@pytest.mark.authorization
@pytest.mark.critical
def test_a_student_cannot_complete_another_students_task(
    client, db, enrolled, make_user, auth_headers_for
):
    task = enrolled['task']()
    intruder = make_user(role='student')

    response = _complete(client, auth_headers_for(intruder['id']), task['id'])

    assert response.status_code in (403, 404)
    assert db.table('quest_task_completions').select('id') \
        .eq('user_id', intruder['id']).execute().data == []


@pytest.mark.integration
@pytest.mark.security
def test_completing_a_task_requires_authentication(client, enrolled):
    task = enrolled['task']()

    response = client.post(
        f'/api/tasks/{task["id"]}/complete',
        data={'evidence_type': 'text', 'text_content': 'x'},
    )

    assert response.status_code == 401


@pytest.mark.integration
def test_completing_an_unknown_task_is_not_a_server_error(client, student, auth_headers_for):
    response = _complete(client, auth_headers_for(student['id']), str(uuid.uuid4()))

    assert response.status_code in (403, 404), \
        f'expected a clean refusal, got {response.status_code}'


@pytest.mark.integration
def test_xp_accumulates_across_tasks_in_the_same_pillar(client, db, enrolled, auth_headers_for):
    student = enrolled['student']
    headers = auth_headers_for(student['id'])
    first = enrolled['task'](pillar='stem', xp_value=100)
    second = enrolled['task'](pillar='stem', xp_value=50)

    _complete(client, headers, first['id'])
    _complete(client, headers, second['id'])

    assert _xp_for(db, student['id'], 'stem') == 150


@pytest.mark.integration
def test_tasks_in_different_pillars_are_tracked_separately(client, db, enrolled, auth_headers_for):
    student = enrolled['student']
    headers = auth_headers_for(student['id'])
    stem = enrolled['task'](pillar='stem', xp_value=100)
    wellness = enrolled['task'](pillar='wellness', xp_value=25)

    _complete(client, headers, stem['id'])
    _complete(client, headers, wellness['id'])

    assert _xp_for(db, student['id'], 'stem') == 100
    assert _xp_for(db, student['id'], 'wellness') == 25
