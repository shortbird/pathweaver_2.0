"""
Observer Module - Observer Feed

Aggregated feed for observers across all linked students.
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
    @bp.route('/api/observers/feed', methods=['GET'])
    @require_auth
    def get_observer_feed(user_id):
        """
        Observer views activity feed for linked students

        Also includes:
        - Students from advisor_student_assignments for superadmin/advisor users
        - Parent's children (dependents and linked 13+ students) for parent users

        Query params:
            student_id: (optional) Filter to specific student
            limit: (optional) Number of items, default 20
            cursor: (optional) Pagination cursor (completion timestamp)

        Returns:
            200: Paginated feed of student activities
        """
        observer_id = user_id
        student_id_filter = request.args.get('student_id')
        limit = min(int(request.args.get('limit', 20)), 50)
        cursor = request.args.get('cursor')

        try:
            supabase = get_supabase_admin_client()

            # Get user role to check if they're superadmin/advisor/parent
            user_result = supabase.table('users').select('role').eq('id', observer_id).single().execute()
            user_role = user_result.data.get('role') if user_result.data else None

            # Get all linked students for this observer
            links = supabase.table('observer_student_links') \
                .select('student_id, can_view_evidence') \
                .eq('observer_id', observer_id) \
                .execute()

            student_ids = [link['student_id'] for link in links.data]
            evidence_permissions = {link['student_id']: link['can_view_evidence'] for link in links.data}

            # For superadmin or advisor, also get students from advisor_student_assignments
            if user_role in ('superadmin', 'advisor'):
                advisor_assignments = supabase.table('advisor_student_assignments') \
                    .select('student_id') \
                    .eq('advisor_id', observer_id) \
                    .eq('is_active', True) \
                    .execute()
                for assignment in advisor_assignments.data:
                    sid = assignment['student_id']
                    if sid not in student_ids:
                        student_ids.append(sid)
                        evidence_permissions[sid] = True  # Advisors can view evidence

            # For parents, include their children (dependents + linked students)
            if user_role == 'parent':
                # Get dependents (under 13, managed by this parent)
                dependents = supabase.table('users') \
                    .select('id') \
                    .eq('managed_by_parent_id', observer_id) \
                    .execute()
                for dep in dependents.data:
                    sid = dep['id']
                    if sid not in student_ids:
                        student_ids.append(sid)
                        evidence_permissions[sid] = True  # Parents can view their children's evidence

                # Get linked students (13+, via parent_student_links)
                linked_students = supabase.table('parent_student_links') \
                    .select('student_user_id') \
                    .eq('parent_user_id', observer_id) \
                    .eq('status', 'approved') \
                    .execute()
                for linked in linked_students.data:
                    sid = linked['student_user_id']
                    if sid not in student_ids:
                        student_ids.append(sid)
                        evidence_permissions[sid] = True  # Parents can view their children's evidence

            if not student_ids:
                return jsonify({'items': [], 'has_more': False}), 200

            # Filter to specific student if requested
            if student_id_filter:
                if student_id_filter not in student_ids:
                    return jsonify({'error': 'Access denied to this student'}), 403
                student_ids = [student_id_filter]

            # Build query for task completions
            # Note: xp_awarded is not on quest_task_completions - get it from user_quest_tasks
            query = supabase.table('quest_task_completions') \
                .select('id, user_id, quest_id, user_quest_task_id, evidence_text, evidence_url, completed_at, is_confidential') \
                .in_('user_id', student_ids) \
                .eq('is_confidential', False) \
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

            # Get student details
            students = supabase.table('users') \
                .select('id, display_name, first_name, last_name, avatar_url') \
                .in_('id', student_ids) \
                .execute()
            students_map = {s['id']: s for s in students.data}

            # Get evidence document blocks for multi-format evidence
            # First, get evidence documents for these task IDs
            evidence_docs = supabase.table('user_task_evidence_documents') \
                .select('id, task_id, user_id, status') \
                .in_('task_id', task_ids) \
                .in_('user_id', student_ids) \
                .eq('status', 'completed') \
                .execute()

            # Map task_id+user_id to document_id
            doc_map = {}
            doc_ids = []
            for doc in evidence_docs.data:
                key = f"{doc['task_id']}_{doc['user_id']}"
                doc_map[key] = doc['id']
                doc_ids.append(doc['id'])

            # Get all evidence blocks for these documents (excluding private ones)
            evidence_blocks_map = {}  # document_id -> list of blocks
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
                student_info = students_map.get(completion['user_id'], {})
                task_info = tasks_map.get(completion['user_quest_task_id'], {})
                quest_info = quests_map.get(completion['quest_id'], {})
                can_view = evidence_permissions.get(completion['user_id'], False)

                if not can_view:
                    continue

                # Check if this completion has multi-format evidence
                doc_key = f"{completion['user_quest_task_id']}_{completion['user_id']}"
                doc_id = doc_map.get(doc_key)

                if doc_id and doc_id in evidence_blocks_map:
                    # Create one feed item per evidence block
                    for block in evidence_blocks_map[doc_id]:
                        evidence_type = None
                        evidence_preview = None
                        evidence_title = None
                        content = block.get('content', {})

                        # Helper to extract URL from content - handles both new format (items array)
                        # and legacy format (direct url property)
                        def get_content_url(content_obj):
                            items = content_obj.get('items', [])
                            if items and len(items) > 0:
                                return items[0].get('url')
                            return content_obj.get('url')

                        if block['block_type'] == 'image':
                            evidence_type = 'image'
                            evidence_preview = get_content_url(content)
                        elif block['block_type'] == 'video':
                            evidence_type = 'video'
                            evidence_preview = get_content_url(content)
                            evidence_title = content.get('title')
                        elif block['block_type'] == 'link':
                            evidence_type = 'link'
                            evidence_preview = get_content_url(content)
                            evidence_title = content.get('title')
                        elif block['block_type'] == 'text':
                            evidence_type = 'text'
                            text = content.get('text', '')
                            evidence_preview = text[:200] + '...' if len(text) > 200 else text
                        elif block['block_type'] == 'document':
                            evidence_type = 'link'
                            evidence_preview = get_content_url(content)
                            evidence_title = content.get('title') or content.get('filename')

                        if evidence_type:
                            student_name = student_info.get('display_name') or \
                                f"{student_info.get('first_name', '')} {student_info.get('last_name', '')}".strip() or 'Student'

                            raw_feed_items.append({
                                'id': f"{completion['id']}_{block['id']}",
                                'completion_id': completion['id'],
                                'block_id': block['id'],
                                'timestamp': block.get('created_at') or completion['completed_at'],
                                'student_id': completion['user_id'],
                                'student_name': student_name,
                                'student_avatar': student_info.get('avatar_url'),
                                'task_id': completion['user_quest_task_id'],
                                'task_title': task_info.get('title', 'Task'),
                                'task_pillar': task_info.get('pillar'),
                                'task_xp': task_info.get('xp_value', 0),
                                'quest_id': completion['quest_id'],
                                'quest_title': quest_info.get('title', 'Quest'),
                                'evidence_type': evidence_type,
                                'evidence_preview': evidence_preview,
                                'evidence_title': evidence_title
                            })
                else:
                    # Fallback: legacy evidence (text/url directly on completion)
                    # Skip if evidence_text is a document reference
                    evidence_text = completion.get('evidence_text', '')
                    if evidence_text and 'Multi-format evidence document' in evidence_text:
                        continue  # Skip - no blocks found for this document

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
                        student_name = student_info.get('display_name') or \
                            f"{student_info.get('first_name', '')} {student_info.get('last_name', '')}".strip() or 'Student'

                        raw_feed_items.append({
                            'id': completion['id'],
                            'completion_id': completion['id'],
                            'block_id': None,
                            'timestamp': completion['completed_at'],
                            'student_id': completion['user_id'],
                            'student_name': student_name,
                            'student_avatar': student_info.get('avatar_url'),
                            'task_id': completion['user_quest_task_id'],
                            'task_title': task_info.get('title', 'Task'),
                            'task_pillar': task_info.get('pillar'),
                            'task_xp': task_info.get('xp_value', 0),
                            'quest_id': completion['quest_id'],
                            'quest_title': quest_info.get('title', 'Quest'),
                            'evidence_type': evidence_type,
                            'evidence_preview': evidence_preview,
                            'evidence_title': None  # Legacy evidence doesn't have titles
                        })

            # Sort by timestamp descending and paginate
            raw_feed_items.sort(key=lambda x: x['timestamp'], reverse=True)

            # Apply pagination
            has_more = len(raw_feed_items) > limit
            paginated_items = raw_feed_items[:limit]

            # Get like counts and user's likes
            completion_ids = list(set([item['completion_id'] for item in paginated_items]))
            likes_count = {}
            user_likes = set()
            try:
                if completion_ids:
                    likes = supabase.table('observer_likes') \
                        .select('completion_id, observer_id') \
                        .in_('completion_id', completion_ids) \
                        .execute()

                    for like in likes.data:
                        likes_count[like['completion_id']] = likes_count.get(like['completion_id'], 0) + 1
                        if like['observer_id'] == observer_id:
                            user_likes.add(like['completion_id'])
            except Exception as likes_error:
                logger.warning(f"Could not fetch observer_likes: {likes_error}")

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
            except Exception as comments_error:
                logger.warning(f"Could not fetch observer_comments: {comments_error}")

            # Build final feed items in the expected format
            feed_items = []
            for item in paginated_items:
                feed_items.append({
                    'type': 'task_completed',
                    'id': item['id'],
                    'completion_id': item['completion_id'],
                    'timestamp': item['timestamp'],
                    'student': {
                        'id': item['student_id'],
                        'display_name': item['student_name'],
                        'avatar_url': item['student_avatar']
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
                    'likes_count': likes_count.get(item['completion_id'], 0),
                    'comments_count': comments_count.get(item['completion_id'], 0),
                    'user_has_liked': item['completion_id'] in user_likes
                })

            # Log feed access
            try:
                audit_service = ObserverAuditService(user_id=observer_id)
                audit_service.log_observer_access(
                    observer_id=observer_id,
                    student_id=student_id_filter or student_ids[0],
                    action_type='view_feed',
                    resource_type='feed',
                    metadata={
                        'student_filter': student_id_filter,
                        'items_returned': len(feed_items)
                    }
                )
            except Exception as audit_error:
                logger.error(f"Failed to log feed access: {audit_error}")

            # Build next cursor
            next_cursor = paginated_items[-1]['timestamp'] if paginated_items and has_more else None

            return jsonify({
                'items': feed_items,
                'has_more': has_more,
                'next_cursor': next_cursor
            }), 200

        except Exception as e:
            logger.error(f"Failed to fetch observer feed: {str(e)}", exc_info=True)
            return jsonify({'error': 'Failed to fetch feed'}), 500
