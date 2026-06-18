"""
Observer Module - Feed Highlights

Superadmin curates a highlight reel from the feed — items pinned here are
returned by /api/observers/feed?highlights_only=true and rendered as the
Highlights feed (the demo "show-off / FYP" view).
"""

from flask import request, jsonify
import logging

from database import get_supabase_admin_client
from utils.auth.decorators import require_auth

logger = logging.getLogger(__name__)

VALID_TARGET_TYPES = ('task_completed', 'learning_moment')


def _strip_le_prefix(target_type: str, target_id):
    """Client sends learning_moment ids as 'le_<uuid>' (matches the feed item
    id shape). The DB stores the raw learning_events.id, so strip the prefix
    before persisting / querying."""
    if (
        target_type == 'learning_moment'
        and isinstance(target_id, str)
        and target_id.startswith('le_')
    ):
        return target_id[3:]
    return target_id


def register_routes(bp):
    """Register routes on the blueprint."""

    @bp.route('/api/observers/feed/highlights/toggle', methods=['POST'])
    @require_auth
    def toggle_feed_highlight(user_id):
        """
        Toggle whether a feed item is on the superadmin-curated highlight reel.

        Body:
            target_type: 'task_completed' or 'learning_moment'
            target_id:   completion_id (task_completed) or learning_event_id
                         (learning_moment, with or without the 'le_' prefix)
            on:          (optional) explicit desired state — true = add to reel,
                         false = remove. If omitted, the row is toggled.

        Returns:
            200: { success: true, is_highlighted: bool }
            400: invalid target_type / missing target_id
            403: not a superadmin
        """
        # admin client justified: superadmin moderation write on a global table; auth gate enforced explicitly below
        supabase = get_supabase_admin_client()

        # Superadmin-only gate. Org-managed superadmin not supported — superadmin
        # is always a platform user per CLAUDE.md.
        user_row = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user_row.data or user_row.data.get('role') != 'superadmin':
            return jsonify({'error': 'Forbidden'}), 403

        data = request.get_json(silent=True) or {}
        target_type = data.get('target_type')
        target_id = data.get('target_id')
        on = data.get('on')

        if target_type not in VALID_TARGET_TYPES:
            return jsonify({'error': 'Invalid target_type'}), 400
        if not target_id:
            return jsonify({'error': 'target_id required'}), 400

        target_id = _strip_le_prefix(target_type, target_id)

        try:
            existing = supabase.table('feed_highlights') \
                .select('id') \
                .eq('target_type', target_type) \
                .eq('target_id', target_id) \
                .execute()
            has_row = bool(existing.data)

            # Toggle when `on` is omitted.
            if on is None:
                on = not has_row
            on = bool(on)

            if on and not has_row:
                supabase.table('feed_highlights').insert({
                    'target_type': target_type,
                    'target_id': target_id,
                    'created_by_user_id': user_id,
                }).execute()
            elif not on and has_row:
                supabase.table('feed_highlights') \
                    .delete() \
                    .eq('target_type', target_type) \
                    .eq('target_id', target_id) \
                    .execute()

            return jsonify({'success': True, 'is_highlighted': on}), 200

        except Exception as e:
            logger.error(f"Failed to toggle feed highlight: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to toggle highlight'}), 500
