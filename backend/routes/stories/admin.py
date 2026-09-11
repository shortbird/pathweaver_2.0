"""Admin stories API.

- POST /api/admin/stories/publish                    - the grader's one click
- GET  /api/admin/stories/eligibility/<completion>   - what the grader panel shows first
- GET  /api/admin/stories                            - the list
- GET  /api/admin/stories/<id>                       - story, assets, consent, blockers
- PUT  /api/admin/stories/<id>                       - edit
- POST /api/admin/stories/<id>/regenerate
- POST /api/admin/stories/<id>/publish               - from review; 400 with blockers
- POST /api/admin/stories/<id>/unpublish

Superadmin only. A story carries a student's id and private evidence pointers,
and the editor shows thumbnails of a minor's photographs; nobody else has a
reason to see either.

Responses use utils.api_response_v1, so the body is {"data": {...}}.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from flask import request

from middleware.rate_limiter import rate_limit
from utils.api_response_v1 import error_response, success_response
from utils.auth.decorators import require_superadmin
from utils.evidence_labels import contains_storage_url
from utils.logger import get_logger
from utils.storage_urls import sign_thumb_urls
from utils.validation.sanitizers import pgrst_uuid

from services import marketing_site
from services.stories import assets as assets_mod
from services.stories import consent_service, generate, publish
from services.stories.activities import normalize_activity_slug, valid_icon
from services.stories.source import subject_key

from . import admin_stories_bp as bp

logger = get_logger(__name__)

SOURCE_TYPES = ('credit_submission', 'quest')
MODES = ('auto', 'review')
THUMB_PX = 320

#: What PUT may change. Everything else on the row is derived or bookkeeping.
EDITABLE = ('title', 'dek', 'body', 'activity_slug', 'activity_label', 'receipt',
            'hero_asset_id', 'student_label', 'concerns', 'slug', 'setting', 'grade_band')

SETTINGS = ('academy', 'homeschool', 'org')
GRADE_BANDS = ('elementary', 'middle', 'high')


def _repos():
    from repositories.story_asset_repository import StoryAssetRepository
    from repositories.story_repository import StoryRepository
    from repositories.story_source_repository import StorySourceRepository
    return StoryRepository(), StoryAssetRepository(), StorySourceRepository()


def _uuid_or_none(value: Any, field: str) -> Optional[str]:
    try:
        return pgrst_uuid(str(value), field) if value else None
    except Exception:  # noqa: BLE001
        return None


# ── the one click ────────────────────────────────────────────────────────────

@bp.route('/publish', methods=['POST'])
@require_superadmin
@rate_limit(max_requests=20, window_seconds=60, per_user=True)
def publish_story(user_id: str):
    """Create the story row in `generating` and draft it on a thread.

    202 with the row is the normal answer; the panel polls GET /<id>. 409 with
    `existing_story_id` when this source already has a story, because one
    submission is one page.
    """
    if not generate.enabled():
        return error_response(code='STORIES_DISABLED', message='Stories are turned off.',
                              status=503)
    body = request.get_json(silent=True) or {}
    source_type = body.get('source_type')
    mode = body.get('mode') or 'auto'
    source_id = _uuid_or_none(body.get('source_id'), 'source_id')
    if source_type not in SOURCE_TYPES or mode not in MODES or not source_id:
        return error_response(code='BAD_REQUEST',
                              message='source_type, source_id and mode are required.')

    story_repo, _, source_repo = _repos()
    if source_type == 'credit_submission':
        completion = source_repo.completion(source_id)
        if not completion:
            return error_response(code='NOT_FOUND', message='Submission not found.', status=404)
        student_id = completion.get('user_id')
    else:
        user_quest = source_repo.user_quest(source_id)
        if not user_quest:
            return error_response(code='NOT_FOUND', message='Quest enrolment not found.',
                                  status=404)
        student_id = user_quest.get('user_id')

    existing = story_repo.get_by_source(source_type, source_id)
    if existing:
        return error_response(code='STORY_EXISTS', message='This source already has a story.',
                              details={'existing_story_id': existing['id']}, status=409)

    story = story_repo.create({
        'status': 'generating',
        'source_type': source_type,
        'source_id': source_id,
        'student_user_id': student_id,
        'mode': mode,
        'created_by': user_id,
        'updated_by': user_id,
    })
    generate.kick_background([story['id']])
    logger.info(f'Superadmin {user_id[:8]} started a {mode} story from {source_type} '
                f'{source_id[:8]}')
    return success_response(data={'story': _serialize(story)}, status=202)


@bp.route('/eligibility/<completion_id>', methods=['GET'])
@require_superadmin
def eligibility(user_id: str, completion_id: str):
    """What the grader panel needs before it shows a button."""
    from services.stories import source_quest
    from utils.ai_access import check_ai_access

    story_repo, _, source_repo = _repos()
    completion = source_repo.completion(completion_id)
    if not completion:
        return error_response(code='NOT_FOUND', message='Submission not found.', status=404)

    student_id = completion.get('user_id')
    student = source_repo.student(student_id) or {}
    reasons: List[str] = []
    if completion.get('diploma_status') != 'finalized':
        reasons.append('source_not_finalized')
    if completion.get('merged_into'):
        reasons.append('merged')
    if completion.get('is_confidential'):
        reasons.append('confidential')
    if student.get('organization_id'):
        reasons.append('org_student_phase2')
    has_access, _, _ = check_ai_access(student_id, strict=True)
    if not has_access:
        reasons.append('ai_disabled')

    task = source_repo.task(completion.get('user_quest_task_id')) or {}
    user_quest_id = task.get('user_quest_id')
    quest_status = source_quest.status(user_quest_id, repo=source_repo) if user_quest_id else None
    quest_story = story_repo.get_by_source('quest', user_quest_id) if user_quest_id else None

    consent = consent_service.status_for(student_id)
    return success_response(data={'eligibility': {
        'completion_id': completion_id,
        'student_user_id': student_id,
        'eligible': not reasons,
        'reasons': reasons,
        'consent': {
            'active': bool(consent['active']),
            'scope': consent['scope'],
            'tier': consent['tier'],
            'consent_id': (consent['active'] or {}).get('id'),
        },
        'existing_story': _serialize(story_repo.get_by_source('credit_submission', completion_id)),
        'quest': {
            'user_quest_id': user_quest_id,
            'complete': bool((quest_status or {}).get('complete')),
            'finalized_task_count': (quest_status or {}).get('finalized_task_count', 0),
            'task_count': (quest_status or {}).get('task_count', 0),
            'existing_story': _serialize(quest_story),
        },
        'stories_enabled': generate.enabled(),
    }})


# ── the list and the editor ──────────────────────────────────────────────────

@bp.route('', methods=['GET'])
@bp.route('/', methods=['GET'])
@require_superadmin
def list_stories(user_id: str):
    story_repo, _, _ = _repos()
    rows = story_repo.list_all()
    return success_response(data={'stories': [_serialize(r) for r in rows]})


@bp.route('/<story_id>', methods=['GET'])
@require_superadmin
def get_story(user_id: str, story_id: str):
    story_repo, asset_repo, _ = _repos()
    story = story_repo.get(story_id)
    if not story:
        return error_response(code='NOT_FOUND', message='Story not found.', status=404)
    assets = asset_repo.for_story(story_id)
    return success_response(data=_detail(story, assets))


@bp.route('/<story_id>', methods=['PUT'])
@require_superadmin
def update_story(user_id: str, story_id: str):
    """Edit the words, the receipt, the hero, and which assets are included.

    A superadmin may override an image's exclusion only in the named tier:
    without a consent there is nobody to have said yes to a face.
    """
    story_repo, asset_repo, _ = _repos()
    story = story_repo.get(story_id)
    if not story:
        return error_response(code='NOT_FOUND', message='Story not found.', status=404)
    if story.get('status') == 'generating':
        return error_response(code='STORY_GENERATING',
                              message='The story is still being drafted.', status=409)

    payload = request.get_json(silent=True) or {}
    changes: Dict[str, Any] = {}
    for key in EDITABLE:
        if key in payload:
            changes[key] = payload[key]
    if contains_storage_url({k: v for k, v in changes.items() if k != 'hero_asset_id'}):
        return error_response(code='STORAGE_URL',
                              message='A private storage link may not appear in a story.')
    if 'activity_slug' in changes:
        changes['activity_slug'] = normalize_activity_slug(changes['activity_slug'])
    if 'receipt' in changes:
        receipt = changes['receipt'] if isinstance(changes['receipt'], dict) else {}
        primary = subject_key(story.get('subject'))
        changes['receipt'] = {
            'activity': str(receipt.get('activity') or '')[:60],
            'course': str(receipt.get('course') or story.get('subject') or '')[:80],
            'credit': str(receipt.get('credit') or (story.get('receipt') or {}).get('credit') or ''),
            'icon': valid_icon(receipt.get('icon'), changes.get('activity_slug')
                               or story.get('activity_slug'), primary),
        }
    if 'body' in changes and not isinstance(changes['body'], dict):
        return error_response(code='BAD_REQUEST', message='body must be an object.')
    # The editor sends faq at the top level for convenience; it lives in body.
    if 'faq' in payload:
        body = dict(changes.get('body') if isinstance(changes.get('body'), dict)
                    else (story.get('body') or {}))
        body['faq'] = [{'q': str(f.get('q') or '')[:300], 'a': str(f.get('a') or '')[:1500]}
                       for f in (payload['faq'] or []) if isinstance(f, dict)]
        changes['body'] = body
    if 'slug' in changes:
        from services.stories.drafter import slugify
        slug = slugify(str(changes['slug'] or ''))
        if not slug:
            return error_response(code='BAD_REQUEST', message='slug cannot be empty.')
        if slug != story.get('slug') and story_repo.slug_exists(slug):
            return error_response(code='SLUG_TAKEN', message='Another story uses that slug.',
                                  status=409)
        changes['slug'] = slug
    if 'setting' in changes and changes['setting'] not in SETTINGS:
        return error_response(code='BAD_REQUEST', message='setting is not one of the known values.')
    if 'grade_band' in changes and changes['grade_band'] not in GRADE_BANDS + (None,):
        return error_response(code='BAD_REQUEST', message='grade_band is not one of the known values.')

    assets = asset_repo.for_story(story_id)
    by_id = {a['id']: a for a in assets}
    for edit in payload.get('assets') or []:
        if not isinstance(edit, dict) or edit.get('id') not in by_id:
            continue
        asset = by_id[edit['id']]
        asset_changes: Dict[str, Any] = {}
        for key in ('alt', 'caption'):
            if key in edit:
                asset_changes[key] = (str(edit[key])[:300] if edit[key] is not None else None)
        if 'included' in edit:
            wanted = bool(edit['included'])
            verdict = (asset.get('safety') or {}).get('verdict')
            if wanted and verdict != 'safe':
                if story.get('tier') != 'named':
                    return error_response(
                        code='EXCLUSION_STANDS',
                        message='An excluded image cannot be included in an anonymized story.')
                asset_changes['safety'] = {**(asset.get('safety') or {}), 'override': user_id}
            asset_changes['included'] = wanted
        if asset_changes:
            asset_repo.patch(asset['id'], asset_changes)
            by_id[asset['id']] = {**asset, **asset_changes}

    changes['updated_by'] = user_id
    story_repo.patch(story_id, changes)
    story = story_repo.get(story_id) or {**story, **changes}
    assets = list(by_id.values())
    found = publish.blockers(story, assets)
    story_repo.patch(story_id, {'blockers': found})
    story['blockers'] = found
    if story.get('status') == 'published':
        marketing_site.request_rebuild('story_edited')
    return success_response(data=_detail(story, assets))


@bp.route('/<story_id>/regenerate', methods=['POST'])
@require_superadmin
def regenerate_story(user_id: str, story_id: str):
    if not generate.enabled():
        return error_response(code='STORIES_DISABLED', message='Stories are turned off.',
                              status=503)
    story_repo, _, _ = _repos()
    story = story_repo.get(story_id)
    if not story:
        return error_response(code='NOT_FOUND', message='Story not found.', status=404)
    if story.get('status') in ('generating', 'published'):
        return error_response(code='WRONG_STATUS',
                              message='Unpublish the story before regenerating it.',
                              status=409)
    payload = request.get_json(silent=True) or {}
    mode = payload.get('mode') if payload.get('mode') in MODES else story.get('mode')
    story_repo.patch(story_id, {
        'status': 'generating', 'mode': mode, 'claim_token': None, 'started_at': None,
        'attempts': 0, 'error': None, 'blockers': [], 'updated_by': user_id,
    })
    generate.kick_background([story_id])
    return success_response(data={'story': _serialize(story_repo.get(story_id))}, status=202)


@bp.route('/<story_id>/publish', methods=['POST'])
@require_superadmin
def publish_from_review(user_id: str, story_id: str):
    story, found = publish.publish_from_review(story_id, user_id=user_id)
    if story is None:
        return error_response(code='NOT_FOUND', message='Story not found.', status=404)
    if found:
        return error_response(code='BLOCKED', message='The story cannot be published yet.',
                              details={'blockers': found}, status=400)
    return success_response(data={'story': _serialize(story),
                                  'marketing_url': marketing_site.story_url(story.get('slug') or '')})


@bp.route('/<story_id>/unpublish', methods=['POST'])
@require_superadmin
def unpublish_story(user_id: str, story_id: str):
    story = publish.unpublish(story_id, user_id=user_id)
    if story is None:
        return error_response(code='NOT_FOUND', message='Story not found.', status=404)
    return success_response(data={'story': _serialize(story)})


# ── serialization ────────────────────────────────────────────────────────────

def _serialize(story: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """A story row for a superadmin. Bookkeeping stays out."""
    if not story:
        return None
    out = {k: v for k, v in story.items() if k not in ('claim_token',)}
    body = out.get('body') if isinstance(out.get('body'), dict) else {}
    out['faq'] = body.get('faq') or []
    if out.get('slug') and out.get('status') == 'published':
        out['marketing_url'] = marketing_site.story_url(out['slug'])
    return out


def _detail(story: Dict[str, Any], assets: List[Dict[str, Any]]) -> Dict[str, Any]:
    thumbs = sign_thumb_urls([a.get('source_ref') for a in assets], size=THUMB_PX)
    return {
        'story': _serialize(story),
        'assets': [{
            **a,
            'thumb_url': thumbs.get(a.get('source_ref')),
            'public_url': assets_mod.public_url_for(a.get('public_path')),
        } for a in assets],
        'consent': _consent_view(story.get('student_user_id')),
        'blockers': story.get('blockers') or [],
        'concerns': story.get('concerns') or [],
        'marketing_url': marketing_site.story_url(story['slug']) if story.get('slug') else None,
    }


def _consent_view(student_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not student_id:
        return None
    status = consent_service.status_for(student_id)
    return {
        'active': bool(status['active']),
        'consent_id': (status['active'] or {}).get('id'),
        'scope': status['scope'],
        'tier': status['tier'],
        'history': consent_service.history_summary(status['history']),
    }
