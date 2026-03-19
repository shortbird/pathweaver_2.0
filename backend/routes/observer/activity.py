"""
Observer Module - Activity Feed

Student activity feed for observers.
"""

from flask import request, jsonify
from datetime import datetime, timedelta
import logging

from database import get_supabase_admin_client, get_user_client
from utils.auth.decorators import require_auth, validate_uuid_param
from middleware.rate_limiter import rate_limit
from services.observer_audit_service import ObserverAuditService

logger = logging.getLogger(__name__)


def register_routes(bp):
    """Register routes on the blueprint."""
    @bp.route('/api/observers/student/<student_id>/activity', methods=['GET'])
    @require_auth
    @validate_uuid_param('student_id')
    def get_student_activity_feed(user_id, student_id):
        """
        Student views their own activity feed (same format as observer feed)

        Shows completed tasks with evidence, likes, and comments.
        Only accessible by the student themselves.

        Args:
            user_id: UUID of authenticated user (from @require_auth)
            student_id: UUID of student

        Query params:
            limit: (optional) Number of items, default 20
            cursor: (optional) Pagination cursor

        Returns:
            200: Paginated feed of student's activities
            403: Access denied (not viewing own feed)
        """
        # Only allow students to view their own activity
        if user_id != student_id:
            return jsonify({'error': 'Access denied'}), 403

        limit = min(int(request.args.get('limit', 20)), 50)
        cursor = request.args.get('cursor')

        try:
            supabase = get_supabase_admin_client()

            # Get student's completed tasks
            query = supabase.table('quest_task_completions') \
                .select('id, user_id, quest_id, user_quest_task_id, completed_at, evidence_url, evidence_text, is_confidential') \
                .eq('user_id', student_id) \
                .order('completed_at', desc=True) \
                .limit(limit + 1)

            if cursor:
                query = query.lt('completed_at', cursor)

            completions = query.execute()

            if not completions.data:
                return jsonify({'items': [], 'has_more': False}), 200

            # Get task details
            task_ids = list(set([c['user_quest_task_id'] for c in completions.data if c['user_quest_task_id']]))
            tasks_map = {}
            if task_ids:
                tasks = supabase.table('user_quest_tasks') \
                    .select('id, title, pillar, xp_value') \
                    .in_('id', task_ids) \
                    .execute()
                tasks_map = {t['id']: t for t in tasks.data}

            # Get quest details
            quest_ids = list(set([c['quest_id'] for c in completions.data if c['quest_id']]))
            quests_map = {}
            if quest_ids:
                quests = supabase.table('quests') \
                    .select('id, title') \
                    .in_('id', quest_ids) \
                    .execute()
                quests_map = {q['id']: q for q in quests.data}

            # Get evidence document blocks for multi-format evidence
            evidence_docs = supabase.table('user_task_evidence_documents') \
                .select('id, task_id, user_id, status') \
                .in_('task_id', task_ids) \
                .eq('user_id', student_id) \
                .eq('status', 'completed') \
                .execute()

            doc_map = {}
            doc_ids = []
            for doc in evidence_docs.data:
                key = f"{doc['task_id']}_{doc['user_id']}"
                doc_map[key] = doc['id']
                doc_ids.append(doc['id'])

            evidence_blocks_map = {}
            if doc_ids:
                blocks = supabase.table('evidence_document_blocks') \
                    .select('id, document_id, block_type, content, order_index, created_at, is_private') \
                    .in_('document_id', doc_ids) \
                    .eq('is_private', False) \
                    .order('order_index') \
                    .execute()

                for block in blocks.data:
                    doc_id = block['document_id']
                    if doc_id not in evidence_blocks_map:
                        evidence_blocks_map[doc_id] = []
                    evidence_blocks_map[doc_id].append(block)

            # Build feed items - one per evidence block
            raw_feed_items = []
            for completion in completions.data:
                task_info = tasks_map.get(completion['user_quest_task_id'], {})
                quest_info = quests_map.get(completion['quest_id'], {})

                doc_key = f"{completion['user_quest_task_id']}_{completion['user_id']}"
                doc_id = doc_map.get(doc_key)

                if doc_id and doc_id in evidence_blocks_map:
                    for block in evidence_blocks_map[doc_id]:
                        evidence_type = None
                        evidence_preview = None
                        content = block.get('content', {})

                        if block['block_type'] == 'image':
                            evidence_type = 'image'
                            evidence_preview = content.get('url')
                        elif block['block_type'] == 'video':
                            evidence_type = 'video'
                            evidence_preview = content.get('url')
                        elif block['block_type'] == 'link':
                            evidence_type = 'link'
                            evidence_preview = content.get('url')
                        elif block['block_type'] == 'text':
                            evidence_type = 'text'
                            text = content.get('text', '')
                            evidence_preview = text[:200] + '...' if len(text) > 200 else text
                        elif block['block_type'] == 'document':
                            evidence_type = 'link'
                            evidence_preview = content.get('url')

                        if evidence_type:
                            raw_feed_items.append({
                                'id': f"{completion['id']}_{block['id']}",
                                'completion_id': completion['id'],
                                'block_id': block['id'],
                                'timestamp': block.get('created_at') or completion['completed_at'],
                                'task_id': completion['user_quest_task_id'],
                                'task_title': task_info.get('title', 'Task'),
                                'task_pillar': task_info.get('pillar'),
                                'task_xp': task_info.get('xp_value', 0),
                                'quest_id': completion['quest_id'],
                                'quest_title': quest_info.get('title', 'Quest'),
                                'evidence_type': evidence_type,
                                'evidence_preview': evidence_preview,
                                'is_confidential': completion.get('is_confidential', False)
                            })
                else:
                    # Fallback: legacy evidence
                    evidence_text = completion.get('evidence_text', '')
                    if evidence_text and 'Multi-format evidence document' in evidence_text:
                        continue

                    evidence_type = None
                    evidence_preview = None

                    if completion.get('evidence_url'):
                        url = completion['evidence_url'].lower()
                        if any(url.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']):
                            evidence_type = 'image'
                            evidence_preview = completion['evidence_url']
                        elif 'youtube.com' in url or 'youtu.be' in url or 'vimeo.com' in url:
                            evidence_type = 'video'
                            evidence_preview = completion['evidence_url']
                        else:
                            evidence_type = 'link'
                            evidence_preview = completion['evidence_url']
                    elif evidence_text:
                        evidence_type = 'text'
                        evidence_preview = evidence_text[:200] + '...' if len(evidence_text) > 200 else evidence_text

                    if evidence_type:
                        raw_feed_items.append({
                            'id': completion['id'],
                            'completion_id': completion['id'],
                            'block_id': None,
                            'timestamp': completion['completed_at'],
                            'task_id': completion['user_quest_task_id'],
                            'task_title': task_info.get('title', 'Task'),
                            'task_pillar': task_info.get('pillar'),
                            'task_xp': task_info.get('xp_value', 0),
                            'quest_id': completion['quest_id'],
                            'quest_title': quest_info.get('title', 'Quest'),
                            'evidence_type': evidence_type,
                            'evidence_preview': evidence_preview,
                            'is_confidential': completion.get('is_confidential', False)
                        })

            # Include bounty completion learning events
            try:
                bounty_events_q = supabase.table('learning_events') \
                    .select('id, title, description, pillars, created_at') \
                    .eq('user_id', student_id) \
                    .like('title', 'Bounty:%') \
                    .order('created_at', desc=True) \
                    .limit(limit)

                if cursor:
                    bounty_events_q = bounty_events_q.lt('created_at', cursor)

                bounty_events = bounty_events_q.execute()

                if bounty_events.data:
                    be_ids = [e['id'] for e in bounty_events.data]
                    be_blocks = supabase.table('learning_event_evidence_blocks') \
                        .select('id, learning_event_id, block_type, content, order_index, created_at') \
                        .in_('learning_event_id', be_ids) \
                        .order('order_index') \
                        .execute()

                    be_blocks_map = {}
                    for block in (be_blocks.data or []):
                        eid = block['learning_event_id']
                        if eid not in be_blocks_map:
                            be_blocks_map[eid] = []
                        be_blocks_map[eid].append(block)

                    for event in bounty_events.data:
                        blocks = be_blocks_map.get(event['id'], [])
                        if blocks:
                            for block in blocks:
                                content = block.get('content', {})
                                evidence_type = None
                                evidence_preview = None

                                if block['block_type'] == 'image':
                                    evidence_type = 'image'
                                    evidence_preview = content.get('url')
                                elif block['block_type'] == 'video':
                                    evidence_type = 'video'
                                    evidence_preview = content.get('url')
                                elif block['block_type'] == 'link':
                                    evidence_type = 'link'
                                    evidence_preview = content.get('url')
                                elif block['block_type'] == 'text':
                                    evidence_type = 'text'
                                    text = content.get('text', '')
                                    evidence_preview = text[:200] + '...' if len(text) > 200 else text
                                elif block['block_type'] == 'document':
                                    evidence_type = 'link'
                                    evidence_preview = content.get('url')

                                if evidence_type:
                                    raw_feed_items.append({
                                        'id': f"bounty_{event['id']}_{block['id']}",
                                        'completion_id': event['id'],
                                        'block_id': block['id'],
                                        'timestamp': block.get('created_at') or event['created_at'],
                                        'task_id': None,
                                        'task_title': event.get('title', 'Bounty'),
                                        'task_pillar': (event.get('pillars') or ['stem'])[0] if event.get('pillars') else 'stem',
                                        'task_xp': 0,
                                        'quest_id': None,
                                        'quest_title': 'Bounty Board',
                                        'evidence_type': evidence_type,
                                        'evidence_preview': evidence_preview,
                                        'is_confidential': False,
                                        'is_bounty': True,
                                    })
                        else:
                            # No evidence blocks -- show the description as text
                            raw_feed_items.append({
                                'id': f"bounty_{event['id']}",
                                'completion_id': event['id'],
                                'block_id': None,
                                'timestamp': event['created_at'],
                                'task_id': None,
                                'task_title': event.get('title', 'Bounty'),
                                'task_pillar': (event.get('pillars') or ['stem'])[0] if event.get('pillars') else 'stem',
                                'task_xp': 0,
                                'quest_id': None,
                                'quest_title': 'Bounty Board',
                                'evidence_type': 'text',
                                'evidence_preview': event.get('description', ''),
                                'is_confidential': False,
                                'is_bounty': True,
                            })
            except Exception as e:
                logger.warning(f"Failed to fetch bounty learning events for feed: {e}")

            # Sort and paginate
            raw_feed_items.sort(key=lambda x: x['timestamp'], reverse=True)
            has_more = len(raw_feed_items) > limit
            paginated_items = raw_feed_items[:limit]

            # Get like counts
            completion_ids = list(set([item['completion_id'] for item in paginated_items]))
            likes_count = {}
            try:
                if completion_ids:
                    likes = supabase.table('observer_likes') \
                        .select('completion_id') \
                        .in_('completion_id', completion_ids) \
                        .execute()

                    for like in likes.data:
                        likes_count[like['completion_id']] = likes_count.get(like['completion_id'], 0) + 1
            except Exception:
                pass

            # Get comment counts
            comments_count = {}
            try:
                if completion_ids:
                    comments = supabase.table('observer_comments') \
                        .select('task_completion_id') \
                        .in_('task_completion_id', completion_ids) \
                        .execute()

                    for comment in comments.data:
                        if comment['task_completion_id']:
                            comments_count[comment['task_completion_id']] = comments_count.get(comment['task_completion_id'], 0) + 1
            except Exception:
                pass

            # Build final feed items
            feed_items = []
            for item in paginated_items:
                feed_items.append({
                    'type': 'task_completed',
                    'id': item['id'],
                    'completion_id': item['completion_id'],
                    'timestamp': item['timestamp'],
                    'task': {
                        'id': item['task_id'],
                        'title': item['task_title'],
                        'pillar': item['task_pillar'],
                        'xp_value': item['task_xp']
                    },
                    'quest': {
                        'id': item['quest_id'],
                        'title': item['quest_title']
                    },
                    'evidence': {
                        'type': item['evidence_type'],
                        'url': item['evidence_preview'] if item['evidence_type'] != 'text' else None,
                        'preview_text': item['evidence_preview'] if item['evidence_type'] == 'text' else None,
                        'title': item.get('evidence_title')
                    },
                    'xp_awarded': item['task_xp'],
                    'likes_count': likes_count.get(item['completion_id'], 0),
                    'comments_count': comments_count.get(item['completion_id'], 0),
                    'is_confidential': item.get('is_confidential', False)
                })

            next_cursor = paginated_items[-1]['timestamp'] if paginated_items and has_more else None

            return jsonify({
                'items': feed_items,
                'has_more': has_more,
                'next_cursor': next_cursor
            }), 200

        except Exception as e:
            logger.error(f"Failed to fetch student activity feed: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch activity feed'}), 500

    @bp.route('/api/observers/feed-item/toggle-visibility', methods=['POST'])
    @require_auth
    def toggle_feed_item_visibility(user_id):
        """
        Student toggles visibility of a feed item for observers.

        Sets is_confidential on the completion or learning event.
        When is_confidential=true, the item is hidden from the observer feed.

        Body:
            completion_id: UUID (for task completions)
            learning_event_id: UUID (for learning moments)
            hidden: boolean (true = hide from observers)

        Returns:
            200: { status: success, hidden: bool }
        """
        data = request.json or {}
        completion_id = data.get('completion_id')
        learning_event_id = data.get('learning_event_id')
        hidden = data.get('hidden', True)

        if not completion_id and not learning_event_id:
            return jsonify({'error': 'completion_id or learning_event_id is required'}), 400

        try:
            supabase = get_supabase_admin_client()

            if completion_id:
                # Verify ownership
                record = supabase.table('quest_task_completions') \
                    .select('id') \
                    .eq('id', completion_id) \
                    .eq('user_id', user_id) \
                    .execute()

                if not record.data:
                    return jsonify({'error': 'Completion not found'}), 404

                supabase.table('quest_task_completions') \
                    .update({'is_confidential': hidden}) \
                    .eq('id', completion_id) \
                    .execute()

            elif learning_event_id:
                # Verify ownership
                record = supabase.table('learning_events') \
                    .select('id') \
                    .eq('id', learning_event_id) \
                    .eq('user_id', user_id) \
                    .execute()

                if not record.data:
                    return jsonify({'error': 'Learning event not found'}), 404

                supabase.table('learning_events') \
                    .update({'is_confidential': hidden}) \
                    .eq('id', learning_event_id) \
                    .execute()

            logger.info(f"Feed item visibility toggled: user={user_id}, hidden={hidden}")

            return jsonify({'status': 'success', 'hidden': hidden}), 200

        except Exception as e:
            logger.error(f"Failed to toggle feed item visibility: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to update visibility'}), 500
