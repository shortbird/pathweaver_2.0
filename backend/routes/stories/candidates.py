"""Story candidates: feed items bookmarked in the app for a future story.

- POST /api/admin/stories/candidates/toggle        - the app's bookmark on a feed item
- GET  /api/admin/stories/candidates               - the queue, enriched for review
- POST /api/admin/stories/candidates/<id>/dismiss  - drop one from the queue

The superadmin sees most of the good work first in the app's feed, on a
phone, where the grader's Publish button and the console's paste-an-id form
are both out of reach. The bookmark is the bridge: one tap in the feed, and
the item waits on the web Stories page with what the reviewer needs to decide
-- who, what, whether it is finalized, whether a story already exists -- and
the same Draft-for-review button the console already has. Starting a story
from the queue (POST /publish with `candidate_id`) moves the row to `started`.

Superadmin only, like the rest of this package: a candidate points at a
student's private work.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from flask import request

from middleware.rate_limiter import rate_limit
from utils.api_response_v1 import error_response, success_response
from utils.auth.decorators import require_superadmin
from utils.logger import get_logger

from repositories.story_candidate_repository import TARGET_TYPES, StoryCandidateRepository
from services.stories import source_quest

from . import admin
from . import admin_stories_bp as bp
from .admin import _serialize, _uuid_or_none

logger = get_logger(__name__)

LIST_STATUSES = ('open', 'dismissed', 'started')


def _strip_le_prefix(target_type: str, target_id: Any) -> Any:
    """The feed names a learning moment 'le_<uuid>'; the row stores the uuid."""
    if target_type == 'learning_moment' and isinstance(target_id, str) and target_id.startswith('le_'):
        return target_id[3:]
    return target_id


def _display_name(row: Optional[Dict[str, Any]]) -> str:
    if not row:
        return 'Unknown student'
    return (row.get('display_name') or row.get('preferred_name')
            or f"{row.get('first_name') or ''} {row.get('last_name') or ''}".strip() or 'Student')


def _student_for_target(source_repo, target_type: str, target_id: str) -> Optional[str]:
    if target_type == 'task_completed':
        completion = source_repo.completion(target_id)
        return completion.get('user_id') if completion else None
    event = source_repo.learning_event(target_id)
    return event.get('user_id') if event else None


@bp.route('/candidates/toggle', methods=['POST'])
@require_superadmin
@rate_limit(max_requests=60, window_seconds=60, per_user=True)
def toggle_candidate(user_id: str):
    """Bookmark a feed item, or take the bookmark off.

    Body: target_type ('task_completed' | 'learning_moment'), target_id (the
    completion id, or the learning event id with or without 'le_'), `on`
    (optional; omitted = toggle), `note` (optional).
    Answers {candidate, is_story_candidate}.
    """
    body = request.get_json(silent=True) or {}
    target_type = body.get('target_type')
    if target_type not in TARGET_TYPES:
        return error_response(code='BAD_REQUEST', message='Invalid target_type.')
    target_id = _uuid_or_none(_strip_le_prefix(target_type, body.get('target_id')), 'target_id')
    if not target_id:
        return error_response(code='BAD_REQUEST', message='target_id required.')

    repo = StoryCandidateRepository()
    existing = repo.get_by_target(target_type, target_id)
    is_open = bool(existing and existing.get('status') == 'open')
    on = body.get('on')
    on = (not is_open) if on is None else bool(on)

    if not on:
        if existing:
            repo.unflag(target_type, target_id)
        return success_response(data={'candidate': None, 'is_story_candidate': False})

    # Through the module, so the test seam on admin._repos holds here too.
    _, _, source_repo = admin._repos()
    student_id = _student_for_target(source_repo, target_type, target_id)
    if not student_id:
        return error_response(code='NOT_FOUND', message='That feed item no longer exists.',
                              status=404)
    note = body.get('note')
    candidate = repo.flag(target_type, target_id, student_user_id=student_id,
                          flagged_by=user_id, note=str(note).strip()[:500] if note else None)
    logger.info(f'Superadmin {user_id[:8]} bookmarked {target_type} {target_id[:8]} for a story')
    return success_response(data={'candidate': candidate, 'is_story_candidate': True})


def _enrich(candidate: Dict[str, Any], story_repo, source_repo) -> Dict[str, Any]:
    """What the reviewer needs beside the row: who, what, and whether a
    story can start from it today."""
    out: Dict[str, Any] = dict(candidate)
    student = source_repo.student(candidate.get('student_user_id')) if candidate.get('student_user_id') else None
    out['student'] = {'id': candidate.get('student_user_id'), 'display_name': _display_name(student)}
    out['flagged_by_name'] = _display_name(source_repo.student(candidate['flagged_by'])) \
        if candidate.get('flagged_by') else None

    if candidate['target_type'] == 'task_completed':
        completion = source_repo.completion(candidate['target_id']) or {}
        task = source_repo.task(completion.get('user_quest_task_id')) or {}
        quest = (source_repo.quest(completion['quest_id']) or {}) if completion.get('quest_id') else {}
        user_quest_id = task.get('user_quest_id')
        reasons: List[str] = []
        if not completion:
            reasons.append('missing')
        elif completion.get('diploma_status') != 'finalized':
            reasons.append('source_not_finalized')
        if completion.get('is_confidential'):
            reasons.append('confidential')
        quest_status = source_quest.status(user_quest_id, repo=source_repo) if user_quest_id else None
        out['item'] = {
            'title': task.get('title'),
            'quest_title': quest.get('title'),
            'completed_at': completion.get('completed_at'),
            'diploma_status': completion.get('diploma_status'),
        }
        out['sources'] = {
            'credit_submission': {
                'source_id': candidate['target_id'],
                'eligible': not reasons,
                'reasons': reasons,
                'existing_story': _serialize(story_repo.get_by_source('credit_submission', candidate['target_id'])),
            },
            'quest': {
                'source_id': user_quest_id,
                'complete': bool((quest_status or {}).get('complete')),
                'finalized_task_count': (quest_status or {}).get('finalized_task_count', 0),
                'task_count': (quest_status or {}).get('task_count', 0),
                'existing_story': _serialize(story_repo.get_by_source('quest', user_quest_id)) if user_quest_id else None,
            },
        }
    else:
        event = source_repo.learning_event(candidate['target_id']) or {}
        out['item'] = {
            'title': event.get('title') or event.get('ai_generated_title'),
            'description': event.get('description'),
            'pillars': event.get('pillars') or [],
            'event_date': event.get('event_date') or event.get('created_at'),
            'is_confidential': bool(event.get('is_confidential')),
        }
        # A learning moment is not a story source yet (stories Phase 2). The
        # row still shows, so the bookmark is not lost.
        out['sources'] = {}
    return out


@bp.route('/candidates', methods=['GET'])
@require_superadmin
def list_candidates(user_id: str):
    status = request.args.get('status') or 'open'
    if status not in LIST_STATUSES:
        return error_response(code='BAD_REQUEST', message='Invalid status.')
    story_repo, _, source_repo = admin._repos()
    rows = StoryCandidateRepository().list_by_status(status)
    return success_response(data={'candidates': [_enrich(r, story_repo, source_repo) for r in rows]})


@bp.route('/candidates/<candidate_id>', methods=['DELETE'])
@bp.route('/candidates/<candidate_id>/dismiss', methods=['POST'])
@require_superadmin
def dismiss_candidate(user_id: str, candidate_id: str):
    cid = _uuid_or_none(candidate_id, 'candidate_id')
    repo = StoryCandidateRepository()
    if not cid or not repo.get(cid):
        return error_response(code='NOT_FOUND', message='Candidate not found.', status=404)
    row = repo.resolve(cid, 'dismissed')
    return success_response(data={'candidate': row})
