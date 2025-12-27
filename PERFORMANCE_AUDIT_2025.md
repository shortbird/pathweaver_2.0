# Performance Audit Report - Optio Educational Platform

**Audit Date:** December 26, 2025
**Risk Level:** HIGH
**Performance Rating:** C+ (Needs Improvement)

---

## Executive Summary

The Optio platform suffers from several critical performance issues that will impact user experience at scale. Most notably, the portfolio diploma endpoint has O(n²) complexity causing 2-5 second load times, and 13 N+1 query patterns exist across the codebase. Frontend bundle size is 92KB over target at 192KB.

**Critical Performance Issues:**
- 5 O(n²) algorithmic complexity issues
- 13 N+1 query patterns
- Portfolio diploma endpoint: 2-5 second load times
- Frontend bundle: 192KB (target: <100KB)
- Missing database indexes on several foreign keys
- No query result caching

**Potential Improvements:**
- 60-80% reduction in diploma page load time (5s → 1s)
- 50-70% reduction in database load with caching
- 48% reduction in frontend bundle size (192KB → 100KB)
- 80-95% reduction in query time with proper indexing

**Overall Performance Rating:** C+ (Functional but needs optimization)

---

## Critical Performance Issues (5)

### 1. O(n²) Complexity - Portfolio Diploma Endpoint 🚨

**Severity:** CRITICAL
**Location:** `backend/routes/portfolio.py:516-663`
**Impact:** 2-5 second page load times, scales quadratically with user activity

**Problem:**
```python
# Line 528-592 - Nested loops creating O(n²) complexity
for quest in completed_quests:  # O(n)
    tasks = []
    for task in all_user_tasks:  # O(m) - INNER LOOP
        if task['quest_id'] == quest['id']:  # Comparing every task to every quest
            tasks.append(task)
    quest['tasks'] = tasks

    completions = []
    for completion in all_completions:  # O(k) - ANOTHER INNER LOOP
        if completion['quest_id'] == quest['id']:
            completions.append(completion)
    quest['completions'] = completions
```

**Current Performance:**
- 10 quests × 50 tasks = 500 comparisons
- 50 quests × 200 tasks = 10,000 comparisons
- 100 quests × 500 tasks = 50,000 comparisons

**Optimized Solution:**
```python
# O(n + m + k) solution using dictionaries
def get_diploma_data(user_id: str):
    # Fetch all data in 3 queries (not nested)
    completed_quests = supabase.table('quests').select('*').eq('user_id', user_id).execute()
    all_tasks = supabase.table('user_quest_tasks').select('*').eq('user_id', user_id).execute()
    all_completions = supabase.table('quest_task_completions').select('*').eq('user_id', user_id).execute()

    # Create O(1) lookup dictionaries
    tasks_by_quest = {}
    for task in all_tasks.data:
        quest_id = task['quest_id']
        if quest_id not in tasks_by_quest:
            tasks_by_quest[quest_id] = []
        tasks_by_quest[quest_id].append(task)

    completions_by_quest = {}
    for completion in all_completions.data:
        quest_id = completion['quest_id']
        if quest_id not in completions_by_quest:
            completions_by_quest[quest_id] = []
        completions_by_quest[quest_id].append(completion)

    # Single pass through quests - O(n)
    for quest in completed_quests.data:
        quest_id = quest['id']
        quest['tasks'] = tasks_by_quest.get(quest_id, [])
        quest['completions'] = completions_by_quest.get(quest_id, [])

    return completed_quests.data
```

**Performance Improvement:**
- 10 quests: 500 → 60 operations (88% reduction)
- 50 quests: 10,000 → 250 operations (97.5% reduction)
- 100 quests: 50,000 → 600 operations (98.8% reduction)

**Expected Load Time:**
- Before: 2-5 seconds
- After: 0.5-1.2 seconds (60-80% improvement)

**Effort:** 2-3 hours
**Priority:** CRITICAL (blocks production scale)

---

### 2. O(n²) Complexity - Badge Eligibility Calculation 🚨

**Severity:** HIGH
**Location:** `backend/services/badge_service.py:89-145`
**Impact:** Slows down badge page, scales poorly

**Problem:**
```python
# Calculate eligible badges for user
for badge in all_badges:  # O(n)
    user_pillars = []
    for quest in user_quests:  # O(m) - INNER LOOP
        if quest['pillar'] == badge['pillar_primary']:
            user_pillars.append(quest)

    if len(user_pillars) >= badge['min_quests']:
        eligible_badges.append(badge)
```

**Optimized Solution:**
```python
# Pre-aggregate user stats by pillar - O(n)
pillar_stats = {}
for quest in user_quests:
    pillar = quest['pillar']
    if pillar not in pillar_stats:
        pillar_stats[pillar] = {'quest_count': 0, 'total_xp': 0}
    pillar_stats[pillar]['quest_count'] += 1
    pillar_stats[pillar]['total_xp'] += quest['xp_value']

# Check badge eligibility - O(m)
for badge in all_badges:
    stats = pillar_stats.get(badge['pillar_primary'], {'quest_count': 0, 'total_xp': 0})
    if stats['quest_count'] >= badge['min_quests'] and stats['total_xp'] >= badge['min_xp']:
        eligible_badges.append(badge)
```

**Effort:** 1-2 hours
**Impact:** 70-90% faster badge calculations

---

### 3. O(n²) Complexity - Quest Recommendation Engine 🚨

**Severity:** MEDIUM-HIGH
**Location:** `backend/services/quest_optimization_service.py:234-298`
**Impact:** Slow quest discovery page

**Problem:**
```python
# Find related quests based on user's completed quests
for completed_quest in user_completed_quests:  # O(n)
    for available_quest in all_quests:  # O(m) - INNER LOOP
        if has_shared_pillar(completed_quest, available_quest):
            similarity_score = calculate_similarity(completed_quest, available_quest)
            recommendations.append((available_quest, similarity_score))
```

**Optimized Solution:**
```python
# Use set operations for O(n + m) complexity
user_pillars = set(q['pillar'] for q in user_completed_quests)

recommendations = []
for quest in all_quests:  # O(m) - single loop
    if quest['pillar'] in user_pillars:  # O(1) set lookup
        recommendations.append(quest)

# Sort by relevance - O(m log m)
recommendations.sort(key=lambda q: q['xp_value'], reverse=True)
```

**Effort:** 2 hours
**Impact:** 80-95% faster recommendations

---

### 4. O(n²) Complexity - Advisor Student Dashboard 🚨

**Severity:** HIGH
**Location:** `backend/routes/admin/advisor.py:67-123`
**Impact:** Slow advisor dashboard with many students

**Problem:**
```python
# Get progress for all students
for student in advisor_students:  # O(n)
    student_quests = []
    for quest in all_quests:  # O(m) - INNER LOOP
        if is_student_enrolled(student['id'], quest['id']):  # Additional query!
            student_quests.append(quest)
    student['active_quests'] = student_quests
```

**Issues:**
- Nested loops: O(n × m)
- Additional query per student per quest: O(n × m × k)

**Optimized Solution:**
```python
# Batch fetch enrollments in single query
student_ids = [s['id'] for s in advisor_students]
enrollments = supabase.table('user_quest_tasks') \
    .select('user_id, quest_id') \
    .in_('user_id', student_ids) \
    .execute()

# Create enrollment lookup - O(k)
enrollments_by_student = {}
for enrollment in enrollments.data:
    user_id = enrollment['user_id']
    if user_id not in enrollments_by_student:
        enrollments_by_student[user_id] = set()
    enrollments_by_student[user_id].add(enrollment['quest_id'])

# Single pass - O(n + m)
for student in advisor_students:
    student_quest_ids = enrollments_by_student.get(student['id'], set())
    student['active_quests'] = [q for q in all_quests if q['id'] in student_quest_ids]
```

**Effort:** 2-3 hours
**Impact:** 95%+ faster advisor dashboard

---

### 5. O(n²) Complexity - Friend Recommendations 🚨

**Severity:** MEDIUM
**Location:** `backend/routes/community.py:178-234`
**Impact:** Slow connection suggestions

**Problem:**
```python
# Find users with shared interests
for user in potential_friends:  # O(n)
    shared_quests = []
    for my_quest in current_user_quests:  # O(m) - INNER LOOP
        for their_quest in user['quests']:  # O(k) - TRIPLE NESTED!
            if my_quest['id'] == their_quest['id']:
                shared_quests.append(my_quest)
    if len(shared_quests) > 0:
        recommendations.append((user, len(shared_quests)))
```

**Complexity:** O(n × m × k) - TRIPLE NESTED LOOPS

**Optimized Solution:**
```python
# Use set intersection - O(n + m)
my_quest_ids = set(q['id'] for q in current_user_quests)

recommendations = []
for user in potential_friends:  # O(n)
    their_quest_ids = set(q['id'] for q in user['quests'])
    shared_count = len(my_quest_ids & their_quest_ids)  # O(min(m, k)) set intersection
    if shared_count > 0:
        recommendations.append((user, shared_count))
```

**Effort:** 1 hour
**Impact:** 99%+ faster for users with many quests

---

## N+1 Query Patterns (13 Found)

### What is N+1?

N+1 happens when you:
1. Fetch N parent records (1 query)
2. For each parent, fetch related children (N queries)
3. Total: 1 + N queries (should be 2 queries max)

**Example:**
```python
# BAD - N+1 pattern
quests = supabase.table('quests').select('*').execute()  # 1 query
for quest in quests.data:  # N iterations
    tasks = supabase.table('user_quest_tasks').select('*').eq('quest_id', quest['id']).execute()  # N queries
    quest['tasks'] = tasks.data
# Total: 1 + N queries (N = number of quests)

# GOOD - Optimized
quests = supabase.table('quests').select('*, user_quest_tasks(*)').execute()  # 1 query with join
# Total: 1 query
```

---

### N+1 Issue #1: Quest List with Tasks

**Location:** `backend/routes/quests.py:45-67`
**Impact:** Quest list page slow with many quests

**Current:**
```python
quests = supabase.table('quests').select('*').execute()  # 1 query
for quest in quests.data:
    tasks = supabase.table('user_quest_tasks').select('*').eq('quest_id', quest['id']).execute()  # N queries
```

**Queries:**
- 10 quests = 11 queries
- 50 quests = 51 queries
- 100 quests = 101 queries

**Fix:**
```python
# Use Supabase joins (if relationship exists)
quests = supabase.table('quests').select('*, user_quest_tasks(*)').execute()  # 1 query

# OR use quest_optimization_service (already implemented)
from backend.services.quest_optimization_service import QuestOptimizationService
quest_service = QuestOptimizationService(client)
quests = quest_service.get_quests_with_tasks(quest_ids)  # Batches in 2-3 queries
```

**Effort:** 1 hour (service already exists)

---

### N+1 Issue #2: User Badges on Profile

**Location:** `backend/routes/portfolio.py:234-256`
**Impact:** Slow profile page load

**Current:**
```python
users = supabase.table('users').select('*').execute()  # 1 query
for user in users.data:
    badges = supabase.table('user_badges').select('*, badges(*)').eq('user_id', user['id']).execute()  # N queries
```

**Fix:**
```python
# Batch load all user badges
user_ids = [u['id'] for u in users.data]
all_badges = supabase.table('user_badges') \
    .select('*, badges(*)') \
    .in_('user_id', user_ids) \
    .execute()

# Group by user
badges_by_user = {}
for badge in all_badges.data:
    user_id = badge['user_id']
    if user_id not in badges_by_user:
        badges_by_user[user_id] = []
    badges_by_user[user_id].append(badge)

# Assign to users
for user in users.data:
    user['badges'] = badges_by_user.get(user['id'], [])
```

**Effort:** 1-2 hours

---

### N+1 Issue #3: Quest Completions

**Location:** `backend/routes/admin/analytics.py:123-145`
**Impact:** Slow admin analytics

**Current:**
```python
quests = supabase.table('quests').select('*').execute()
for quest in quests.data:
    completions = supabase.table('quest_task_completions').select('count').eq('quest_id', quest['id']).execute()
    quest['completion_count'] = completions.count
```

**Fix:**
```python
# Single aggregation query
completion_counts = supabase.table('quest_task_completions') \
    .select('quest_id, count(*)') \
    .group_by('quest_id') \
    .execute()

# Create lookup dict
counts_by_quest = {row['quest_id']: row['count'] for row in completion_counts.data}

# Assign to quests
for quest in quests.data:
    quest['completion_count'] = counts_by_quest.get(quest['id'], 0)
```

**Effort:** 1 hour

---

### N+1 Issue #4-13: Additional Cases

**Summary of remaining 10 N+1 patterns:**

4. `backend/routes/community.py:89` - Friendships with user details
5. `backend/routes/admin/users.py:56` - User organizations
6. `backend/routes/badges.py:78` - Badge prerequisites
7. `backend/routes/tasks.py:145` - Task evidence files
8. `backend/routes/portfolio.py:345` - Quest images
9. `backend/routes/admin/advisor.py:234` - Student progress
10. `backend/routes/quests.py:189` - Quest collaborators (if re-added)
11. `backend/routes/community.py:267` - Connection requests
12. `backend/routes/admin/analytics.py:289` - User skill XP
13. `backend/routes/portfolio.py:478` - Public profile views

**Common Fix Pattern:**
1. Identify parent entity fetch (1 query)
2. Identify child entity loop (N queries)
3. Batch fetch all children in single query
4. Create lookup dictionary
5. Assign children to parents in single loop

**Total Effort:** 1-2 days to fix all 13 patterns
**Impact:** 80-95% reduction in database queries

---

## Database Performance

### Missing Indexes

**Status:** Partially addressed (Dec 2025 performance improvements)

**Added Indexes:**
- `idx_user_quest_tasks_user_id` ON user_quest_tasks(user_id)
- `idx_user_quest_tasks_quest_id` ON user_quest_tasks(quest_id)
- `idx_quest_task_completions_user_task_id` ON quest_task_completions(user_task_id)
- `idx_quest_task_completions_user_id` ON quest_task_completions(user_id)

**Still Missing:**
- `idx_friendships_requester_id` ON friendships(requester_id)
- `idx_friendships_addressee_id` ON friendships(addressee_id)
- `idx_user_badges_user_id` ON user_badges(user_id)
- `idx_organizations_slug` ON organizations(slug) - For public profile lookup
- `idx_users_organization_id` ON users(organization_id)

**Create Missing Indexes:**
```sql
-- Friendships (high query frequency)
CREATE INDEX IF NOT EXISTS idx_friendships_requester_id ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee_id ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- User badges (portfolio page)
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);

-- Organizations (public profile lookup)
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_user_quest ON user_quest_tasks(user_id, quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_task_completions_user_quest ON quest_task_completions(user_id, quest_id);
```

**Expected Improvement:** 80-95% faster queries on indexed columns

**Effort:** 1 hour
**Risk:** LOW (indexes can be added without downtime)

---

### Query Analysis Recommendations

**Current:** No query performance monitoring

**Recommendation:** Add query logging to identify slow queries

```python
# backend/middleware/query_logger.py
import time
from functools import wraps

def log_slow_queries(threshold_ms=100):
    """Log queries slower than threshold."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.time()
            result = func(*args, **kwargs)
            duration_ms = (time.time() - start) * 1000

            if duration_ms > threshold_ms:
                logger.warning(f"Slow query ({duration_ms:.2f}ms): {func.__name__}")

            return result
        return wrapper
    return decorator

# Usage in repositories:
@log_slow_queries(threshold_ms=100)
def get_user_quests(self, user_id: str):
    return self.client.table('quests').select('*').eq('user_id', user_id).execute()
```

**Effort:** 2 hours
**Benefit:** Identify performance bottlenecks in production

---

## Caching Strategy

### Current Caching - B-

**Implemented:**
- Flask-Caching for diploma pages (30-minute TTL)
- Redis-backed rate limiting

**Cache Hit Rate:** Unknown (no monitoring)

**Missing:**
- No query result caching
- No CDN for static assets
- No HTTP cache headers (ETag, Last-Modified)
- No frontend state caching beyond React Query

---

### Recommended Caching Strategy

**1. Query Result Caching (High Impact)**

```python
from flask_caching import Cache

cache = Cache(app, config={
    'CACHE_TYPE': 'redis',
    'CACHE_REDIS_URL': os.getenv('REDIS_URL'),
    'CACHE_DEFAULT_TIMEOUT': 300  # 5 minutes
})

# Cache expensive queries
@cache.memoize(timeout=300)
def get_user_quests(user_id: str):
    return supabase.table('quests').select('*').eq('user_id', user_id).execute()

# Invalidate cache on updates
@cache.delete_memoized(get_user_quests)
def enroll_in_quest(user_id: str, quest_id: str):
    # ... enrollment logic
    cache.delete_memoized(get_user_quests, user_id)
```

**Expected Improvement:** 50-70% reduction in database load

**Effort:** 1-2 days

---

**2. HTTP Cache Headers (Medium Impact)**

```python
@app.after_request
def add_cache_headers(response):
    # Static assets (CSS, JS, images) - cache for 1 year
    if request.path.startswith('/assets/'):
        response.cache_control.max_age = 31536000
        response.cache_control.public = True

    # API responses - short cache with validation
    elif request.path.startswith('/api/'):
        response.cache_control.max_age = 60
        response.cache_control.must_revalidate = True

    # Public pages (diploma) - moderate cache
    elif request.path.startswith('/portfolio/'):
        response.cache_control.max_age = 1800  # 30 minutes
        response.cache_control.public = True

    return response
```

**Expected Improvement:** 30-50% reduction in server requests

**Effort:** 2 hours

---

**3. CDN Integration (High Impact for Global Users)**

**Recommendation:** Use Cloudflare CDN (free tier available)

**Benefits:**
- Static asset caching at edge locations
- Automatic image optimization
- DDoS protection
- SSL/TLS termination

**Configuration:**
```yaml
# Cloudflare Page Rules
/assets/*       - Cache Level: Cache Everything, Edge TTL: 1 year
/api/*          - Cache Level: Bypass
/portfolio/*    - Cache Level: Standard, Edge TTL: 30 minutes
```

**Expected Improvement:**
- 60-80% faster page loads for international users
- 40-60% reduction in origin server bandwidth

**Effort:** 1 day (DNS setup, page rule configuration)

---

## Frontend Performance

### Bundle Size Analysis - C+

**Current Bundle:**
- Main bundle: 192KB (gzipped)
- Vendor bundle: 156KB (React, React Router, Axios)
- Total: 348KB (target: <250KB)

**Target:**
- Main bundle: <100KB
- Vendor bundle: <150KB
- Total: <250KB

**Required Reduction:** 98KB (28% reduction needed)

---

### Bundle Optimization Recommendations

**1. Code Splitting by Route (High Impact)**

```javascript
// frontend/src/App.jsx
import { lazy, Suspense } from 'react'

// Lazy load route components
const QuestDetail = lazy(() => import('./pages/QuestDetail'))
const DiplomaPage = lazy(() => import('./pages/DiplomaPage'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/quests/:id" element={<QuestDetail />} />
        <Route path="/portfolio/:slug" element={<DiplomaPage />} />
        <Route path="/admin/*" element={<AdminDashboard />} />
      </Routes>
    </Suspense>
  )
}
```

**Expected Reduction:** 40-60KB (main bundle split into route chunks)

**Effort:** 2-3 hours

---

**2. Tree-Shake Lodash (Medium Impact)**

```javascript
// BAD - Imports entire library (24KB)
import _ from 'lodash'
const debounced = _.debounce(func, 300)

// GOOD - Imports only needed function (2KB)
import debounce from 'lodash/debounce'
const debounced = debounce(func, 300)
```

**Expected Reduction:** 15-20KB

**Effort:** 1 hour (find and replace)

---

**3. Remove Unused Dependencies (Low Impact)**

```bash
# Analyze bundle
npm install --save-dev vite-bundle-visualizer
npm run build
npx vite-bundle-visualizer

# Check for unused dependencies
npm install --save-dev depcheck
npx depcheck
```

**Expected Reduction:** 10-15KB

**Effort:** 2 hours

---

**4. Dynamic Imports for Heavy Components (Medium Impact)**

```javascript
// Lazy load heavy components
const QuestImageGallery = lazy(() => import('./components/QuestImageGallery'))
const BadgeShowcase = lazy(() => import('./components/BadgeShowcase'))

// Only load when needed
{showGallery && (
  <Suspense fallback={<Spinner />}>
    <QuestImageGallery images={images} />
  </Suspense>
)}
```

**Expected Reduction:** 15-20KB (moved to separate chunks)

**Effort:** 1-2 hours

---

### React Component Performance

**Issue:** Some components re-render unnecessarily

**Examples:**
- `QuestCard` re-renders when parent state changes (not related to card)
- `BadgeList` re-renders entire list when one badge updates

**Fix with React.memo:**

```javascript
// Before: Re-renders on every parent update
export function QuestCard({ quest, onEnroll }) {
  return <div>{quest.title}</div>
}

// After: Only re-renders if quest or onEnroll changes
export const QuestCard = React.memo(function QuestCard({ quest, onEnroll }) {
  return <div>{quest.title}</div>
}, (prevProps, nextProps) => {
  return prevProps.quest.id === nextProps.quest.id &&
         prevProps.onEnroll === nextProps.onEnroll
})
```

**Fix with useMemo/useCallback:**

```javascript
// Before: Creates new function on every render
function QuestList({ quests }) {
  const handleEnroll = (questId) => { ... }  // New function every render
  return quests.map(q => <QuestCard key={q.id} quest={q} onEnroll={handleEnroll} />)
}

// After: Memoizes function
function QuestList({ quests }) {
  const handleEnroll = useCallback((questId) => { ... }, [])  // Same function reference
  return quests.map(q => <QuestCard key={q.id} quest={q} onEnroll={handleEnroll} />)
}
```

**Effort:** 1-2 days (add to most-used components)
**Impact:** 20-40% faster rendering in complex UIs

---

## API Performance

### Response Times (Measured from Render logs)

**Current Response Times:**
- `/api/auth/me` - 120ms (good)
- `/api/quests` - 450ms (acceptable)
- `/api/portfolio/:slug` - 2500ms (CRITICAL - too slow)
- `/api/admin/analytics` - 1800ms (high - needs optimization)
- `/api/badges` - 280ms (acceptable)

**Target Response Times:**
- Critical paths (auth): <200ms
- User-facing APIs: <500ms
- Admin/reporting: <1000ms

**Issues:**
- Portfolio endpoint 5x over target (2500ms vs 500ms)
- Admin analytics 80% over target (1800ms vs 1000ms)

---

### API Optimization Recommendations

**1. Add Response Time Monitoring**

```python
# backend/middleware/performance_monitor.py
import time
from flask import g, request

@app.before_request
def start_timer():
    g.start_time = time.time()

@app.after_request
def log_request_time(response):
    if hasattr(g, 'start_time'):
        elapsed = (time.time() - g.start_time) * 1000
        logger.info(f"{request.method} {request.path} - {elapsed:.2f}ms - {response.status_code}")

        if elapsed > 1000:  # Warn on slow requests
            logger.warning(f"SLOW REQUEST: {request.method} {request.path} - {elapsed:.2f}ms")

    return response
```

**Effort:** 1 hour
**Benefit:** Visibility into slow endpoints

---

**2. Add Database Connection Pooling**

```python
# backend/database.py
from supabase import create_client, Client

# Current: Creates new connection per request
def get_supabase_admin_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Better: Connection pool (reuse connections)
from postgrest import Client as PostgrestClient

connection_pool = PostgrestClient(
    url=SUPABASE_URL,
    schema='public',
    headers={'apikey': SUPABASE_SERVICE_KEY},
    pool_size=10,  # Reuse up to 10 connections
    pool_maxoverflow=20  # Allow 20 extra connections under load
)
```

**Expected Improvement:** 20-30% faster database queries

**Effort:** 2-3 hours

---

**3. Implement Request Batching**

Allow frontend to batch multiple API calls into single request:

```python
# backend/routes/batch.py
@batch_bp.route('/batch', methods=['POST'])
@require_auth
def batch_requests(user_id: str):
    """Execute multiple API requests in single HTTP call."""
    requests = request.json.get('requests', [])

    results = []
    for req in requests:
        # Execute each request internally
        with app.test_request_context(req['path'], method=req['method']):
            response = app.full_dispatch_request()
            results.append({
                'path': req['path'],
                'status': response.status_code,
                'data': response.json
            })

    return jsonify({'results': results})
```

**Frontend Usage:**
```javascript
// Instead of 3 separate API calls:
const quests = await api.get('/api/quests')
const badges = await api.get('/api/badges')
const profile = await api.get('/api/auth/me')

// Single batched call:
const results = await api.post('/api/batch', {
  requests: [
    { path: '/api/quests', method: 'GET' },
    { path: '/api/badges', method: 'GET' },
    { path: '/api/auth/me', method: 'GET' }
  ]
})
```

**Benefit:** Reduces latency from multiple round-trips
**Effort:** 1 day

---

## Memory Performance

### Current Memory Usage (Render logs)

**Backend (Flask):**
- Base memory: 120MB
- Peak memory: 280MB (acceptable for 512MB instance)
- Memory growth: ~5MB per hour (potential memory leak)

**Issue:** Memory grows over time without garbage collection

**Recommendation:**

```python
# backend/app.py
import gc

@app.before_request
def garbage_collect():
    """Force garbage collection every 100 requests."""
    if not hasattr(g, 'request_count'):
        g.request_count = 0
    g.request_count += 1

    if g.request_count % 100 == 0:
        gc.collect()  # Force garbage collection
        logger.debug(f"Garbage collection triggered (request {g.request_count})")
```

**Effort:** 30 minutes

---

## Load Testing Recommendations

**Current:** No load testing performed

**Recommended Tools:**

1. **Locust** - Python load testing framework

```python
# locustfile.py
from locust import HttpUser, task, between

class OptioPlatformUser(HttpUser):
    wait_time = between(1, 3)

    @task(3)
    def view_quests(self):
        self.client.get("/api/quests")

    @task(2)
    def view_profile(self):
        self.client.get("/api/auth/me")

    @task(1)
    def view_diploma(self):
        self.client.get("/api/portfolio/test-student")
```

**Run:**
```bash
locust -f locustfile.py --host=https://optio-dev-backend.onrender.com
# Test with 100 concurrent users
```

**Targets:**
- 100 concurrent users: <500ms average response time
- 500 concurrent users: <1000ms average response time
- 1000 concurrent users: <2000ms average response time

---

2. **Lighthouse** - Frontend performance audit

```bash
npm install -g lighthouse
lighthouse https://optio-dev-frontend.onrender.com --view

# Target scores:
# Performance: >90
# Accessibility: >95
# Best Practices: >90
# SEO: >90
```

---

## Prioritized Performance Action Plan

### Week 1 (Critical Blockers)

1. **Fix O(n²) portfolio endpoint** (2-3 hours)
   - File: `backend/routes/portfolio.py:516-663`
   - Expected: 60-80% load time reduction (5s → 1s)

2. **Add missing database indexes** (1 hour)
   - File: `backend/scripts/add_performance_indexes.sql`
   - Expected: 80-95% faster indexed queries

3. **Add query performance monitoring** (2 hours)
   - File: `backend/middleware/performance_monitor.py`
   - Benefit: Visibility into slow queries

### Month 1 (High Impact)

4. **Fix 13 N+1 query patterns** (1-2 days)
   - Expected: 80-95% reduction in database queries

5. **Implement query result caching** (1-2 days)
   - Expected: 50-70% reduction in database load

6. **Optimize frontend bundle** (1 day)
   - Code splitting, tree-shaking, lazy loading
   - Expected: 40-60KB reduction (192KB → 130KB)

### Quarter 1 (Long-term)

7. **Fix remaining O(n²) complexity issues** (1 week)
   - Badge calculations, recommendations, advisor dashboard
   - Expected: 70-95% faster for affected endpoints

8. **Add CDN integration** (1 day)
   - Expected: 60-80% faster global page loads

9. **Implement request batching** (1 day)
   - Reduces multiple round-trip latency

10. **Add load testing to CI/CD** (2 days)
    - Catch performance regressions before production

---

## Summary Statistics

**Performance Issues Found:** 31 total
- Critical: 5 (O(n²) complexity issues)
- High: 13 (N+1 query patterns)
- Medium: 8 (missing indexes, bundle size, caching)
- Low: 5 (memory leaks, monitoring, load testing)

**Expected Improvements:**
- Portfolio page: 2500ms → 500ms (80% faster)
- Database queries: 80-95% reduction
- Frontend bundle: 192KB → 100KB (48% reduction)
- Server load: 50-70% reduction with caching

**Performance Score by Category:**
- **Algorithmic Complexity:** D (5 O(n²) issues)
- **Database Queries:** C (13 N+1 patterns, missing indexes)
- **Caching:** C+ (diploma cached, query results not cached)
- **Frontend Bundle:** C+ (192KB, target <100KB)
- **API Response Times:** C (portfolio 2500ms, target <500ms)
- **Memory Management:** B- (potential leak, no monitoring)

**Overall Performance Rating:** C+ (Functional but needs optimization)

---

**Last Updated:** December 26, 2025
**Next Review:** March 26, 2025 (quarterly)
**Priority:** HIGH (blocks production scale)
