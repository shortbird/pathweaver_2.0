# Supabase Performance Fix Plan

**Total Issues Found:** 695
**Priority Focus:** Auth RLS Initplan (77 slow queries) - These cause actual query slowness

---

## Summary by Issue Type

| Category | Count | Impact | Priority |
|----------|-------|--------|----------|
| Auth RLS Initplan | 77 | HIGH - Causes slow queries | P0 |
| Multiple Permissive Policies | 327 | MEDIUM - Cumulative slowdown | P1 |
| Unindexed Foreign Keys | 17 | MEDIUM - Slow JOINs | P2 |
| Duplicate Indexes | 11 | LOW - Wasted space | P3 |
| Unused Indexes | 253 | LOW - Wasted space/slow writes | P3 |
| No Primary Key | 9 | LOW - All backup tables | P4 |
| Auth DB Connections | 1 | LOW - Config setting | P4 |

---

## Phase 1: Fix Auth RLS Initplan Issues (P0 - CRITICAL)

**Problem:** RLS policies using `auth.uid()` or `auth.jwt()` in subqueries cause the query planner to re-evaluate for each row instead of caching the result.

**Tables Affected (by policy count):**
- `users` (6 policies)
- `quest_invitations` (6 policies)
- `org_invitations` (5 policies)
- `public_visibility_requests` (5 policies)
- `observer_requests` (4 policies)
- `user_quest_deadlines` (4 policies)
- `observer_access_audit` (4 policies)
- `user_quest_tasks` (3 policies)
- `quests` (3 policies)
- ...and 26 more tables

**Solution Pattern:**
Replace subqueries with `JOIN` or rewrite to use materialized CTEs.

**Before (slow):**
```sql
CREATE POLICY "users_select" ON users FOR SELECT
USING (
  id = auth.uid() OR
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);
```

**After (fast):**
```sql
CREATE POLICY "users_select" ON users FOR SELECT
USING (
  id = (SELECT auth.uid()) OR
  organization_id = (SELECT organization_id FROM users WHERE id = (SELECT auth.uid()))
);
```

The key is wrapping `auth.uid()` in a subselect `(SELECT auth.uid())` to force caching.

**Migration Files to Create:**
1. `fix_rls_users_performance.sql`
2. `fix_rls_quest_invitations_performance.sql`
3. `fix_rls_org_invitations_performance.sql`
4. `fix_rls_public_visibility_performance.sql`
5. `fix_rls_observer_tables_performance.sql`
6. `fix_rls_user_quest_tables_performance.sql`
7. `fix_rls_misc_tables_performance.sql`

---

## Phase 2: Consolidate Multiple Permissive Policies (P1)

**Problem:** Multiple PERMISSIVE policies on the same table/operation are OR'd together, causing multiple condition evaluations.

**Most Affected Tables:**
- `curriculum_uploads` (16 policy combinations)
- `friendships` (16)
- `site_settings` (16)
- `user_achievements` (16)
- `user_xp` (16)
- `users` (16)
- `course_enrollments` (12)
- `diplomas` (12)
- `leaderboards` (12)
- `observer_likes` (12)
- `quests` (12)

**Solution Pattern:**
Combine multiple SELECT policies into single policy with CASE/OR logic.

**Before (slow - multiple policies):**
```sql
CREATE POLICY "users_view_own" ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_view_org" ON users FOR SELECT USING (org_id = get_user_org());
CREATE POLICY "users_view_public" ON users FOR SELECT USING (is_public = true);
```

**After (fast - single policy):**
```sql
CREATE POLICY "users_select" ON users FOR SELECT
USING (
  id = (SELECT auth.uid()) OR
  org_id = (SELECT organization_id FROM users WHERE id = (SELECT auth.uid())) OR
  is_public = true
);
```

**Migration Files to Create:**
1. `consolidate_rls_users.sql`
2. `consolidate_rls_curriculum_uploads.sql`
3. `consolidate_rls_friendships.sql`
4. `consolidate_rls_site_settings.sql`
5. `consolidate_rls_achievements_xp.sql`
6. `consolidate_rls_enrollments_diplomas.sql`
7. `consolidate_rls_leaderboards_observers.sql`
8. `consolidate_rls_quests.sql`

---

## Phase 3: Add Missing Foreign Key Indexes (P2)

**Problem:** Foreign keys without indexes cause slow JOINs and slow CASCADE deletes.

**Tables Needing Indexes:**
```sql
-- 17 missing indexes
CREATE INDEX idx_ai_prompt_components_modified_by ON ai_prompt_components(modified_by);
CREATE INDEX idx_curriculum_attachments_deleted_by ON curriculum_attachments(deleted_by);
CREATE INDEX idx_curriculum_lesson_tasks_org ON curriculum_lesson_tasks(organization_id);
CREATE INDEX idx_curriculum_lessons_edited_by ON curriculum_lessons(last_edited_by);
CREATE INDEX idx_curriculum_uploads_quest ON curriculum_uploads(created_quest_id);
CREATE INDEX idx_curriculum_uploads_reviewer ON curriculum_uploads(reviewed_by);
CREATE INDEX idx_diplomas_consent_by ON diplomas(public_consent_given_by);
CREATE INDEX idx_leaderboards_user ON leaderboards(user_id);
CREATE INDEX idx_org_invitations_accepted ON org_invitations(accepted_by);
CREATE INDEX idx_org_course_access_granted ON organization_course_access(granted_by);
CREATE INDEX idx_org_quest_access_granted ON organization_quest_access(granted_by);
CREATE INDEX idx_parent_evidence_parent ON parent_evidence_uploads(parent_id); -- Check FK name
CREATE INDEX idx_quest_collaborations_created ON quest_collaborations(created_by);
CREATE INDEX idx_quest_personalization_quest ON quest_personalization_sessions(quest_id);
CREATE INDEX idx_user_quest_deadlines_quest ON user_quest_deadlines(quest_id);
CREATE INDEX idx_user_quest_deadlines_task ON user_quest_deadlines(task_id);
CREATE INDEX idx_users_ai_enabled_by ON users(ai_features_enabled_by);
```

**Migration File:** `add_missing_fk_indexes.sql`

---

## Phase 4: Remove Duplicate Indexes (P3)

**Problem:** Identical indexes waste disk space and slow down writes.

**Duplicates to Remove:**
```sql
-- public.quest_task_completions (4 duplicates)
DROP INDEX IF EXISTS idx_task_completions_quest;  -- keep idx_quest_task_completions_quest_id
DROP INDEX IF EXISTS idx_task_completions_task;   -- keep idx_quest_task_completions_task_id
DROP INDEX IF EXISTS idx_task_completions_user;   -- keep idx_quest_task_completions_user_id
DROP INDEX IF EXISTS idx_task_completions_user_task; -- keep idx_task_completions_task_id

-- public.quest_tasks_archived
DROP INDEX IF EXISTS idx_quest_tasks_quest;  -- keep idx_quest_tasks_quest_id

-- public.quests
DROP INDEX IF EXISTS idx_quests_source;  -- keep idx_quests_quest_type

-- public.user_task_evidence_documents
DROP INDEX IF EXISTS user_task_evidence_documents_user_task_unique;  -- keep the _key version
```

**Migration File:** `remove_duplicate_indexes.sql`

---

## Phase 5: Clean Up Unused Indexes (P3)

**Problem:** 253 unused indexes consuming space. Focus on public schema (ignore test_schema).

**High-value targets (public schema with 4+ unused indexes):**
- `credit_ledger` (7 unused)
- `quest_templates` (5 unused)
- `ai_content_metrics` (5 unused)
- `quest_metadata` (5 unused)
- `quest_tasks_archived` (4 unused)
- `admin_audit_logs` (4 unused)
- `friendships` (4 unused)
- `ai_generation_metrics` (4 unused)
- `curriculum_lesson_progress` (4 unused)
- `org_invitations` (4 unused)

**Approach:**
1. Query `pg_stat_user_indexes` to verify truly unused
2. Drop in batches with monitoring
3. Keep indexes that MIGHT be used by scheduled jobs or admin queries

**Migration File:** `cleanup_unused_indexes.sql` (will need verification first)

---

## Phase 6: Low Priority Items (P4)

### Tables Without Primary Keys
All are backup tables - not critical:
- `parent_invitations_backup`
- `backup_schema.*` (7 tables)

### Auth DB Connection Strategy
Configuration setting - change from absolute to percentage-based in Supabase dashboard.

---

## Execution Order

1. **Week 1:** Phase 1 - Auth RLS Initplan fixes (biggest performance impact)
2. **Week 2:** Phase 2 - Consolidate permissive policies (requires careful testing)
3. **Week 3:** Phase 3 + 4 - Add FK indexes, remove duplicates (low risk)
4. **Week 4:** Phase 5 - Clean unused indexes (requires verification)

---

## Testing Strategy

For each migration:
1. Test on development branch first
2. Run `EXPLAIN ANALYZE` on affected queries before/after
3. Monitor Supabase dashboard for query performance
4. Check application for any regressions

**Sample test queries:**
```sql
-- Test users table RLS performance
EXPLAIN ANALYZE SELECT * FROM users WHERE organization_id = 'test-org-id';

-- Test quest_task_completions performance
EXPLAIN ANALYZE SELECT * FROM quest_task_completions WHERE user_id = 'test-user-id';
```

---

## Rollback Plan

Each migration should have a corresponding rollback:
```sql
-- Example rollback for index changes
CREATE INDEX idx_name ON table(column);  -- Re-create if dropped
DROP INDEX IF EXISTS idx_name;           -- Drop if added
```

For RLS policies, keep the old policy definitions commented in the migration file.

---

## References

- [Supabase RLS Performance Guide](https://supabase.com/docs/guides/database/database-linter?lint=0013_auth_rls_initplan)
- [Unindexed Foreign Keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Multiple Permissive Policies](https://supabase.com/docs/guides/database/database-linter?lint=0002_multiple_permissive_policies)
