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
    def org_row(self, org_id): return {'id': org_id, 'name': 'Hearthwood Academy', 'slug': 'hearthwood'} if org_id else None
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


VIDEO_URL = PRIVATE_URL.replace('bridge.jpg', 'anna_load_test.MP4')


def _video(index=3):
    return ImageCandidate(index=index, task_index=1, block_id='v1', item_index=1,
                          source_ref=VIDEO_URL, mime_type='video/mp4', data=b'ftypmp42',
                          label='Load test', kind='video', file_name='anna_load_test.MP4')


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

    def test_the_facts_and_the_credit_rule_are_in_it(self, source):
        text = prompt_mod.build_prompt(source, student_label='A high school student',
                                       safe_images=[_image()])
        assert 'Science: 150 XP, Mathematics: 50 XP' in text
        assert 'This assignment earned 200 XP toward a Science credit.' in text
        assert 'never "0.1 credit"' in text                            # a sliver of credit is said as XP
        assert 'Optio uses XP instead of letter grades.' in text
        assert '2000 XP is one high school credit.' in text
        assert 'Tasks credited: 1 of 1' in text
        assert 'THE REVIEW IS STILL OPEN' not in text
        assert 'Credit is never based on hours, seat time or logged time. Do not say it is.' in text
        assert 'Setting: Optio Academy, a WASC-accredited online private school.' in text
        assert '[T1] [name] load test' in text
        assert '[C1] Built the bridge' in text
        assert '[I1]' in text
        assert 'Grade band: high school' in text
        assert 'GUARDRAILS' in text
        assert 'No em dashes' in text
        assert 'Return "tasks" as an empty list' in text
        assert 'under 155 characters' in text                         # the dek is the meta description
        # The FAQ is about Optio, with the story as the example, never the assignment's own steps.
        assert 'never as the rule' in text
        assert "this assignment's steps,\ntools, software or materials helps nobody" in text

    def test_half_a_credit_and_up_is_said_as_credit(self, source):
        source.tasks[0].xp = 1000
        source.tasks[0].subject_split = {'science': 1000}
        text = prompt_mod.build_prompt(source, student_label='A student', safe_images=[])
        assert 'This assignment earned 0.5 credit of Science.' in text
        assert 'reads as a joke' not in text

    def test_an_uncredited_source_is_told_the_review_is_open(self, source):
        """A story drafted before the grader finalizes must not claim credit."""
        source.tasks[0].credited = False
        text = prompt_mod.build_prompt(source, student_label='A student', safe_images=[])
        assert source.credit_state == 'pending'
        assert 'how that work is becoming credit on a transcript' in text
        assert 'This assignment is worth 200 XP toward a Science credit once a licensed teacher awards it.' in text
        assert 'Tasks submitted: 1. Tasks credited so far: 0.' in text
        assert 'THE REVIEW IS STILL OPEN' in text
        assert 'Do not write that the credit was earned, awarded,' in text
        assert 'why the evidence is what earns it' in text
        assert 'the page marks it pending itself; do not' in text
        assert 'This assignment earned' not in text

    def test_an_anonymized_story_names_nobody_not_even_generically(self, source):
        text = prompt_mod.build_prompt(source, student_label='A high school student',
                                       safe_images=[_image()])
        assert 'Call the student' not in text
        assert 'Refer to the student as "the student"' in text
        assert 'You may say "a high school student" at most once' in text
        assert 'ONLY the student label' not in text

    def test_a_named_story_uses_the_label(self, source):
        text = prompt_mod.build_prompt(source, student_label='Anna, 14',
                                       safe_images=[_image()], tier='named')
        assert 'Call the student: "Anna, 14". That is the only way to refer to them.' in text
        assert 'Refer to the student as "the student"' not in text

    def test_the_setting_line_never_names_a_partner_school(self, source):
        source.student.setting = 'org'
        text = prompt_mod.build_prompt(source, student_label='A student', safe_images=[])
        assert 'Setting: a partner school that runs on Optio. Do not name it.' in text
        source.student.setting = 'homeschool'
        text = prompt_mod.build_prompt(source, student_label='A student', safe_images=[])
        assert 'Setting: homeschool, taking Optio classes.' in text

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

    def test_a_video_is_described_not_attached_and_may_be_the_hero(self, source):
        source.tasks[0].images = [_image(1), _video(3)]
        text = prompt_mod.build_prompt(source, student_label='A student',
                                       safe_images=[_image(1), _video(3)])
        assert 'IMAGES (1 passed the safety check, attached below): [I1]' in text
        assert 'VIDEOS (1 passed the safety check; not attached):' in text
        assert ('[I3] Load test (a short video the student submitted; it passed the safety '
                'check; you cannot watch it here, write the alt from the task and label)') in text
        assert 'Pick the best image or video as hero_index' in text
        assert 'A document can never be the hero.' in text
        assert 'A video can never be the hero' not in text
        assert 'Videos attached to this task: [I3]' in text
        for token in FORBIDDEN + ('anna_load_test', '.MP4'):
            assert token not in text, token

        parts = prompt_mod.build_parts(text, [_image(1), _video(3)])
        assert parts == [text, '[I1]:', {'mime_type': 'image/jpeg', 'data': b'\xff\xd8jpeg'}]

    def test_only_a_video_still_offers_a_hero(self, source):
        text = prompt_mod.build_prompt(source, student_label='A student', safe_images=[_video(3)])
        assert 'No image passed the safety check.' in text
        assert 'Pick the best image or video as hero_index' in text
        assert 'hero_index must be 0' not in text
        assert prompt_mod.build_parts(text, [_video(3)]) == [text]

    def test_only_a_document_means_hero_index_zero(self, source):
        from services.stories.source import ImageCandidate
        doc = ImageCandidate(index=4, task_index=1, block_id='d4', item_index=1,
                             source_ref=PRIVATE_URL, mime_type='application/pdf',
                             data=b'%PDF', label='Lab report', kind='document', excerpt='x')
        text = prompt_mod.build_prompt(source, student_label='A student', safe_images=[doc])
        assert 'There is no image or video, so hero_index must be 0.' in text


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
    taken_slugs = set(taken or [])
    return assemble(source, result, student_label='A high school student', tier=tier,
                    verdicts=[_verdict(1, 'safe'), _verdict(2, 'excluded', faces=1)],
                    scrubber=Scrubber(['Anna Lindqvist']), slug_exists=lambda s: s in taken_slugs,
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
                                    'credit': '0.1 credit', 'icon': 'flask', 'state': 'awarded'}
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
        media = [i for i in evidence['items'] if i['type'] in ('image', 'video', 'document')]
        assert [i['asset_id'] for i in media] == [assets[0]['id']]
        assert media[0]['url'] is None                                  # filled at publish
        # The two typed text blocks follow the media, as quotes, in order.
        assert [i['type'] for i in evidence['items']] == ['image', 'quote', 'quote']
        # The model wanted [I2] as hero; it is excluded, so the first included wins.
        assert out['story']['hero_asset_id'] == assets[0]['id']
        assert assets[0]['source_ref'] == PRIVATE_URL                   # admin-only pointer

    def test_criteria_are_copied_verbatim_and_the_rounds_stay_off_the_page(self, source):
        sections = {s['kind']: s for s in _assemble(source)['story']['body']['sections']}
        assert [c['verdict'] for c in sections['what_reviewer_looked_for']['criteria']] == ['met', 'met']
        assert sections['what_reviewer_looked_for']['criteria'][0]['text'] == 'Built the bridge'
        # The rounds inform the prompt (the reviewer's words are context) but
        # are not a section: a visitor reads the work, not the paperwork.
        assert 'how_it_went' not in sections
        assert list(sections) == ['what_they_did', 'evidence', 'what_reviewer_looked_for',
                                  'what_it_counted_for']
        assert 'tasks' not in sections

    def test_quest_story_gets_a_tasks_section(self, source):
        source.source_type = 'quest'
        draft = {**DRAFT, 'tasks': [{'index': 1, 'summary': 'Built and tested a bridge.'}]}
        sections = {s['kind']: s for s in _assemble(source, draft)['story']['body']['sections']}
        row = sections['tasks']['rows'][0]
        assert row['title'] == '[name] load test'
        assert row['subject'] == 'Science'
        assert row['xp'] == 200
        assert (row['criteria_met'], row['criteria_total']) == (2, 2)
        assert 'rounds' not in row
        assert row['summary'] == 'Built and tested a bridge.'

    def test_faq_drops_empty_rows(self, source):
        assert _assemble(source)['story']['body']['faq'] == [{'q': 'Can a bridge count?', 'a': 'Yes.'}]

    def test_a_video_asset_carries_its_kind_and_is_the_hero_when_the_model_picks_it(self, source):
        source.tasks[0].images = [_image(1), _video(3)]
        draft = {**DRAFT, 'images': [
            {'index': 1, 'use': True, 'alt': 'A wooden bridge', 'caption': 'The bridge'},
            {'index': 3, 'use': True, 'alt': 'The load test, filmed', 'caption': 'It held'},
        ], 'hero_index': 3}
        result = DraftResult(data=draft, model='gemini-test', prompt_version='story-draft/test',
                             usage={}, drafted_at='2026-09-11T00:00:00+00:00')
        out = assemble(source, result, student_label='A high school student', tier='anonymized',
                       verdicts=[_verdict(1, 'safe'), _verdict(3, 'safe')],
                       scrubber=Scrubber(['Anna Lindqvist']), slug_exists=lambda s: False,
                       story_id='story-1')
        image, video = out['assets']
        assert (image['kind'], image['mime_type']) == ('image', 'image/jpeg')
        assert (video['kind'], video['mime_type']) == ('video', 'video/mp4')
        assert video['included'] and video['alt'] == 'The load test, filmed'
        assert video['source_ref'] == VIDEO_URL
        evidence = next(s for s in out['story']['body']['sections'] if s['kind'] == 'evidence')
        assert [i['type'] for i in evidence['items'] if 'asset_id' in i] == ['image', 'video']
        # The model wanted the video as hero, and the page leads with it.
        assert out['story']['hero_asset_id'] == video['id']

    def test_with_only_a_video_the_video_is_the_hero(self, source):
        source.tasks[0].images = [_video(3)]
        draft = {**DRAFT, 'images': [{'index': 3, 'use': True, 'alt': 'Filmed', 'caption': ''}],
                 'hero_index': 0}                                       # the model chose nothing
        result = DraftResult(data=draft, model='gemini-test', prompt_version='story-draft/test',
                             usage={}, drafted_at='2026-09-11T00:00:00+00:00')
        out = assemble(source, result, student_label='A high school student', tier='anonymized',
                       verdicts=[_verdict(3, 'safe')], scrubber=Scrubber([]),
                       slug_exists=lambda s: False, story_id='story-1')
        assert out['assets'][0]['included'] is True
        assert out['story']['hero_asset_id'] == out['assets'][0]['id']

    def test_a_document_is_never_the_hero(self, source):
        from services.stories.source import ImageCandidate
        doc = ImageCandidate(index=4, task_index=1, block_id='d4', item_index=1,
                             source_ref=PRIVATE_URL, mime_type='application/pdf',
                             data=b'%PDF', label='Lab report', kind='document', excerpt='x')
        source.tasks[0].images = [doc]
        draft = {**DRAFT, 'images': [{'index': 4, 'use': True, 'alt': 'Report', 'caption': ''}],
                 'hero_index': 4}
        result = DraftResult(data=draft, model='gemini-test', prompt_version='story-draft/test',
                             usage={}, drafted_at='2026-09-11T00:00:00+00:00')
        out = assemble(source, result, student_label='A high school student', tier='anonymized',
                       verdicts=[_verdict(4, 'safe')], scrubber=Scrubber([]),
                       slug_exists=lambda s: False, story_id='story-1')
        assert out['assets'][0]['included'] is True
        assert out['story']['hero_asset_id'] is None

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
