"""What reaches Gemini when a story is drafted, and what Python decides afterwards.

Mirrors test_credit_ai_review_prompt.py: the student is not in the prompt (no
name, email or id), no storage URL or bucket name is, and every fact about the
credit is supplied by code rather than left to the model.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import pytest

from services.stories import prompt as prompt_mod
from services.stories.anonymize import Scrubber
from services.stories.drafter import AUTHOR_NAME, DraftResult, assemble, slugify, unique_slug
from services.stories.safety import ImageVerdict
from services.stories.source import ImageCandidate, StorySource, credit_display
from services.stories import source_completion

pytestmark = pytest.mark.unit

STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
PARENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
TASK_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
QUEST_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
USER_QUEST_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
PRIVATE_URL = ('https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/'
               'quest-evidence/task-evidence/dddddddd/bridge.jpg')

FORBIDDEN = ('Anna', 'Lindqvist', 'Erik', 'anna@example.com', STUDENT_ID, PARENT_ID,
             COMPLETION_ID, TASK_ID, '/storage/v1/', 'quest-evidence', 'user-uploads',
             'story-assets', 'bridge.jpg')
UUID_RE = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')


class FakeSourceRepo:
    """The story source repository over in-memory rows."""

    def __init__(self):
        self.completions = {COMPLETION_ID: {
            'id': COMPLETION_ID, 'user_id': STUDENT_ID, 'quest_id': QUEST_ID,
            'task_id': None, 'user_quest_task_id': TASK_ID, 'completed_at': '2026-09-01',
            'is_confidential': False, 'diploma_status': 'finalized', 'revision_number': 2,
            'finalized_at': '2026-09-05T10:00:00+00:00', 'merged_into': None,
            'in_portfolio': True, 'credit_requested_at': '2026-08-30',
        }}
        self.rounds = {COMPLETION_ID: [
            {'id': 'r1', 'completion_id': COMPLETION_ID, 'round_number': 1,
             'evidence_snapshot': [{'id': 'b1', 'block_type': 'text',
                                    'content': {'text': 'Anna built a bridge with Erik.'}}],
             'submitted_at': '2026-08-30T09:00:00+00:00', 'reviewer_action': 'grow_this',
             'reviewer_feedback': 'Anna, add the load numbers. Erik can help.',
             'approved_subjects': None, 'reviewed_at': '2026-08-31'},
            {'id': 'r2', 'completion_id': COMPLETION_ID, 'round_number': 2,
             'evidence_snapshot': [
                 {'id': 'b1', 'block_type': 'text',
                  'content': {'text': 'Anna built a bridge with Erik. Email anna@example.com. '
                                      f'Photo at {PRIVATE_URL}'}},
                 {'id': 'b2', 'block_type': 'text', 'content': {'text': 'It held 12 kg.'}},
             ],
             'submitted_at': '2026-09-02T09:00:00+00:00', 'reviewer_action': 'approved',
             'reviewer_feedback': 'Great numbers, Anna Lindqvist.',
             'approved_subjects': {'science': 150, 'math': 50}, 'reviewed_at': '2026-09-05'},
        ]}
        self.tasks = {TASK_ID: {
            'id': TASK_ID, 'user_id': STUDENT_ID, 'quest_id': QUEST_ID,
            'user_quest_id': USER_QUEST_ID, 'title': "Anna's load test",
            'description': 'Test how much weight the bridge holds.',
            'pillar': 'stem', 'xp_value': 200, 'order_index': 0, 'is_required': True,
            'diploma_subjects': {'Science': 150, 'Math': 50}, 'subject_xp_distribution': None,
            'success_criteria': ['Built the bridge', 'Tested it with weight'],
            'source_moment_id': None,
        }}
        self.quests = {QUEST_ID: {'id': QUEST_ID, 'title': 'Bridge Build',
                                  'description': 'Design and test a bridge.',
                                  'big_idea': 'Structures carry load.', 'header_image_url': None,
                                  'image_url': None, 'organization_id': None,
                                  'transcript_subject': None}}
        self.user_quests = {USER_QUEST_ID: {
            'id': USER_QUEST_ID, 'user_id': STUDENT_ID, 'quest_id': QUEST_ID,
            'started_at': '2026-08-01', 'completed_at': None, 'is_active': True,
            'status': 'active', 'reflection_notes': [{'text': 'I liked working with Erik.'}],
            'archived_at': None}}
        self.students = {
            STUDENT_ID: {'id': STUDENT_ID, 'first_name': 'Anna', 'last_name': 'Lindqvist',
                         'display_name': 'Anna L', 'preferred_name': None, 'role': 'student',
                         'org_role': None, 'organization_id': None,
                         'date_of_birth': '2012-03-04', 'is_dependent': True,
                         'managed_by_parent_id': PARENT_ID},
            PARENT_ID: {'id': PARENT_ID, 'first_name': 'Erik', 'last_name': 'Lindqvist',
                        'display_name': None, 'preferred_name': None},
        }

    def completion(self, cid): return self.completions.get(cid)
    def rounds_for_completion(self, cid): return list(self.rounds.get(cid, []))
    def task(self, tid): return self.tasks.get(tid)
    def quest(self, qid): return self.quests.get(qid)
    def user_quest(self, uid): return self.user_quests.get(uid)
    def tasks_for_user_quest(self, uid): return [t for t in self.tasks.values() if t['user_quest_id'] == uid]
    def finalized_completions_for_tasks(self, ids):
        return [c for c in self.completions.values()
                if c['user_quest_task_id'] in ids and c['diploma_status'] == 'finalized']
    def student(self, uid): return self.students.get(uid)
    def parent_rows(self, student):
        pid = student.get('managed_by_parent_id')
        return [self.students[pid]] if pid in self.students else []
    def org_name(self, org_id): return 'Hearthwood Academy' if org_id else None
    def active_academy_enrollment(self, uid): return {'id': 'e1', 'status': 'active', 'grade_level': '8'}


@pytest.fixture
def source(monkeypatch) -> StorySource:
    # No AI review row: the criteria come from the task.
    monkeypatch.setattr(
        'repositories.credit_ai_review_repository.CreditAIReviewRepository.latest_complete_for_completion',
        lambda self, cid: {'review': {
            'criteria': [{'index': 1, 'criterion': 'Built the bridge', 'verdict': 'met',
                          'note': 'Anna shows it in the photo.'},
                         {'index': 2, 'criterion': 'Tested it with weight', 'verdict': 'met',
                          'note': 'It held 12 kg.'}],
            'feedback': {'celebrate': 'Anna, you tested it properly.', 'grow_this': None},
            'concerns': []}})
    return source_completion.load(COMPLETION_ID, repo=FakeSourceRepo(), admin=None)


def _image(index=1):
    return ImageCandidate(index=index, task_index=1, block_id='b9', item_index=1,
                          source_ref=PRIVATE_URL, mime_type='image/jpeg', data=b'\xff\xd8jpeg',
                          label='bridge.jpg')


class TestTheSourceIsScrubbed:
    def test_names_are_gone_from_every_text_field(self, source):
        task = source.tasks[0]
        assert task.title == "[name] load test"
        assert all('Anna' not in t and 'Erik' not in t for t in task.evidence_texts)
        assert '[email]' in task.evidence_texts[0]
        assert '[link]' in task.evidence_texts[0]
        assert 'quest-evidence' not in task.evidence_texts[0]
        assert all('Anna' not in (r.feedback or '') for r in task.rounds)
        assert source.reflections == ['I liked working with [name].']
        assert task.celebrate == '[name], you tested it properly.'
        assert task.ai_criteria[0]['note'] == '[name] shows it in the photo.'

    def test_the_facts_are_copied(self, source):
        task = source.tasks[0]
        assert task.subject_split == {'science': 150, 'math': 50}
        assert task.xp == 200
        assert source.primary_subject == 'science'
        assert [r.action for r in task.rounds] == ['grow_this', 'approved']
        assert task.rounds[1].what_changed == 'Added 2 pieces of evidence and removed 1.'
        assert source.student.grade_band == 'high'
        assert source.student.setting == 'academy'
        assert source.student.identity_names == ['Anna', 'Lindqvist', 'Anna L', 'Erik']


class TestThePrompt:
    def test_nothing_identifying_reaches_the_model(self, source):
        text = prompt_mod.build_prompt(source, student_label='A high school student',
                                       safe_images=[_image()])
        for token in FORBIDDEN:
            assert token not in text, token
        assert not UUID_RE.search(text)

    def test_the_label_and_the_facts_are_in_it(self, source):
        text = prompt_mod.build_prompt(source, student_label='A high school student',
                                       safe_images=[_image()])
        assert 'Call the student: "A high school student"' in text
        assert 'Science: 150 XP, Mathematics: 50 XP' in text
        assert 'Credit earned: 0.1 credit' in text
        assert '[T1] [name] load test' in text
        assert '[C1] Built the bridge' in text
        assert '[I1]' in text
        assert 'Grade band: high school' in text
        assert 'GUARDRAILS' in text
        assert 'No em dashes' in text
        assert 'Return "tasks" as an empty list' in text

    def test_quest_stories_ask_for_task_summaries(self, source):
        source.source_type = 'quest'
        text = prompt_mod.build_prompt(source, student_label='A student', safe_images=[])
        assert 'Fill "tasks" with one summary per [T<n>]' in text
        assert 'No image passed the safety check' in text

    def test_parts_attach_bytes_behind_labels_never_filenames(self, source):
        text = prompt_mod.build_prompt(source, student_label='A student', safe_images=[_image()])
        parts = prompt_mod.build_parts(text, [_image(), _image(2)])
        assert parts[0] == text
        assert parts[1] == '[I1]:'
        assert parts[2] == {'mime_type': 'image/jpeg', 'data': b'\xff\xd8jpeg'}
        assert parts[3] == '[I2]:'
        assert all('bridge.jpg' not in p for p in parts if isinstance(p, str))

    def test_prompt_version_is_pinned(self):
        assert prompt_mod.PROMPT_VERSION.startswith('story-draft/')


# ── assembly ─────────────────────────────────────────────────────────────────

DRAFT = {
    'title': '**A bridge that held 12 kg**',
    'title_options': ['Alt one', 'Alt two', 'Alt three'],
    'dek': 'A load test that became science credit for Anna.',
    'activity_slug': 'rocketry',
    'activity_label': 'A bridge build',
    'receipt': {'activity': 'Backyard bridge build', 'course': 'Wrong', 'credit': 'wrong',
                'icon': 'trumpet'},
    'what_they_did': 'They built it.\n\nThey tested it.',
    'tasks': [],
    'what_it_counted_for': 'It counted.',
    'faq': [{'q': 'Can a bridge count?', 'a': 'Yes.'}, {'q': '', 'a': 'dropped'}],
    'images': [{'index': 1, 'use': True, 'alt': 'A wooden bridge', 'caption': 'The bridge'},
               {'index': 2, 'use': True, 'alt': 'Anna at the table', 'caption': 'Testing'}],
    'hero_index': 2,
    'search_phrases': ['does a bridge project count for science'],
    'concerns': ['The reflection mentions a sibling.'],
}


def _verdict(index, verdict, faces=0):
    return ImageVerdict(index=index, block_id=f'b{index}', item_index=1, source_ref=PRIVATE_URL,
                        verdict=verdict, reason=None if verdict == 'safe' else 'faces', faces=faces)


def _assemble(source: StorySource, draft: Optional[Dict[str, Any]] = None,
              taken: Optional[List[str]] = None, tier='anonymized'):
    source.tasks[0].images = [_image(1), _image(2)]
    result = DraftResult(data=draft or DRAFT, model='gemini-test', prompt_version='story-draft/test',
                         usage={'input_tokens': 1}, drafted_at='2026-09-11T00:00:00+00:00')
    taken = set(taken or [])
    return assemble(source, result, student_label='A high school student', tier=tier,
                    verdicts=[_verdict(1, 'safe'), _verdict(2, 'excluded', faces=1)],
                    scrubber=Scrubber(['Anna Lindqvist']), slug_exists=lambda s: s in taken,
                    story_id='story-1')


class TestAssemble:
    def test_python_supplies_every_fact(self, source):
        out = _assemble(source)
        story = out['story']
        assert story['title'] == 'A bridge that held 12 kg'          # markdown stripped
        assert story['dek'] == 'A load test that became science credit for [name].'
        assert story['subject'] == 'Science'
        assert story['subject_split'] == [{'subject': 'Science', 'xp': 150},
                                          {'subject': 'Mathematics', 'xp': 50}]
        assert story['xp_awarded'] == 200
        assert story['credit_fraction'] == 0.1
        assert story['receipt'] == {'activity': 'Backyard bridge build', 'course': 'Science',
                                    'credit': '0.1 credit', 'icon': 'flask'}
        assert story['activity_slug'] == 'other'
        assert story['grade_band'] == 'high'
        assert story['setting'] == 'academy'
        assert story['student_label'] == 'A high school student'
        assert story['author_name'] == AUTHOR_NAME
        assert story['ai_draft']['model'] == 'gemini-test'
        assert story['concerns'] == ['The reflection mentions a sibling.']

    def test_excluded_image_is_never_included_and_hero_falls_back(self, source):
        out = _assemble(source)
        assets = out['assets']
        assert [a['included'] for a in assets] == [True, False]
        assert assets[1]['safety']['verdict'] == 'excluded'
        evidence = next(s for s in out['story']['body']['sections'] if s['kind'] == 'evidence')
        assert [i['asset_id'] for i in evidence['items']] == [assets[0]['id']]
        assert evidence['items'][0]['url'] is None                      # filled at publish
        # The model wanted [I2] as hero; it is excluded, so the first included wins.
        assert out['story']['hero_asset_id'] == assets[0]['id']
        assert assets[0]['source_ref'] == PRIVATE_URL                   # admin-only pointer

    def test_criteria_and_rounds_are_copied_verbatim(self, source):
        sections = {s['kind']: s for s in _assemble(source)['story']['body']['sections']}
        assert [c['verdict'] for c in sections['what_reviewer_looked_for']['criteria']] == ['met', 'met']
        assert sections['what_reviewer_looked_for']['criteria'][0]['text'] == 'Built the bridge'
        rounds = sections['how_it_went']['rounds']
        assert [r['round'] for r in rounds] == [1, 2]
        assert rounds[0]['feedback_verbatim'] == '[name], add the load numbers. [name] can help.'
        assert rounds[1]['action'] == 'approved'
        assert 'tasks' not in sections

    def test_quest_story_gets_a_tasks_section(self, source):
        source.source_type = 'quest'
        draft = {**DRAFT, 'tasks': [{'index': 1, 'summary': 'Built and tested a bridge.'}]}
        sections = {s['kind']: s for s in _assemble(source, draft)['story']['body']['sections']}
        row = sections['tasks']['rows'][0]
        assert row['title'] == '[name] load test'
        assert row['subject'] == 'Science'
        assert row['xp'] == 200
        assert (row['criteria_met'], row['criteria_total'], row['rounds']) == (2, 2, 2)
        assert row['summary'] == 'Built and tested a bridge.'

    def test_faq_drops_empty_rows(self, source):
        assert _assemble(source)['story']['body']['faq'] == [{'q': 'Can a bridge count?', 'a': 'Yes.'}]

    def test_slug_is_unique(self, source):
        assert _assemble(source)['story']['slug'] == 'a-bridge-that-held-12-kg'
        assert _assemble(source, taken=['a-bridge-that-held-12-kg'])['story']['slug'] == \
            'a-bridge-that-held-12-kg-2'
        assert unique_slug('x', lambda s: s in {'x', 'x-2'}) == 'x-3'
        assert slugify("Anna's Bridge!! Held") == 'annas-bridge-held'

    def test_credit_display(self):
        assert credit_display(0.5) == '0.5 credit'
        assert credit_display(1.0) == '1 credit'
        assert credit_display(1.5) == '1.5 credits'
        assert credit_display(0.25) == '0.25 credit'
