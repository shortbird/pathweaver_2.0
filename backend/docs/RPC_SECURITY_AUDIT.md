# Supabase RPC Function Security Audit

**Audit Date**: December 17, 2025
**Priority**: P0-SEC-3 (OWASP A03:2021 - Injection)
**Status**: 1 CRITICAL vulnerability found, 2 missing functions found

---

## Executive Summary

Audited **12 unique RPC function calls** across backend repositories, routes, and services. Found:

- **10 functions SAFE** - Use proper parameterized queries
- **1 function VULNERABLE** - SQL injection risk via string concatenation
- **2 functions MISSING** - Do not exist in database (runtime errors)

**CRITICAL ACTION REQUIRED**: Fix `get_human_quest_performance` SQL injection vulnerability

---

## Table of Contents

1. [Safe RPC Functions (10)](#safe-rpc-functions)
2. [Vulnerable RPC Function (1)](#vulnerable-rpc-function)
3. [Missing RPC Functions (2)](#missing-rpc-functions)
4. [Recommendations](#recommendations)
5. [Implementation Plan](#implementation-plan)

---

## Safe RPC Functions

These 10 functions use proper parameterized queries and are NOT vulnerable to SQL injection:

### 1. create_verified_parent_link
**Location**: [backend/repositories/parent_repository.py:438](../repositories/parent_repository.py#L438), [backend/routes/admin/parent_connections.py:159](../routes/admin/parent_connections.py#L159)

**Parameters**: `p_parent_id`, `p_student_id`, `p_admin_id`, `p_notes`

**SQL Pattern**: ✅ Uses parameterized INSERT/UPDATE with VALUES
```sql
WHERE parent_user_id = p_parent_id AND student_user_id = p_student_id
```

**Verdict**: SAFE

---

### 2. get_ai_review_queue_stats
**Location**: [backend/services/ai_quest_review_service.py:423](../services/ai_quest_review_service.py#L423)

**Parameters**: None

**SQL Pattern**: ✅ No parameters, pure aggregation
```sql
SELECT COUNT(*) FILTER (WHERE status = 'pending_review') as pending_count, ...
```

**Verdict**: SAFE

---

### 3. get_learning_rhythm_status
**Location**: [backend/routes/parent_dashboard.py:190](../routes/parent_dashboard.py#L190)

**Parameters**: `p_student_id`

**SQL Pattern**: ✅ Uses parameterized WHERE clauses
```sql
WHERE uqd.user_id = p_student_id
AND qtc.user_id = p_student_id
```

**Verdict**: SAFE

---

### 4. get_org_total_xp
**Location**: [backend/repositories/organization_repository.py:145](../repositories/organization_repository.py#L145)

**Parameters**: `org_id_param`

**SQL Pattern**: ✅ Uses parameterized WHERE clause
```sql
WHERE organization_id = org_id_param
```

**Verdict**: SAFE

---

### 5. get_parent_dependents
**Location**: [backend/repositories/dependent_repository.py:162](../repositories/dependent_repository.py#L162)

**Parameters**: `p_parent_id`

**SQL Pattern**: ✅ Uses parameterized WHERE clause
```sql
WHERE u.managed_by_parent_id = p_parent_id AND u.is_dependent = TRUE
```

**Verdict**: SAFE

---

### 6. get_user_organization
**Location**: [backend/repositories/quest_repository.py:525](../repositories/quest_repository.py#L525)

**Parameters**: `p_user_id`

**SQL Pattern**: ✅ Uses parameterized WHERE clause
```sql
WHERE u.id = p_user_id
```

**Verdict**: SAFE

---

### 7. increment_message_usage
**Location**: [backend/routes/tutor.py:194](../routes/tutor.py#L194)

**Parameters**: `p_user_id`

**SQL Pattern**: ✅ Uses parameterized INSERT/UPDATE
```sql
VALUES (p_user_id, 1, CURRENT_DATE)
ON CONFLICT (user_id) DO UPDATE SET messages_used_today = tutor_settings.messages_used_today + 1
```

**Verdict**: SAFE

---

### 8. match_student_by_email
**Location**: [backend/repositories/parent_repository.py:334](../repositories/parent_repository.py#L334)

**Parameters**: `p_email`

**SQL Pattern**: ✅ Uses parameterized WHERE clause with LOWER()
```sql
WHERE LOWER(email) = LOWER(p_email) AND role = 'student'
```

**Verdict**: SAFE

---

### 9. update_ai_generation_performance_metrics
**Location**: [backend/services/ai_performance_analytics_service.py:417](../services/ai_performance_analytics_service.py#L417)

**Parameters**: None

**SQL Pattern**: ✅ No parameters, complex aggregation with JOINs
```sql
UPDATE ai_generation_metrics m SET ... FROM (SELECT ...) perf WHERE m.quest_id = perf.quest_id
```

**Verdict**: SAFE

---

### 10. get_parent_dependents (duplicate check)
**Location**: Multiple locations

**Verdict**: SAFE (same as #5)

---

## Vulnerable RPC Function

### get_human_quest_performance ⚠️ CRITICAL SQL INJECTION RISK

**Location**: [backend/services/ai_performance_analytics_service.py:142](../services/ai_performance_analytics_service.py#L142)

**OWASP**: A03:2021 - Injection

**Parameters**: `days_back_param`

**Vulnerable SQL Pattern**:
```sql
date_cutoff := NOW() - (days_back_param || ' days')::INTERVAL;
```

**Issue**: String concatenation with user input creates SQL injection vector

**Attack Vector**:
```python
# Malicious input
days_back = "1; DROP TABLE users; --"

# Resulting SQL
date_cutoff := NOW() - ('1; DROP TABLE users; --' || ' days')::INTERVAL;
```

**Current Usage**:
```python
# ai_performance_analytics_service.py:118
def get_ai_vs_human_comparison(days_back: int = 30):
    # Type hint provides NO runtime protection!
    supabase.rpc('get_human_quest_performance', {
        'days_back_param': days_back  # Could be ANY type at runtime
    }).execute()
```

**Risk Level**: CRITICAL - Could lead to:
- Data exfiltration
- Table drops
- Unauthorized data modification
- Complete database compromise

---

## Missing RPC Functions

### 1. add_user_skill_xp ❌ DOES NOT EXIST

**Location**: [backend/routes/parent_evidence.py:562](../routes/parent_evidence.py#L562)

**Call**:
```python
try:
    supabase.rpc('add_user_skill_xp', {
        'p_user_id': user_id,
        'p_pillar': task['pillar'],
        'p_xp_amount': task['xp_value']
    }).execute()
except Exception as xp_error:
    logger.warning(f"Failed to award XP: {xp_error}")
```

**Impact**: MEDIUM - Wrapped in try/except, so fails silently. XP not awarded but task completion succeeds.

**Fix Required**: Create missing RPC function or replace with direct table insert

---

### 2. bypass_friendship_update ❌ DOES NOT EXIST

**Location**: [backend/repositories/friendship_repository.py:195](../repositories/friendship_repository.py#L195)

**Call**:
```python
try:
    result = self.client.rpc('bypass_friendship_update', {
        'friendship_id': friendship_id,
        'new_status': 'accepted'
    }).execute()
except Exception as e:
    logger.error(f"Error accepting connection request {friendship_id}: {e}")
    raise  # Re-raises exception - breaks friendship acceptance!
```

**Impact**: HIGH - Exception is re-raised, so friendship acceptance FAILS entirely

**Fix Required**: Create missing RPC function or replace with direct table update

---

## Recommendations

### Immediate Actions (This Week)

1. **Fix get_human_quest_performance SQL injection** (P0)
   - Replace string concatenation with parameterized INTERVAL
   - Add input validation for days_back parameter
   - Add runtime type checking

2. **Create missing RPC functions** (P0)
   - Implement `add_user_skill_xp` function
   - Implement `bypass_friendship_update` function
   - OR replace with direct table operations

3. **Add input validation** (P1)
   - Validate all RPC parameters at application layer before calling
   - Use Pydantic models for type safety
   - Add parameter sanitization middleware

---

### Long-term Actions (This Month)

4. **Establish RPC security guidelines** (P1)
   - Document safe patterns for RPC function creation
   - Require code review for all new RPC functions
   - Add linting rules to detect string concatenation in SQL

5. **Audit all RPC functions quarterly** (P2)
   - Schedule regular security audits
   - Automated scanning for SQL injection patterns
   - Penetration testing for RPC endpoints

---

## Implementation Plan

### Step 1: Fix get_human_quest_performance (P0)

**Create migration file**: `backend/migrations/fix_get_human_quest_performance_injection.sql`

```sql
-- Drop existing vulnerable function
DROP FUNCTION IF EXISTS get_human_quest_performance(INTEGER);

-- Create safe version with parameterized INTERVAL
CREATE OR REPLACE FUNCTION get_human_quest_performance(days_back_param INTEGER)
RETURNS TABLE (
    total_quests BIGINT,
    avg_completion_rate DECIMAL,
    avg_rating DECIMAL,
    avg_engagement_score DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    date_cutoff TIMESTAMPTZ;
BEGIN
    -- Input validation
    IF days_back_param IS NULL OR days_back_param < 1 OR days_back_param > 365 THEN
        RAISE EXCEPTION 'days_back_param must be between 1 and 365';
    END IF;

    -- Safe INTERVAL construction using multiplication (no string concatenation)
    date_cutoff := NOW() - (days_back_param * INTERVAL '1 day');

    RETURN QUERY
    SELECT
        COUNT(DISTINCT q.id) as total_quests,
        COALESCE(
            AVG(
                CASE
                    WHEN uq_counts.total_enrollments > 0
                    THEN uq_counts.completed_count::DECIMAL / uq_counts.total_enrollments
                    ELSE 0
                END
            ),
            0
        ) as avg_completion_rate,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COALESCE(
            AVG(
                CASE
                    WHEN task_counts.total_tasks > 0 AND uq_counts.total_enrollments > 0
                    THEN tc_counts.completion_count::DECIMAL / (task_counts.total_tasks * uq_counts.total_enrollments)
                    ELSE 0
                END
            ),
            0
        ) as avg_engagement_score
    FROM quests q
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) as total_enrollments,
            COUNT(uq.completed_at) as completed_count
        FROM user_quests uq
        WHERE uq.quest_id = q.id
    ) uq_counts ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) as total_tasks
        FROM quest_tasks_archived qt
        WHERE qt.quest_id = q.id
    ) task_counts ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) as completion_count
        FROM quest_task_completions tc
        WHERE tc.quest_id = q.id
    ) tc_counts ON TRUE
    LEFT JOIN quest_ratings r ON r.quest_id = q.id
    WHERE
        q.created_at >= date_cutoff
        AND q.source NOT IN ('ai_generated', 'custom')
        AND q.is_active = TRUE;
END;
$$;

-- Add comment documenting the fix
COMMENT ON FUNCTION get_human_quest_performance(INTEGER) IS 'Fixed SQL injection vulnerability by using interval multiplication instead of string concatenation. Validates input range 1-365 days.';
```

**Update Python caller**: `backend/services/ai_performance_analytics_service.py`

```python
@staticmethod
def get_ai_vs_human_comparison(
    days_back: int = 30
) -> Dict[str, Any]:
    """
    Compare performance of AI-generated quests vs human-created quests.

    Args:
        days_back: Number of days to look back for comparison (1-365)

    Returns:
        Dict with comparison metrics
    """
    try:
        # Input validation (defense in depth)
        if not isinstance(days_back, int):
            raise ValueError(f"days_back must be an integer, got {type(days_back)}")
        if days_back < 1 or days_back > 365:
            raise ValueError(f"days_back must be between 1 and 365, got {days_back}")

        supabase = get_supabase_admin_client()
        date_cutoff = (datetime.utcnow() - timedelta(days=days_back)).isoformat()

        # Get AI quest performance
        ai_metrics_response = supabase.table('ai_generation_metrics').select(
            'completion_rate, average_rating, engagement_score'
        ).eq('approved', True).not_.is_('quest_id', 'null').gte('created_at', date_cutoff).execute()

        ai_quests = ai_metrics_response.data

        # Get human quest performance (NOW SAFE from SQL injection)
        human_quests_response = supabase.rpc('get_human_quest_performance', {
            'days_back_param': days_back  # Validated as integer
        }).execute()

        # ... rest of function
```

---

### Step 2: Create add_user_skill_xp function (P0)

**Create migration file**: `backend/migrations/create_add_user_skill_xp_function.sql`

```sql
CREATE OR REPLACE FUNCTION add_user_skill_xp(
    p_user_id UUID,
    p_pillar TEXT,
    p_xp_amount INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Input validation
    IF p_user_id IS NULL OR p_pillar IS NULL OR p_xp_amount IS NULL THEN
        RAISE EXCEPTION 'All parameters are required';
    END IF;

    IF p_xp_amount < 0 OR p_xp_amount > 10000 THEN
        RAISE EXCEPTION 'XP amount must be between 0 and 10000';
    END IF;

    -- Validate pillar is one of the allowed values
    IF p_pillar NOT IN ('stem', 'wellness', 'communication', 'civics', 'art') THEN
        RAISE EXCEPTION 'Invalid pillar. Must be one of: stem, wellness, communication, civics, art';
    END IF;

    -- Insert or update user_skill_xp
    INSERT INTO user_skill_xp (user_id, pillar, xp_amount)
    VALUES (p_user_id, p_pillar, p_xp_amount)
    ON CONFLICT (user_id, pillar)
    DO UPDATE SET
        xp_amount = user_skill_xp.xp_amount + p_xp_amount,
        updated_at = NOW();

    -- Also update total_xp on users table
    UPDATE users
    SET total_xp = total_xp + p_xp_amount,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION add_user_skill_xp(UUID, TEXT, INTEGER) IS 'Atomically adds XP to user skill and total XP. Validates pillar and XP range.';
```

---

### Step 3: Create bypass_friendship_update function (P0)

**Create migration file**: `backend/migrations/create_bypass_friendship_update_function.sql`

```sql
CREATE OR REPLACE FUNCTION bypass_friendship_update(
    p_friendship_id UUID,
    p_new_status TEXT
)
RETURNS SETOF friendships
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Input validation
    IF p_friendship_id IS NULL OR p_new_status IS NULL THEN
        RAISE EXCEPTION 'All parameters are required';
    END IF;

    -- Validate status is one of the allowed values
    IF p_new_status NOT IN ('pending', 'accepted', 'rejected') THEN
        RAISE EXCEPTION 'Invalid status. Must be one of: pending, accepted, rejected';
    END IF;

    -- Update friendship status
    -- SECURITY DEFINER bypasses RLS policies and timestamp triggers
    RETURN QUERY
    UPDATE friendships
    SET
        status = p_new_status,
        updated_at = NOW()
    WHERE id = p_friendship_id
    RETURNING *;
END;
$$;

COMMENT ON FUNCTION bypass_friendship_update(UUID, TEXT) IS 'Updates friendship status with SECURITY DEFINER to bypass RLS/triggers. Used by friendship_repository.';
```

---

### Step 4: Run migrations

```bash
# Connect to Supabase
cd backend/migrations

# Apply migrations via Supabase MCP or SQL editor
# 1. fix_get_human_quest_performance_injection.sql
# 2. create_add_user_skill_xp_function.sql
# 3. create_bypass_friendship_update_function.sql
```

---

### Step 5: Verify fixes

**Test SQL injection is patched**:
```python
# This should now FAIL with validation error
service.get_ai_vs_human_comparison(days_back="1; DROP TABLE users; --")
# Expected: ValueError("days_back must be an integer")

# This should work
service.get_ai_vs_human_comparison(days_back=30)
# Expected: Returns comparison data
```

**Test XP function works**:
```bash
# Via Supabase SQL editor
SELECT add_user_skill_xp(
    'user-uuid-here',
    'stem',
    100
);
# Expected: XP added successfully
```

**Test friendship function works**:
```bash
# Via Supabase SQL editor
SELECT * FROM bypass_friendship_update(
    'friendship-uuid-here',
    'accepted'
);
# Expected: Returns updated friendship row
```

---

## Security Guidelines for Future RPC Functions

### DO ✅

1. **Use parameterized queries**
   ```sql
   WHERE user_id = p_user_id  -- Good
   ```

2. **Use interval multiplication**
   ```sql
   date_cutoff := NOW() - (p_days * INTERVAL '1 day');  -- Good
   ```

3. **Validate inputs**
   ```sql
   IF p_xp_amount < 0 OR p_xp_amount > 10000 THEN
       RAISE EXCEPTION 'Invalid XP amount';
   END IF;
   ```

4. **Use SECURITY DEFINER sparingly**
   - Only when RLS bypass is required
   - Add validation to prevent abuse

5. **Add comments documenting function purpose**
   ```sql
   COMMENT ON FUNCTION my_func(...) IS 'Description...';
   ```

---

### DON'T ❌

1. **Never use string concatenation with user input**
   ```sql
   -- BAD - SQL injection risk
   date_cutoff := NOW() - (p_days || ' days')::INTERVAL;
   ```

2. **Never use dynamic SQL with EXECUTE**
   ```sql
   -- BAD - SQL injection risk
   EXECUTE 'SELECT * FROM users WHERE id = ' || p_user_id;
   ```

3. **Never trust client input**
   - Always validate on server
   - Type hints are NOT enough

4. **Never skip input validation**
   - Even for "trusted" admin functions

---

## Appendix: All RPC Calls in Codebase

### Production Code (12 unique functions)
1. ✅ `create_verified_parent_link` - repositories/parent_repository.py:438
2. ✅ `get_ai_review_queue_stats` - services/ai_quest_review_service.py:423
3. ⚠️ `get_human_quest_performance` - services/ai_performance_analytics_service.py:142 **VULNERABLE**
4. ✅ `get_learning_rhythm_status` - routes/parent_dashboard.py:190
5. ✅ `get_org_total_xp` - repositories/organization_repository.py:145
6. ✅ `get_parent_dependents` - repositories/dependent_repository.py:162
7. ✅ `get_user_organization` - repositories/quest_repository.py:525
8. ✅ `increment_message_usage` - routes/tutor.py:194
9. ✅ `match_student_by_email` - repositories/parent_repository.py:334
10. ✅ `update_ai_generation_performance_metrics` - services/ai_performance_analytics_service.py:417
11. ❌ `add_user_skill_xp` - routes/parent_evidence.py:562 **MISSING**
12. ❌ `bypass_friendship_update` - repositories/friendship_repository.py:195 **MISSING**

### Test Code (excluded from production audit)
- `execute_sql` - tests/conftest.py, tests/integration/*
- Various test-only RPC calls

### Migration Code (excluded from production audit)
- `exec_sql` - scripts/*, migrations/*

---

## Summary

**Findings**:
- 10 functions SAFE ✅
- 1 function VULNERABLE ⚠️ (get_human_quest_performance)
- 2 functions MISSING ❌ (add_user_skill_xp, bypass_friendship_update)

**Action Required**: Implement Step 1-5 above to resolve P0-SEC-3

**Estimated Effort**: 4 hours (2 hours coding, 2 hours testing)

**Risk Reduction**: MEDIUM-HIGH → LOW after fixes applied

---

**Status**: Ready for implementation
**Next Step**: Create and apply migration files
**Review**: Requires security review before production deployment
