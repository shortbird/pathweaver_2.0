"""The public stories feed the marketing site builds from.

- GET /api/public/stories          {success, stories: [...]} newest first
- GET /api/public/stories/<slug>   {success, story} or 404

No auth. Every object is `publish.public_view`, an allowlist built field by
field: no student id, no source id, no private pointer, no AI notes. A story
that is not `published` does not exist here. Five minutes of cache: the
static site fetches once per build, and a crawler hitting the JSON directly
should not be able to make the database work for it.
"""

from __future__ import annotations

from typing import Any, Dict, List

from flask import jsonify, request

from utils.logger import get_logger

from services.stories import publish

from . import public_stories_bp as bp

logger = get_logger(__name__)

CACHE_CONTROL = 'public, max-age=300'


def _cached(payload: Dict[str, Any], status: int = 200):
    response = jsonify(payload)
    response.headers['Cache-Control'] = CACHE_CONTROL
    return response, status


def _preview_requested() -> bool:
    """``?preview=1`` shows review-status stories with signed media. Never in production.

    The flag is for a developer's own marketing dev server reading their own
    local API. In production it is ignored, not refused, so a stray link
    simply sees the published list.
    """
    from app_config import Config
    if Config.FLASK_ENV == 'production':
        return False
    return request.args.get('preview') in ('1', 'true')


def _assets_by_story(asset_repo, story_ids: List[str]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for asset in asset_repo.for_stories(story_ids):
        grouped.setdefault(asset.get('story_id'), []).append(asset)
    return grouped


@bp.route('', methods=['GET'])
@bp.route('/', methods=['GET'])
def list_stories():
    from repositories.story_asset_repository import StoryAssetRepository
    from repositories.story_repository import StoryRepository

    preview = _preview_requested()
    try:
        repo = StoryRepository()
        rows = repo.list_previewable() if preview else repo.list_published()
        grouped = _assets_by_story(StoryAssetRepository(), [r['id'] for r in rows])
        stories = [publish.public_view(r, grouped.get(r['id'], []), preview=preview) for r in rows]
    except Exception as e:  # noqa: BLE001
        logger.error(f'Public stories list failed: {e}')
        return jsonify({'success': False, 'error': 'Stories are unavailable.'}), 500
    return _cached({'success': True, 'stories': stories})


@bp.route('/<slug>', methods=['GET'])
def get_story(slug: str):
    from repositories.story_asset_repository import StoryAssetRepository
    from repositories.story_repository import StoryRepository

    preview = _preview_requested()
    try:
        row = StoryRepository().get_by_slug(slug)
        allowed = ('published', 'review') if preview else ('published',)
        if not row or row.get('status') not in allowed:
            return _cached({'success': False, 'error': 'Story not found.'}, 404)
        assets = StoryAssetRepository().for_story(row['id'])
        story = publish.public_view(row, assets, preview=preview)
    except Exception as e:  # noqa: BLE001
        logger.error(f'Public story read failed: {e}')
        return jsonify({'success': False, 'error': 'Stories are unavailable.'}), 500
    return _cached({'success': True, 'story': story})
