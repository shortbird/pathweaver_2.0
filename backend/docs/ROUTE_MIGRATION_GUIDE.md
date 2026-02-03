# Route Migration Guide - Repository Pattern Adoption

## Overview

This guide provides step-by-step instructions and code examples for migrating route files to use the repository pattern instead of direct database access.

## Why Migrate?

**Benefits:**
- Single source of truth for database queries
- Automatic RLS enforcement through user-authenticated clients
- Easier testing (mock repositories instead of database)
- Consistent error handling and logging
- Reduced code duplication
- Better performance through optimized query patterns

**Before Migration:**
```python
from database import get_supabase_client

@bp.route('/users/<user_id>/quests', methods=['GET'])
@require_auth
def get_user_quests(current_user_id, user_id):
    supabase = get_supabase_client()
    result = supabase.table('user_quests')\
        .select('*, quests(*)')\
        .eq('user_id', user_id)\
        .eq('is_active', True)\
        .execute()

    return jsonify(result.data or []), 200
```

**After Migration:**
```python
from backend.repositories import QuestRepository

@bp.route('/users/<user_id>/quests', methods=['GET'])
@require_auth
def get_user_quests(current_user_id, user_id):
    quest_repo = QuestRepository(user_id=current_user_id)

    try:
        quests = quest_repo.get_user_active_quests(user_id)
        return jsonify(quests), 200
    except DatabaseError as e:
        logger.error(f"Error fetching quests: {e}")
        return jsonify({'error': 'Failed to fetch quests'}), 500
```

## Migration Steps

### Step 1: Add Repository Imports

Add repository imports at the top of your route file:

```python
from backend.repositories import (
    UserRepository,
    QuestRepository,
    TaskRepository,
    TaskCompletionRepository,
    BadgeRepository,
    EvidenceRepository,
    FriendshipRepository,
    ParentRepository,
    TutorRepository,
    LMSRepository,
    AnalyticsRepository
)
```

### Step 2: Remove Direct Database Access

**Remove these imports:**
```python
# Remove direct database imports
from database import get_supabase_admin_client  # Remove
from database import get_user_client  # Remove
from database import get_supabase_client  # Remove
```

**Keep authentication decorators:**
```python
# Keep these
from utils.auth.decorators import require_auth, require_admin
from utils.logger import get_logger
```

### Step 3: Initialize Repositories in Route Handlers

**Pattern for user-scoped operations (with RLS):**
```python
@bp.route('/endpoint', methods=['GET'])
@require_auth
def handler(user_id):
    # Initialize with user_id for RLS enforcement
    user_repo = UserRepository(user_id=user_id)
    quest_repo = QuestRepository(user_id=user_id)

    # Use repository methods
    user = user_repo.find_by_id(user_id)
    quests = quest_repo.get_user_active_quests(user_id)
```

**Pattern for admin operations (no RLS):**
```python
@bp.route('/admin/endpoint', methods=['GET'])
@require_admin
def admin_handler(admin_id):
    # No user_id = uses admin client (bypasses RLS)
    analytics_repo = AnalyticsRepository()

    # Use repository methods
    stats = analytics_repo.get_user_stats()
```

### Step 4: Replace Direct Table Access with Repository Methods

#### Common Patterns

**Pattern 1: Find by ID**

Before:
```python
result = supabase.table('users').select('*').eq('id', user_id).execute()
user = result.data[0] if result.data else None
```

After:
```python
user = user_repo.find_by_id(user_id)
```

**Pattern 2: Find with Filters**

Before:
```python
result = supabase.table('quests')\
    .select('*')\
    .eq('is_active', True)\
    .eq('source', 'optio')\
    .execute()
quests = result.data or []
```

After:
```python
quests = quest_repo.get_active_quests(source='optio')
```

**Pattern 3: Insert/Create**

Before:
```python
result = supabase.table('friendships').insert({
    'requester_id': user_id,
    'addressee_id': friend_id,
    'status': 'pending'
}).execute()
friendship = result.data[0]
```

After:
```python
friendship = friendship_repo.create_request(user_id, friend_id)
```

**Pattern 4: Update**

Before:
```python
result = supabase.table('users')\
    .update({'display_name': new_name})\
    .eq('id', user_id)\
    .execute()
user = result.data[0]
```

After:
```python
user = user_repo.update_profile(user_id, display_name=new_name)
```

**Pattern 5: Delete**

Before:
```python
result = supabase.table('friendships')\
    .delete()\
    .eq('id', friendship_id)\
    .execute()
```

After:
```python
friendship_repo.delete(friendship_id)
```

### Step 5: Optimize N+1 Queries with Batch Methods

**Before (N+1 query problem):**
```python
friendships = supabase.table('friendships').select('*').eq('user_id', user_id).execute()

# BAD: Fetches each user one at a time
friends = []
for friendship in friendships.data:
    friend_result = supabase.table('users').select('*').eq('id', friendship['friend_id']).execute()
    if friend_result.data:
        friends.append(friend_result.data[0])
```

**After (single batch query):**
```python
friendships = friendship_repo.find_by_user(user_id)

# GOOD: Fetches all users in a single query
friend_ids = [f['addressee_id'] if f['requester_id'] == user_id else f['requester_id']
              for f in friendships]
user_lookup = user_repo.get_basic_profiles(friend_ids)

friends = [user_lookup[fid] for fid in friend_ids if fid in user_lookup]
```

### Step 6: Add Proper Error Handling

**Always wrap repository calls in try/except:**

```python
from backend.repositories import NotFoundError, DatabaseError, PermissionError

@bp.route('/users/<user_id>', methods=['GET'])
@require_auth
def get_user(current_user_id, user_id):
    user_repo = UserRepository(user_id=current_user_id)

    try:
        user = user_repo.find_by_id(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify(user), 200

    except PermissionError as e:
        logger.warning(f"Permission denied for user {current_user_id}: {e}")
        return jsonify({'error': 'Forbidden'}), 403

    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        return jsonify({'error': 'Internal server error'}), 500
```

## Complete Migration Examples

### Example 1: User Profile Endpoint

**Before:**
```python
@bp.route('/users/<user_id>/profile', methods=['GET'])
@require_auth
def get_profile(current_user_id, user_id):
    supabase = get_supabase_client()

    result = supabase.table('users').select('*').eq('id', user_id).execute()

    if not result.data:
        return jsonify({'error': 'User not found'}), 404

    return jsonify(result.data[0]), 200
```

**After:**
```python
@bp.route('/users/<user_id>/profile', methods=['GET'])
@require_auth
def get_profile(current_user_id, user_id):
    user_repo = UserRepository(user_id=current_user_id)

    try:
        user = user_repo.get_profile(user_id)
        return jsonify(user), 200
    except NotFoundError:
        return jsonify({'error': 'User not found'}), 404
    except DatabaseError as e:
        logger.error(f"Error fetching profile: {e}")
        return jsonify({'error': 'Internal server error'}), 500
```

### Example 2: Quest Enrollment with Task Creation

**Before:**
```python
@bp.route('/quests/<quest_id>/start', methods=['POST'])
@require_auth
def start_quest(user_id, quest_id):
    supabase = get_supabase_client()

    # Check if already enrolled
    existing = supabase.table('user_quests')\
        .select('*')\
        .eq('user_id', user_id)\
        .eq('quest_id', quest_id)\
        .execute()

    if existing.data:
        return jsonify({'error': 'Already enrolled'}), 400

    # Create enrollment
    enrollment = supabase.table('user_quests').insert({
        'user_id': user_id,
        'quest_id': quest_id,
        'is_active': True
    }).execute()

    # Get quest tasks
    tasks = supabase.table('quest_tasks')\
        .select('*')\
        .eq('quest_id', quest_id)\
        .execute()

    return jsonify({
        'enrollment': enrollment.data[0],
        'tasks': tasks.data or []
    }), 201
```

**After:**
```python
@bp.route('/quests/<quest_id>/start', methods=['POST'])
@require_auth
def start_quest(user_id, quest_id):
    quest_repo = QuestRepository(user_id=user_id)
    task_repo = TaskRepository(user_id=user_id)

    try:
        # Check and create enrollment
        enrollment = quest_repo.enroll_user(user_id, quest_id)

        # Get quest tasks
        tasks = task_repo.find_by_quest(quest_id, user_id=user_id)

        return jsonify({
            'enrollment': enrollment,
            'tasks': tasks
        }), 201

    except DatabaseError as e:
        logger.error(f"Error starting quest: {e}")
        return jsonify({'error': str(e)}), 500
```

### Example 3: Complex Query with Joins

**Before:**
```python
@bp.route('/users/<user_id>/completed-quests', methods=['GET'])
@require_auth
def get_completed_quests(current_user_id, user_id):
    supabase = get_supabase_client()

    result = supabase.table('user_quests')\
        .select('quest_id, completed_at, quests(*)')\
        .eq('user_id', user_id)\
        .not_.is_('completed_at', 'null')\
        .order('completed_at', desc=True)\
        .execute()

    quests = []
    for enrollment in result.data or []:
        if enrollment.get('quests'):
            quest = enrollment['quests']
            quest['completed_at'] = enrollment['completed_at']
            quests.append(quest)

    return jsonify(quests), 200
```

**After:**
```python
@bp.route('/users/<user_id>/completed-quests', methods=['GET'])
@require_auth
def get_completed_quests(current_user_id, user_id):
    quest_repo = QuestRepository(user_id=current_user_id)

    try:
        quests = quest_repo.get_completed_quests(user_id)
        return jsonify(quests), 200
    except DatabaseError as e:
        logger.error(f"Error fetching completed quests: {e}")
        return jsonify({'error': 'Failed to fetch quests'}), 500
```

### Example 4: Admin Analytics Dashboard

**Before:**
```python
@bp.route('/admin/analytics', methods=['GET'])
@require_admin
def get_analytics(admin_id):
    supabase = get_supabase_admin_client()

    # User stats
    user_count = supabase.table('users').select('id', count='exact').execute()

    # Quest stats
    quest_count = supabase.table('quests').select('id', count='exact').execute()

    # XP stats
    xp_stats = supabase.table('users')\
        .select('total_xp')\
        .order('total_xp', desc=True)\
        .limit(10)\
        .execute()

    return jsonify({
        'total_users': user_count.count,
        'total_quests': quest_count.count,
        'top_users': xp_stats.data
    }), 200
```

**After:**
```python
@bp.route('/admin/analytics', methods=['GET'])
@require_admin
def get_analytics(admin_id):
    analytics_repo = AnalyticsRepository()  # No user_id = admin client

    try:
        stats = {
            'users': analytics_repo.get_user_stats(),
            'quests': analytics_repo.get_quest_stats(),
            'top_users': analytics_repo.get_top_users(limit=10)
        }
        return jsonify(stats), 200
    except DatabaseError as e:
        logger.error(f"Error fetching analytics: {e}")
        return jsonify({'error': 'Failed to fetch analytics'}), 500
```

## Available Repository Methods

### UserRepository

```python
# Find operations
user = user_repo.find_by_id(user_id)
user = user_repo.find_by_email(email)
user = user_repo.find_by_slug(portfolio_slug)
users = user_repo.find_by_role('student', limit=100)
users = user_repo.search_by_display_name('John', limit=20)

# Batch operations (prevents N+1 queries)
user_lookup = user_repo.find_by_ids(['id1', 'id2', 'id3'])
profiles = user_repo.get_basic_profiles(['id1', 'id2'])

# Update operations
user = user_repo.update_profile(user_id, display_name='New Name', bio='Bio')
user = user_repo.update_xp(user_id, total_xp=1000, level=5)
user = user_repo.increment_achievements(user_id)
user = user_repo.update_streak(user_id, streak_days=7)
success = user_repo.update_last_active(user_id)

# Stats
stats = user_repo.get_dashboard_stats(user_id)
```

### QuestRepository

```python
# Find operations
quest = quest_repo.find_by_id(quest_id)
quests = quest_repo.get_active_quests(source='optio', limit=50)
quest = quest_repo.get_quest_with_tasks(quest_id)
quest = quest_repo.get_user_quest_progress(user_id, quest_id)
quests = quest_repo.search_quests('math', limit=20)

# Enrollment operations
quests = quest_repo.get_user_active_quests(user_id, limit=20)
enrollment = quest_repo.get_user_enrollment(user_id, quest_id)
enrollments = quest_repo.get_user_enrollments(user_id, is_active=True)
enrollment = quest_repo.enroll_user(user_id, quest_id)
success = quest_repo.abandon_quest(user_id, quest_id)

# Completion
enrollment = quest_repo.complete_quest(user_id, quest_id)
quests = quest_repo.get_completed_quests(user_id, limit=50)
```

### TaskRepository & TaskCompletionRepository

```python
# TaskRepository
tasks = task_repo.find_by_quest(quest_id, user_id=user_id)
tasks = task_repo.find_by_user_quest(user_quest_id)
task = task_repo.create_task({'quest_id': id, 'user_id': id, 'title': 'Task'})
task = task_repo.update_task(task_id, {'title': 'Updated'})
success = task_repo.delete_task(task_id)

# TaskCompletionRepository
completions = completion_repo.find_by_user_quest(user_id, quest_id)
completions = completion_repo.find_by_task(task_id, user_id=user_id)
completion = completion_repo.create_completion({
    'user_id': user_id,
    'quest_id': quest_id,
    'user_quest_task_id': task_id
})
count = completion_repo.get_completion_count(user_id, quest_id=quest_id)
success = completion_repo.delete_completion(completion_id)
```

### FriendshipRepository

```python
# Find operations
friendships = friendship_repo.find_by_user(user_id, status='accepted')
friendship = friendship_repo.find_by_id(friendship_id)

# Request operations
friendship = friendship_repo.create_request(requester_id, addressee_id)
friendship = friendship_repo.accept_request(friendship_id, user_id)
friendship = friendship_repo.decline_request(friendship_id, user_id)
success = friendship_repo.cancel_request(friendship_id, user_id)

# Check relationship
is_connected = friendship_repo.check_friendship(user_id, other_user_id)
```

### EvidenceRepository

```python
# Find operations
evidence_list = evidence_repo.find_by_task_completion(task_completion_id)
evidence = evidence_repo.find_by_id(evidence_id)

# Create
evidence = evidence_repo.create_evidence({
    'user_id': user_id,
    'task_completion_id': completion_id,
    'file_name': 'document.pdf',
    'file_type': 'application/pdf',
    'file_url': 'https://...',
    'file_size': 1024000
})

# Delete
success = evidence_repo.delete(evidence_id)
```

### BadgeRepository

```python
# Find operations
badge = badge_repo.find_by_id(badge_id)
badges = badge_repo.get_active_badges(pillar='stem')

# Progress
progress = badge_repo.get_user_progress(user_id, badge_id)
badges = badge_repo.get_user_badges_with_progress(user_id)

# Award
badge_progress = badge_repo.award_badge(user_id, badge_id)
```

## Migration Checklist

- [ ] Add repository imports to route file
- [ ] Remove direct database imports (get_supabase_client, get_supabase_admin_client, get_user_client)
- [ ] Initialize repositories in route handlers
- [ ] Replace all .table() calls with repository methods
- [ ] Add try/except blocks with proper error handling
- [ ] Replace N+1 queries with batch fetch methods
- [ ] Test all endpoints thoroughly
- [ ] Remove any unused imports
- [ ] Update any route-level comments to reflect repository usage

## Testing Migrated Routes

1. **Unit tests**: Mock repositories instead of database
2. **Integration tests**: Test actual repository behavior
3. **Manual testing**: Verify endpoints work as expected
4. **Performance testing**: Check for N+1 query improvements

## Common Pitfalls

1. **Forgetting RLS**: Always pass `user_id` for user-scoped operations
2. **N+1 queries**: Use batch fetch methods when loading related data
3. **Error handling**: Always wrap in try/except with specific exception types
4. **Admin operations**: Don't pass `user_id` for admin/analytics endpoints
5. **Import paths**: Use `backend.repositories` not `repositories`

## Getting Help

- See [REPOSITORY_PATTERN.md](./REPOSITORY_PATTERN.md) for repository documentation
- Check existing migrated routes for examples (community.py, portfolio.py)
- Review repository source code in `backend/repositories/`
- Run migration analysis script: `python backend/scripts/complete_route_migration.py`
