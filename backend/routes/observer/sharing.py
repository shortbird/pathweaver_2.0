"""
Observer Module - Feed Sharing

Generate and resolve share tokens for feed posts.
"""

import secrets
import logging

from flask import request, jsonify
from database import get_supabase_admin_client
from utils.auth.decorators import require_auth
from app_config import Config

logger = logging.getLogger(__name__)


def _check_student_access(supabase, user_id, student_id):
    """Check if user has observer/parent/advisor/superadmin access to a student."""
    user_result = supabase.table('users').select('role').eq('id', user_id).single().execute()
    user_role = user_result.data.get('role') if user_result.data else None

    if user_role == 'superadmin':
        return True

    # Observer link
    link = supabase.table('observer_student_links') \
        .select('id') \
        .eq('observer_id', user_id) \
        .eq('student_id', student_id) \
        .execute()
    if link.data:
        return True

    # Advisor assignment
    if user_role == 'advisor':
        adv = supabase.table('advisor_student_assignments') \
            .select('id') \
            .eq('advisor_id', user_id) \
            .eq('student_id', student_id) \
            .eq('is_active', True) \
            .execute()
        if adv.data:
            return True

    # Parent (dependent)
    dep = supabase.table('users') \
        .select('id') \
        .eq('id', student_id) \
        .eq('managed_by_parent_id', user_id) \
        .execute()
    if dep.data:
        return True

    # Parent (linked 13+)
    linked = supabase.table('parent_student_links') \
        .select('id') \
        .eq('parent_user_id', user_id) \
        .eq('student_user_id', student_id) \
        .eq('status', 'approved') \
        .execute()
    if linked.data:
        return True

    return False


def register_routes(bp):
    """Register routes on the blueprint."""

    @bp.route('/api/observers/feed/share', methods=['POST'])
    @require_auth
    def create_share_token(user_id):
        """Generate a share link for a feed item."""
        try:
            data = request.get_json()
            completion_id = data.get('completion_id')
            learning_event_id = data.get('learning_event_id')

            if not completion_id and not learning_event_id:
                return jsonify({'error': 'completion_id or learning_event_id required'}), 400
            if completion_id and learning_event_id:
                return jsonify({'error': 'Provide only one of completion_id or learning_event_id'}), 400

            supabase = get_supabase_admin_client()

            # Determine student_id and validate the item exists
            if completion_id:
                item = supabase.table('quest_task_completions') \
                    .select('user_id, is_confidential') \
                    .eq('id', completion_id) \
                    .single() \
                    .execute()
                if not item.data:
                    return jsonify({'error': 'Completion not found'}), 404
                if item.data.get('is_confidential'):
                    return jsonify({'error': 'Cannot share confidential content'}), 403
                student_id = item.data['user_id']
            else:
                item = supabase.table('learning_events') \
                    .select('user_id') \
                    .eq('id', learning_event_id) \
                    .single() \
                    .execute()
                if not item.data:
                    return jsonify({'error': 'Learning event not found'}), 404
                student_id = item.data['user_id']

            # Verify access
            if not _check_student_access(supabase, user_id, student_id):
                return jsonify({'error': 'Access denied'}), 403

            # Check for existing token (idempotent)
            if completion_id:
                existing = supabase.table('feed_share_tokens') \
                    .select('token') \
                    .eq('completion_id', completion_id) \
                    .eq('is_active', True) \
                    .limit(1) \
                    .execute()
            else:
                existing = supabase.table('feed_share_tokens') \
                    .select('token') \
                    .eq('learning_event_id', learning_event_id) \
                    .eq('is_active', True) \
                    .limit(1) \
                    .execute()

            if existing.data:
                token = existing.data[0]['token']
            else:
                token = secrets.token_urlsafe(32)
                insert_data = {
                    'token': token,
                    'created_by': user_id,
                    'student_id': student_id,
                }
                if completion_id:
                    insert_data['completion_id'] = completion_id
                else:
                    insert_data['learning_event_id'] = learning_event_id

                supabase.table('feed_share_tokens').insert(insert_data).execute()

            frontend_url = Config.FRONTEND_URL
            share_url = f"{frontend_url}/shared/feed/{token}"

            return jsonify({'share_url': share_url, 'token': token}), 200

        except Exception as e:
            logger.error(f"Failed to create share token: {e}", exc_info=True)
            return jsonify({'error': 'Failed to create share link'}), 500

    @bp.route('/api/public/feed/<token>', methods=['GET'])
    def view_shared_feed_item(token):
        """Public endpoint to view a shared feed post."""
        try:
            supabase = get_supabase_admin_client()

            # Look up token
            result = supabase.table('feed_share_tokens') \
                .select('*') \
                .eq('token', token) \
                .eq('is_active', True) \
                .single() \
                .execute()

            if not result.data:
                return jsonify({'error': 'Share link not found or expired'}), 404

            share = result.data
            student_id = share['student_id']

            # Increment view count
            supabase.table('feed_share_tokens') \
                .update({'view_count': share['view_count'] + 1}) \
                .eq('id', share['id']) \
                .execute()

            # Try to identify the caller (optional auth)
            caller_id = None
            try:
                from utils.session_manager import session_manager
                session_data = session_manager.get_session(request)
                if session_data:
                    caller_id = session_data.get('user_id')
            except Exception:
                pass

            # Check access
            has_access = False
            if caller_id:
                has_access = _check_student_access(supabase, caller_id, student_id)
                # Student can also view their own shared post
                if caller_id == student_id:
                    has_access = True

            if not has_access:
                return jsonify({
                    'access': 'denied',
                    'logged_in': caller_id is not None,
                    'message': 'This post belongs to a student on Optio. To view their learning journey, contact their parent about observer access.'
                }), 200

            # Build the full feed item
            student = supabase.table('users') \
                .select('id, display_name, first_name, last_name, avatar_url') \
                .eq('id', student_id) \
                .single() \
                .execute()
            student_info = student.data or {}

            if share.get('completion_id'):
                return _build_completion_item(supabase, share, student_info, caller_id)
            else:
                return _build_learning_moment_item(supabase, share, student_info, caller_id)

        except Exception as e:
            logger.error(f"Failed to view shared feed item: {e}", exc_info=True)
            return jsonify({'error': 'Failed to load shared post'}), 500


def _build_completion_item(supabase, share, student_info, caller_id):
    """Build a task completion feed item for the shared view."""
    completion_id = share['completion_id']

    completion = supabase.table('quest_task_completions') \
        .select('id, user_id, quest_id, user_quest_task_id, evidence_text, evidence_url, completed_at') \
        .eq('id', completion_id) \
        .single() \
        .execute()

    if not completion.data:
        return jsonify({'error': 'Content no longer available'}), 404

    c = completion.data
    task_info = {}
    if c.get('user_quest_task_id'):
        task = supabase.table('user_quest_tasks') \
            .select('id, title, pillar, xp_value') \
            .eq('id', c['user_quest_task_id']) \
            .single() \
            .execute()
        task_info = task.data or {}

    quest_info = {}
    if c.get('quest_id'):
        quest = supabase.table('quests') \
            .select('id, title') \
            .eq('id', c['quest_id']) \
            .single() \
            .execute()
        quest_info = quest.data or {}

    # Get evidence blocks
    evidence = _get_completion_evidence(supabase, c)

    # Get social counts
    likes_count, user_liked = _get_likes(supabase, completion_id=completion_id, caller_id=caller_id)
    comments_count = _get_comment_count(supabase, completion_id=completion_id)

    item = {
        'type': 'task_completed',
        'id': completion_id,
        'completion_id': completion_id,
        'timestamp': c['completed_at'],
        'student': {
            'id': student_info.get('id'),
            'display_name': student_info.get('display_name') or
                f"{student_info.get('first_name', '')} {student_info.get('last_name', '')}".strip() or 'Student',
            'avatar_url': student_info.get('avatar_url')
        },
        'task': {
            'id': task_info.get('id'),
            'title': task_info.get('title', 'Task'),
            'pillar': task_info.get('pillar'),
            'xp_value': task_info.get('xp_value', 0)
        },
        'quest': {
            'id': quest_info.get('id'),
            'title': quest_info.get('title', 'Quest')
        },
        'evidence': evidence,
        'xp_awarded': task_info.get('xp_value', 0),
        'likes_count': likes_count,
        'comments_count': comments_count,
        'user_has_liked': user_liked
    }

    return jsonify({'access': 'granted', 'item': item}), 200


def _build_learning_moment_item(supabase, share, student_info, caller_id):
    """Build a learning moment feed item for the shared view."""
    le_id = share['learning_event_id']

    event = supabase.table('learning_events') \
        .select('id, user_id, title, description, pillars, created_at, source_type, captured_by_user_id, track_id') \
        .eq('id', le_id) \
        .single() \
        .execute()

    if not event.data:
        return jsonify({'error': 'Content no longer available'}), 404

    e = event.data

    # Get track name
    topic_name = None
    if e.get('track_id'):
        track = supabase.table('interest_tracks') \
            .select('name') \
            .eq('id', e['track_id']) \
            .single() \
            .execute()
        if track.data:
            topic_name = track.data['name']

    # Get evidence blocks
    blocks = supabase.table('learning_event_evidence_blocks') \
        .select('id, block_type, content, file_url, file_name, order_index') \
        .eq('learning_event_id', le_id) \
        .order('order_index') \
        .execute()

    media_items = []
    primary_evidence = None
    for block in (blocks.data or []):
        content = block.get('content', {})
        media_item = None
        if block['block_type'] == 'image':
            media_item = {'type': 'image', 'url': content.get('url') or block.get('file_url'), 'title': None}
        elif block['block_type'] == 'video':
            media_item = {'type': 'video', 'url': content.get('url') or block.get('file_url'), 'title': content.get('title')}
        elif block['block_type'] == 'link':
            media_item = {'type': 'link', 'url': content.get('url'), 'title': content.get('title')}
        elif block['block_type'] == 'document':
            media_item = {'type': 'document', 'url': content.get('url') or block.get('file_url'), 'title': content.get('title') or block.get('file_name')}

        if media_item and media_item.get('url'):
            media_items.append(media_item)
            if primary_evidence is None:
                primary_evidence = {'type': media_item['type'], 'preview': media_item['url'], 'title': media_item.get('title')}

    description = e.get('description', '')

    # Social counts
    likes_count, user_liked = _get_likes(supabase, learning_event_id=le_id, caller_id=caller_id)
    comments_count = _get_comment_count(supabase, learning_event_id=le_id)

    item = {
        'type': 'learning_moment',
        'id': f"le_{le_id}",
        'learning_event_id': le_id,
        'timestamp': e['created_at'],
        'student': {
            'id': student_info.get('id'),
            'display_name': student_info.get('display_name') or
                f"{student_info.get('first_name', '')} {student_info.get('last_name', '')}".strip() or 'Student',
            'avatar_url': student_info.get('avatar_url')
        },
        'moment': {
            'title': e.get('title') or 'Learning Moment',
            'description': description,
            'pillars': e.get('pillars', []),
            'topic_name': topic_name,
            'source_type': e.get('source_type', 'realtime'),
            'captured_by_user_id': e.get('captured_by_user_id')
        },
        'evidence': {
            'type': primary_evidence['type'] if primary_evidence else ('text' if description else None),
            'url': primary_evidence['preview'] if primary_evidence else None,
            'preview_text': description if not primary_evidence or primary_evidence['type'] == 'text' else None,
            'title': primary_evidence.get('title') if primary_evidence else None
        },
        'media': media_items,
        'likes_count': likes_count,
        'comments_count': comments_count,
        'user_has_liked': user_liked
    }

    return jsonify({'access': 'granted', 'item': item}), 200


def _get_completion_evidence(supabase, completion):
    """Get the primary evidence for a completion."""
    task_id = completion.get('user_quest_task_id')
    user_id = completion.get('user_id')

    # Check for multi-format evidence
    if task_id:
        doc = supabase.table('user_task_evidence_documents') \
            .select('id') \
            .eq('task_id', task_id) \
            .eq('user_id', user_id) \
            .eq('status', 'completed') \
            .limit(1) \
            .execute()

        if doc.data:
            blocks = supabase.table('evidence_document_blocks') \
                .select('block_type, content, order_index') \
                .eq('document_id', doc.data[0]['id']) \
                .eq('is_private', False) \
                .order('order_index') \
                .limit(1) \
                .execute()

            if blocks.data:
                block = blocks.data[0]
                content = block.get('content', {})
                items = content.get('items', [])
                url = items[0].get('url') if items else content.get('url')

                if block['block_type'] == 'image':
                    return {'type': 'image', 'url': url, 'preview_text': None, 'title': None}
                elif block['block_type'] == 'video':
                    return {'type': 'video', 'url': url, 'preview_text': None, 'title': content.get('title')}
                elif block['block_type'] == 'link':
                    return {'type': 'link', 'url': url, 'preview_text': None, 'title': content.get('title')}
                elif block['block_type'] == 'text':
                    return {'type': 'text', 'url': None, 'preview_text': content.get('text', ''), 'title': None}
                elif block['block_type'] == 'document':
                    return {'type': 'document', 'url': url, 'preview_text': None, 'title': content.get('title') or content.get('filename')}

    # Legacy evidence
    if completion.get('evidence_url'):
        url = completion['evidence_url']
        lower = url.lower()
        if any(lower.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
            return {'type': 'image', 'url': url, 'preview_text': None, 'title': None}
        elif any(d in lower for d in ['youtube.com', 'youtu.be', 'vimeo.com']):
            return {'type': 'video', 'url': url, 'preview_text': None, 'title': None}
        else:
            return {'type': 'link', 'url': url, 'preview_text': None, 'title': None}

    if completion.get('evidence_text') and 'Multi-format evidence document' not in completion.get('evidence_text', ''):
        return {'type': 'text', 'url': None, 'preview_text': completion['evidence_text'], 'title': None}

    return {'type': None, 'url': None, 'preview_text': None, 'title': None}


def _get_likes(supabase, completion_id=None, learning_event_id=None, caller_id=None):
    """Get like count and whether caller has liked."""
    try:
        query = supabase.table('observer_likes').select('observer_id')
        if completion_id:
            query = query.eq('completion_id', completion_id)
        elif learning_event_id:
            query = query.eq('learning_event_id', learning_event_id)
        else:
            return 0, False

        likes = query.execute()
        count = len(likes.data) if likes.data else 0
        user_liked = caller_id and any(l['observer_id'] == caller_id for l in (likes.data or []))
        return count, bool(user_liked)
    except Exception:
        return 0, False


def _get_comment_count(supabase, completion_id=None, learning_event_id=None):
    """Get comment count for an item."""
    try:
        query = supabase.table('observer_comments').select('id')
        if completion_id:
            query = query.eq('task_completion_id', completion_id)
        elif learning_event_id:
            query = query.eq('learning_event_id', learning_event_id)
        else:
            return 0

        comments = query.execute()
        return len(comments.data) if comments.data else 0
    except Exception:
        return 0
