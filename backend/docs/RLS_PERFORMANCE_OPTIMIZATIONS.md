# RLS Performance Optimizations

## Issue
Supabase database linter has identified critical performance issues with Row Level Security (RLS) policies. The main problem is that `auth.uid()` and other auth functions are being re-evaluated for each row instead of being cached.

## Impact
- Suboptimal query performance at scale
- Increased database load
- Slower response times for large datasets

## Solution
Replace `auth.uid()` with `(select auth.uid())` in RLS policies to cache the authentication result.

## Required SQL Optimizations

### 1. Friendships Table
```sql
-- Drop existing policies
DROP POLICY IF EXISTS "Users can update friendships they're part of" ON public.friendships;
DROP POLICY IF EXISTS "friendships_update_involved" ON public.friendships;

-- Create optimized policies with cached auth calls
CREATE POLICY "Users can update friendships they're part of"
ON public.friendships FOR UPDATE
USING ((select auth.uid()) = requester_id OR (select auth.uid()) = addressee_id);

CREATE POLICY "friendships_update_involved"
ON public.friendships FOR UPDATE
USING ((select auth.uid()) = requester_id OR (select auth.uid()) = addressee_id);
```

### 2. Diplomas Table
```sql
-- Drop existing policy
DROP POLICY IF EXISTS "diplomas_update_own" ON public.diplomas;

-- Create optimized policy with cached auth call
CREATE POLICY "diplomas_update_own"
ON public.diplomas FOR UPDATE
USING ((select auth.uid()) = user_id);
```

### 3. User Skill Details Table
```sql
-- Drop existing policy
DROP POLICY IF EXISTS "Service role can manage skill details" ON public.user_skill_details;

-- Create optimized policy with cached auth call
CREATE POLICY "Service role can manage skill details"
ON public.user_skill_details FOR ALL
USING ((select auth.role()) = 'service_role' OR (select auth.uid()) = user_id);
```

### 4. User XP Table
```sql
-- Drop existing policies
DROP POLICY IF EXISTS "Service role can manage all XP" ON public.user_xp;
DROP POLICY IF EXISTS "Users can view own XP" ON public.user_xp;

-- Create optimized policies with cached auth calls
CREATE POLICY "Service role can manage all XP"
ON public.user_xp FOR ALL
USING ((select auth.role()) = 'service_role');

CREATE POLICY "Users can view own XP"
ON public.user_xp FOR SELECT
USING ((select auth.uid()) = user_id);
```

### 5. Quest Ideas Table
```sql
-- Drop existing policy
DROP POLICY IF EXISTS "Users can manage own quest ideas" ON public.quest_ideas;

-- Create optimized policy with cached auth call
CREATE POLICY "Users can manage own quest ideas"
ON public.quest_ideas FOR ALL
USING ((select auth.uid()) = user_id);
```

### 6. Quest Ratings Table
```sql
-- Drop existing policy
DROP POLICY IF EXISTS "Users can manage own ratings" ON public.quest_ratings;

-- Create optimized policy with cached auth call
CREATE POLICY "Users can manage own ratings"
ON public.quest_ratings FOR ALL
USING ((select auth.uid()) = user_id);
```

### 7. Users Table
```sql
-- Drop existing policies
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;

-- Create optimized policies with cached auth calls
CREATE POLICY "Users can update own profile"
ON public.users FOR UPDATE
USING ((select auth.uid()) = id);

CREATE POLICY "Users can view own profile"
ON public.users FOR SELECT
USING ((select auth.uid()) = id);
```

## Implementation Status
- [x] Execute SQL optimizations via Supabase dashboard ✅ COMPLETED
- [x] Verify RLS policies are working correctly after optimization ✅ VERIFIED (all queries successful)
- [x] Test application functionality to ensure no regressions ✅ VERIFIED (all core features operational)
- [ ] Re-run Supabase linter to confirm warnings are resolved (recommended for final verification)

## References
- [Supabase RLS Performance Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)
- [Database Linter Warning 0003](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)

## Performance Impact
These optimizations should significantly improve:
- Query performance for large tables
- Dashboard load times
- User authentication flows
- Overall database efficiency