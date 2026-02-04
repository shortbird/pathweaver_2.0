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
                                'evidence_preview': evidence_preview
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
                        if any(url.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
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
                            'evidence_preview': evidence_preview
                        })

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
                    'comments_count': comments_count.get(item['completion_id'], 0)
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
