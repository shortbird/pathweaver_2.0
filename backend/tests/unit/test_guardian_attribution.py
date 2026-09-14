"""A guardian's writes on a child's account name the guardian.

Migration 20260915120000 added three nullable columns -- NULL means the
student themselves:

  * quest_task_completions.completed_by_user_id
  * user_quest_tasks.created_by_user_id
  * user_quests.enrolled_by_user_id

Evidence blocks (uploaded_by_user_id / uploaded_by_role) and journal moments
(captured_by_user_id) already recorded the adult. These tests pin the three
new stamps at the repository and helper level, and the block stamping in
evidence_documents, so a parent's work never again reads as the student's.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from utils.guardian_scope import StudentScope


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
KID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
QUEST = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
DELEGATED = StudentScope(caller_id=PARENT, student_id=KID, via='parent')
SELF = StudentScope(caller_id=KID, student_id=KID, via='self')


class _Recorder:
    """A PostgREST chain that answers a fixed shape and records writes."""

    def __init__(self, answers, log):
        self._answers, self._log, self._table = answers, log, None

    def table(self, name):
        self._table = name
        return self

    def __getattr__(self, name):
        def chain(*args, **kwargs):
            if name in ('insert', 'update', 'delete'):
                self._log.append((name, self._table, args[0] if args else None))
            return self
        return chain

    def execute(self):
        result = MagicMock()
        result.data = self._answers.get(self._table, [])
        return result


# ── enrollment ───────────────────────────────────────────────────────────────

def test_enroll_user_stamps_the_guardian_on_a_new_enrollment():
    from repositories.quest_repository import QuestRepository
    log = []
    client = _Recorder({'user_quests': [{'id': 'uq-1'}]}, log)
    # first read (existing?) must answer empty, the insert answers a row
    client._answers = {'user_quests': []}
    reads = {'n': 0}

    def execute():
        result = MagicMock()
        reads['n'] += 1
        result.data = [] if reads['n'] == 1 else [{'id': 'uq-1'}]
        return result
    client.execute = execute

    with patch('database.get_supabase_admin_client', return_value=client):
        QuestRepository.enroll_user(MagicMock(), KID, QUEST, enrolled_by_user_id=PARENT)
    inserts = [payload for op, table, payload in log if op == 'insert' and table == 'user_quests']
    assert inserts and inserts[0]['enrolled_by_user_id'] == PARENT
    assert inserts[0]['user_id'] == KID


def test_enroll_user_stamps_the_guardian_on_a_reactivation():
    from repositories.quest_repository import QuestRepository
    log = []
    client = _Recorder({'user_quests': [{'id': 'uq-1', 'is_active': False}]}, log)
    with patch('database.get_supabase_admin_client', return_value=client):
        QuestRepository.enroll_user(MagicMock(), KID, QUEST, enrolled_by_user_id=PARENT)
    updates = [payload for op, table, payload in log if op == 'update']
    assert updates and updates[0]['enrolled_by_user_id'] == PARENT


def test_a_student_enrolling_themselves_is_stamped_with_nothing():
    from repositories.quest_repository import QuestRepository
    log = []
    client = _Recorder({}, log)
    reads = {'n': 0}

    def execute():
        result = MagicMock()
        reads['n'] += 1
        result.data = [] if reads['n'] == 1 else [{'id': 'uq-1'}]
        return result
    client.execute = execute
    with patch('database.get_supabase_admin_client', return_value=client):
        QuestRepository.enroll_user(MagicMock(), KID, QUEST)
    inserts = [payload for op, table, payload in log if op == 'insert']
    assert inserts[0]['enrolled_by_user_id'] is None


def test_get_or_create_enrollment_stamps_a_new_row_only():
    from utils import personalization_helpers as helpers
    log = []
    client = _Recorder({}, log)
    reads = {'n': 0}

    def execute():
        result = MagicMock()
        reads['n'] += 1
        result.data = [] if reads['n'] == 1 else [{'id': 'uq-1'}]
        return result
    client.execute = execute
    with patch.object(helpers, 'get_supabase_admin_client', return_value=client):
        assert helpers.get_or_create_enrollment(KID, QUEST, enrolled_by_user_id=PARENT) == 'uq-1'
    inserts = [payload for op, table, payload in log if op == 'insert']
    assert inserts[0]['enrolled_by_user_id'] == PARENT


# ── tasks ────────────────────────────────────────────────────────────────────

def test_persist_accepted_task_stamps_created_by():
    from routes import quest_personalization as qp
    log = []
    client = _Recorder({'user_quest_tasks': [{'id': 't-1'}]}, log)
    subject_service = MagicMock()
    subject_service.classify_task.return_value = {'subjects': ['STEM']}
    with patch.object(qp, 'get_or_create_enrollment', return_value='uq-1') as enroll, \
            patch.object(qp, 'get_next_order_index', return_value=0), \
            patch.object(qp, '_class_subject_override', return_value=(None, None)), \
            patch.object(qp, 'normalize_diploma_subjects', return_value={'STEM': 100}), \
            patch.object(qp, 'clean_subjects', return_value=['STEM'], create=True):
        qp.persist_accepted_task(client, subject_service, KID, QUEST,
                                 {'title': 'Read a chapter', 'pillar': 'stem', 'xp_value': 100,
                                  'diploma_subjects': ['STEM']},
                                 save_to_library=False, created_by_user_id=PARENT)
    enroll.assert_called_once_with(KID, QUEST, enrolled_by_user_id=PARENT)
    inserts = [payload for op, table, payload in log if op == 'insert' and table == 'user_quest_tasks']
    assert inserts and inserts[0]['created_by_user_id'] == PARENT
    assert inserts[0]['user_id'] == KID


# ── evidence blocks ──────────────────────────────────────────────────────────

@pytest.fixture
def app():
    return Flask(__name__)


def _blocks_written(uploader, blocks):
    from routes import evidence_documents as ed
    log = []
    client = _Recorder({'evidence_document_blocks': []}, log)
    with patch.object(ed, '_sync_paired_learning_event'):
        ed.update_document_blocks(client, 'doc-1', blocks, uploader=uploader)
    inserted = [payload for op, table, payload in log if op == 'insert' and table == 'evidence_document_blocks']
    return inserted[0] if inserted else []


def test_a_new_block_saved_by_a_parent_is_stamped_parent():
    rows = _blocks_written(DELEGATED, [{'type': 'text', 'content': {'text': 'hi'}}])
    assert rows[0]['uploaded_by_user_id'] == PARENT
    assert rows[0]['uploaded_by_role'] == 'parent'


def test_a_new_block_saved_by_platform_staff_is_stamped_advisor():
    """The enum is student | advisor | parent; staff is recorded as advisor."""
    rows = _blocks_written(StudentScope(PARENT, KID, 'superadmin'),
                           [{'type': 'text', 'content': {'text': 'hi'}}])
    assert rows[0]['uploaded_by_role'] == 'advisor'


def test_a_new_block_saved_by_the_student_stays_student():
    rows = _blocks_written(SELF, [{'type': 'text', 'content': {'text': 'hi'}}])
    assert rows[0]['uploaded_by_user_id'] is None
    assert rows[0]['uploaded_by_role'] == 'student'


def test_a_parent_resaving_the_students_block_does_not_claim_it():
    """Existing blocks keep their uploader whoever re-saves the document."""
    from routes import evidence_documents as ed
    log = []
    client = _Recorder({'evidence_document_blocks': [
        {'id': 'b-1', 'uploaded_by_user_id': None, 'uploaded_by_role': 'student'},
    ]}, log)
    with patch.object(ed, '_sync_paired_learning_event'):
        ed.update_document_blocks(client, 'doc-1',
                                  [{'id': 'b-1', 'type': 'text', 'content': {'text': 'edited'}}],
                                  uploader=DELEGATED)
    inserted = [payload for op, table, payload in log if op == 'insert' and table == 'evidence_document_blocks'][0]
    assert inserted[0]['uploaded_by_role'] == 'student'
    assert inserted[0]['uploaded_by_user_id'] is None


def test_the_paired_journal_moment_is_captured_by_the_parent(app):
    from routes import evidence_documents as ed
    from flask import g
    with app.test_request_context('/x'):
        g.student_scope = DELEGATED
        assert ed._captured_by(KID) == PARENT
        # pytest-flask keeps one app context alive across the test, so `g`
        # survives the block; clear it by hand for the self case.
        g.pop('student_scope', None)
        assert ed._captured_by(KID) == KID
