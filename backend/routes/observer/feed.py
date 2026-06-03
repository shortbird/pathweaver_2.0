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
        - Students from advisor_student_assignments for advisor users
        - Parent's children (dependents and linked 13+ students) for parent users
        - For superadmin with no student_id filter: every non-confidential evidence
          upload across all users and organizations (global moderation feed). When
          student_id is supplied, superadmin can scope to any user regardless of
          observer/advisor links.

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
            # admin client justified: observer feed aggregates across observer_student_links + advisor_student_assignments + parent_student_links + own activity; cross-user reads gated by per-row can_view_evidence permission filter
            supabase = get_supabase_admin_client()

            # Get user role to check if they're superadmin/advisor/parent
            # Need both role and org_role to handle org-managed users
            user_result = supabase.table('users').select('role, org_role').eq('id', observer_id).single().execute()
            user_role = user_result.data.get('role') if user_result.data else None
            user_org_role = user_result.data.get('org_role') if user_result.data else None

            # Determine effective role (org_role for org_managed users, role otherwise)
            effective_role = user_org_role if user_role == 'org_managed' else user_role

            # Superadmin global feed: no student_id filter -> show every non-confidential
            # evidence upload across all users and orgs. Skips link-based scoping and
            # per-row permission checks. Confidential items remain hidden to match the
            # existing privacy boundary.
            is_superadmin_global = (effective_role == 'superadmin' and not student_id_filter)

            if is_superadmin_global:
                student_ids = []
                evidence_permissions = {}
            else:
                # Get all linked students for this observer
                links = supabase.table('observer_student_links') \
                    .select('student_id, can_view_evidence') \
                    .eq('observer_id', observer_id) \
                    .execute()

                student_ids = [link['student_id'] for link in links.data]
                evidence_permissions = {link['student_id']: link['can_view_evidence'] for link in links.data}

                # For superadmin or advisor, also get students from advisor_student_assignments
                if effective_role in ('superadmin', 'advisor'):
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

                # Always check for user's children (dependents + linked students)
                # This applies to parents, but also superadmins or anyone who has children
                # Get dependents (under 13, managed by this user)
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

                # Always include the user's own activity in the feed
                if observer_id not in student_ids:
                    student_ids.append(observer_id)
                    evidence_permissions[observer_id] = True

                # Exclude blocked users (never hide own content)
                try:
                    blocks_result = supabase.table('user_blocks') \
                        .select('blocked_id') \
                        .eq('blocker_id', observer_id) \
                        .execute()
                    blocked_ids = {b['blocked_id'] for b in (blocks_result.data or [])}
                except Exception as block_err:
                    logger.warning(f"Failed to fetch user blocks for {observer_id[:8]}: {block_err}")
                    blocked_ids = set()

                if blocked_ids:
                    student_ids = [sid for sid in student_ids if sid == observer_id or sid not in blocked_ids]

                if not student_ids:
                    return jsonify({'items': [], 'has_more': False}), 200

                # Filter to specific student if requested
                if student_id_filter:
                    if student_id_filter in blocked_ids and student_id_filter != observer_id:
                        return jsonify({'error': 'Access denied to this student'}), 403
                    # Superadmin can scope to any student regardless of linking.
                    if student_id_filter not in student_ids and effective_role != 'superadmin':
                        return jsonify({'error': 'Access denied to this student'}), 403
                    student_ids = [student_id_filter]
                    evidence_permissions.setdefault(student_id_filter, True)

            # Evidence is surfaced on upload (block.created_at), not on task completion.
            # Drive document-evidence items from evidence_document_blocks; quest_task_completions
            # is only needed for legacy non-document completions and for view/comment counts.
            evidence_docs_by_id = {}
            evidence_block_rows = []

            if is_superadmin_global:
                # Blocks-first to avoid scanning every doc on the platform: get the latest
                # public blocks, then resolve their parent docs (drop confidential ones).
                blocks_query = supabase.table('evidence_document_blocks') \
                    .select('id, document_id, block_type, content, order_index, created_at, is_private') \
                    .eq('is_private', False) \
                    .order('created_at', desc=True) \
                    .limit(limit + 1)

                if cursor:
                    blocks_query = blocks_query.lt('created_at', cursor)

                blocks_response = blocks_query.execute()
                referenced_doc_ids = list({b['document_id'] for b in (blocks_response.data or []) if b.get('document_id')})

                if referenced_doc_ids:
                    docs_resp = supabase.table('user_task_evidence_documents') \
                        .select('id, user_id, task_id, quest_id, is_confidential, status') \
                        .in_('id', referenced_doc_ids) \
                        .eq('is_confidential', False) \
                        .execute()
                    evidence_docs_by_id = {d['id']: d for d in (docs_resp.data or [])}

                for b in (blocks_response.data or []):
                    doc = evidence_docs_by_id.get(b['document_id'])
                    if not doc:
                        continue
                    b['user_task_evidence_documents'] = doc
                    evidence_block_rows.append(b)
            else:
                evidence_docs_resp = supabase.table('user_task_evidence_documents') \
                    .select('id, user_id, task_id, quest_id, is_confidential, status') \
                    .in_('user_id', student_ids) \
                    .eq('is_confidential', False) \
                    .execute()
                evidence_docs_by_id = {d['id']: d for d in (evidence_docs_resp.data or [])}
                evidence_doc_ids = list(evidence_docs_by_id.keys())

                if evidence_doc_ids:
                    blocks_query = supabase.table('evidence_document_blocks') \
                        .select('id, document_id, block_type, content, order_index, created_at, is_private') \
                        .in_('document_id', evidence_doc_ids) \
                        .eq('is_private', False) \
                        .order('created_at', desc=True) \
                        .limit(limit + 1)

                    if cursor:
                        blocks_query = blocks_query.lt('created_at', cursor)

                    blocks_response = blocks_query.execute()
                    # Attach the parent doc onto each block in the shape expected downstream.
                    for b in (blocks_response.data or []):
                        doc = evidence_docs_by_id.get(b['document_id'])
                        if not doc:
                            continue
                        b['user_task_evidence_documents'] = doc
                        evidence_block_rows.append(b)

            # Build query for legacy task completions (evidence_text / evidence_url with no document).
            # These predate the multi-format evidence document system.
            completions_query = supabase.table('quest_task_completions') \
                .select('id, user_id, quest_id, user_quest_task_id, evidence_text, evidence_url, completed_at, is_confidential') \
                .eq('is_confidential', False) \
                .order('completed_at', desc=True) \
                .limit(limit + 1)

            if not is_superadmin_global:
                completions_query = completions_query.in_('user_id', student_ids)

            if cursor:
                completions_query = completions_query.lt('completed_at', cursor)

            completions = completions_query.execute()

            # Learning events for moments that aren't task evidence.
            # Task-attached learning_events (attached_task_id IS NOT NULL) represent the
            # same evidence already surfaced via the document-block path above — skip them.
            learning_events_query = supabase.table('learning_events') \
                .select('id, user_id, title, description, pillars, created_at, source_type, captured_by_user_id, attached_task_id') \
                .eq('is_confidential', False) \
                .is_('attached_task_id', 'null') \
                .order('created_at', desc=True) \
                .limit(limit + 1)

            if not is_superadmin_global:
                learning_events_query = learning_events_query.in_('user_id', student_ids)

            if cursor:
                learning_events_query = learning_events_query.lt('created_at', cursor)

            learning_events = learning_events_query.execute()

            # Get a primary topic name for each learning event from the junction table.
            # Used only as a display label on the feed card — first topic wins.
            event_ids_for_topics = [e['id'] for e in (learning_events.data or [])]
            event_track_label = {}  # event_id -> track name
            if event_ids_for_topics:
                junction = supabase.table('learning_event_topics') \
                    .select('learning_event_id, topic_id, topic_type') \
                    .in_('learning_event_id', event_ids_for_topics) \
                    .eq('topic_type', 'topic') \
                    .execute()
                track_ids = list({r['topic_id'] for r in (junction.data or [])})
                track_name_by_id = {}
                if track_ids:
                    tracks = supabase.table('interest_tracks') \
                        .select('id, name') \
                        .in_('id', track_ids) \
                        .execute()
                    track_name_by_id = {t['id']: t['name'] for t in (tracks.data or [])}
                for row in (junction.data or []):
                    eid = row['learning_event_id']
                    if eid in event_track_label:
                        continue  # First topic per event wins
                    name = track_name_by_id.get(row['topic_id'])
                    if name:
                        event_track_label[eid] = name

            # If no evidence blocks AND no completions AND no learning events, return empty
            if not evidence_block_rows and not completions.data and not learning_events.data:
                return jsonify({'items': [], 'has_more': False}), 200

            # Collect task_ids and quest_ids referenced by both evidence blocks and completions
            block_task_ids = {
                (b.get('user_task_evidence_documents') or {}).get('task_id')
                for b in evidence_block_rows
            }
            block_quest_ids = {
                (b.get('user_task_evidence_documents') or {}).get('quest_id')
                for b in evidence_block_rows
            }
            completion_task_ids = {c['user_quest_task_id'] for c in completions.data if c['user_quest_task_id']}
            completion_quest_ids = {c['quest_id'] for c in completions.data if c['quest_id']}

            task_ids = list({tid for tid in block_task_ids | completion_task_ids if tid})
            quest_ids = list({qid for qid in block_quest_ids | completion_quest_ids if qid})

            tasks_map = {}
            if task_ids:
                tasks = supabase.table('user_quest_tasks') \
                    .select('id, title, pillar, xp_value') \
                    .in_('id', task_ids) \
                    .execute()
                tasks_map = {t['id']: t for t in tasks.data}

            quests_map = {}
            if quest_ids:
                quests = supabase.table('quests') \
                    .select('id, title') \
                    .in_('id', quest_ids) \
                    .execute()
                quests_map = {q['id']: q for q in quests.data}

            if is_superadmin_global:
                # student_ids is empty in global mode — collect the user ids actually
                # referenced by the result set instead.
                referenced_user_ids = set()
                for doc in evidence_docs_by_id.values():
                    if doc.get('user_id'):
                        referenced_user_ids.add(doc['user_id'])
                for c in (completions.data or []):
                    if c.get('user_id'):
                        referenced_user_ids.add(c['user_id'])
                for e in (learning_events.data or []):
                    if e.get('user_id'):
                        referenced_user_ids.add(e['user_id'])
                students_lookup_ids = list(referenced_user_ids)
            else:
                students_lookup_ids = student_ids

            students_map = {}
            if students_lookup_ids:
                students = supabase.table('users') \
                    .select('id, display_name, first_name, last_name, avatar_url') \
                    .in_('id', students_lookup_ids) \
                    .execute()
                students_map = {s['id']: s for s in students.data}

            # Build a (task_id, user_id) -> completion lookup so block items can attach
            # completion_id for views/comments counts when a completion exists.
            completion_by_task_user = {
                (c['user_quest_task_id'], c['user_id']): c
                for c in completions.data
                if c.get('user_quest_task_id')
            }
            # Track tasks that have document-driven blocks already emitted, so the legacy
            # completion path can skip duplicating items for the same task.
            task_user_keys_with_blocks = {
                ((b.get('user_task_evidence_documents') or {}).get('task_id'),
                 (b.get('user_task_evidence_documents') or {}).get('user_id'))
                for b in evidence_block_rows
            }

            # Get evidence blocks for learning events
            learning_event_ids = [e['id'] for e in learning_events.data] if learning_events.data else []
            learning_event_blocks_map = {}  # learning_event_id -> list of blocks
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

            # Helper to extract URL from block content - handles both new format (items array)
            # and legacy format (direct url property)
            def get_content_url(content_obj):
                items = content_obj.get('items', [])
                if items and len(items) > 0:
                    return items[0].get('url')
                return content_obj.get('url')

            # Build feed items - one per evidence block.
            # Items appear as soon as a block is uploaded; no completion record required.
            raw_feed_items = []
            for block in evidence_block_rows:
                doc = block.get('user_task_evidence_documents') or {}
                doc_user_id = doc.get('user_id')
                doc_task_id = doc.get('task_id')
                doc_quest_id = doc.get('quest_id')

                can_view = True if is_superadmin_global else evidence_permissions.get(doc_user_id, False)
                if not can_view:
                    continue

                student_info = students_map.get(doc_user_id, {})
                task_info = tasks_map.get(doc_task_id, {})
                quest_info = quests_map.get(doc_quest_id, {})
                completion = completion_by_task_user.get((doc_task_id, doc_user_id))

                content = block.get('content', {})
                evidence_type = None
                evidence_preview = None
                evidence_title = None

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
                    evidence_preview = content.get('text', '')
                elif block['block_type'] == 'document':
                    evidence_type = 'document'
                    evidence_preview = get_content_url(content)
                    evidence_title = content.get('title') or content.get('filename')

                if not evidence_type:
                    continue

                student_name = student_info.get('display_name') or \
                    f"{student_info.get('first_name', '')} {student_info.get('last_name', '')}".strip() or 'Student'

                raw_feed_items.append({
                    'id': f"{(completion or {}).get('id', doc.get('id'))}_{block['id']}",
                    'completion_id': completion['id'] if completion else None,
                    'block_id': block['id'],
                    'timestamp': block.get('created_at'),
                    'student_id': doc_user_id,
                    'student_name': student_name,
                    'student_avatar': student_info.get('avatar_url'),
                    'task_id': doc_task_id,
                    'task_title': task_info.get('title', 'Task'),
                    'task_pillar': task_info.get('pillar'),
                    'task_xp': task_info.get('xp_value', 0),
                    'quest_id': doc_quest_id,
                    'quest_title': quest_info.get('title', 'Quest'),
                    'evidence_type': evidence_type,
                    'evidence_preview': evidence_preview,
                    'evidence_title': evidence_title
                })

            # Legacy: emit completions that have only evidence_text/evidence_url (no document).
            # Skip any completion whose task already has document-driven block items above.
            for completion in completions.data:
                key = (completion.get('user_quest_task_id'), completion.get('user_id'))
                if key in task_user_keys_with_blocks:
                    continue
                evidence_text = completion.get('evidence_text', '') or ''
                if 'Multi-format evidence document' in evidence_text:
                    continue  # Document-referenced completion with no blocks found

                student_info = students_map.get(completion['user_id'], {})
                task_info = tasks_map.get(completion['user_quest_task_id'], {})
                quest_info = quests_map.get(completion['quest_id'], {})
                can_view = True if is_superadmin_global else evidence_permissions.get(completion['user_id'], False)
                if not can_view:
                    continue

                evidence_type = None
                evidence_preview = None
                if completion.get('evidence_url'):
                    url = completion['evidence_url'].lower()
                    if any(url.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']):
                        evidence_type = 'image'
                        evidence_preview = completion['evidence_url']
                    elif any(domain in url for domain in ['youtube.com', 'youtu.be', 'vimeo.com', 'loom.com/share', 'drive.google.com/file']):
                        evidence_type = 'video'
                        evidence_preview = completion['evidence_url']
                    else:
                        evidence_type = 'link'
                        evidence_preview = completion['evidence_url']
                elif evidence_text:
                    evidence_type = 'text'
                    evidence_preview = evidence_text

                if not evidence_type:
                    continue

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
                    'evidence_title': None
                })

            # Build feed items for learning moments - group all media into single items
            for event in (learning_events.data or []):
                student_info = students_map.get(event['user_id'], {})
                can_view = True if is_superadmin_global else evidence_permissions.get(event['user_id'], False)

                if not can_view:
                    continue

                student_name = student_info.get('display_name') or \
                    f"{student_info.get('first_name', '')} {student_info.get('last_name', '')}".strip() or 'Student'

                # Get evidence blocks for this learning event
                event_blocks = learning_event_blocks_map.get(event['id'], [])

                # Collect all media items for this learning event
                media_items = []
                primary_evidence = None  # First media item for backwards compatibility

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
                        elif block['block_type'] == 'audio':
                            media_item = {
                                'type': 'audio',
                                'url': content.get('url') or block.get('file_url'),
                                'title': content.get('filename') or block.get('file_name'),
                                'duration_ms': content.get('duration_ms'),
                            }

                        if media_item and media_item.get('url'):
                            media_items.append(media_item)
                            if primary_evidence is None:
                                primary_evidence = {
                                    'type': media_item['type'],
                                    'preview': media_item['url'],
                                    'title': media_item.get('title')
                                }

                # Create single feed item for this learning event
                description = event.get('description', '')

                # Only add if we have media or description
                if media_items or description:
                    raw_feed_items.append({
                        'id': f"le_{event['id']}",
                        'learning_event_id': event['id'],
                        'block_id': None,
                        'timestamp': event['created_at'],
                        'student_id': event['user_id'],
                        'student_name': student_name,
                        'student_avatar': student_info.get('avatar_url'),
                        'event_title': event.get('title') or 'Learning Moment',
                        'event_description': description,
                        'event_pillars': event.get('pillars', []),
                        'topic_name': event_track_label.get(event['id']),
                        'source_type': event.get('source_type', 'realtime'),
                        'captured_by_user_id': event.get('captured_by_user_id'),
                        # Primary evidence for backwards compatibility
                        'evidence_type': primary_evidence['type'] if primary_evidence else ('text' if description else None),
                        'evidence_preview': primary_evidence['preview'] if primary_evidence else description,
                        'evidence_title': primary_evidence.get('title') if primary_evidence else None,
                        # All media items for carousel display
                        'media_items': media_items,
                        'item_type': 'learning_moment'
                    })

            # Sort by timestamp descending and paginate
            raw_feed_items.sort(key=lambda x: x['timestamp'], reverse=True)

            # Apply pagination
            has_more = len(raw_feed_items) > limit
            paginated_items = raw_feed_items[:limit]

            # Get view counts for task completions
            completion_ids = list(set([item.get('completion_id') for item in paginated_items if item.get('completion_id')]))
            views_count = {}
            try:
                if completion_ids:
                    views = supabase.table('feed_item_views') \
                        .select('completion_id') \
                        .in_('completion_id', completion_ids) \
                        .execute()

                    for view in views.data:
                        views_count[view['completion_id']] = views_count.get(view['completion_id'], 0) + 1
            except Exception as views_error:
                logger.warning(f"Could not fetch feed_item_views for completions: {views_error}")

            # Get view counts for learning events
            le_ids = list(set([item.get('learning_event_id') for item in paginated_items if item.get('learning_event_id')]))
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
            except Exception as views_error:
                logger.warning(f"Could not fetch feed_item_views for learning events: {views_error}")

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
            except Exception as comments_error:
                logger.warning(f"Could not fetch observer_comments for completions: {comments_error}")

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
            except Exception as comments_error:
                logger.warning(f"Could not fetch observer_comments for learning events: {comments_error}")

            # Build final feed items in the expected format
            feed_items = []
            for item in paginated_items:
                if item.get('item_type') == 'learning_moment':
                    # Learning moment feed item
                    le_id = item['learning_event_id']
                    feed_items.append({
                        'type': 'learning_moment',
                        'id': item['id'],
                        'learning_event_id': le_id,
                        'timestamp': item['timestamp'],
                        'student': {
                            'id': item['student_id'],
                            'display_name': item['student_name'],
                            'avatar_url': item['student_avatar']
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
                        # All media items for carousel display
                        'media': item.get('media_items', []),
                        'views_count': le_views_count.get(le_id, 0),
                        'comments_count': le_comments_count.get(le_id, 0),
                    })
                else:
                    # Task-attached evidence item — either a real completion
                    # (completion_id present) or a draft evidence block (no
                    # completion yet — e.g. helper evidence added by a parent
                    # while the kid hasn't marked the task done).
                    feed_items.append({
                        'type': 'task_completed',
                        'id': item['id'],
                        'completion_id': item.get('completion_id'),
                        # Block id is needed client-side to address the
                        # underlying evidence_document_blocks row (e.g. for
                        # block-scoped privacy toggling) when the item is a
                        # draft block with no completion yet.
                        'block_id': item.get('block_id'),
                        'timestamp': item['timestamp'],
                        'student': {
                            'id': item['student_id'],
                            'display_name': item['student_name'],
                            'avatar_url': item['student_avatar']
                        },
                        'task': {
                            'id': item.get('task_id'),
                            'title': item.get('task_title', 'Task'),
                            'pillar': item.get('task_pillar'),
                            'xp_value': item.get('task_xp', 0)
                        },
                        'quest': {
                            'id': item.get('quest_id'),
                            'title': item.get('quest_title', 'Quest')
                        },
                        'evidence': {
                            'type': item['evidence_type'],
                            'url': item['evidence_preview'] if item['evidence_type'] != 'text' else None,
                            'preview_text': item['evidence_preview'] if item['evidence_type'] == 'text' else None,
                            'title': item.get('evidence_title')
                        },
                        'xp_awarded': item.get('task_xp', 0),
                        'views_count': views_count.get(item.get('completion_id'), 0),
                        'comments_count': comments_count.get(item.get('completion_id'), 0),
                    })

            # Log feed access
            try:
                audit_service = ObserverAuditService(user_id=observer_id)
                # In global mode student_ids is empty; log the observer as the subject
                # and mark the privileged scope in metadata for compliance review.
                audit_student = (
                    student_id_filter
                    or (student_ids[0] if student_ids else observer_id)
                )
                audit_service.log_observer_access(
                    observer_id=observer_id,
                    student_id=audit_student,
                    action_type='view_global_feed' if is_superadmin_global else 'view_feed',
                    resource_type='feed',
                    metadata={
                        'student_filter': student_id_filter,
                        'items_returned': len(feed_items),
                        'superadmin_global': is_superadmin_global,
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
