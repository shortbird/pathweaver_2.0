"""Ticket 1237ae13: Bloomy-synced work waited in the teacher Verifications queue.

The sync writes an approved task and its completion for a skill Bloomy itself
assessed as mastered, but left quest_task_completions.subject_verified_at NULL.
routes/teacher_verification.py lists every completion with that column NULL, so
each synced day sat there until a teacher clicked Approve on work nobody at the
school had to judge. The completion is now written verified, naming Bloomy.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from services import bloomy_sync_service as svc
from services.external_learning_verification import platform_verified_fields


def _make_task_completion():
    """Run _make_task and return the dict handed to create_completion."""
    repo = MagicMock()
    repo.client = MagicMock()
    repo.insert_task.return_value = {'id': 'task-1'}
    completions = MagicMock()
    subject = next(iter(svc.SUBJECTS))
    with patch.object(svc, '_ensure_quest', return_value='quest-1'), \
         patch.object(svc, '_ensure_enrollment', return_value='uq-1'), \
         patch.object(svc, '_attach_card'), \
         patch('repositories.task_repository.TaskCompletionRepository',
               return_value=completions), \
         patch('services.xp_service.XPService',
               return_value=SimpleNamespace(award_xp=lambda *a, **k: True)):
        svc._make_task(repo, 'org-1', 'user-1', subject, '2026-10-01',
                       [{'code': 'M1', 'title': 'Fractions'}], {})
    completions.create_completion.assert_called_once()
    return completions.create_completion.call_args[0][0]


@pytest.mark.unit
class TestBloomyCompletionIsVerified:
    def test_the_completion_carries_the_verification_columns(self):
        row = _make_task_completion()
        assert row['subject_verified_at']
        assert row['verified_by_advisor_id'] is None
        assert row['verification_notes'] == 'Verified by Bloomy'

    def test_the_rest_of_the_completion_is_unchanged(self):
        row = _make_task_completion()
        assert row['user_quest_task_id'] == 'task-1'
        assert row['completed_by_user_id'] is None
        assert row['diploma_status'] == 'none'


@pytest.mark.unit
class TestTheHelper:
    def test_names_the_source(self):
        fields = platform_verified_fields('Khan Academy', at='2026-10-14T00:00:00+00:00')
        assert fields == {
            'subject_verified_at': '2026-10-14T00:00:00+00:00',
            'verified_by_advisor_id': None,
            'verification_notes': 'Verified by Khan Academy',
        }

    def test_a_source_is_required(self):
        with pytest.raises(ValueError):
            platform_verified_fields('  ')


@pytest.mark.unit
def test_a_manual_completion_is_not_verified_by_the_repository():
    """The stamp is opt-in for platform syncs. A student's own completion
    still goes through create_completion untouched, so it still reaches the
    teacher's Verifications queue."""
    from repositories.task_repository import TaskCompletionRepository

    client = MagicMock()
    client.table.return_value.insert.return_value.execute.return_value = \
        SimpleNamespace(data=[{'id': 'c1'}])
    TaskCompletionRepository(client=client).create_completion({
        'user_id': 'user-1', 'quest_id': 'quest-1', 'user_quest_task_id': 'task-1',
        'evidence_text': 'I built a bridge',
    })
    inserted = client.table.return_value.insert.call_args[0][0]
    for col in ('subject_verified_at', 'verified_by_advisor_id', 'verification_notes'):
        assert col not in inserted
