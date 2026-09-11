"""A story from a whole quest: what is pooled, what is left out.

Only finalized completions count, subjects and XP are summed across them, the
primary subject is the one with the most XP, and the student's reflections
arrive already scrubbed.
"""

from __future__ import annotations

import pytest

from services.stories import source_quest
from services.stories.source_completion import SourceNotFound

pytestmark = pytest.mark.unit

STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
USER_QUEST_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
QUEST_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'


def _task(n, xp, subjects, required=True):
    return {'id': f't{n}', 'user_id': STUDENT_ID, 'quest_id': QUEST_ID,
            'user_quest_id': USER_QUEST_ID, 'title': f'Task {n} by Maya',
            'description': f'Do thing {n}.', 'pillar': 'stem', 'xp_value': xp,
            'order_index': n, 'is_required': required, 'diploma_subjects': subjects,
            'subject_xp_distribution': None, 'success_criteria': [f'Did {n}'],
            'source_moment_id': None}


def _completion(n, status='finalized', confidential=False, merged=None):
    return {'id': f'c{n}', 'user_id': STUDENT_ID, 'quest_id': QUEST_ID, 'task_id': None,
            'user_quest_task_id': f't{n}', 'completed_at': '2026-09-01',
            'is_confidential': confidential, 'diploma_status': status, 'revision_number': 1,
            'finalized_at': f'2026-09-0{n}T00:00:00+00:00' if status == 'finalized' else None,
            'merged_into': merged, 'in_portfolio': True, 'credit_requested_at': None}


class FakeRepo:
    def __init__(self, *, completed_at=None, tasks=None, completions=None, org=False):
        self.user_quests = {USER_QUEST_ID: {
            'id': USER_QUEST_ID, 'user_id': STUDENT_ID, 'quest_id': QUEST_ID,
            'started_at': '2026-08-01', 'completed_at': completed_at, 'is_active': True,
            'status': 'active',
            'reflection_notes': {'intro': 'Maya and Coach Reyes planned it.',
                                 'end': ['We showed it at Hearthwood Academy.', {'text': 'Done.'}]},
            'archived_at': None}}
        self.tasks = tasks if tasks is not None else [
            _task(1, 100, {'Science': 100}),
            _task(2, 150, {'Fine Arts': 150}),
            _task(3, 50, {'Science': 50}, required=False),
        ]
        self.completions = completions if completions is not None else [
            _completion(1), _completion(2), _completion(3, status='pending_review'),
        ]
        self.org = org
        self.student_row = {'id': STUDENT_ID, 'first_name': 'Maya', 'last_name': 'Reyes',
                            'display_name': None, 'preferred_name': 'May', 'role': 'student',
                            'org_role': None, 'organization_id': 'org-1' if org else None,
                            'date_of_birth': None, 'is_dependent': True,
                            'managed_by_parent_id': None}

    def user_quest(self, uid): return self.user_quests.get(uid)
    def tasks_for_user_quest(self, uid): return [t for t in self.tasks if t['user_quest_id'] == uid]
    def finalized_completions_for_tasks(self, ids):
        return [c for c in self.completions if c['user_quest_task_id'] in ids
                and c['diploma_status'] == 'finalized' and not c.get('merged_into')]
    def completion(self, cid): return next((c for c in self.completions if c['id'] == cid), None)
    def rounds_for_completion(self, cid):
        return [{'id': f'r-{cid}', 'completion_id': cid, 'round_number': 1,
                 'evidence_snapshot': [{'id': 'b', 'block_type': 'text',
                                        'content': {'text': 'Maya wrote this.'}}],
                 'submitted_at': '2026-08-30T00:00:00+00:00', 'reviewer_action': 'approved',
                 'reviewer_feedback': 'Nice work Maya', 'approved_subjects': None,
                 'reviewed_at': '2026-09-01'}]
    def task(self, tid): return next((t for t in self.tasks if t['id'] == tid), None)
    def quest(self, qid): return {'id': qid, 'title': 'Robot Garden', 'description': 'Grow things',
                                  'big_idea': 'Systems'}
    def student(self, uid): return self.student_row if uid == STUDENT_ID else None
    def parent_rows(self, student): return [{'id': 'p', 'first_name': 'Carlos', 'last_name': 'Reyes',
                                             'display_name': None, 'preferred_name': None}]
    def org_name(self, org_id): return 'Hearthwood Academy' if org_id else None
    def active_academy_enrollment(self, uid): return None


@pytest.fixture(autouse=True)
def _no_ai_review(monkeypatch):
    monkeypatch.setattr(
        'repositories.credit_ai_review_repository.CreditAIReviewRepository.latest_complete_for_completion',
        lambda self, cid: None)


def test_only_finalized_completions_become_tasks():
    source = source_quest.load(USER_QUEST_ID, repo=FakeRepo(completed_at='2026-09-03'), admin=None)
    assert [t.completion_id for t in source.tasks] == ['c1', 'c2']
    assert [t.index for t in source.tasks] == [1, 2]
    assert source.source_type == 'quest'
    assert source.finalized_at == '2026-09-02T00:00:00+00:00'


def test_subjects_and_xp_are_pooled_and_the_primary_is_the_largest():
    source = source_quest.load(USER_QUEST_ID, repo=FakeRepo(completed_at='2026-09-03'), admin=None)
    assert source.subject_split == {'science': 100, 'fine_arts': 150}
    assert source.xp_total == 250
    assert source.primary_subject == 'fine_arts'
    assert source.tasks[0].primary_subject == 'science'


def test_reflections_are_scrubbed_in_every_shape():
    source = source_quest.load(USER_QUEST_ID, repo=FakeRepo(completed_at='2026-09-03'), admin=None)
    assert source.reflections == ['[name] and Coach [name] planned it.',
                                  'We showed it at Hearthwood Academy.', 'Done.']
    assert all('Maya' not in r and 'Reyes' not in r for r in source.reflections)


def test_org_name_is_scrubbed_for_an_org_student():
    """Phase 1 refuses org students upstream; the loader still scrubs the org."""
    source = source_quest.load(USER_QUEST_ID, repo=FakeRepo(completed_at='2026-09-03', org=True),
                               admin=None)
    assert source.is_org_student
    assert source.reflections[1] == 'We showed it at [school].'
    assert source.student.org_names == ['Hearthwood Academy']


def test_every_text_field_is_scrubbed_including_feedback_and_titles():
    source = source_quest.load(USER_QUEST_ID, repo=FakeRepo(completed_at='2026-09-03'), admin=None)
    task = source.tasks[0]
    assert task.title == 'Task 1 by [name]'
    assert task.evidence_texts == ['[name] wrote this.']
    assert task.rounds[0].feedback == 'Nice work [name]'
    # The preferred name and the parent's name are identity too.
    assert set(source.student.identity_names) == {'Maya', 'Reyes', 'May', 'Carlos'}
    assert source.student.first_name == 'May'


def test_complete_when_every_required_task_is_finalized_even_without_completed_at():
    source = source_quest.load(USER_QUEST_ID, repo=FakeRepo(completed_at=None), admin=None)
    assert len(source.tasks) == 2


def test_not_complete_when_a_required_task_is_still_pending():
    repo = FakeRepo(completed_at=None, completions=[_completion(1), _completion(2, status='pending_review')])
    with pytest.raises(source_quest.QuestNotComplete):
        source_quest.load(USER_QUEST_ID, repo=repo, admin=None)
    assert source_quest.status(USER_QUEST_ID, repo=repo) == {
        'user_quest_id': USER_QUEST_ID, 'complete': False,
        'finalized_task_count': 1, 'task_count': 3}


def test_completed_at_alone_is_enough_but_needs_one_finalized_task():
    repo = FakeRepo(completed_at='2026-09-03', completions=[_completion(1, status='pending_review')])
    with pytest.raises(source_quest.QuestNotComplete):
        source_quest.load(USER_QUEST_ID, repo=repo, admin=None)


def test_merged_completions_are_left_out():
    repo = FakeRepo(completed_at='2026-09-03',
                    completions=[_completion(1, merged='c9'), _completion(2)])
    source = source_quest.load(USER_QUEST_ID, repo=repo, admin=None)
    assert [t.completion_id for t in source.tasks] == ['c2']


def test_missing_enrolment_raises_source_not_found():
    with pytest.raises(SourceNotFound):
        source_quest.load('nope', repo=FakeRepo(), admin=None)
    assert source_quest.status('nope', repo=FakeRepo()) is None


def test_status_counts_without_loading_evidence():
    repo = FakeRepo(completed_at='2026-09-03')
    assert source_quest.status(USER_QUEST_ID, repo=repo) == {
        'user_quest_id': USER_QUEST_ID, 'complete': True,
        'finalized_task_count': 2, 'task_count': 3}
