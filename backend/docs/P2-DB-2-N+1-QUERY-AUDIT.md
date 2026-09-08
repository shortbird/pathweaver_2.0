# P2-DB-2: N+1 Query Pattern Audit Results

**Date**: December 19, 2025
**Status**: Audit Complete - 2 Critical N+1 Patterns Found

---

## Summary

Audited `evidence_documents.py` and `parent_dashboard.py` for N+1 query patterns. Found **2 critical N+1 patterns** that need fixing and **several already-optimized patterns** that are implemented correctly.

---

## Critical N+1 Patterns Found

### 1. parent_dashboard.py - Lines 983-986
**Location**: `get_student_communications()` endpoint
**Pattern**: Loop over conversations, query last message for each conversation individually

```python
# BEFORE (N+1 Pattern)
for conv in conversations_response.data:
    # Get message preview (last message)
    messages_response = supabase.table('tutor_messages').select('''
        content, role, safety_level, created_at
    ''').eq('conversation_id', conv['id']).order('created_at', desc=True).limit(1).execute()
```

**Impact**: For 20 conversations, this makes 20 separate queries (1 + 20 = 21 total queries)

**Fix**: Batch fetch all messages in one query, then map to conversations

---

### 2. parent_dashboard.py - Lines 1266-1279
**Location**: `get_student_quest_view()` endpoint
**Pattern**: Loop over evidence blocks, query uploader name for each block individually

```python
# BEFORE (N+1 Pattern)
for block in blocks_response.data:
    enriched_block = dict(block)

    # Get uploader name if available
    if block.get('uploaded_by_user_id'):
        uploader_response = supabase.table('users')\
            .select('display_name, first_name, last_name')\
            .eq('id', block['uploaded_by_user_id'])\
            .single()\
            .execute()
```

**Impact**: For 10 evidence blocks, this makes 10 separate queries (1 + 10 = 11 total queries)

**Fix**: Collect all uploader_ids first, batch fetch users in one query with `.in_()`

---

## Already Optimized Patterns (Good Examples)

### evidence_documents.py - Lines 94-99
**Pattern**: Batch fetch uploader names (ALREADY OPTIMIZED)

```python
# GOOD - Batch loading pattern
uploader_ids = [b['uploaded_by_user_id'] for b in blocks_response.data if b.get('uploaded_by_user_id')]
uploader_names = {}
if uploader_ids:
    uploaders = supabase.table('users').select('id, first_name, last_name').in_('id', list(set(uploader_ids))).execute()
    for u in uploaders.data:
        uploader_names[u['id']] = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
```

### parent_dashboard.py - Lines 240-268
**Pattern**: Batch fetch tasks and completions for active quests (ALREADY OPTIMIZED)

```python
# GOOD - Batch loading pattern
if active_quest_ids:
    all_tasks_response = supabase.table('user_quest_tasks').select('id, quest_id').eq(
        'user_id', student_id
    ).in_('quest_id', active_quest_ids).execute()

    all_completions_response = supabase.table('quest_task_completions').select('task_id, quest_id, user_quest_task_id').eq(
        'user_id', student_id
    ).in_('quest_id', active_quest_ids).execute()
```

### parent_dashboard.py - Lines 349-355
**Pattern**: Batch fetch task details (ALREADY OPTIMIZED)

```python
# GOOD - Batch loading pattern
all_task_ids = list(set(personalized_ids + template_ids))
if all_task_ids:
    tasks_response = supabase.table('user_quest_tasks').select('''
        id, title, pillar, xp_value, quest_id
    ''').in_('id', all_task_ids).execute()
```

---

## Recommended Fixes

### Fix 1: Batch fetch tutor messages

```python
# AFTER (Optimized)
conversations = []
conversation_ids = [conv['id'] for conv in conversations_response.data]

# Batch fetch last messages for all conversations
if conversation_ids:
    # Get latest message for each conversation using window function or subquery
    messages_response = supabase.table('tutor_messages').select('''
        conversation_id, content, role, safety_level, created_at
    ''').in_('conversation_id', conversation_ids).order('created_at', desc=True).execute()

    # Group by conversation_id and take first (latest) for each
    messages_map = {}
    for msg in messages_response.data:
        conv_id = msg['conversation_id']
        if conv_id not in messages_map:
            messages_map[conv_id] = msg

    # Build conversations with mapped messages
    for conv in conversations_response.data:
        last_message = messages_map.get(conv['id'])
        conversations.append({
            'id': conv['id'],
            'title': conv.get('title'),
            'mode': conv.get('conversation_mode'),
            'message_count': conv.get('message_count', 0),
            'last_message_at': conv.get('last_message_at'),
            'created_at': conv['created_at'],
            'last_message_preview': last_message['content'][:100] if last_message else None,
            'last_message_safety': last_message['safety_level'] if last_message else 'safe'
        })
```

### Fix 2: Batch fetch uploader names

```python
# AFTER (Optimized)
if blocks_response.data:
    # Collect all unique uploader IDs
    uploader_ids = list(set(
        block['uploaded_by_user_id']
        for block in blocks_response.data
        if block.get('uploaded_by_user_id')
    ))

    # Batch fetch all uploaders in one query
    uploaders_map = {}
    if uploader_ids:
        uploaders_response = supabase.table('users')\
            .select('id, display_name, first_name, last_name')\
            .in_('id', uploader_ids)\
            .execute()

        for uploader in uploaders_response.data:
            uploaders_map[uploader['id']] = (
                uploader.get('display_name') or
                f"{uploader.get('first_name', '')} {uploader.get('last_name', '')}".strip() or
                'Unknown'
            )

    # Enrich blocks with uploader names
    enriched_blocks = []
    for block in blocks_response.data:
        enriched_block = dict(block)

        if block.get('uploaded_by_user_id'):
            enriched_block['uploaded_by_name'] = uploaders_map.get(
                block['uploaded_by_user_id'],
                'Unknown'
            )

        enriched_blocks.append(enriched_block)

    evidence_blocks = enriched_blocks
    evidence_type = 'multi_format'
```

---

## Performance Impact

### Before Fixes
- `get_student_communications()`: 1 + 20 = **21 queries**
- `get_student_quest_view()`: 1 + N (evidence blocks) = **up to 11+ queries**

### After Fixes
- `get_student_communications()`: 1 + 1 = **2 queries** (90% reduction)
- `get_student_quest_view()`: 1 + 1 = **2 queries** (82% reduction)

---

## Next Steps

1. Apply Fix 1 to `parent_dashboard.py` lines 976-998
2. Apply Fix 2 to `parent_dashboard.py` lines 1259-1283
3. Test endpoints with production-like data volumes
4. Monitor query performance in logs
5. Consider similar patterns in other mega-files (auth.py, quests.py, tutor.py)

---

## Notes

- The codebase already has good examples of batch loading patterns (see "Already Optimized" section)
- Most N+1 patterns occur in parent_dashboard.py because it's a mega-file (1,375 lines)
- Per P2-ARCH-1, parent_dashboard.py should be split into smaller modules before further optimization
- evidence_documents.py is already well-optimized with proper batch loading patterns
