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
        # Allow viewing own activity, or parent/observer viewing linked student
        if user_id != student_id:
            # Check if user has parent/observer access to this student
            try:
                # admin client justified: cross-user access check (superadmin / dependent / parent_student_links / observer_student_links) before granting student-activity feed access
                supabase_check = get_supabase_admin_client()
                # Check superadmin
                user_resp = supabase_check.table('users').select('role').eq('id', user_id).single().execute()
                if not user_resp.data or user_resp.data.get('role') != 'superadmin':
                    # Check dependent relationship
                    student_resp = supabase_check.table('users').select('is_dependent, managed_by_parent_id').eq('id', student_id).single().execute()
                    is_dependent = student_resp.data and student_resp.data.get('is_dependent') and student_resp.data.get('managed_by_parent_id') == user_id
                    if not is_dependent:
                        # Check parent_student_links
                        link_resp = supabase_check.table('parent_student_links').select('id').eq('parent_user_id', user_id).eq('student_user_id', student_id).eq('status', 'approved').limit(1).execute()
                        if not link_resp.data:
                            # Check observer_student_links
                            obs_resp = supabase_check.table('observer_student_links').select('id').eq('observer_id', user_id).eq('student_id', student_id).limit(1).execute()
                            if not obs_resp.data:
                                return jsonify({'error': 'Access denied'}), 403
            except Exception as e:
                logger.error(f"Error checking parent/observer access: {e}")
                return jsonify({'error': 'Access denied'}), 403

        limit = min(int(request.args.get('limit', 20)), 50)
        cursor = request.args.get('cursor')

        try:
            # admin client justified: relationship gate above grants access; reads cross-user activity feed (quest_task_completions + learning_events + evidence blocks) and writes feed-item visibility toggle on user's own rows
            supabase = get_supabase_admin_client()

            # Get student profile for feed display
            student_profile = supabase.table('users') \
                .select('id, display_name, first_name, last_name, avatar_url') \
                .eq('id', student_id) \
                .single() \
                .execute()
            student_info = student_profile.data or {}

            # Get student's completed tasks
            query = supabase.table('quest_task_completions') \
                .select('id, user_id, quest_id, user_quest_task_id, completed_at, evidence_url, evidence_text, is_confidential') \
                .eq('user_id', student_id) \
                .order('completed_at', desc=True) \
                .limit(limit + 1)

            if cursor:
                query = query.lt('completed_at', cursor)

            completions = query.execute()

            # Get ALL learning events for this student (journal entries, bounties, etc.)
            learning_events_query = supabase.table('learning_events') \
                .select('id, user_id, title, description, pillars, created_at, source_type, captured_by_user_id, track_id, is_confidential') \
                .eq('user_id', student_id) \
                .order('created_at', desc=True) \
                .limit(limit + 1)

            if cursor:
                learning_events_query = learning_events_query.lt('created_at', cursor)

            learning_events = learning_events_query.execute()

            if not completions.data and not learning_events.data:
                return jsonify({'items': [], 'has_more': False}), 200

            # Get task details
            task_ids = list(set([c['user_quest_task_id'] for c in (completions.data or []) if c['user_quest_task_id']]))
            tasks_map = {}
            if task_ids:
                tasks = supabase.table('user_quest_tasks') \
                    .select('id, title, pillar, xp_value') \
                    .in_('id', task_ids) \
                    .execute()
                tasks_map = {t['id']: t for t in tasks.data}

            # Get quest details
            quest_ids = list(set([c['quest_id'] for c in (completions.data or []) if c['quest_id']]))
            quests_map = {}
            if quest_ids:
                quests = supabase.table('quests') \
                    .select('id, title') \
                    .in_('id', quest_ids) \
                    .execute()
                quests_map = {q['id']: q for q in quests.data}

            # Get track names for learning events
            track_ids = list(set([e['track_id'] for e in (learning_events.data or []) if e.get('track_id')]))
            tracks_map = {}
            if track_ids:
                tracks = supabase.table('interest_tracks') \
                    .select('id, name') \
                    .in_('id', track_ids) \
                    .execute()
                tracks_map = {t['id']: t['name'] for t in tracks.data}

            # Get evidence document blocks for multi-format evidence
            evidence_docs_data = []
            if task_ids:
                evidence_docs = supabase.table('user_task_evidence_documents') \
                    .select('id, task_id, user_id, status') \
                    .in_('task_id', task_ids) \
                    .eq('user_id', student_id) \
                    .eq('status', 'completed') \
                    .execute()
                evidence_docs_data = evidence_docs.data or []

            doc_map = {}
            doc_ids = []
            for doc in evidence_docs_data:
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

            # Get evidence blocks for learning events
            learning_event_ids = [e['id'] for e in learning_events.data] if learning_events.data else []
            learning_event_blocks_map = {}
            if learning_event_ids:
                le_blocks = supabase.table('learning_event_evidence_blocks') \
                    .select('id, learning_event_id, block_type, content, order_index, created_at, file_url, file_name') \
                    .in_('learning_event_id', learning_event_ids) \
                    .order('order_index') \
                    .execute()

                for block in le_blocks.data:
                    le_id = block['learning_event_id']
                    if le_id not in learning_event_blocks_map:
                        learning_event_blocks_map[le_id] = []
                    learning_event_blocks_map[le_id].append(block)

            # Build feed items from task completions
            raw_feed_items = []
            for completion in (completions.data or []):
                task_info = tasks_map.get(completion['user_quest_task_id'], {})
                quest_info = quests_map.get(completion['quest_id'], {})

                doc_key = f"{completion['user_quest_task_id']}_{completion['user_id']}"
                doc_id = doc_map.get(doc_key)

                if doc_id and doc_id in evidence_blocks_map:
                    for block in evidence_blocks_map[doc_id]:
                        evidence_type = None
                        evidence_preview = None
                        content = block.get('content', {})

                        url = content.get('url', '')
                        is_heic = url.lower().endswith('.heic') or url.lower().endswith('.heif') if url else False

                        if block['block_type'] == 'image' or is_heic:
                            evidence_type = 'image'
                            evidence_preview = url
                        elif block['block_type'] == 'video':
                            evidence_type = 'video'
                            evidence_preview = url
                        elif block['block_type'] == 'link':
                            evidence_type = 'link'
                            evidence_preview = url
                        elif block['block_type'] == 'text':
                            evidence_type = 'text'
                            text = content.get('text', '')
                            evidence_preview = text[:200] + '...' if len(text) > 200 else text
                        elif block['block_type'] == 'document':
                            evidence_type = 'link'
                            evidence_preview = url

                        if evidence_type:
                            raw_feed_items.append({
                                'id': f"{completion['id']}_{block['id']}",
                                'item_type': 'task_completed',
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
                            'item_type': 'task_completed',
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

            # Build feed items from learning events (journal entries, bounties, etc.)
            for event in (learning_events.data or []):
                event_blocks = learning_event_blocks_map.get(event['id'], [])

                # Collect all media items
                media_items = []
                primary_evidence = None

                if event_blocks:
                    for block in event_blocks:
                        content = block.get('content', {})
                        media_item = None

                        if block['block_type'] == 'image':
                            media_item = {
                                'type': 'image',
                                'url': content.get('url') or block.get('file_url'),
                                'title': None
                            }
                        elif block['block_type'] == 'video':
                            media_item = {
                                'type': 'video',
                                'url': content.get('url') or block.get('file_url'),
                                'title': content.get('title'),
                                'thumbnail_url': content.get('thumbnail_url'),
                                'duration_seconds': content.get('duration_seconds'),
                            }
                        elif block['block_type'] == 'link':
                            media_item = {
                                'type': 'link',
                                'url': content.get('url'),
                                'title': content.get('title')
                            }
                        elif block['block_type'] == 'document':
                            media_item = {
                                'type': 'document',
                                'url': content.get('url') or block.get('file_url'),
                                'title': content.get('title') or content.get('filename') or block.get('file_name')
                            }

                        if media_item and media_item.get('url'):
                            media_items.append(media_item)
                            if primary_evidence is None:
                                primary_evidence = {
                                    'type': media_item['type'],
                                    'preview': media_item['url'],
                                    'title': media_item.get('title')
                                }

                description = event.get('description', '')

                # Only add if we have media or description
                if media_items or description:
                    raw_feed_items.append({
                        'id': f"le_{event['id']}",
                        'item_type': 'learning_moment',
                        'learning_event_id': event['id'],
                        'block_id': None,
                        'timestamp': event['created_at'],
                        'event_title': event.get('title') or 'Learning Moment',
                        'event_description': description,
                        'event_pillars': event.get('pillars', []),
                        'topic_name': tracks_map.get(event.get('track_id')),
                        'source_type': event.get('source_type', 'realtime'),
                        'captured_by_user_id': event.get('captured_by_user_id'),
                        'evidence_type': primary_evidence['type'] if primary_evidence else ('text' if description else None),
                        'evidence_preview': primary_evidence['preview'] if primary_evidence else description,
                        'evidence_title': primary_evidence.get('title') if primary_evidence else None,
                        'media_items': media_items,
                        'is_confidential': event.get('is_confidential', False)
                    })

            # Sort and paginate
            raw_feed_items.sort(key=lambda x: x['timestamp'], reverse=True)
            has_more = len(raw_feed_items) > limit
            paginated_items = raw_feed_items[:limit]

            # Get view counts for task completions
            completion_ids = list(set([item['completion_id'] for item in paginated_items if item.get('completion_id')]))
            views_count = {}
            try:
                if completion_ids:
                    views = supabase.table('feed_item_views') \
                        .select('completion_id') \
                        .in_('completion_id', completion_ids) \
                        .execute()

                    for view in views.data:
                        views_count[view['completion_id']] = views_count.get(view['completion_id'], 0) + 1
            except Exception:
                logger.debug("intentional swallow", exc_info=True)

            # Get view counts for learning events
            le_ids = list(set([item['learning_event_id'] for item in paginated_items if item.get('learning_event_id')]))
            le_views_count = {}
            try:
                if le_ids:
                    le_views = supabase.table('feed_item_views') \
                        .select('learning_event_id') \
                        .in_('learning_event_id', le_ids) \
                        .execute()

                    for view in le_views.data:
                        le_id = view['learning_event_id']
                        le_views_count[le_id] = le_views_count.get(le_id, 0) + 1
            except Exception:
                logger.debug("intentional swallow", exc_info=True)

            # Get comment counts for task completions
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
                logger.debug("intentional swallow", exc_info=True)

            # Get comment counts for learning events
            le_comments_count = {}
            try:
                if le_ids:
                    le_comments = supabase.table('observer_comments') \
                        .select('learning_event_id') \
                        .in_('learning_event_id', le_ids) \
                        .execute()

                    for comment in le_comments.data:
                        if comment['learning_event_id']:
                            le_comments_count[comment['learning_event_id']] = le_comments_count.get(comment['learning_event_id'], 0) + 1
            except Exception:
                logger.debug("intentional swallow", exc_info=True)

            # Build final feed items
            feed_items = []
            for item in paginated_items:
                if item.get('item_type') == 'learning_moment':
                    le_id = item['learning_event_id']
                    feed_items.append({
                        'type': 'learning_moment',
                        'id': item['id'],
                        'learning_event_id': le_id,
                        'timestamp': item['timestamp'],
                        'student': {
                            'id': student_id,
                            'display_name': student_info.get('display_name'),
                            'first_name': student_info.get('first_name'),
                            'last_name': student_info.get('last_name'),
                            'avatar_url': student_info.get('avatar_url')
                        },
                        'moment': {
                            'title': item['event_title'],
                            'description': item['event_description'],
                            'pillars': item['event_pillars'],
                            'topic_name': item.get('topic_name'),
                            'source_type': item['source_type'],
                            'captured_by_user_id': item.get('captured_by_user_id')
                        },
                        'evidence': {
                            'type': item['evidence_type'],
                            'url': item['evidence_preview'] if item['evidence_type'] not in ('text',) else None,
                            'preview_text': item['evidence_preview'] if item['evidence_type'] == 'text' else None,
                            'title': item.get('evidence_title')
                        },
                        'media': item.get('media_items', []),
                        'views_count': le_views_count.get(le_id, 0),
                        'comments_count': le_comments_count.get(le_id, 0),
                        'is_confidential': item.get('is_confidential', False)
                    })
                else:
                    feed_items.append({
                        'type': 'task_completed',
                        'id': item['id'],
                        'completion_id': item['completion_id'],
                        'timestamp': item['timestamp'],
                        'student': {
                            'id': student_id,
                            'display_name': student_info.get('display_name'),
                            'first_name': student_info.get('first_name'),
                            'last_name': student_info.get('last_name'),
                            'avatar_url': student_info.get('avatar_url')
                        },
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
                        'views_count': views_count.get(item.get('completion_id'), 0),
                        'comments_count': comments_count.get(item.get('completion_id'), 0),
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
            # admin client justified: relationship gate above grants access; reads cross-user activity feed (quest_task_completions + learning_events + evidence blocks) and writes feed-item visibility toggle on user's own rows
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
