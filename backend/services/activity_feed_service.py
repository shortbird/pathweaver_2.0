"""Activity feed assembly, for one student or several.

Extracted verbatim from routes/observer/activity.py on 2026-08-14, when peer
connections needed the same feed for a set of students rather than one. The
logic is a move, not a rewrite: the observer route now calls this with a single
id and gets byte-identical output, which is the only way to change a 450-line
handler that has no test coverage without gambling on it.

The one genuinely new concept is CONFIDENTIALITY SCOPE. `is_confidential` is the
per-item "don't show this to my observers" flag a student (or their parent) sets
from the feed. On your own feed you still see your own hidden items, greyed, so
you can unhide them -- so the flag cannot simply be a WHERE clause. When the feed
widens to include peers, that same flag has to become a hard filter for everyone
else's items: an item a student marked private must not reach a classmate just
because the feed grew a second source.

Hence `confidential_ok_for`: the set of owners whose hidden items the *viewer* is
entitled to see. Callers pass their own id (and nothing else) for a peer feed.
Passing an owner in that set is the deliberate act of saying "this viewer may see
this person's hidden work"; the default is to see nobody's.
"""

from typing import Any, Dict, Iterable, List, Optional, Set

from utils.logger import get_logger
from utils.storage_urls import sign_in_place

logger = get_logger(__name__)


def build_activity_feed(
    supabase,
    student_ids: Iterable[str],
    limit: int = 20,
    cursor: Optional[str] = None,
    confidential_ok_for: Optional[Set[str]] = None,
) -> Dict[str, Any]:
    """Assemble a chronological feed of task completions and learning moments.

    Args:
        supabase: an admin client. This function does NO authorization -- every
            caller must already have decided that the viewer may see each of
            ``student_ids``. It is a shaping helper, not a gate.
        student_ids: whose work to include.
        limit: page size.
        cursor: ISO timestamp; returns items strictly older than this.
        confidential_ok_for: owners whose ``is_confidential`` items to include.
            Anyone not in this set has their hidden items dropped entirely.

    Returns {'items', 'has_more', 'next_cursor'}.
    """
    student_ids = [s for s in (student_ids or []) if s]
    if not student_ids:
        return {'items': [], 'has_more': False, 'next_cursor': None}

    confidential_ok_for = confidential_ok_for or set()

    # Profiles for feed display, one row per author.
    profiles = supabase.table('users') \
        .select('id, display_name, first_name, last_name, avatar_url') \
        .in_('id', student_ids) \
        .execute()
    students_map = {u['id']: u for u in (profiles.data or [])}
    # Avatars live in private buckets. One batch for the whole author set, so a
    # 50-item feed costs one signing call rather than one per row.
    sign_in_place(list(students_map.values()), ['avatar_url'])

    query = supabase.table('quest_task_completions') \
        .select('id, user_id, quest_id, user_quest_task_id, completed_at, '
                'evidence_url, evidence_text, is_confidential') \
        .in_('user_id', student_ids) \
        .order('completed_at', desc=True) \
        .limit(limit + 1)
    if cursor:
        query = query.lt('completed_at', cursor)
    completions = query.execute()

    learning_events_query = supabase.table('learning_events') \
        .select('id, user_id, title, description, pillars, created_at, '
                'source_type, captured_by_user_id, is_confidential') \
        .in_('user_id', student_ids) \
        .order('created_at', desc=True) \
        .limit(limit + 1)
    if cursor:
        learning_events_query = learning_events_query.lt('created_at', cursor)
    learning_events = learning_events_query.execute()

    # Drop other people's hidden items before any further work. Doing it here
    # rather than at render time means a hidden item cannot leak through a
    # counter, a cursor, or a future caller that forgets to check.
    completion_rows = [
        c for c in (completions.data or [])
        if not c.get('is_confidential') or c['user_id'] in confidential_ok_for
    ]
    event_rows = [
        e for e in (learning_events.data or [])
        if not e.get('is_confidential') or e['user_id'] in confidential_ok_for
    ]

    if not completion_rows and not event_rows:
        return {'items': [], 'has_more': False, 'next_cursor': None}

    task_ids = list({c['user_quest_task_id'] for c in completion_rows
                     if c['user_quest_task_id']})
    tasks_map = {}
    if task_ids:
        tasks = supabase.table('user_quest_tasks') \
            .select('id, title, pillar, xp_value').in_('id', task_ids).execute()
        tasks_map = {t['id']: t for t in tasks.data}

    quest_ids = list({c['quest_id'] for c in completion_rows if c['quest_id']})
    quests_map = {}
    if quest_ids:
        quests = supabase.table('quests').select('id, title') \
            .in_('id', quest_ids).execute()
        quests_map = {q['id']: q for q in quests.data}

    # Primary topic name per learning event, display label only.
    event_ids_for_topics = [e['id'] for e in event_rows]
    event_track_label = {}
    if event_ids_for_topics:
        junction = supabase.table('learning_event_topics') \
            .select('learning_event_id, topic_id, topic_type') \
            .in_('learning_event_id', event_ids_for_topics) \
            .eq('topic_type', 'topic').execute()
        track_ids = list({r['topic_id'] for r in (junction.data or [])})
        track_name_by_id = {}
        if track_ids:
            tracks = supabase.table('interest_tracks').select('id, name') \
                .in_('id', track_ids).execute()
            track_name_by_id = {t['id']: t['name'] for t in (tracks.data or [])}
        for row in (junction.data or []):
            eid = row['learning_event_id']
            if eid in event_track_label:
                continue
            name = track_name_by_id.get(row['topic_id'])
            if name:
                event_track_label[eid] = name

    # Multi-format evidence documents.
    evidence_docs_data = []
    if task_ids:
        evidence_docs = supabase.table('user_task_evidence_documents') \
            .select('id, task_id, user_id, status') \
            .in_('task_id', task_ids) \
            .in_('user_id', student_ids) \
            .eq('status', 'completed').execute()
        evidence_docs_data = evidence_docs.data or []

    doc_map = {}
    doc_ids = []
    for doc in evidence_docs_data:
        doc_map[f"{doc['task_id']}_{doc['user_id']}"] = doc['id']
        doc_ids.append(doc['id'])

    evidence_blocks_map = {}
    if doc_ids:
        blocks = supabase.table('evidence_document_blocks') \
            .select('id, document_id, block_type, content, order_index, '
                    'created_at, is_private') \
            .in_('document_id', doc_ids).eq('is_private', False) \
            .order('order_index').execute()
        for block in blocks.data:
            evidence_blocks_map.setdefault(block['document_id'], []).append(block)

    learning_event_ids = [e['id'] for e in event_rows]
    learning_event_blocks_map = {}
    if learning_event_ids:
        le_blocks = supabase.table('learning_event_evidence_blocks') \
            .select('id, learning_event_id, block_type, content, order_index, '
                    'created_at, file_url, file_name') \
            .in_('learning_event_id', learning_event_ids) \
            .order('order_index').execute()
        for block in le_blocks.data:
            learning_event_blocks_map.setdefault(
                block['learning_event_id'], []).append(block)

    raw_feed_items: List[Dict[str, Any]] = []

    for completion in completion_rows:
        task_info = tasks_map.get(completion['user_quest_task_id'], {})
        quest_info = quests_map.get(completion['quest_id'], {})
        doc_id = doc_map.get(
            f"{completion['user_quest_task_id']}_{completion['user_id']}")

        if doc_id and doc_id in evidence_blocks_map:
            for block in evidence_blocks_map[doc_id]:
                evidence_type = None
                evidence_preview = None
                content = block.get('content', {})
                url = content.get('url', '')
                is_heic = (url.lower().endswith('.heic')
                           or url.lower().endswith('.heif')) if url else False

                if block['block_type'] == 'image' or is_heic:
                    evidence_type, evidence_preview = 'image', url
                elif block['block_type'] == 'video':
                    evidence_type, evidence_preview = 'video', url
                elif block['block_type'] == 'link':
                    evidence_type, evidence_preview = 'link', url
                elif block['block_type'] == 'text':
                    text = content.get('text', '')
                    evidence_type = 'text'
                    evidence_preview = text[:200] + '...' if len(text) > 200 else text
                elif block['block_type'] == 'document':
                    evidence_type, evidence_preview = 'link', url

                if evidence_type:
                    raw_feed_items.append({
                        'id': f"{completion['id']}_{block['id']}",
                        'owner_id': completion['user_id'],
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
            evidence_text = completion.get('evidence_text', '')
            if evidence_text and 'Multi-format evidence document' in evidence_text:
                continue

            evidence_type = None
            evidence_preview = None
            if completion.get('evidence_url'):
                url = completion['evidence_url'].lower()
                if any(url.endswith(ext) for ext in
                       ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']):
                    evidence_type = 'image'
                elif 'youtube.com' in url or 'youtu.be' in url or 'vimeo.com' in url:
                    evidence_type = 'video'
                else:
                    evidence_type = 'link'
                evidence_preview = completion['evidence_url']
            elif evidence_text:
                evidence_type = 'text'
                evidence_preview = (evidence_text[:200] + '...'
                                    if len(evidence_text) > 200 else evidence_text)

            if evidence_type:
                raw_feed_items.append({
                    'id': completion['id'],
                    'owner_id': completion['user_id'],
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

    for event in event_rows:
        event_blocks = learning_event_blocks_map.get(event['id'], [])
        media_items = []
        primary_evidence = None

        for block in event_blocks:
            content = block.get('content', {})
            media_item = None
            if block['block_type'] == 'image':
                media_item = {'type': 'image',
                              'url': content.get('url') or block.get('file_url'),
                              'title': None}
            elif block['block_type'] == 'video':
                media_item = {'type': 'video',
                              'url': content.get('url') or block.get('file_url'),
                              'title': content.get('title'),
                              'thumbnail_url': content.get('thumbnail_url'),
                              'duration_seconds': content.get('duration_seconds')}
            elif block['block_type'] == 'link':
                media_item = {'type': 'link', 'url': content.get('url'),
                              'title': content.get('title')}
            elif block['block_type'] == 'document':
                media_item = {'type': 'document',
                              'url': content.get('url') or block.get('file_url'),
                              'title': (content.get('title') or content.get('filename')
                                        or block.get('file_name'))}

            if media_item and media_item.get('url'):
                media_items.append(media_item)
                if primary_evidence is None:
                    primary_evidence = {'type': media_item['type'],
                                        'preview': media_item['url'],
                                        'title': media_item.get('title')}

        description = event.get('description', '')
        if media_items or description:
            raw_feed_items.append({
                'id': f"le_{event['id']}",
                'owner_id': event['user_id'],
                'item_type': 'learning_moment',
                'learning_event_id': event['id'],
                'block_id': None,
                'timestamp': event['created_at'],
                'event_title': event.get('title') or 'Learning Moment',
                'event_description': description,
                'event_pillars': event.get('pillars', []),
                'topic_name': event_track_label.get(event['id']),
                'source_type': event.get('source_type', 'realtime'),
                'captured_by_user_id': event.get('captured_by_user_id'),
                'evidence_type': (primary_evidence['type'] if primary_evidence
                                  else ('text' if description else None)),
                'evidence_preview': (primary_evidence['preview'] if primary_evidence
                                     else description),
                'evidence_title': primary_evidence.get('title') if primary_evidence else None,
                'media_items': media_items,
                'is_confidential': event.get('is_confidential', False)
            })

    raw_feed_items.sort(key=lambda x: x['timestamp'], reverse=True)
    has_more = len(raw_feed_items) > limit
    paginated_items = raw_feed_items[:limit]

    completion_ids = list({i['completion_id'] for i in paginated_items
                           if i.get('completion_id')})
    views_count = {}
    try:
        if completion_ids:
            views = supabase.table('feed_item_views').select('completion_id') \
                .in_('completion_id', completion_ids).execute()
            for view in views.data:
                views_count[view['completion_id']] = views_count.get(view['completion_id'], 0) + 1
    except Exception:
        logger.debug("intentional swallow", exc_info=True)

    le_ids = list({i['learning_event_id'] for i in paginated_items
                   if i.get('learning_event_id')})
    le_views_count = {}
    try:
        if le_ids:
            le_views = supabase.table('feed_item_views').select('learning_event_id') \
                .in_('learning_event_id', le_ids).execute()
            for view in le_views.data:
                lid = view['learning_event_id']
                le_views_count[lid] = le_views_count.get(lid, 0) + 1
    except Exception:
        logger.debug("intentional swallow", exc_info=True)

    comments_count = {}
    try:
        if completion_ids:
            comments = supabase.table('observer_comments').select('task_completion_id') \
                .in_('task_completion_id', completion_ids).execute()
            for comment in comments.data:
                if comment['task_completion_id']:
                    cid = comment['task_completion_id']
                    comments_count[cid] = comments_count.get(cid, 0) + 1
    except Exception:
        logger.debug("intentional swallow", exc_info=True)

    le_comments_count = {}
    try:
        if le_ids:
            le_comments = supabase.table('observer_comments').select('learning_event_id') \
                .in_('learning_event_id', le_ids).execute()
            for comment in le_comments.data:
                if comment['learning_event_id']:
                    lid = comment['learning_event_id']
                    le_comments_count[lid] = le_comments_count.get(lid, 0) + 1
    except Exception:
        logger.debug("intentional swallow", exc_info=True)

    # Peer comments are counted alongside observer comments so the count on a
    # card matches what opening it shows. They are stored separately (see the
    # peer_comments migration) precisely so an adult's note and a classmate's
    # note never mix; a total is the one place they legitimately add up.
    try:
        if completion_ids:
            pc = supabase.table('peer_comments').select('task_completion_id') \
                .in_('task_completion_id', completion_ids) \
                .is_('hidden_at', 'null').execute()
            for c in pc.data or []:
                if c['task_completion_id']:
                    cid = c['task_completion_id']
                    comments_count[cid] = comments_count.get(cid, 0) + 1
        if le_ids:
            ple = supabase.table('peer_comments').select('learning_event_id') \
                .in_('learning_event_id', le_ids) \
                .is_('hidden_at', 'null').execute()
            for c in ple.data or []:
                if c['learning_event_id']:
                    lid = c['learning_event_id']
                    le_comments_count[lid] = le_comments_count.get(lid, 0) + 1
    except Exception:
        logger.debug("intentional swallow", exc_info=True)

    def _author(owner_id):
        info = students_map.get(owner_id, {})
        return {
            'id': owner_id,
            'display_name': info.get('display_name'),
            'first_name': info.get('first_name'),
            'last_name': info.get('last_name'),
            'avatar_url': info.get('avatar_url'),
        }

    feed_items = []
    for item in paginated_items:
        if item.get('item_type') == 'learning_moment':
            le_id = item['learning_event_id']
            feed_items.append({
                'type': 'learning_moment',
                'id': item['id'],
                'learning_event_id': le_id,
                'timestamp': item['timestamp'],
                'student': _author(item['owner_id']),
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
                'student': _author(item['owner_id']),
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

    # Evidence media is student work in `quest-evidence`, which is private too.
    # Sign the evidence block and every media item across the page in one batch.
    _to_sign = [i['evidence'] for i in feed_items if isinstance(i.get('evidence'), dict)]
    for item in feed_items:
        _to_sign.extend(m for m in (item.get('media') or []) if isinstance(m, dict))
    # Same key set the evidence-block signer uses, so a media item that grows a
    # poster_url or src doesn't silently ship unsigned.
    from services.portfolio_service import _BLOCK_URL_KEYS
    sign_in_place(_to_sign, _BLOCK_URL_KEYS)

    next_cursor = paginated_items[-1]['timestamp'] if paginated_items and has_more else None
    return {'items': feed_items, 'has_more': has_more, 'next_cursor': next_cursor}
