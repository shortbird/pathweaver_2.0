"""Cron entrypoints for stories.

- POST /api/admin/stories/internal/rebuild-sweep   every tick: fire deferred
                                                    rebuilds, requeue stale drafts
- POST /api/admin/stories/internal/nightly         reconcile the bucket with the
                                                    rows; rebuild if anything changed

Auth via X-Cron-Secret, or a signed-in superadmin for manual triggering: the
same dual gate as the AI review sweep (routes/credit_dashboard/ai_review.py).
Both return before any model call; the drafts they start run on a thread.
"""

from __future__ import annotations

from flask import jsonify, request

from utils.logger import get_logger

from services import marketing_site
from services.stories import generate, publish

from . import admin_stories_bp as bp

logger = get_logger(__name__)


def _authorized() -> bool:
    from utils.cron_auth import is_valid_cron_secret

    if is_valid_cron_secret(request.headers.get('X-Cron-Secret')):
        return True
    from utils.session_manager import session_manager
    uid = session_manager.get_effective_user_id()
    return bool(uid and _is_superadmin(uid))


def _is_superadmin(user_id: str) -> bool:
    """The role lookup IS the access check, so it reads through the repository
    the story worker already uses rather than the caller's RLS view."""
    try:
        from repositories.story_source_repository import StorySourceRepository
        row = StorySourceRepository().student(user_id)
        return isinstance(row, dict) and row.get('role') == 'superadmin'
    except Exception as e:  # noqa: BLE001
        logger.warning(f'Could not check superadmin for the stories sweep: {e}')
        return False


@bp.route('/internal/rebuild-sweep', methods=['POST'])
def rebuild_sweep():
    if not _authorized():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    drafts = generate.sweep()
    rebuilds = marketing_site.fire_pending()
    return jsonify({'success': True, 'drafts': drafts, 'rebuilds': rebuilds})


@bp.route('/internal/nightly', methods=['POST'])
def nightly():
    if not _authorized():
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    from repositories.marketing_rebuild_repository import MarketingRebuildRepository
    from repositories.story_repository import StoryRepository

    counts = publish.reconcile()
    rebuilt = None
    latest = StoryRepository().max_updated_at_published()
    last_fired = MarketingRebuildRepository().last_fired_at()
    if latest and (not last_fired or str(latest) > str(last_fired)):
        rebuilt = marketing_site.request_rebuild('nightly_changed')
    return jsonify({'success': True, 'reconcile': counts, 'rebuild': rebuilt})
