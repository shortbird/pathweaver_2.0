"""The one click, end to end, against fakes.

The happy path publishes, copies the safe image, rebuilds the site and emails
the founder. A second text leak parks the story in review with the reason.
Review mode never publishes. The gates refuse in the documented order.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from app_config import Config
from services import marketing_site
from services.stories import assets as assets_mod
from services.stories import drafter as drafter_mod
from services.stories import generate, publish, safety
from services.stories.drafter import DraftResult
from services.stories.safety import ImageVerdict
from services.stories.source import (
    ImageCandidate,
    QuestSource,
    RoundSource,
    StorySource,
    StudentSource,
    TaskSource,
)

pytestmark = pytest.mark.unit

STORY_ID = '11111111-1111-1111-1111-111111111111'
STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
COMPLETION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
REF = ('https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/'
       'quest-evidence/task-evidence/x/{n}.jpg')


# ── fakes ────────────────────────────────────────────────────────────────────

class FakeStoryRepo:
    def __init__(self, rows: List[Dict[str, Any]]):
        self.rows = {r['id']: dict(r) for r in rows}
        self.patches: List[Dict[str, Any]] = []

    def get(self, sid): return dict(self.rows[sid]) if sid in self.rows else None
    def patch(self, sid, changes):
        self.patches.append(changes)
        self.rows[sid].update(changes)
        return dict(self.rows[sid])
    def claim_generating(self, sid, token, started_at):
        row = self.rows.get(sid)
        if not row or row['status'] != 'generating' or row.get('claim_token'):
            return False
        row.update({'claim_token': token, 'started_at': started_at})
        return True
    def finish(self, sid, token, update):
        row = self.rows.get(sid)
        if not row or row.get('claim_token') != token:
            return False
        row.update(update)
        return True
    def slug_exists(self, slug): return any(r.get('slug') == slug for r in self.rows.values())
    def list_for_student(self, student_id, statuses=None):
        return [dict(r) for r in self.rows.values() if r.get('student_user_id') == student_id
                and (not statuses or r.get('status') in statuses)]
    def list_all(self, limit=200): return [dict(r) for r in self.rows.values()]
    def generating_since_before(self, cutoff, limit=50):
        return [{'id': r['id'], 'attempts': r.get('attempts', 0)} for r in self.rows.values()
                if r['status'] == 'generating' and (r.get('started_at') or '9') < cutoff]
    def release_if_generating(self, sid, update):
        if self.rows[sid]['status'] == 'generating':
            self.rows[sid].update(update)
    def unclaimed_generating_ids(self, limit=20):
        return [r['id'] for r in self.rows.values() if r['status'] == 'generating' and not r.get('claim_token')]


class FakeAssetRepo:
    def __init__(self):
        self.rows: Dict[str, Dict[str, Any]] = {}

    def for_story(self, sid): return [dict(a) for a in self.rows.values() if a['story_id'] == sid]
    def replace_for_story(self, sid, rows):
        self.rows = {k: v for k, v in self.rows.items() if v['story_id'] != sid}
        for r in rows:
            self.rows[r['id']] = dict(r)
        return list(rows)
    def patch(self, aid, changes):
        self.rows[aid].update(changes)
        return dict(self.rows[aid])
    def clear_public_paths(self, sid):
        for a in self.rows.values():
            if a['story_id'] == sid:
                a['public_path'] = None


class FakeSourceRepo:
    def __init__(self, *, status='finalized', merged=None, confidential=False, org=None):
        self.completion_row = {'id': COMPLETION_ID, 'user_id': STUDENT_ID,
                               'diploma_status': status, 'merged_into': merged,
                               'is_confidential': confidential, 'user_quest_task_id': 't1'}
        self.student_row = {'id': STUDENT_ID, 'first_name': 'Anna', 'organization_id': org,
                            'role': 'student', 'date_of_birth': '2012-01-01'}

    def completion(self, cid): return self.completion_row if cid == COMPLETION_ID else None
    def student(self, uid): return self.student_row if uid == STUDENT_ID else None
    def user_quest(self, uid): return None


class FakeConsentRepo:
    def __init__(self, active=None): self.active = active
    def active_for_student(self, sid): return self.active


def _source(images: int = 2) -> StorySource:
    student = StudentSource(user_id=STUDENT_ID, first_name='Anna', date_of_birth='2012-01-01',
                            grade_level=None, setting='homeschool', is_org_student=False,
                            organization_id=None, identity_names=['Anna', 'Lindqvist'],
                            org_names=[])
    task = TaskSource(index=1, completion_id=COMPLETION_ID, task_id='t1', title='Load test',
                      description='Test the bridge.', criteria=['Built it', 'Tested it'],
                      criteria_source='success_criteria', subject_split={'science': 150},
                      xp=150, evidence_texts=['It held 12 kg.'],
                      images=[ImageCandidate(index=n, task_index=1, block_id=f'b{n}',
                                             item_index=1, source_ref=REF.format(n=n),
                                             mime_type='image/jpeg', data=b'\xff\xd8')
                              for n in range(1, images + 1)],
                      ai_criteria=[{'index': 1, 'criterion': 'Built it', 'verdict': 'met', 'note': 'yes'}],
                      rounds=[RoundSource(1, '2026-09-01', 'approved', 'Good.', None)],
                      finalized_at='2026-09-05T00:00:00+00:00', diploma_status='finalized')
    return StorySource(source_type='credit_submission', source_id=COMPLETION_ID, student=student,
                       quest=QuestSource('q1', 'Bridge Build', 'Design a bridge.', ''), tasks=[task])


DRAFT = {
    'title': 'A bridge that held 12 kg', 'title_options': [], 'dek': 'A load test that counted.',
    'activity_slug': 'other', 'activity_label': 'A bridge build',
    'receipt': {'activity': 'Backyard bridge build', 'course': 'Science', 'credit': '0.08 credit',
                'icon': 'flask'},
    'what_they_did': 'They built it and tested it.', 'tasks': [],
    'what_it_counted_for': 'Science credit.',
    'faq': [{'q': 'Does a bridge count?', 'a': 'Yes.'}],
    'images': [{'index': 1, 'use': True, 'alt': 'A wooden bridge', 'caption': 'The bridge'},
               {'index': 2, 'use': True, 'alt': 'The table', 'caption': 'Testing'}],
    'hero_index': 1, 'search_phrases': [], 'concerns': ['Check the caption.'],
}


class FakeDrafter:
    def __init__(self, data=None): self.data = data or DRAFT
    def draft(self, source, *, student_label, safe_images, tier='anonymized'):
        self.seen = {'label': student_label, 'safe': [i.index for i in safe_images], 'tier': tier}
        return DraftResult(data=dict(self.data), model='gemini-test', prompt_version='story-draft/test',
                           usage={}, drafted_at='2026-09-11T00:00:00+00:00')


@pytest.fixture
def world(monkeypatch):
    """Every seam the run crosses, stubbed and recording."""
    story_repo = FakeStoryRepo([{
        'id': STORY_ID, 'status': 'generating', 'source_type': 'credit_submission',
        'source_id': COMPLETION_ID, 'student_user_id': STUDENT_ID, 'mode': 'auto',
        'attempts': 0, 'claim_token': None, 'tier': 'anonymized',
    }])
    asset_repo = FakeAssetRepo()
    state: Dict[str, Any] = {
        'story_repo': story_repo, 'asset_repo': asset_repo,
        'source_repo': FakeSourceRepo(), 'consent': FakeConsentRepo(),
        'ai_access': (True, None, None), 'source': _source(),
        'verdicts': [ImageVerdict(1, 'b1', 1, REF.format(n=1), 'safe', None, checked_by='g'),
                     ImageVerdict(2, 'b2', 1, REF.format(n=2), 'excluded', 'faces', faces=1)],
        'text_phrases': [], 'text_blockers': [],
        'drafter': FakeDrafter(), 'copied': [], 'rebuilds': [], 'emails': [], 'deleted': [],
    }
    monkeypatch.setattr(generate, '_repos', lambda admin=None: (story_repo, asset_repo))
    monkeypatch.setattr(publish, '_repos', lambda admin=None: (story_repo, asset_repo))
    monkeypatch.setattr('repositories.story_source_repository.StorySourceRepository',
                        lambda client=None: state['source_repo'])
    monkeypatch.setattr('repositories.promotional_consent_repository.PromotionalConsentRepository',
                        lambda client=None: state['consent'])
    monkeypatch.setattr('utils.ai_access.check_ai_access', lambda sid, strict=False: state['ai_access'])
    monkeypatch.setattr(generate, '_load', lambda row, admin: state['source'])
    monkeypatch.setattr(safety, 'check_images',
                        lambda candidates, **k: [v for v in state['verdicts']
                                                 if v.index in {c.index for c in candidates}])
    monkeypatch.setattr(drafter_mod, 'StoryDrafter', lambda: state['drafter'])

    def fake_check_text(fields, scrubber, checker=None):
        return fields, {'leaks_found': [], 'ai_phrases': state['text_phrases'],
                        'leaks_after': ['Anna'] if state['text_blockers'] else [],
                        'blockers': list(state['text_blockers']), 'model': 'g', 'error': None,
                        'checked_at': 'now'}
    monkeypatch.setattr(safety, 'check_text', fake_check_text)

    def fake_copy(story, assets, *, admin=None, repo=None):
        out = []
        for a in assets:
            if a.get('included'):
                path = assets_mod.public_path_for(story['id'], a['id'])
                state['copied'].append(path)
                repo.patch(a['id'], {'public_path': path, 'width': 1600, 'height': 900})
                a = {**a, 'public_path': path, 'width': 1600, 'height': 900}
            out.append(a)
        return out
    monkeypatch.setattr(assets_mod, 'copy_to_public', fake_copy)

    def fake_delete(story, assets, *, admin=None, repo=None):
        state['deleted'].append(story['id'])
        repo.clear_public_paths(story['id'])
        return len([a for a in assets if a.get('public_path')])
    monkeypatch.setattr(assets_mod, 'delete_public', fake_delete)
    monkeypatch.setattr(marketing_site, 'request_rebuild',
                        lambda reason, repo=None: state['rebuilds'].append(reason) or {'status': 'fired'})

    class FakeEmail:
        def send_email(self, **kw):
            state['emails'].append(kw)
            return True
    monkeypatch.setattr('services.email_service.EmailService', FakeEmail)
    monkeypatch.setattr(Config, 'ADMIN_EMAIL', 'founder@example.com')
    monkeypatch.setattr(Config, 'FRONTEND_URL', 'https://app.optioeducation.com')
    monkeypatch.setattr(Config, 'MARKETING_URL', 'https://www.optioeducation.com')
    monkeypatch.setattr(Config, 'STORIES_ENABLED', True)
    return state


def _story(world) -> Dict[str, Any]:
    return world['story_repo'].get(STORY_ID)


# ── the happy path ───────────────────────────────────────────────────────────

class TestAutoPublish:
    def test_publishes_copies_rebuilds_and_emails(self, world):
        out = generate.run(STORY_ID)
        assert out['status'] == 'published'
        story = _story(world)
        assert story['status'] == 'published'
        assert story['published_at']
        assert story['slug'] == 'a-bridge-that-held-12-kg'
        assert story['tier'] == 'anonymized'
        assert story['student_label'] == 'A high school student'
        assert story['claim_token'] is None
        assert story['attempts'] == 1
        assert story['blockers'] == []

        # Only the safe image was copied, and its URL is in the body.
        assets = world['asset_repo'].for_story(STORY_ID)
        included = [a for a in assets if a['included']]
        assert len(included) == 1 and included[0]['source_block_id'] == 'b1'
        assert world['copied'] == [f'stories/{STORY_ID}/{included[0]["id"]}.jpg']
        evidence = next(s for s in story['body']['sections'] if s['kind'] == 'evidence')
        assert evidence['items'][0]['url'].startswith('https://')
        assert '/storage/v1/object/public/story-assets/stories/' in evidence['items'][0]['url']
        assert evidence['items'][0]['width'] == 1600
        assert story['hero_asset_id'] == included[0]['id']

        assert world['rebuilds'] == ['story_published']
        email = world['emails'][0]
        assert email['to_email'] == 'founder@example.com'
        assert email['subject'] == 'Story published: A bridge that held 12 kg'
        assert 'https://www.optioeducation.com/stories/a-bridge-that-held-12-kg/' in email['text_body']
        assert 'Check the caption.' in email['text_body']
        assert f'https://app.optioeducation.com/admin/stories/{STORY_ID}' in email['text_body']

    def test_the_drafter_sees_only_safe_images_and_the_generic_label(self, world):
        generate.run(STORY_ID)
        assert world['drafter'].seen == {'label': 'A high school student', 'safe': [1],
                                         'tier': 'anonymized'}

    def test_safety_verdicts_are_stored_on_the_story_and_the_assets(self, world):
        generate.run(STORY_ID)
        story = _story(world)
        assert [v['verdict'] for v in story['safety']['images']] == ['safe', 'excluded']
        assert story['safety']['text']['blockers'] == []
        excluded = next(a for a in world['asset_repo'].for_story(STORY_ID) if not a['included'])
        assert excluded['safety']['reason'] == 'faces'
        assert excluded['public_path'] is None

    def test_email_failure_does_not_fail_publish(self, world, monkeypatch):
        class Broken:
            def send_email(self, **kw):
                raise RuntimeError('sendgrid down')
        monkeypatch.setattr('services.email_service.EmailService', Broken)
        assert generate.run(STORY_ID)['status'] == 'published'
        assert _story(world)['status'] == 'published'

    def test_named_tier_with_consent(self, world):
        world['consent'] = FakeConsentRepo({'id': 'consent-1', 'scope_work': True,
                                            'scope_first_name': True, 'scope_age': True})
        generate.run(STORY_ID)
        story = _story(world)
        assert story['tier'] == 'named'
        assert story['consent_id'] == 'consent-1'
        assert story['student_label'] == 'Anna, 14'
        assert story['status'] == 'published'


class TestLandsInReview:
    def test_second_text_leak_parks_the_story_with_the_reason(self, world):
        world['text_blockers'] = ['text_leak']
        out = generate.run(STORY_ID)
        assert out['status'] == 'review'
        story = _story(world)
        assert story['status'] == 'review'
        assert [b['code'] for b in story['blockers']] == ['text_leak']
        assert world['copied'] == [] and world['rebuilds'] == [] and world['emails'] == []

    def test_anonymized_story_may_not_show_a_face_even_if_the_drafter_chose_it(self, world):
        """apply_verdicts drops it first; if a row still claimed included, blockers catch it."""
        world['verdicts'][1] = ImageVerdict(2, 'b2', 1, REF.format(n=2), 'safe', None, faces=1)
        out = generate.run(STORY_ID)
        assert out['status'] == 'review'
        assert 'faces_in_anonymized' in [b['code'] for b in _story(world)['blockers']]

    def test_empty_title_blocks(self, world):
        world['drafter'] = FakeDrafter({**DRAFT, 'title': ''})
        generate.run(STORY_ID)
        assert 'empty_title' in [b['code'] for b in _story(world)['blockers']]
        assert _story(world)['status'] == 'review'

    def test_review_mode_never_publishes(self, world):
        world['story_repo'].rows[STORY_ID]['mode'] = 'review'
        out = generate.run(STORY_ID)
        assert out['status'] == 'review'
        story = _story(world)
        assert story['status'] == 'review'
        assert story['title'] == 'A bridge that held 12 kg'
        assert story['blockers'] == []                       # nothing wrong, just parked
        assert world['copied'] == [] and world['rebuilds'] == [] and world['emails'] == []

    def test_publish_from_review_then_unpublish(self, world):
        world['story_repo'].rows[STORY_ID]['mode'] = 'review'
        generate.run(STORY_ID)
        story, found = publish.publish_from_review(STORY_ID, user_id='admin-1')
        assert found == [] and story['status'] == 'published'
        assert world['rebuilds'] == ['story_published']
        assert len(world['copied']) == 1

        down = publish.unpublish(STORY_ID, user_id='admin-1')
        assert down['status'] == 'unpublished' and down['unpublished_at']
        assert world['deleted'] == [STORY_ID]
        assert world['rebuilds'] == ['story_published', 'story_unpublished']
        evidence = next(s for s in _story(world)['body']['sections'] if s['kind'] == 'evidence')
        assert evidence['items'] == []


class TestGates:
    @pytest.mark.parametrize('setup, code', [
        (dict(status='pending_review'), 'source_not_finalized'),
        (dict(merged='c9'), 'merged'),
        (dict(confidential=True), 'confidential'),
        (dict(org='org-1'), 'org_student_phase2'),
    ])
    def test_refusals_by_source_state(self, world, setup, code):
        world['source_repo'] = FakeSourceRepo(**setup)
        out = generate.run(STORY_ID)
        assert out == {'status': 'failed', 'reason': code}
        story = _story(world)
        assert story['status'] == 'failed'
        assert story['blockers'][0]['code'] == code
        assert story['claim_token'] is None
        assert world['drafter'].__dict__.get('seen') is None

    def test_ai_disabled_refuses_before_loading(self, world, monkeypatch):
        world['ai_access'] = (False, {'code': 'DEPENDENT_AI_DISABLED', 'message': 'off'}, 403)
        loaded = []
        monkeypatch.setattr(generate, '_load', lambda row, admin: loaded.append(1))
        out = generate.run(STORY_ID)
        assert out == {'status': 'failed', 'reason': 'ai_disabled'}
        assert loaded == []

    def test_gate_order_merged_before_confidential(self, world):
        world['source_repo'] = FakeSourceRepo(merged='c9', confidential=True)
        assert generate.run(STORY_ID)['reason'] == 'merged'


class TestClaimAndFailure:
    def test_second_worker_cannot_claim(self, world):
        world['story_repo'].rows[STORY_ID]['claim_token'] = 'someone-else'
        assert generate.run(STORY_ID) == {'status': 'not_claimed', 'story_id': STORY_ID}

    def test_an_exception_lands_in_failed_never_raises(self, world, monkeypatch):
        monkeypatch.setattr(generate, '_load', lambda row, admin: (_ for _ in ()).throw(RuntimeError('boom')))
        out = generate.run(STORY_ID)
        assert out['status'] == 'failed'
        story = _story(world)
        assert story['status'] == 'failed' and story['error'] == 'boom'
        assert story['claim_token'] is None

    def test_requeue_stale_then_fail_after_budget(self, world):
        world['story_repo'].rows[STORY_ID].update({'claim_token': 'dead', 'started_at': '2000-01-01T00:00:00+00:00'})
        assert generate.requeue_stale() == 1
        row = world['story_repo'].rows[STORY_ID]
        assert row['status'] == 'generating' and row['claim_token'] is None and row['attempts'] == 1
        row.update({'claim_token': 'dead-again', 'started_at': '2000-01-01T00:00:00+00:00'})
        assert generate.requeue_stale() == 1
        assert world['story_repo'].rows[STORY_ID]['status'] == 'failed'

    def test_unpublish_all_for_student_takes_named_only_when_asked(self, world):
        repo = world['story_repo']
        repo.rows['s2'] = {'id': 's2', 'status': 'published', 'student_user_id': STUDENT_ID,
                           'tier': 'named', 'body': {'sections': []}}
        repo.rows['s3'] = {'id': 's3', 'status': 'published', 'student_user_id': STUDENT_ID,
                           'tier': 'anonymized', 'body': {'sections': []}}
        assert publish.unpublish_all_for_student(STUDENT_ID, tier='named') == 1
        assert repo.rows['s2']['status'] == 'unpublished'
        assert repo.rows['s3']['status'] == 'published'
        assert world['rebuilds'] == ['consent_revoked']
        assert publish.unpublish_all_for_student(STUDENT_ID, reason='student_erased') == 1
        assert repo.rows['s3']['status'] == 'unpublished'
