"""
A teacher's copy replaces the original on their class. Ticket 987218e0.

A teacher cannot edit a quest the office or the Optio library wrote
(services/quest_edit_rules, on purpose: other classes share it). "Make my own
copy" gave them an editable quest, but it went on the class BESIDE the
original, so students got both. "Replace the original on this class":

  - removes the original's class_quests row from THIS class only;
  - puts the copy there for at least the original's students;
  - takes the original back only from students who have not started it (no
    completed task, no evidence, no task of their own). Students who already
    started the original keep it -- and their work;
  - a student who also gets the original through another class keeps it.

Two doors: the editor's "Publish to class" with replace_original, and
POST .../quests/<copy>/replace-original for a copy published earlier. Both
behind the class moderator gate.
"""

import uuid as _uuid
from unittest.mock import patch

import pytest

import app as _real_app  # noqa: F401 — import graph ordering
from routes.sis import class_quest_students as cqs
from routes.sis import class_quests as cq
from services import class_quest_replace
from tests.test_class_quest_copy import (
    CLASS, ORG, OFFICE, OTHER_TEACHER, QUEST as ORIGINAL, S1, S2, TEACHER,
    _call as _duplicate, _client, _publish, _writes,
)

S3 = str(_uuid.uuid4())
OTHER_CLASS = str(_uuid.uuid4())


def _db():
    return {
        'org_classes': [
            {'id': CLASS, 'organization_id': ORG, 'name': 'Reading Workshop',
             'primary_instructor_id': TEACHER, 'assistant_instructor_ids': [], 'status': 'active'},
            {'id': OTHER_CLASS, 'organization_id': ORG, 'name': 'Reading, Tuesday',
             'primary_instructor_id': OFFICE, 'assistant_instructor_ids': [], 'status': 'active'},
        ],
        'class_advisors': [],
        'class_enrollments': [
            {'class_id': CLASS, 'student_id': S1, 'status': 'active'},
            {'class_id': CLASS, 'student_id': S2, 'status': 'active'},
            {'class_id': CLASS, 'student_id': S3, 'status': 'active'},
            # S3 also gets the original through the other class.
            {'class_id': OTHER_CLASS, 'student_id': S3, 'status': 'active'},
        ],
        'quests': [
            # The office's quest: the teacher cannot edit it.
            {'id': ORIGINAL, 'title': 'Vocab Week 1', 'organization_id': ORG,
             'created_by': OFFICE, 'is_active': True, 'is_public': False},
        ],
        'quest_template_tasks': [
            {'id': 'tt-1', 'quest_id': ORIGINAL, 'title': 'Define the words',
             'pillar': 'communication', 'xp_value': 50, 'order_index': 0},
        ],
        'class_quests': [
            {'id': 'cq-1', 'class_id': CLASS, 'quest_id': ORIGINAL, 'sequence_order': 0,
             'publish_at': None, 'due_date': None, 'student_ids': None},
            {'id': 'cq-9', 'class_id': OTHER_CLASS, 'quest_id': ORIGINAL, 'sequence_order': 0,
             'publish_at': None, 'due_date': None, 'student_ids': None},
        ],
        'sis_curriculum_classes': [],
        # Everyone on this class holds the original. S1 has completed a task.
        'user_quests': [
            {'id': 'uq-1', 'user_id': S1, 'quest_id': ORIGINAL, 'is_active': True, 'completed_at': None},
            {'id': 'uq-2', 'user_id': S2, 'quest_id': ORIGINAL, 'is_active': True, 'completed_at': None},
            {'id': 'uq-3', 'user_id': S3, 'quest_id': ORIGINAL, 'is_active': True, 'completed_at': None},
        ],
        'user_quest_tasks': [
            {'id': 'ut-1', 'user_quest_id': 'uq-1', 'is_manual': False},
            {'id': 'ut-2', 'user_quest_id': 'uq-2', 'is_manual': False},
            {'id': 'ut-3', 'user_quest_id': 'uq-3', 'is_manual': False},
        ],
        'quest_task_completions': [{'id': 'c-1', 'task_id': 'ut-1'}],
        'user_task_evidence_documents': [],
    }


def _view(fn, caller, *args, db, body=None, is_admin=False):
    view = fn
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    from flask import Flask
    log = []
    admin = _client(db, log)
    with Flask(__name__).test_request_context('/x', method='POST', json=body or {}), \
         patch.object(cq, 'get_supabase_admin_client', return_value=admin), \
         patch.object(cq, '_bad_uuid', return_value=False), \
         patch.object(cqs, '_bad_uuid', return_value=False), \
         patch.object(cq.sis_service, 'caller_is_admin', return_value=is_admin), \
         patch.object(cq.sis_service, 'resolve_org_id', return_value=ORG), \
         patch('services.quest_edit_rules.sis_service.caller_is_admin', return_value=is_admin), \
         patch('services.quest_edit_rules.sis_service.resolve_org_id', return_value=ORG), \
         patch('routes.quest_types.get_template_tasks', return_value=[]), \
         patch('utils.template_tasks.get_valid_source_template_ids', return_value=set()), \
         patch('utils.class_membership.guardians_by_student', return_value={}), \
         patch.object(cq.student_class_quests, 'made_by', return_value={}):
        resp = view(caller, *args)
    out, status = (resp if isinstance(resp, tuple) else (resp, 200))
    return out.get_json(), status, log


def _copy(db):
    out, status, _, _ = _duplicate(TEACHER, db=db)
    assert status == 201, out
    return out['quest_id']


def _holders(db, quest_id):
    return sorted(r['user_id'] for r in db['user_quests'] if r['quest_id'] == quest_id)


def _links(db, quest_id):
    return sorted(r['class_id'] for r in db['class_quests'] if r['quest_id'] == quest_id)


@pytest.mark.unit
class TestReplaceAtPublish:

    def test_the_copy_takes_the_originals_place_on_this_class_only(self):
        """987218e0: students got both. Now the copy replaces the original."""
        db = _db()
        copy_id = _copy(db)
        body, status = _publish(TEACHER, copy_id, db, {'replace_original': True})
        assert status == 200, body
        # Off this class, still on the other class exactly as it was.
        assert _links(db, ORIGINAL) == [OTHER_CLASS]
        other = next(r for r in db['class_quests'] if r['class_id'] == OTHER_CLASS)
        assert other['student_ids'] is None and other['id'] == 'cq-9'
        # The copy is on the class for the same audience: everyone.
        link = next(r for r in db['class_quests'] if r['quest_id'] == copy_id)
        assert link['class_id'] == CLASS and link.get('student_ids') is None
        assert _holders(db, copy_id) == sorted([S1, S2, S3])
        assert body['replaced']['original_quest_id'] == ORIGINAL

    def test_students_who_started_keep_the_original_and_the_rest_lose_it(self):
        """"Students who already started the original keep it." S1 completed a
        task; S2 never touched it; S3 holds it through another class."""
        db = _db()
        copy_id = _copy(db)
        body, _ = _publish(TEACHER, copy_id, db, {'replace_original': True})
        assert _holders(db, ORIGINAL) == sorted([S1, S3])
        kept = next(r for r in db['user_quests'] if r['id'] == 'uq-1')
        assert kept['is_active'] is True  # still working on it, not set down
        assert [c['task_id'] for c in db['quest_task_completions']] == ['ut-1']
        assert body['replaced'] == {'original_quest_id': ORIGINAL, 'removed': 1,
                                    'kept_started': 1, 'kept_elsewhere': 1}
        assert 'already started it and keeps it' in body['summary']

    def test_a_per_student_original_widens_the_copy_never_narrows_it(self):
        db = _db()
        db['class_quests'][0]['student_ids'] = [S1, S2]
        copy_id = _copy(db)  # the draft starts with [S1, S2]
        body, status = _publish(TEACHER, copy_id, db,
                                {'student_ids': [S2], 'replace_original': True})
        assert status == 200, body
        link = next(r for r in db['class_quests'] if r['quest_id'] == copy_id)
        assert sorted(link['student_ids']) == sorted([S1, S2])

    def test_without_the_flag_both_stay_on_the_class(self):
        """Publishing a copy without asking leaves the original where it was,
        and the copy remembers its original so the swap can be offered later."""
        db = _db()
        copy_id = _copy(db)
        _publish(TEACHER, copy_id, db, {})
        assert CLASS in _links(db, ORIGINAL)
        copy_row = next(q for q in db['quests'] if q['id'] == copy_id)
        assert copy_row['metadata']['copied_from'] == ORIGINAL
        assert 'draft' not in copy_row['metadata']

    def test_refused_when_the_original_is_gone_and_the_draft_stays_a_draft(self):
        db = _db()
        copy_id = _copy(db)
        db['class_quests'] = [r for r in db['class_quests'] if r['id'] != 'cq-1']
        body, status = _publish(TEACHER, copy_id, db, {'replace_original': True})
        assert status == 404, body
        copy_row = next(q for q in db['quests'] if q['id'] == copy_id)
        assert copy_row['is_active'] is False
        assert _holders(db, ORIGINAL) == sorted([S1, S2, S3])


@pytest.mark.unit
class TestReplaceLater:

    def _published_copy(self):
        db = _db()
        copy_id = _copy(db)
        _publish(TEACHER, copy_id, db, {})
        return db, copy_id

    def test_the_class_list_offers_the_swap(self):
        db, copy_id = self._published_copy()
        # PostgREST embeds the quest row; the fake store does not, so the
        # rows carry it the way the real read returns them.
        quests = {q['id']: q for q in db['quests']}
        for r in db['class_quests']:
            r['quests'] = quests[r['quest_id']]
        out, status, _ = _view(cq.list_class_quests, TEACHER, CLASS, db=db)
        assert status == 200, out
        by_id = {q['quest_id']: q for q in out['quests']}
        assert by_id[copy_id]['replaces_quest_id'] == ORIGINAL
        assert by_id[ORIGINAL]['replaces_quest_id'] is None

    def test_the_teacher_replaces_a_copy_published_earlier(self):
        db, copy_id = self._published_copy()
        out, status, _ = _view(cqs.replace_original_with_copy, TEACHER, CLASS, copy_id, db=db)
        assert status == 200, out
        assert _links(db, ORIGINAL) == [OTHER_CLASS]
        assert _holders(db, ORIGINAL) == sorted([S1, S3])
        assert out['removed'] == 1 and out['kept_started'] == 1

    def test_another_teacher_is_refused_and_nothing_is_written(self):
        db, copy_id = self._published_copy()
        before = [dict(r) for r in db['class_quests']]
        out, status, log = _view(cqs.replace_original_with_copy, OTHER_TEACHER, CLASS, copy_id, db=db)
        assert status == 403, out
        assert _writes(log) == []
        assert db['class_quests'] == before

    def test_a_quest_that_is_not_a_copy_is_refused(self):
        db = _db()
        out, status, log = _view(cqs.replace_original_with_copy, TEACHER, CLASS, ORIGINAL, db=db)
        assert status == 409, out
        assert _writes(log) == []

    def test_one_route_one_owner(self):
        m = _real_app.app.url_map.bind('localhost')
        endpoint, _ = m.match(f'/api/sis/classes/{CLASS}/quests/{ORIGINAL}/replace-original',
                              method='POST')
        assert endpoint == 'sis_class_quest_students.replace_original_with_copy'


@pytest.mark.unit
def test_copied_from_reads_the_draft_marker_and_the_published_record():
    assert class_quest_replace.copied_from({'metadata': {'draft': {'copied_from': 'a'}}}) == 'a'
    assert class_quest_replace.copied_from({'metadata': {'copied_from': 'b'}}) == 'b'
    assert class_quest_replace.copied_from({'metadata': {}}) is None
    assert class_quest_replace.copied_from(None) is None
