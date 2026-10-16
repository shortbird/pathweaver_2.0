"""
A teacher adds a student's work to a task, and may mark it done.

Ticket 77637c3a (Apogee Cache Valley, 2026-10-15): "Is there a way for my
teachers to track student progress on quests and upload photos of their work
from their accounts instead of the students? ... our chromebooks do not have
the ability to take pictures and one kiosk for 30 kids is going to be
challenging."

Tanner's decisions, which these pin:
  - any staff member of the student's school (the Students page's gate);
  - the photo is task evidence, written as a helper block with a journal entry;
  - "Mark this task done" completes it for the student with XP, and the
    completion is born reviewed: verified (the Verifications queue) and
    accepted (the Submissions inbox), so it waits in neither.
"""

import inspect
from typing import Any, Dict, List
from unittest.mock import Mock, patch

import pytest

from services import staff_task_capture as stc
from services.staff_task_capture import CaptureError
from tests.test_student_quest_assignments import ORG, OTHER_ORG, STUDENT, TEACHER, _client

TASK = '22222222-2222-4222-8222-222222222221'
QUEST = '33333333-3333-4333-8333-333333333331'


def _db(**over):
    base = {
        'user_quest_tasks': [{'id': TASK, 'user_id': STUDENT, 'quest_id': QUEST, 'title': 'Build a bridge',
                              'pillar': 'stem', 'xp_value': 50, 'approval_status': 'approved'}],
        'user_quests': [{'id': 'uq-1', 'user_id': STUDENT, 'quest_id': QUEST,
                         'is_active': True, 'completed_at': None}],
        'quest_task_completions': [], 'sis_submission_reviews': [], 'xp_award_failures': [],
        'learning_events': [], 'learning_event_topics': [], 'learning_event_evidence_blocks': [],
    }
    base.update(over)
    return base


class _File:
    def __init__(self, name='work.jpg'):
        self.filename = name


class _Repo:
    """EvidenceDocumentRepository: records the helper blocks it is asked to write."""
    blocks: List[Dict[str, Any]] = []

    def __init__(self):
        self._client = None

    def get_or_create_document(self, _student, _task, _quest):
        return 'doc-1'

    def get_next_block_order_index(self, _doc):
        return 3

    def create_helper_block(self, **kw):
        _Repo.blocks.append(kw)
        return {'id': f'block-{len(_Repo.blocks)}'}


def _upload_ok(*_a, **kw):
    return Mock(success=True, file_url=f"/object/public/quest-evidence/{kw['user_id']}/x.jpg",
                filename='work.jpg', media_type='image', content_type='image/jpeg')


def _run(db, *, files=None, note='', mark_done=False, xp_ok=True):
    _Repo.blocks = []
    xp = Mock()
    xp.return_value.award_xp.return_value = xp_ok
    with patch('services.media_upload_service.MediaUploadService') as media, \
         patch('repositories.EvidenceDocumentRepository', _Repo), \
         patch('services.xp_service.XPService', xp), \
         patch('services.class_quest_completion.end_if_class_quest_complete', return_value=False), \
         patch('repositories.sis_submission_repository.SisSubmissionRepository.save_reviews',
               lambda self, rows: db['sis_submission_reviews'].extend(rows) or rows):
        media.return_value.upload_evidence_file.side_effect = _upload_ok
        out = stc.capture(_client(db), staff_id=TEACHER, org_id=ORG, student_id=STUDENT,
                          task_id=TASK, files=files, note=note, mark_done=mark_done)
    return out, media, xp


class TestEvidence:
    def test_a_photo_is_task_evidence_on_the_students_document(self):
        db = _db()
        out, media, _ = _run(db, files=[_File()])
        # Stored under the STUDENT's evidence path, not the teacher's.
        assert media.return_value.upload_evidence_file.call_args.kwargs['user_id'] == STUDENT
        assert [b['block_type'] for b in _Repo.blocks] == ['image']
        block = _Repo.blocks[0]
        assert block['uploaded_by_user_id'] == TEACHER and block['uploaded_by_role'] == 'advisor'
        assert block['document_id'] == 'doc-1' and block['order_index'] == 3
        assert out['blocks_added'] == 1 and out['completed'] is False
        # Not marked done: no completion, no XP.
        assert db['quest_task_completions'] == []

    def test_a_note_is_a_text_block_after_the_photos(self):
        _run(_db(), files=[_File(), _File('b.jpg')], note='  Measured twice  ')
        assert [b['block_type'] for b in _Repo.blocks] == ['image', 'image', 'text']
        assert _Repo.blocks[2]['content'] == {'text': 'Measured twice'}

    def test_one_journal_entry_for_the_capture(self):
        db = _db()
        _run(db, files=[_File(), _File('b.jpg')])
        assert len(db['learning_events']) == 1
        ev = db['learning_events'][0]
        assert ev['user_id'] == STUDENT and ev['captured_by_user_id'] == TEACHER
        assert ev['source_type'] == 'advisor_captured' and ev['attached_task_id'] == TASK

    def test_nothing_to_add_is_refused(self):
        with pytest.raises(CaptureError, match='Add a photo or a note'):
            _run(_db())

    def test_too_many_photos_is_refused_before_any_upload(self):
        with pytest.raises(CaptureError):
            _run(_db(), files=[_File(f'{i}.jpg') for i in range(stc.MAX_FILES + 1)])

    def test_another_students_task_is_not_found(self):
        db = _db(user_quest_tasks=[{'id': TASK, 'user_id': 'someone-else', 'quest_id': QUEST}])
        with pytest.raises(CaptureError) as e:
            _run(db, note='hi')
        assert e.value.status == 404

    def test_a_quest_they_are_not_working_on_is_refused(self):
        db = _db(user_quests=[{'id': 'uq-1', 'user_id': STUDENT, 'quest_id': QUEST,
                               'is_active': True, 'completed_at': '2026-10-01T00:00:00Z'}])
        with pytest.raises(CaptureError) as e:
            _run(db, note='hi')
        assert e.value.status == 409

    def test_a_failed_upload_writes_nothing(self):
        _Repo.blocks = []
        db = _db()
        with patch('services.media_upload_service.MediaUploadService') as media, \
                 patch('repositories.EvidenceDocumentRepository', _Repo):
            media.return_value.upload_evidence_file.return_value = Mock(
                success=False, error_message='That file type is not allowed')
            with pytest.raises(CaptureError, match='not allowed'):
                stc.capture(_client(db), staff_id=TEACHER, org_id=ORG, student_id=STUDENT,
                            task_id=TASK, files=[_File('x.exe')])
        assert _Repo.blocks == [] and db['learning_events'] == []


class TestMarkDone:
    def test_completes_for_the_student_and_awards_xp(self):
        db = _db()
        out, _, xp = _run(db, files=[_File()], mark_done=True)
        [c] = db['quest_task_completions']
        assert c['user_id'] == STUDENT and c['user_quest_task_id'] == TASK
        # The teacher pressed the button; NULL would say the student did.
        assert c['completed_by_user_id'] == TEACHER
        assert c['evidence_url'].endswith('/x.jpg')
        xp.return_value.award_xp.assert_called_once_with(STUDENT, 'stem', 50, f'task_completion:{TASK}')
        assert out['completed'] is True and out['xp_awarded'] == 50

    def test_it_is_born_reviewed_in_both_queues(self):
        """Verified (teacher_verification reads subject_verified_at) and accepted
        (the SIS inbox reads sis_submission_reviews), so it waits in neither."""
        db = _db()
        _run(db, note='Presented to the class', mark_done=True)
        [c] = db['quest_task_completions']
        assert c['subject_verified_at'] and c['verified_by_advisor_id'] == TEACHER
        assert c['verification_notes'] == stc.VERIFIED_NOTE
        assert c['evidence_text'] == 'Presented to the class'
        [r] = db['sis_submission_reviews']
        assert r['completion_id'] == c['id'] and r['action'] == 'accepted'
        assert r['reviewed_by'] == TEACHER and r['organization_id'] == ORG

    def test_an_already_done_task_is_not_completed_twice(self):
        db = _db(quest_task_completions=[{'id': 'c-0', 'user_id': STUDENT, 'user_quest_task_id': TASK}])
        out, _, xp = _run(db, files=[_File()], mark_done=True)
        assert len(db['quest_task_completions']) == 1
        xp.return_value.award_xp.assert_not_called()
        # The photo still lands: a teacher adding to finished work is fine.
        assert out['already_done'] is True and out['blocks_added'] == 1

    def test_a_failed_xp_award_is_recorded_for_reconciliation(self):
        db = _db()
        out, _, _ = _run(db, files=[_File()], mark_done=True, xp_ok=False)
        assert out['xp_award_pending'] is True and out['xp_awarded'] == 0
        assert db['xp_award_failures'][0]['task_id'] == TASK

    def test_a_task_waiting_for_approval_cannot_be_marked_done(self):
        db = _db()
        db['user_quest_tasks'][0]['approval_status'] = 'pending'
        with pytest.raises(CaptureError) as e:
            _run(db, files=[_File()], mark_done=True)
        assert e.value.status == 409 and _Repo.blocks == []


class TestTheRoute:
    """Any staff member of the student's school, the Students page's own gate."""

    def test_it_carries_the_student_work_gate(self):
        import routes.sis.student_work as sw
        src = inspect.getsource(sw.capture_work)
        assert '@require_role(*STAFF_ROLES)' in src
        assert "@require_relationship_to('student_id', allow=('org_staff',))" in src
        assert 'per_user=True' in src

    def _post(self, users, data):
        import routes.sis.student_work as sw
        from flask import Flask
        view = inspect.unwrap(sw.capture_work)
        app = Flask(__name__)
        with patch.object(sw, '_admin', return_value=_client({'users': users})), \
             patch('services.sis_service.org_or_error', return_value=(ORG, None)), \
             patch('services.staff_task_capture.capture', return_value={'blocks_added': 1}) as cap, \
             app.test_request_context(method='POST', data=data):
            resp = view(TEACHER, STUDENT, TASK)
        return resp, cap

    def test_a_student_of_another_school_is_not_found(self):
        resp, cap = self._post([{'id': STUDENT, 'organization_id': OTHER_ORG, 'role': 'student'}],
                               {'note': 'hi'})
        assert resp[1] == 404
        cap.assert_not_called()

    def test_the_form_reaches_the_service(self):
        resp, cap = self._post([{'id': STUDENT, 'organization_id': ORG, 'role': 'student'}],
                               {'note': 'hi', 'mark_done': 'true'})
        assert resp[1] == 201
        kw = cap.call_args.kwargs
        assert kw['staff_id'] == TEACHER and kw['org_id'] == ORG and kw['student_id'] == STUDENT
        assert kw['note'] == 'hi' and kw['mark_done'] is True

    def test_mark_done_is_off_unless_asked(self):
        _resp, cap = self._post([{'id': STUDENT, 'organization_id': ORG, 'role': 'student'}],
                                {'note': 'hi'})
        assert cap.call_args.kwargs['mark_done'] is False
