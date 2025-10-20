# Optio Platform Refactoring - Complete Implementation Plan

**Version:** 2.0 (CORRECTED - Based on Actual Codebase Analysis)
**Date:** October 20, 2025
**Last Updated:** January 2025
**Estimated Timeline:** 4-6 weeks
**Estimated Effort:** 200-240 hours (reduced after eliminating unnecessary tasks)

---

## ⚠️ CRITICAL CORRECTIONS FROM V1.0

**VERIFIED via Codebase Exploration & Database MCP Queries:**

1. ✅ Badge System: ALREADY SIMPLIFIED - No 5-level progression exists, skip badge simplification
2. ✅ Database Tables: Add `task_collaborations` to deletion list (found in exploration)
3. ✅ User Columns: Only subscription columns exist, NO achievement/momentum columns
4. ✅ XP Bonuses: Only 2x collaboration, 50% completion, 500 XP badge bonuses exist
5. ✅ Backend Files: Corrected actual file names (subscription_requests.py, not subscriptions.py)
6. ✅ Parent Dashboard: Backend complete, NO frontend exists yet - skip frontend tasks
7. ✅ Quest Ratings: Orphaned code (not registered) - simple file deletion
8. ✅ LMS Integration: Simplify to SINGLE platform (user only needs one LMS)
9. ✅ Badge Table: Already has correct min_xp and min_quests columns

---

## 🎯 Project Goals (REVISED)

1. Remove unwanted features completely (no commenting out)
2. ~~Simplify badge system~~ SKIP - Already simplified (no 5-level progression)
3. Simplify XP system (remove 2x collab bonus, 50% completion bonus, 500 XP badge bonus)
4. Remove subscription/tier system completely (manual request system, no Stripe)
5. Remove collaboration/team-up features (quest_collaborations AND task_collaborations)
6. Remove quest rating system (orphaned code)
7. Simplify quest sources to: 'optio' or 'lms'
8. Add observer role for family members
9. Prepare for SINGLE LMS integration (SSO/LTI only, no multi-platform)
10. ~~Add badge quest pathways~~ DEFER - Not required for MVP

---

## 📋 Implementation Phases

- **Phase 0:** Safety Prep & Backups (Week 1, Days 1-2)
- **Phase 1:** Database Migration (Week 1, Days 3-5)
- **Phase 2:** Backend Refactoring (Week 2-3)
- **Phase 3:** Frontend Refactoring (Week 3-4)
- **Phase 4:** LMS Integration Foundation (Week 4-5)
- **Phase 5:** Testing & Validation (Week 5-6)
- **Phase 6:** Documentation Updates (Week 6)

---

# PHASE 0: SAFETY PREP & BACKUPS

## Task 0.1: Create Full Database Backup

```bash
# File: scripts/backup_database.sh
#!/bin/bash

BACKUP_DIR="./database_backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/optio_pre_refactor_$TIMESTAMP.sql"

mkdir -p $BACKUP_DIR

echo "Creating full database backup..."
pg_dump $DATABASE_URL > $BACKUP_FILE

echo "Backup created: $BACKUP_FILE"
echo "Size: $(du -h $BACKUP_FILE | cut -f1)"

# Verify backup
if [ -s $BACKUP_FILE ]; then
    echo "✓ Backup verification passed"
else
    echo "✗ Backup verification FAILED"
    exit 1
fi
```

**Tasks:**
- [ ] Create `scripts/backup_database.sh`
- [ ] Run backup script on development database
- [ ] Verify backup file exists and has content
- [ ] Store backup in secure location
- [ ] Document backup location in BACKUPS.md

---

## Task 0.2: Database Dependency Analysis

```sql
-- File: scripts/analyze_dependencies.sql

-- Find all foreign key relationships
SELECT
    tc.table_schema, 
    tc.constraint_name, 
    tc.table_name AS child_table, 
    kcu.column_name AS child_column, 
    ccu.table_name AS parent_table,
    ccu.column_name AS parent_column 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;

-- Check tables we plan to delete
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'quest_collaborations',
    'quest_ratings',
    'subscription_tiers',
    'promo_codes'
  );

-- Check for references to columns we plan to delete
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN (
    'subscription_tier',
    'subscription_status',
    'stripe_customer_id',
    'achievement_level',
    'momentum_rank'
  )
ORDER BY table_name, column_name;
```

**Tasks:**
- [ ] Create `scripts/analyze_dependencies.sql`
- [ ] Run analysis on development database
- [ ] Document all foreign key relationships in DEPENDENCIES.md
- [ ] Review output to ensure no surprises
- [ ] Share findings with team before proceeding

---

## Task 0.3: Create Rollback Scripts

```sql
-- File: scripts/rollback/001_restore_tables.sql

-- Restore deleted tables from backup schema
CREATE TABLE IF NOT EXISTS quest_collaborations AS 
  SELECT * FROM backup_schema.quest_collaborations;

CREATE TABLE IF NOT EXISTS quest_ratings AS 
  SELECT * FROM backup_schema.quest_ratings;

CREATE TABLE IF NOT EXISTS subscription_tiers AS 
  SELECT * FROM backup_schema.subscription_tiers;

CREATE TABLE IF NOT EXISTS promo_codes AS 
  SELECT * FROM backup_schema.promo_codes;

-- Restore foreign key constraints
-- (Add specific constraints based on your schema)
```

```sql
-- File: scripts/rollback/002_restore_columns.sql

-- Restore deleted columns to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50),
  ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS achievement_level VARCHAR(50),
  ADD COLUMN IF NOT EXISTS momentum_rank VARCHAR(50);

-- Restore data from backup
UPDATE users u
SET 
  subscription_tier = b.subscription_tier,
  subscription_status = b.subscription_status,
  stripe_customer_id = b.stripe_customer_id,
  achievement_level = b.achievement_level,
  momentum_rank = b.momentum_rank
FROM backup_schema.users_backup b
WHERE u.id = b.id;
```

**Tasks:**
- [ ] Create `scripts/rollback/` directory
- [ ] Create `001_restore_tables.sql`
- [ ] Create `002_restore_columns.sql`
- [ ] Test rollback scripts on dev database
- [ ] Document rollback procedure in ROLLBACK.md

---

# PHASE 1: DATABASE MIGRATION

## Task 1.1: Create Backup Schema

```sql
-- File: migrations/001_create_backup_schema.sql

-- Create backup schema for safety
CREATE SCHEMA IF NOT EXISTS backup_schema;

-- Backup tables we plan to delete
CREATE TABLE backup_schema.quest_collaborations AS 
  SELECT * FROM quest_collaborations;

CREATE TABLE backup_schema.quest_ratings AS 
  SELECT * FROM quest_ratings;

CREATE TABLE backup_schema.subscription_tiers AS 
  SELECT * FROM subscription_tiers;

CREATE TABLE backup_schema.promo_codes AS 
  SELECT * FROM promo_codes;

-- Backup users table (before column deletion)
CREATE TABLE backup_schema.users_backup AS 
  SELECT * FROM users;

-- Backup badges table (before column deletion)
CREATE TABLE backup_schema.badges_backup AS 
  SELECT * FROM badges;

-- Backup quests table (before modification)
CREATE TABLE backup_schema.quests_backup AS 
  SELECT * FROM quests;

-- Verify backups
SELECT 
  'quest_collaborations' as table_name, 
  COUNT(*) as row_count 
FROM backup_schema.quest_collaborations
UNION ALL
SELECT 'quest_ratings', COUNT(*) FROM backup_schema.quest_ratings
UNION ALL
SELECT 'subscription_tiers', COUNT(*) FROM backup_schema.subscription_tiers
UNION ALL
SELECT 'promo_codes', COUNT(*) FROM backup_schema.promo_codes
UNION ALL
SELECT 'users_backup', COUNT(*) FROM backup_schema.users_backup
UNION ALL
SELECT 'badges_backup', COUNT(*) FROM backup_schema.badges_backup
UNION ALL
SELECT 'quests_backup', COUNT(*) FROM backup_schema.quests_backup;
```

**Tasks:**
- [ ] Create `migrations/001_create_backup_schema.sql`
- [ ] Run on dev database via Supabase MCP
- [ ] Verify all backups created successfully
- [ ] Document row counts for validation

---

## Task 1.2: Soft Delete (Rename Tables)

```sql
-- File: migrations/002_soft_delete_tables.sql

-- Rename tables instead of dropping (safety net)
ALTER TABLE IF EXISTS quest_collaborations
  RENAME TO quest_collaborations_deprecated;

ALTER TABLE IF EXISTS task_collaborations
  RENAME TO task_collaborations_deprecated;

ALTER TABLE IF EXISTS quest_ratings
  RENAME TO quest_ratings_deprecated;

ALTER TABLE IF EXISTS subscription_tiers
  RENAME TO subscription_tiers_deprecated;

ALTER TABLE IF EXISTS subscription_requests
  RENAME TO subscription_requests_deprecated;

ALTER TABLE IF EXISTS subscription_history
  RENAME TO subscription_history_deprecated;

-- Note: promo_codes table does NOT exist in production database (verified via MCP)

-- Verify tables renamed
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%_deprecated';
```

**Tasks:**
- [ ] Create `migrations/002_soft_delete_tables.sql`
- [ ] Run on dev database
- [ ] Test application for 3-5 days
- [ ] Monitor error logs for unexpected issues
- [ ] If no issues, proceed to hard delete

---

## Task 1.3: Hard Delete Tables

```sql
-- File: migrations/003_hard_delete_tables.sql

-- Only run after soft delete testing period
DROP TABLE IF EXISTS quest_collaborations_deprecated CASCADE;
DROP TABLE IF EXISTS task_collaborations_deprecated CASCADE;
DROP TABLE IF EXISTS quest_ratings_deprecated CASCADE;
DROP TABLE IF EXISTS subscription_tiers_deprecated CASCADE;
DROP TABLE IF EXISTS subscription_requests_deprecated CASCADE;
DROP TABLE IF EXISTS subscription_history_deprecated CASCADE;

-- Verify deletion
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'quest_collaborations',
    'task_collaborations',
    'quest_ratings',
    'subscription_tiers',
    'subscription_requests',
    'subscription_history',
    'quest_collaborations_deprecated',
    'task_collaborations_deprecated',
    'quest_ratings_deprecated',
    'subscription_tiers_deprecated',
    'subscription_requests_deprecated',
    'subscription_history_deprecated'
  );
-- Should return 0 rows
```

**Tasks:**
- [ ] Create `migrations/003_hard_delete_tables.sql`
- [ ] Wait 3-5 days after soft delete
- [ ] Confirm no errors in logs
- [ ] Run on dev database
- [ ] Verify tables completely gone

---

## Task 1.4: Remove Columns from Users Table

```sql
-- File: migrations/004_cleanup_users_table.sql

-- Remove subscription-related columns ONLY (VERIFIED via MCP)
-- NOTE: achievement_level, achievement_level_name, momentum_rank, momentum_score do NOT exist
ALTER TABLE users
  DROP COLUMN IF EXISTS subscription_tier CASCADE,
  DROP COLUMN IF EXISTS subscription_status CASCADE,
  DROP COLUMN IF EXISTS subscription_end_date CASCADE,
  DROP COLUMN IF EXISTS stripe_customer_id CASCADE,
  DROP COLUMN IF EXISTS stripe_subscription_id CASCADE;

-- Verify columns removed
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN (
    'subscription_tier',
    'subscription_status',
    'subscription_end_date',
    'stripe_customer_id',
    'stripe_subscription_id'
  );
-- Should return 0 rows
```

**Tasks:**
- [ ] Create `migrations/004_cleanup_users_table.sql`
- [ ] Run on dev database
- [ ] Verify columns removed
- [ ] Test user authentication still works

---

## Task 1.5: Update Users Table Role Field

```sql
-- File: migrations/005_update_users_roles.sql

-- Ensure role column exists with correct constraints
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'student';
  END IF;
END $$;

-- Update role constraint to include observer
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('student', 'parent', 'admin', 'advisor', 'observer'));

-- Ensure all existing users have valid roles
UPDATE users 
SET role = 'student' 
WHERE role IS NULL OR role NOT IN ('student', 'parent', 'admin', 'advisor', 'observer');

-- Verify role distribution
SELECT role, COUNT(*) as count 
FROM users 
GROUP BY role 
ORDER BY role;
```

**Tasks:**
- [ ] Create `migrations/005_update_users_roles.sql`
- [ ] Run on dev database
- [ ] Verify observer role can be assigned
- [ ] Test role-based permissions

---

## Task 1.6: ~~Simplify Badges Table~~ SKIP - ALREADY CORRECT

**VERIFIED via MCP Query:**
- Badges table already has `min_xp` and `min_quests` columns
- No 5-level progression columns exist
- No migration needed

**Actual Badge Schema (Confirmed):**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'badges'
ORDER BY ordinal_position;

-- Result shows:
-- id, name, description, identity_statement
-- pillar_primary, min_quests, min_xp
-- image_url, image_generated_at, image_generation_status
-- is_active, created_at, updated_at
```

**Tasks:**
- [x] SKIP - Badge table already correct
- [x] No migration needed

---

## Task 1.7: Simplify Quests Table (Sources)

```sql
-- File: migrations/007_simplify_quest_sources.sql

-- Migrate all existing sources to 'optio'
UPDATE quests 
SET source = 'optio' 
WHERE source IS NULL 
   OR source = ''
   OR source IN ('khan_academy', 'brilliant', 'custom', 'other');

-- Add LMS-related columns
ALTER TABLE quests 
  ADD COLUMN IF NOT EXISTS lms_course_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lms_assignment_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lms_platform VARCHAR(50);

-- Remove external integration columns
ALTER TABLE quests 
  DROP COLUMN IF EXISTS source_url CASCADE,
  DROP COLUMN IF EXISTS external_course_id CASCADE;

-- Add constraint for valid sources
ALTER TABLE quests DROP CONSTRAINT IF EXISTS quests_source_check;
ALTER TABLE quests ADD CONSTRAINT quests_source_check 
  CHECK (source IN ('optio', 'lms'));

-- Verify source distribution
SELECT source, COUNT(*) as count 
FROM quests 
GROUP BY source;
-- Should only show 'optio' and maybe 'lms'

-- Verify LMS columns exist
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'quests'
  AND column_name IN ('lms_course_id', 'lms_assignment_id', 'lms_platform');
-- Should return 3 rows
```

**Tasks:**
- [ ] Create `migrations/007_simplify_quest_sources.sql`
- [ ] Run on dev database
- [ ] Verify sources simplified to optio/lms
- [ ] Test quest display still works

---

## Task 1.8: Add LMS Integration Tables

```sql
-- File: migrations/008_add_lms_tables.sql

-- LMS user mapping and sync tracking
CREATE TABLE IF NOT EXISTS lms_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  lms_platform VARCHAR(50) NOT NULL,
  lms_user_id VARCHAR(255) NOT NULL,
  lms_course_id VARCHAR(255),
  lms_enrollment_id VARCHAR(255),
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status VARCHAR(50) DEFAULT 'pending',
  sync_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(lms_platform, lms_user_id)
);

-- LMS session tracking for SSO
CREATE TABLE IF NOT EXISTS lms_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  lms_platform VARCHAR(50) NOT NULL,
  session_token TEXT NOT NULL,
  id_token TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- LMS grade passback queue
CREATE TABLE IF NOT EXISTS lms_grade_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
  lms_platform VARCHAR(50) NOT NULL,
  lms_assignment_id VARCHAR(255) NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  max_score NUMERIC(5,2) DEFAULT 100,
  sync_status VARCHAR(50) DEFAULT 'pending',
  sync_attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_lms_integrations_user 
  ON lms_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_lms_integrations_platform_user 
  ON lms_integrations(lms_platform, lms_user_id);
CREATE INDEX IF NOT EXISTS idx_lms_sessions_user 
  ON lms_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lms_grade_sync_status 
  ON lms_grade_sync(sync_status);
CREATE INDEX IF NOT EXISTS idx_lms_grade_sync_user 
  ON lms_grade_sync(user_id);

-- Add LMS fields to users table
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS lms_user_id VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS lms_platform VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(50);

-- Verify tables created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN (
    'lms_integrations',
    'lms_sessions',
    'lms_grade_sync'
  );
-- Should return 3 rows
```

**Tasks:**
- [ ] Create `migrations/008_add_lms_tables.sql`
- [ ] Run on dev database
- [ ] Verify tables created with correct structure
- [ ] Test inserting sample LMS data

---

## Task 1.9: Add Badge Quest Pathways Table

```sql
-- File: migrations/009_add_badge_pathways.sql

-- Badge quest pathways (recommended learning sequences)
CREATE TABLE IF NOT EXISTS badge_quest_pathways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
  quest_id UUID REFERENCES quests(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL,
  difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  is_required BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(badge_id, quest_id),
  UNIQUE(badge_id, sequence_order)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_badge_pathways_badge 
  ON badge_quest_pathways(badge_id);
CREATE INDEX IF NOT EXISTS idx_badge_pathways_quest 
  ON badge_quest_pathways(quest_id);
CREATE INDEX IF NOT EXISTS idx_badge_pathways_order 
  ON badge_quest_pathways(badge_id, sequence_order);

-- Verify table created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name = 'badge_quest_pathways';
-- Should return 1 row
```

**Tasks:**
- [ ] Create `migrations/009_add_badge_pathways.sql`
- [ ] Run on dev database
- [ ] Verify table created
- [ ] Test inserting sample pathway data

---

## Task 1.10: Database Migration Validation

```sql
-- File: migrations/010_validate_migrations.sql

-- 1. Check deleted tables are gone
SELECT 'DELETED TABLES CHECK' as check_name,
  CASE 
    WHEN COUNT(*) = 0 THEN 'PASS' 
    ELSE 'FAIL' 
  END as status,
  COUNT(*) as found_count
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN (
    'quest_collaborations',
    'quest_ratings',
    'subscription_tiers',
    'promo_codes'
  )

UNION ALL

-- 2. Check deleted columns are gone from users
SELECT 'USERS DELETED COLUMNS CHECK',
  CASE 
    WHEN COUNT(*) = 0 THEN 'PASS' 
    ELSE 'FAIL' 
  END,
  COUNT(*)
FROM information_schema.columns 
WHERE table_name = 'users'
  AND column_name IN (
    'subscription_tier',
    'stripe_customer_id',
    'achievement_level',
    'momentum_rank'
  )

UNION ALL

-- 3. Check new badge columns exist
SELECT 'BADGES NEW COLUMNS CHECK',
  CASE 
    WHEN COUNT(*) = 2 THEN 'PASS' 
    ELSE 'FAIL' 
  END,
  COUNT(*)
FROM information_schema.columns 
WHERE table_name = 'badges'
  AND column_name IN ('min_xp_required', 'min_quests_required')

UNION ALL

-- 4. Check quest sources are simplified
SELECT 'QUEST SOURCES CHECK',
  CASE 
    WHEN COUNT(*) = 0 THEN 'PASS' 
    ELSE 'FAIL' 
  END,
  COUNT(*)
FROM quests 
WHERE source NOT IN ('optio', 'lms')

UNION ALL

-- 5. Check LMS tables exist
SELECT 'LMS TABLES CHECK',
  CASE 
    WHEN COUNT(*) = 3 THEN 'PASS' 
    ELSE 'FAIL' 
  END,
  COUNT(*)
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN (
    'lms_integrations',
    'lms_sessions',
    'lms_grade_sync'
  )

UNION ALL

-- 6. Check badge pathways table exists
SELECT 'BADGE PATHWAYS TABLE CHECK',
  CASE 
    WHEN COUNT(*) = 1 THEN 'PASS' 
    ELSE 'FAIL' 
  END,
  COUNT(*)
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name = 'badge_quest_pathways'

UNION ALL

-- 7. Check for orphaned records
SELECT 'ORPHANED RECORDS CHECK',
  CASE 
    WHEN COUNT(*) = 0 THEN 'PASS' 
    ELSE 'FAIL' 
  END,
  COUNT(*)
FROM user_quests uq
WHERE NOT EXISTS (SELECT 1 FROM quests q WHERE q.id = uq.quest_id);

-- All checks should return 'PASS'
```

**Tasks:**
- [ ] Create `migrations/010_validate_migrations.sql`
- [ ] Run validation script
- [ ] Verify all checks return 'PASS'
- [ ] Document any failures and fix before proceeding

---

# PHASE 2: BACKEND REFACTORING

## Task 2.1: Delete Removed Feature Files

**Files to DELETE completely (VERIFIED via codebase exploration):**

```bash
# File: scripts/delete_backend_files.sh
#!/bin/bash

# Routes to delete (CORRECTED)
rm -f backend/routes/collaborations.py        # Collaboration system (registered in app.py)
rm -f backend/routes/task_collaboration.py    # Task collaboration (exists)
rm -f backend/routes/ratings.py               # Quest ratings (orphaned, not registered)
rm -f backend/routes/subscription_requests.py # Manual subscription system (registered)
rm -f backend/routes/tiers.py                 # Tier management (registered)

# Services to delete (these likely DON'T exist, but attempt deletion anyway)
rm -f backend/services/collaboration_service.py
rm -f backend/services/recommendation_service.py
rm -f backend/services/stripe_service.py
rm -f backend/services/credit_mapping_service.py
rm -f backend/services/momentum_service.py

# Utils to delete (likely DON'T exist)
rm -f backend/utils/stripe_utils.py
rm -f backend/utils/tier_utils.py

echo "✓ Deleted removed feature files"
```

**Tasks:**
- [ ] Create `scripts/delete_backend_files.sh`
- [ ] Review each file before deletion
- [ ] Run deletion script
- [ ] Unregister blueprints from app.py (collaborations, tiers, subscription_requests)
- [ ] Commit changes with message: "Remove deleted features from backend"

---

## Task 2.2: Update XP Service - Remove Bonuses

**VERIFIED Bonus Locations:**

1. **2x Collaboration Bonus** - `xp_service.py` line 39
2. **2x Collaboration Bonus** - `tasks.py` line 206
3. **50% Completion Bonus** - `tasks.py` lines 344-387
4. **50% Completion Bonus** - `atomic_quest_service.py`
5. **500 XP Badge Bonus** - `badge_service.py` line 416

**Changes Required:**

**File: `backend/services/xp_service.py`**
- Remove 2x collaboration multiplier (line 39)
- Keep per-task XP and pillar tracking

**File: `backend/routes/tasks.py`**
- Remove collaboration check and 2x multiplier (line 206)
- Remove 50% completion bonus logic (lines 344-387)

**File: `backend/services/atomic_quest_service.py`**
- Remove 50% completion bonus calculation

**File: `backend/services/badge_service.py`**
- Remove 500 XP badge completion bonus (line 416)

**Tasks:**
- [ ] Open `backend/services/xp_service.py`
- [ ] Remove line 39: 2x collaboration multiplier
- [ ] Open `backend/routes/tasks.py`
- [ ] Remove line 206: collaboration XP multiplier check
- [ ] Remove lines 344-387: completion bonus calculation
- [ ] Open `backend/services/atomic_quest_service.py`
- [ ] Remove completion bonus logic
- [ ] Open `backend/services/badge_service.py`
- [ ] Remove line 416: 500 XP badge bonus
- [ ] Test XP calculations (should now be pure sum of task XP)
- [ ] Verify pillar-specific XP tracking still works

---

## Task 2.3: ~~Update Badge Service~~ MOSTLY SKIP - Only Remove 500 XP Bonus

**VERIFIED via Code Exploration:**
- No 5-level progression logic exists in badge_service.py
- Badge earning already checks min_xp AND min_quests
- No level-up notifications exist
- Badge logic already correct

**ONLY CHANGE NEEDED:**
- Remove 500 XP badge completion bonus from line 416

**Tasks:**
- [ ] Open `backend/services/badge_service.py`
- [ ] Remove line 416: 500 XP badge completion bonus
- [x] SKIP - No 5-level progression to remove (doesn't exist)
- [x] SKIP - Badge earning logic already correct
- [x] SKIP - No level notifications to remove (don't exist)

---

## Task 2.4: Remove Collaboration from Quest Service

**File:** `backend/services/quest_service.py`

**Changes:**
- Remove collaboration checks
- Remove team-up logic
- Keep solo quest functionality

**Tasks:**
- [ ] Open `backend/services/quest_service.py`
- [ ] Remove `is_collaborative` parameter from functions
- [ ] Remove `get_collaborators()` function
- [ ] Remove `invite_to_quest()` function
- [ ] Update `complete_quest()` to remove collaboration checks
- [ ] Test quest completion flow

---

## Task 2.5: Remove Tier Decorators

**File:** `backend/utils/auth/decorators.py`

**Changes:**
- Remove `@require_paid_tier` decorator
- Remove tier-based permission checks
- Add `@require_observer` decorator

**Tasks:**
- [ ] Open `backend/utils/auth/decorators.py`
- [ ] Delete `require_paid_tier()` function
- [ ] Delete `check_tier_access()` function
- [ ] Add new decorator:
  ```python
  def require_observer(f):
      @wraps(f)
      def decorated_function(*args, **kwargs):
          user = get_current_user()
          if user.role not in ['observer', 'admin', 'advisor']:
              return jsonify({'error': 'Observer access required'}), 403
          return f(*args, **kwargs)
      return decorated_function
  ```
- [ ] Search codebase for `@require_paid_tier` usage
- [ ] Remove all tier check decorators
- [ ] Test authentication still works

---

## Task 2.6: Update Quest Routes

**File:** `backend/routes/quests.py`

**Changes:**
- Remove collaboration endpoints
- Remove rating endpoints
- Remove source filtering by external platforms

**Tasks:**
- [ ] Open `backend/routes/quests.py`
- [ ] Remove `POST /api/quests/:id/collaborate` endpoint
- [ ] Remove `POST /api/quests/:id/rate` endpoint
- [ ] Update `GET /api/quests` to filter by source ('optio' or 'lms')
- [ ] Remove tier-based quest access checks
- [ ] Test quest API endpoints

---

## Task 2.7: Update Connection Routes

**File:** `backend/routes/connections.py` or `backend/routes/community.py`

**Changes:**
- Remove team-up invitation endpoints
- Keep connection requests and activity feed

**Tasks:**
- [ ] Open connections route file
- [ ] Remove `POST /api/collaborations/invite` endpoint
- [ ] Remove `GET /api/collaborations/invites` endpoint
- [ ] Keep `GET /api/community/friends` endpoint
- [ ] Keep `POST /api/community/friends/request` endpoint
- [ ] Keep activity feed endpoint
- [ ] Test connection features work

---

## Task 2.8: Update Parent Dashboard Routes

**File:** `backend/routes/parent.py`

**Changes:**
- Remove parent evidence upload (you said no ability to upload evidence)
- Keep read-only monitoring

**Tasks:**
- [ ] Open `backend/routes/parent.py`
- [ ] Remove `POST /api/parent/evidence/:studentId` endpoint
- [ ] Verify `GET /api/parent/dashboard/:studentId` works
- [ ] Verify `GET /api/parent/calendar/:studentId` works
- [ ] Ensure AI tutor conversations NOT exposed
- [ ] Test parent dashboard still works

---

## Task 2.9: Add Observer Routes

**File:** `backend/routes/observer.py` (NEW)

**Create new observer routes:**

```python
# backend/routes/observer.py

from flask import Blueprint, jsonify, request
from utils.auth.decorators import require_observer, require_auth
from services.portfolio_service import get_portfolio_by_user_id
from services.quest_service import get_user_active_quests
from services.community_service import get_user_activity_feed

observer_bp = Blueprint('observer', __name__)

@observer_bp.route('/api/observer/students', methods=['GET'])
@require_observer
def get_observed_students():
    """Get list of students this observer is watching"""
    # Return students observer has permission to view
    pass

@observer_bp.route('/api/observer/portfolio/<user_id>', methods=['GET'])
@require_observer
def view_student_portfolio(user_id):
    """View student's portfolio (read-only)"""
    # Check observer has permission for this student
    # Return portfolio data
    pass

@observer_bp.route('/api/observer/activity/<user_id>', methods=['GET'])
@require_observer
def view_student_activity(user_id):
    """View student's activity feed (read-only)"""
    # Return activity feed
    pass
```

**Tasks:**
- [ ] Create `backend/routes/observer.py`
- [ ] Implement observer endpoints
- [ ] Add observer permission checks
- [ ] Register blueprint in main app
- [ ] Test observer access

---

## Task 2.10: Create LMS Integration Services

**File:** `backend/services/lti_service.py` (NEW)

```python
# backend/services/lti_service.py

import jwt
from datetime import datetime, timedelta
from flask import current_app

class LTI13Service:
    """LTI 1.3 integration service for LMS platforms"""
    
    def __init__(self):
        self.platform_configs = self.load_platform_configs()
    
    def validate_launch(self, id_token):
        """
        Validate LTI 1.3 launch request
        
        Args:
            id_token: JWT token from LMS
            
        Returns:
            User data dict or None if invalid
        """
        try:
            # Decode and validate JWT
            decoded = jwt.decode(
                id_token,
                self.get_platform_key(),
                algorithms=['RS256']
            )
            
            # Extract user info
            user_data = {
                'lms_user_id': decoded.get('sub'),
                'email': decoded.get('email'),
                'name': decoded.get('name'),
                'lms_platform': decoded.get('iss'),
                'lms_course_id': decoded.get('https://purl.imsglobal.org/spec/lti/claim/context', {}).get('id')
            }
            
            return user_data
            
        except Exception as e:
            current_app.logger.error(f"LTI validation error: {e}")
            return None
    
    def create_or_update_user(self, user_data):
        """Create or update user from LMS data"""
        # Implementation
        pass
    
    def generate_deep_link(self, quest_id):
        """Generate LTI deep link to specific quest"""
        return f"{current_app.config['FRONTEND_URL']}/lti/quest/{quest_id}"
    
    def send_grade(self, lms_user_id, score, max_score=100):
        """Send grade back to LMS gradebook via AGS"""
        # Implementation for LTI Assignment and Grade Services
        pass
```

**Tasks:**
- [ ] Create `backend/services/lti_service.py`
- [ ] Implement LTI 1.3 validation
- [ ] Implement user creation from LMS data
- [ ] Add deep linking support
- [ ] Add grade passback (AGS)
- [ ] Add configuration for Canvas, Google Classroom
- [ ] Test with mock LTI launch data

---

**File:** `backend/services/sso_service.py` (NEW)

```python
# backend/services/sso_service.py

from onelogin.saml2.auth import OneLogin_Saml2_Auth
from flask import current_app

class SSOService:
    """SAML 2.0 SSO service"""
    
    def __init__(self):
        self.saml_settings = self.load_saml_settings()
    
    def process_saml_response(self, request):
        """Process SAML assertion from IdP"""
        auth = OneLogin_Saml2_Auth(request, self.saml_settings)
        auth.process_response()
        
        if auth.is_authenticated():
            user_data = {
                'lms_user_id': auth.get_nameid(),
                'email': auth.get_attribute('email')[0],
                'name': auth.get_attribute('name')[0],
                'role': self.map_saml_role(auth.get_attribute('role'))
            }
            return user_data
        return None
    
    def map_saml_role(self, saml_role):
        """Map SAML role to Optio role"""
        role_mapping = {
            'Learner': 'student',
            'Instructor': 'advisor',
            'Administrator': 'admin'
        }
        return role_mapping.get(saml_role[0], 'student')
```

**Tasks:**
- [ ] Create `backend/services/sso_service.py`
- [ ] Install python3-saml library
- [ ] Implement SAML response processing
- [ ] Add SAML configuration support
- [ ] Test with mock SAML assertions

---

**File:** `backend/services/lms_sync_service.py` (NEW)

```python
# backend/services/lms_sync_service.py

import csv
from io import StringIO
from models import User, Quest, LMSIntegration
from services.quest_service import create_quest
from database import db

class LMSSyncService:
    """Service for syncing rosters and grades with LMS"""
    
    def sync_roster_from_oneroster(self, csv_content, lms_platform):
        """
        Import student roster from OneRoster CSV format
        
        Args:
            csv_content: CSV file content
            lms_platform: Platform name (canvas, google_classroom, etc)
            
        Returns:
            Dict with sync results
        """
        users_created = 0
        users_updated = 0
        errors = []
        
        reader = csv.DictReader(StringIO(csv_content))
        
        for row in reader:
            try:
                user_data = {
                    'lms_user_id': row['sourcedId'],
                    'email': row['email'],
                    'name': f"{row['givenName']} {row['familyName']}",
                    'role': self.map_oneroster_role(row['role']),
                    'lms_platform': lms_platform
                }
                
                # Create or update user
                user = self.create_or_update_user(user_data)
                
                if user.created:
                    users_created += 1
                else:
                    users_updated += 1
                    
            except Exception as e:
                errors.append(f"Row error: {e}")
        
        return {
            'users_created': users_created,
            'users_updated': users_updated,
            'errors': errors
        }
    
    def sync_lms_assignment_to_quest(self, lms_assignment_data):
        """Convert LMS assignment to Optio quest"""
        quest_data = {
            'title': lms_assignment_data['name'],
            'description': lms_assignment_data['description'],
            'source': 'lms',
            'lms_course_id': lms_assignment_data['course_id'],
            'lms_assignment_id': lms_assignment_data['id'],
            'lms_platform': lms_assignment_data['platform']
        }
        
        return create_quest(quest_data)
    
    def sync_quest_completion_to_lms(self, user_id, quest_id):
        """Push quest completion as grade to LMS"""
        # Get quest and LMS info
        quest = Quest.get_by_id(quest_id)
        lms_integration = LMSIntegration.get_by_user_id(user_id)
        
        if quest.source == 'lms' and lms_integration:
            # Calculate score (100% if completed)
            score = 100
            
            # Queue for grade sync
            self.queue_grade_sync(
                user_id=user_id,
                quest_id=quest_id,
                lms_assignment_id=quest.lms_assignment_id,
                score=score
            )
```

**Tasks:**
- [ ] Create `backend/services/lms_sync_service.py`
- [ ] Implement OneRoster CSV parsing
- [ ] Implement assignment → quest conversion
- [ ] Implement grade passback queue
- [ ] Test with sample CSV data

---

## Task 2.11: Create LMS Integration Routes

**File:** `backend/routes/lms_integration.py` (NEW)

```python
# backend/routes/lms_integration.py

from flask import Blueprint, request, redirect, jsonify, current_app
from services.lti_service import LTI13Service
from services.sso_service import SSOService
from services.lms_sync_service import LMSSyncService
from utils.auth.decorators import require_admin
from services.auth_service import create_session_token

lms_bp = Blueprint('lms', __name__)

lti_service = LTI13Service()
sso_service = SSOService()
sync_service = LMSSyncService()

@lms_bp.route('/lti/launch', methods=['POST'])
def lti_launch():
    """Handle LTI 1.3 launch request from LMS"""
    id_token = request.form.get('id_token')
    
    # Validate LTI token
    user_data = lti_service.validate_launch(id_token)
    
    if not user_data:
        return jsonify({'error': 'Invalid LTI launch'}), 401
    
    # Create or get user
    user = lti_service.create_or_update_user(user_data)
    
    # Generate Optio session token
    session_token = create_session_token(user.id)
    
    # Redirect to Optio with session
    redirect_url = f"{current_app.config['FRONTEND_URL']}/lti/callback?token={session_token}"
    return redirect(redirect_url)

@lms_bp.route('/sso/saml', methods=['POST'])
def saml_sso():
    """Handle SAML 2.0 SSO from enterprise LMS"""
    user_data = sso_service.process_saml_response(request)
    
    if not user_data:
        return jsonify({'error': 'Invalid SAML response'}), 401
    
    # Create session and redirect
    # Similar to LTI flow
    pass

@lms_bp.route('/api/lms/sync/roster', methods=['POST'])
@require_admin
def sync_roster():
    """Sync student roster from LMS via OneRoster CSV"""
    csv_file = request.files.get('roster_csv')
    lms_platform = request.form.get('lms_platform')
    
    if not csv_file:
        return jsonify({'error': 'No CSV file provided'}), 400
    
    csv_content = csv_file.read().decode('utf-8')
    result = sync_service.sync_roster_from_oneroster(csv_content, lms_platform)
    
    return jsonify(result), 200

@lms_bp.route('/api/lms/sync/assignments', methods=['POST'])
@require_admin
def sync_assignments():
    """Sync LMS assignments as Optio quests"""
    # Implementation
    pass
```

**Tasks:**
- [ ] Create `backend/routes/lms_integration.py`
- [ ] Implement LTI launch endpoint
- [ ] Implement SAML SSO endpoint
- [ ] Implement roster sync endpoint
- [ ] Implement assignment sync endpoint
- [ ] Register blueprint in main app
- [ ] Test with mock data

---

## Task 2.12: Add Badge Pathways Service

**File:** `backend/services/badge_pathways_service.py` (NEW)

```python
# backend/services/badge_pathways_service.py

from models import BadgeQuestPathway, Badge, Quest
from database import db

class BadgePathwaysService:
    """Service for managing badge quest pathways"""
    
    def get_badge_pathway(self, badge_id):
        """Get recommended quest sequence for badge"""
        pathways = BadgeQuestPathway.query.filter_by(
            badge_id=badge_id
        ).order_by(
            BadgeQuestPathway.sequence_order
        ).all()
        
        return [{
            'quest': quest.to_dict(),
            'sequence_order': pw.sequence_order,
            'difficulty_level': pw.difficulty_level,
            'is_required': pw.is_required
        } for pw in pathways]
    
    def add_quest_to_pathway(self, badge_id, quest_id, sequence_order, difficulty_level='intermediate'):
        """Add quest to badge pathway"""
        pathway = BadgeQuestPathway(
            badge_id=badge_id,
            quest_id=quest_id,
            sequence_order=sequence_order,
            difficulty_level=difficulty_level
        )
        db.session.add(pathway)
        db.session.commit()
        return pathway
    
    def remove_quest_from_pathway(self, badge_id, quest_id):
        """Remove quest from badge pathway"""
        BadgeQuestPathway.query.filter_by(
            badge_id=badge_id,
            quest_id=quest_id
        ).delete()
        db.session.commit()
    
    def reorder_pathway(self, badge_id, quest_sequence):
        """Reorder quests in pathway"""
        for idx, quest_id in enumerate(quest_sequence):
            pathway = BadgeQuestPathway.query.filter_by(
                badge_id=badge_id,
                quest_id=quest_id
            ).first()
            if pathway:
                pathway.sequence_order = idx + 1
        db.session.commit()
```

**Tasks:**
- [ ] Create `backend/services/badge_pathways_service.py`
- [ ] Implement pathway CRUD operations
- [ ] Add pathways to badge detail API response
- [ ] Test pathway functionality

---

## Task 2.13: Update Badge Routes

**File:** `backend/routes/badges.py`

**Changes:**
- Add pathway data to badge details
- Remove level progression logic

**Tasks:**
- [ ] Open `backend/routes/badges.py`
- [ ] Update `GET /api/badges/:id` to include pathway:
  ```python
  @badges_bp.route('/api/badges/<badge_id>', methods=['GET'])
  def get_badge(badge_id):
      badge = Badge.get_by_id(badge_id)
      pathway = badge_pathways_service.get_badge_pathway(badge_id)
      
      return jsonify({
          **badge.to_dict(),
          'recommended_pathway': pathway
      })
  ```
- [ ] Remove level-related fields from response
- [ ] Test badge API endpoints

---

## Task 2.14: Update Environment Variables

**File:** `backend/.env` and deployment configs

**Remove:**
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PUBLISHABLE_KEY
```

**Add:**
```
# LMS Integration
LTI_CLIENT_ID=your_lti_client_id
LTI_PLATFORM_URL=https://canvas.instructure.com
SAML_IDP_URL=https://your-idp.com/saml
SAML_CERT_PATH=/path/to/saml/cert.pem

# Feature Flags
ENABLE_LMS_SYNC=true
ENABLE_GRADE_PASSBACK=true
```

**Tasks:**
- [ ] Remove Stripe environment variables
- [ ] Add LMS integration variables
- [ ] Update `.env.example`
- [ ] Update deployment configs (Render)
- [ ] Document new environment variables

---

## Task 2.15: Update Requirements.txt

**File:** `backend/requirements.txt`

**Remove:**
```
stripe==5.x.x
```

**Add:**
```
# LMS Integration
python3-saml==1.15.0
PyJWT==2.8.0
cryptography==41.0.4
```

**Tasks:**
- [ ] Update `requirements.txt`
- [ ] Run `pip install -r requirements.txt`
- [ ] Test imports work
- [ ] Update deployment dependencies

---

# PHASE 3: FRONTEND REFACTORING

## Task 3.1: Delete Removed Feature Components

```bash
# File: scripts/delete_frontend_files.sh
#!/bin/bash

# Pages to delete
rm -rf frontend/src/pages/Pricing.jsx
rm -rf frontend/src/pages/Subscription.jsx
rm -rf frontend/src/pages/Upgrade.jsx

# Components to delete
rm -rf frontend/src/components/collaborations/
rm -rf frontend/src/components/ratings/
rm -rf frontend/src/components/subscription/

# Invitations tab (team-ups)
rm -f frontend/src/components/connections/InvitationsTab.jsx

echo "✓ Deleted removed feature components"
```

**Tasks:**
- [ ] Create `scripts/delete_frontend_files.sh`
- [ ] Review each file/folder before deletion
- [ ] Run deletion script
- [ ] Commit changes

---

## Task 3.2: Update Badge Components

**File:** `frontend/src/components/badges/BadgeCard.jsx`

**Changes:**
- Remove 5-level progression UI
- Show simple earned/not-earned state
- Show XP progress and quest count progress

**Tasks:**
- [ ] Open `BadgeCard.jsx`
- [ ] Remove level indicator components
- [ ] Remove "Next level" progress bars
- [ ] Update to show:
  ```jsx
  {badge.earned ? (
    <div className="badge-earned">✓ Earned</div>
  ) : (
    <div className="badge-progress">
      <div>XP: {badge.current_xp}/{badge.min_xp_required}</div>
      <div>Quests: {badge.completed_quests}/{badge.min_quests_required}</div>
    </div>
  )}
  ```
- [ ] Test badge display

---

**File:** `frontend/src/components/badges/BadgeDetailModal.jsx`

**Changes:**
- Add recommended pathway section
- Remove level progression timeline

**Tasks:**
- [ ] Open `BadgeDetailModal.jsx`
- [ ] Add pathway display:
  ```jsx
  <div className="recommended-pathway">
    <h3>Recommended Quest Pathway</h3>
    <ol>
      {badge.recommended_pathway?.map(item => (
        <li key={item.quest.id}>
          <Link to={`/quests/${item.quest.id}`}>
            {item.quest.title}
          </Link>
          <span className={`difficulty-${item.difficulty_level}`}>
            {item.difficulty_level}
          </span>
        </li>
      ))}
    </ol>
  </div>
  ```
- [ ] Remove level timeline component
- [ ] Test modal display

---

## Task 3.3: Update Quest Components

**File:** `frontend/src/components/quests/QuestCard.jsx`

**Changes:**
- Remove source badges (Khan Academy, Brilliant logos)
- Remove collaboration indicators
- Remove rating stars
- Simplify to show just quest info

**Tasks:**
- [ ] Open `QuestCard.jsx`
- [ ] Remove source logo/badge display
- [ ] Remove "Collaborate" button
- [ ] Remove rating stars display
- [ ] Keep just: title, description, XP, tasks, start button
- [ ] Test quest card display

---

**File:** `frontend/src/components/quests/QuestDetailPage.jsx`

**Changes:**
- Remove collaboration section
- Remove rating form
- Keep task completion flow

**Tasks:**
- [ ] Open `QuestDetailPage.jsx`
- [ ] Remove collaboration invite UI
- [ ] Remove rating form at bottom
- [ ] Keep task list and completion
- [ ] Test quest detail page

---

## Task 3.4: Update Profile/Stats Components

**File:** `frontend/src/components/profile/ProfileStats.jsx`

**Changes:**
- Remove achievement level titles
- Remove momentum rank badges
- Show numerical XP milestones instead

**Tasks:**
- [ ] Open `ProfileStats.jsx`
- [ ] Remove achievement level display
- [ ] Remove momentum rank badge
- [ ] Add milestone celebration:
  ```jsx
  const nextMilestone = Math.ceil(totalXP / 500) * 500;
  
  <div className="milestone-progress">
    <h4>Next Milestone: {nextMilestone} XP</h4>
    <ProgressBar current={totalXP} target={nextMilestone} />
  </div>
  ```
- [ ] Test profile stats display

---

## Task 3.5: Update Connections Page

**File:** `frontend/src/components/connections/ConnectionsPage.jsx`

**Changes:**
- Remove "Invitations" tab
- Keep "Activity Feed" and "Your Connections" tabs

**Tasks:**
- [ ] Open `ConnectionsPage.jsx`
- [ ] Remove InvitationsTab import
- [ ] Remove tab from TabList
- [ ] Keep ActivityFeed and YourConnections tabs
- [ ] Test connections page

---

**File:** `frontend/src/components/connections/ActivityFeed.jsx`

**Changes:**
- Ensure it shows connection activity only
- No collaboration/team-up activities

**Tasks:**
- [ ] Open `ActivityFeed.jsx`
- [ ] Remove team-up activity items
- [ ] Keep quest starts, completions, badge earnings
- [ ] Test activity feed updates

---

## Task 3.6: Update Navigation/Routing

**File:** `frontend/src/App.jsx` or `frontend/src/routes.jsx`

**Changes:**
- Remove pricing/subscription routes
- Remove upgrade routes

**Tasks:**
- [ ] Open routing file
- [ ] Remove `/pricing` route
- [ ] Remove `/subscription` route
- [ ] Remove `/upgrade` route
- [ ] Remove any tier-gated route wrappers
- [ ] Test navigation works

---

## Task 3.7: Remove Tier-Based UI Elements

**Search for and remove:**
- "Upgrade" buttons
- "Premium feature" badges
- Tier requirement messages
- Paywall modals

**Tasks:**
- [ ] Search codebase for "upgrade"
- [ ] Search for "premium"
- [ ] Search for "tier"
- [ ] Search for "subscription"
- [ ] Remove all tier-based UI elements
- [ ] Test that no tier checks remain

---

## Task 3.8: Create Observer Components

**File:** `frontend/src/components/observer/ObserverDashboard.jsx` (NEW)

```jsx
// frontend/src/components/observer/ObserverDashboard.jsx

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { observerApi } from '../../services/api';

export default function ObserverDashboard() {
  const { studentId } = useParams();
  const [portfolio, setPortfolio] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadObserverData();
  }, [studentId]);

  const loadObserverData = async () => {
    try {
      const [portfolioData, activityData] = await Promise.all([
        observerApi.getPortfolio(studentId),
        observerApi.getActivity(studentId)
      ]);
      
      setPortfolio(portfolioData);
      setActivity(activityData);
    } catch (error) {
      console.error('Error loading observer data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="observer-dashboard">
      <h1>Watching {portfolio.name}'s Learning Journey</h1>
      
      <section className="portfolio-preview">
        <h2>Portfolio Highlights</h2>
        <div className="xp-summary">
          {/* XP radar chart */}
        </div>
        <div className="recent-completions">
          {/* Recent quest completions */}
        </div>
      </section>

      <section className="activity-feed">
        <h2>Recent Activity</h2>
        {activity.map(item => (
          <div key={item.id} className="activity-item">
            {item.description}
          </div>
        ))}
      </section>
    </div>
  );
}
```

**Tasks:**
- [ ] Create `frontend/src/components/observer/` directory
- [ ] Create `ObserverDashboard.jsx`
- [ ] Create `ObserverStudentSelector.jsx`
- [ ] Add observer routes
- [ ] Test observer view

---

## Task 3.9: Create LMS Integration Components

**File:** `frontend/src/components/lms/LMSLoginButton.jsx` (NEW)

```jsx
// frontend/src/components/lms/LMSLoginButton.jsx

import React from 'react';

export default function LMSLoginButton({ platform }) {
  const handleLMSLogin = () => {
    // Redirect to LMS SSO endpoint
    window.location.href = `/lti/launch?platform=${platform}`;
  };

  const logos = {
    canvas: '/images/canvas-logo.png',
    google_classroom: '/images/google-classroom-logo.png',
    schoology: '/images/schoology-logo.png'
  };

  return (
    <button 
      onClick={handleLMSLogin}
      className="lms-login-button"
    >
      <img src={logos[platform]} alt={`Login with ${platform}`} />
      Continue with {platform}
    </button>
  );
}
```

**File:** `frontend/src/pages/LMSCallback.jsx` (NEW)

```jsx
// frontend/src/pages/LMSCallback.jsx

import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function LMSCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuthToken } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (token) {
      // Store token
      setAuthToken(token);
      
      // Redirect to dashboard
      navigate('/dashboard');
    } else {
      // Handle error
      navigate('/login?error=lms_auth_failed');
    }
  }, [searchParams]);

  return (
    <div className="lms-callback-loading">
      <div className="spinner" />
      <p>Connecting to your learning platform...</p>
    </div>
  );
}
```

**Tasks:**
- [ ] Create `frontend/src/components/lms/` directory
- [ ] Create `LMSLoginButton.jsx`
- [ ] Create `LMSSyncStatus.jsx`
- [ ] Create `LMSCourseBadge.jsx`
- [ ] Create `frontend/src/pages/LMSCallback.jsx`
- [ ] Add LMS callback route
- [ ] Test LMS login flow with mock data

---

## Task 3.10: Update API Service

**File:** `frontend/src/services/api.js`

**Changes:**
- Remove collaboration API calls
- Remove rating API calls
- Remove subscription/tier API calls
- Add LMS API calls
- Add badge pathways API calls

**Tasks:**
- [ ] Open `api.js`
- [ ] Remove collaboration functions
- [ ] Remove rating functions
- [ ] Remove subscription functions
- [ ] Add:
  ```javascript
  // Badge Pathways
  export const badgeApi = {
    getBadge: (id) => api.get(`/api/badges/${id}`),
    getPathway: (badgeId) => api.get(`/api/badges/${badgeId}/pathway`)
  };
  
  // LMS Integration
  export const lmsApi = {
    syncRoster: (file) => {
      const formData = new FormData();
      formData.append('roster_csv', file);
      return api.post('/api/lms/sync/roster', formData);
    },
    getIntegrationStatus: () => api.get('/api/lms/status')
  };
  
  // Observer
  export const observerApi = {
    getPortfolio: (studentId) => api.get(`/api/observer/portfolio/${studentId}`),
    getActivity: (studentId) => api.get(`/api/observer/activity/${studentId}`)
  };
  ```
- [ ] Test API calls

---

## Task 3.11: Update Parent Dashboard

**File:** `frontend/src/components/parent/ParentDashboard.jsx`

**Changes:**
- Remove evidence upload capability
- Ensure AI tutor conversations NOT displayed

**Tasks:**
- [ ] Open `ParentDashboard.jsx`
- [ ] Remove evidence upload button/form
- [ ] Remove AI tutor conversation tab
- [ ] Keep: Learning Rhythm, Calendar, Insights
- [ ] Test parent dashboard

---

## Task 3.12: Remove Stripe Components

**Search for and remove:**
- Stripe checkout components
- Payment form components
- Subscription management UI

**Tasks:**
- [ ] Search for "stripe" in frontend
- [ ] Delete all Stripe-related components
- [ ] Remove Stripe script tags from index.html
- [ ] Test that no Stripe code remains

---

# PHASE 4: LMS INTEGRATION FOUNDATION

## Task 4.1: Create LMS Configuration System

**File:** `backend/config/lms_platforms.py` (NEW)

```python
# backend/config/lms_platforms.py

LMS_PLATFORMS = {
    'canvas': {
        'name': 'Canvas LMS',
        'auth_method': 'lti_1_3',
        'client_id': 'ENV:CANVAS_CLIENT_ID',
        'platform_url': 'https://canvas.instructure.com',
        'jwks_url': 'https://canvas.instructure.com/api/lti/security/jwks',
        'supports_grade_passback': True,
        'supports_deep_linking': True
    },
    'google_classroom': {
        'name': 'Google Classroom',
        'auth_method': 'oauth2',
        'client_id': 'ENV:GOOGLE_CLIENT_ID',
        'client_secret': 'ENV:GOOGLE_CLIENT_SECRET',
        'scopes': [
            'https://www.googleapis.com/auth/classroom.courses.readonly',
            'https://www.googleapis.com/auth/classroom.rosters.readonly'
        ],
        'supports_grade_passback': False,
        'supports_deep_linking': False
    },
    'schoology': {
        'name': 'Schoology',
        'auth_method': 'oauth2',
        'client_id': 'ENV:SCHOOLOGY_CLIENT_ID',
        'client_secret': 'ENV:SCHOOLOGY_CLIENT_SECRET',
        'api_url': 'https://api.schoology.com/v1',
        'supports_grade_passback': True,
        'supports_deep_linking': False
    },
    'moodle': {
        'name': 'Moodle',
        'auth_method': 'lti_1_3',
        'platform_url': 'ENV:MOODLE_URL',
        'supports_grade_passback': True,
        'supports_deep_linking': True
    }
}

def get_platform_config(platform_name):
    """Get configuration for specific LMS platform"""
    return LMS_PLATFORMS.get(platform_name)

def get_supported_platforms():
    """Get list of supported LMS platforms"""
    return list(LMS_PLATFORMS.keys())
```

**Tasks:**
- [ ] Create `backend/config/lms_platforms.py`
- [ ] Add configuration for each platform
- [ ] Document required environment variables
- [ ] Test configuration loading

---

## Task 4.2: Create LMS Admin Panel

**File:** `frontend/src/components/admin/LMSIntegrationPanel.jsx` (NEW)

```jsx
// frontend/src/components/admin/LMSIntegrationPanel.jsx

import React, { useState } from 'react';
import { lmsApi } from '../../services/api';

export default function LMSIntegrationPanel() {
  const [platform, setPlatform] = useState('canvas');
  const [rosterFile, setRosterFile] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const handleRosterSync = async () => {
    if (!rosterFile) return;

    setSyncing(true);
    try {
      const result = await lmsApi.syncRoster(rosterFile);
      setResult(result);
    } catch (error) {
      console.error('Roster sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="lms-integration-panel">
      <h2>LMS Integration</h2>

      <section className="platform-selection">
        <label>Platform:</label>
        <select value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="canvas">Canvas</option>
          <option value="google_classroom">Google Classroom</option>
          <option value="schoology">Schoology</option>
          <option value="moodle">Moodle</option>
        </select>
      </section>

      <section className="roster-sync">
        <h3>Sync Student Roster</h3>
        <input 
          type="file" 
          accept=".csv"
          onChange={e => setRosterFile(e.target.files[0])}
        />
        <button onClick={handleRosterSync} disabled={!rosterFile || syncing}>
          {syncing ? 'Syncing...' : 'Sync Roster'}
        </button>

        {result && (
          <div className="sync-result">
            <p>✓ Created: {result.users_created} users</p>
            <p>✓ Updated: {result.users_updated} users</p>
            {result.errors.length > 0 && (
              <div className="errors">
                <p>Errors: {result.errors.length}</p>
                <ul>
                  {result.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="grade-sync-settings">
        <h3>Grade Passback</h3>
        <label>
          <input type="checkbox" />
          Enable automatic grade sync to LMS
        </label>
      </section>
    </div>
  );
}
```

**Tasks:**
- [ ] Create `LMSIntegrationPanel.jsx`
- [ ] Add to admin dashboard
- [ ] Implement roster upload
- [ ] Implement settings management
- [ ] Test admin panel

---

## Task 4.3: Create LMS Documentation

**File:** `docs/LMS_INTEGRATION.md` (NEW)

```markdown
# LMS Integration Guide

## Supported Platforms

Optio currently supports integration with:

1. **Canvas LMS** (LTI 1.3)
2. **Google Classroom** (OAuth 2.0)
3. **Schoology** (OAuth 2.0)
4. **Moodle** (LTI 1.3)

## Setup Instructions

### Canvas LMS Integration

#### Step 1: Register Optio as External App

1. Navigate to Canvas Admin > Developer Keys
2. Create new LTI Key
3. Configure with these settings:
   - **Method:** Manual Entry
   - **Title:** Optio Education
   - **Redirect URIs:** `https://www.optioeducation.com/lti/launch`
   - **JWK Method:** Public JWK URL
   - **JWK URL:** `https://www.optioeducation.com/.well-known/jwks.json`
   - **Target Link URI:** `https://www.optioeducation.com/lti/launch`

#### Step 2: Configure Scopes

Enable these LTI Advantage scopes:
- [ ] Can retrieve user data
- [ ] Can create and view assignment data
- [ ] Can view submission data
- [ ] Can view course content

#### Step 3: Deploy to Courses

1. In each Canvas course, go to Settings > Apps
2. Add Optio app using the Developer Key
3. Configure placement as "Course Navigation"

### Google Classroom Integration

[Instructions for Google Classroom...]

### Roster Sync

Optio supports OneRoster CSV format for bulk user import:

1. Export roster from your LMS
2. Upload CSV via Admin > LMS Integration
3. Review sync results

## Grade Passback

When enabled, Optio will automatically send quest completion grades back to the LMS gradebook.

### Configuration

- Completed quest = 100%
- In-progress quest = No grade sent
- Abandoned quest = No grade sent

Grades sync within 5 minutes of quest completion.

## Troubleshooting

### Common Issues

**Issue:** "Invalid LTI Launch"
- **Solution:** Verify client ID matches in LMS and Optio

**Issue:** "Grade not syncing"
- **Solution:** Check that assignment is linked to LMS assignment ID

## Support

For integration support, contact: support@optioeducation.com
```

**Tasks:**
- [ ] Create `docs/LMS_INTEGRATION.md`
- [ ] Document each platform setup
- [ ] Add troubleshooting section
- [ ] Include screenshots (create placeholder references)

---

# PHASE 5: TESTING & VALIDATION

## Task 5.1: Backend API Testing

**File:** `backend/tests/test_refactored_features.py` (NEW)

```python
# backend/tests/test_refactored_features.py

import pytest
from services.badge_service import check_badge_earned
from services.xp_service import calculate_quest_xp
from models import Badge, Quest, User

class TestSimplifiedBadges:
    """Test badge system with single XP/quest requirements"""
    
    def test_badge_earning_with_xp_and_quests(self):
        # User has 600 XP and 5 completed quests in STEM pillar
        badge = Badge(
            pillar='stem',
            min_xp_required=500,
            min_quests_required=5
        )
        
        assert check_badge_earned(user_id='test', badge_id=badge.id) == True
    
    def test_badge_not_earned_insufficient_xp(self):
        # User has 400 XP but 5 quests
        badge = Badge(
            pillar='stem',
            min_xp_required=500,
            min_quests_required=5
        )
        
        assert check_badge_earned(user_id='test', badge_id=badge.id) == False
    
    def test_badge_not_earned_insufficient_quests(self):
        # User has 600 XP but only 4 quests
        badge = Badge(
            pillar='stem',
            min_xp_required=500,
            min_quests_required=5
        )
        
        assert check_badge_earned(user_id='test', badge_id=badge.id) == False

class TestSimplifiedXP:
    """Test XP system without bonuses"""
    
    def test_xp_calculation_without_bonuses(self):
        tasks = [
            {'xp_value': 100},
            {'xp_value': 150},
            {'xp_value': 50}
        ]
        
        total_xp = calculate_quest_xp(tasks)
        assert total_xp == 300  # No bonuses

class TestObserverRole:
    """Test observer role permissions"""
    
    def test_observer_can_view_portfolio(self):
        # Test observer accessing student portfolio
        pass
    
    def test_observer_cannot_upload_evidence(self):
        # Test observer blocked from uploading
        pass
    
    def test_observer_cannot_message_student(self):
        # Test observer blocked from messaging
        pass

class TestLMSIntegration:
    """Test LMS integration features"""
    
    def test_lti_launch_validation(self):
        # Test LTI 1.3 launch token validation
        pass
    
    def test_roster_sync(self):
        # Test OneRoster CSV parsing
        pass
    
    def test_grade_passback(self):
        # Test sending grades to LMS
        pass
```

**Tasks:**
- [ ] Create test file
- [ ] Write tests for simplified badges
- [ ] Write tests for simplified XP
- [ ] Write tests for observer role
- [ ] Write tests for LMS integration
- [ ] Run all tests: `pytest backend/tests/`
- [ ] Fix any failing tests

---

## Task 5.2: Frontend Component Testing

**File:** `frontend/src/__tests__/BadgeCard.test.jsx` (NEW)

```jsx
// frontend/src/__tests__/BadgeCard.test.jsx

import { render, screen } from '@testing-library/react';
import BadgeCard from '../components/badges/BadgeCard';

describe('BadgeCard', () => {
  test('shows earned state when badge is earned', () => {
    const badge = {
      id: '1',
      title: 'Python Master',
      earned: true,
      min_xp_required: 500,
      min_quests_required: 5
    };
    
    render(<BadgeCard badge={badge} />);
    expect(screen.getByText('✓ Earned')).toBeInTheDocument();
  });
  
  test('shows progress when badge is not earned', () => {
    const badge = {
      id: '1',
      title: 'Python Master',
      earned: false,
      current_xp: 300,
      min_xp_required: 500,
      completed_quests: 3,
      min_quests_required: 5
    };
    
    render(<BadgeCard badge={badge} />);
    expect(screen.getByText(/300\/500/)).toBeInTheDocument();
    expect(screen.getByText(/3\/5/)).toBeInTheDocument();
  });
  
  test('does not show level progression', () => {
    const badge = {
      id: '1',
      title: 'Python Master',
      earned: false
    };
    
    render(<BadgeCard badge={badge} />);
    expect(screen.queryByText(/Explorer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Builder/i)).not.toBeInTheDocument();
  });
});
```

**Tasks:**
- [ ] Create test files for key components
- [ ] Test BadgeCard
- [ ] Test QuestCard
- [ ] Test ProfileStats
- [ ] Test ConnectionsPage
- [ ] Run tests: `npm test`
- [ ] Fix failing tests

---

## Task 5.3: Integration Testing

**Checklist:** Test these user flows end-to-end

- [ ] User signup and login
- [ ] Browse and start quests
- [ ] Complete quest tasks and earn XP
- [ ] Badge earning (meet both XP and quest requirements)
- [ ] View portfolio page
- [ ] Parent dashboard viewing student progress
- [ ] Observer viewing student portfolio
- [ ] Connections - Add friend, view activity feed
- [ ] AI tutor conversation
- [ ] Calendar scheduling
- [ ] Evidence upload
- [ ] Admin dashboard - User management
- [ ] Admin dashboard - Quest management
- [ ] Admin dashboard - Badge pathway creation

**Tasks:**
- [ ] Create integration test checklist
- [ ] Test each user flow manually
- [ ] Document any issues
- [ ] Fix issues
- [ ] Re-test

---

## Task 5.4: Database Integrity Validation

**File:** `scripts/validate_database_integrity.sql`

```sql
-- scripts/validate_database_integrity.sql

-- 1. Check for orphaned user_quests
SELECT 'Orphaned user_quests' as issue,
  COUNT(*) as count
FROM user_quests uq
WHERE NOT EXISTS (
  SELECT 1 FROM quests q WHERE q.id = uq.quest_id
);
-- Should be 0

-- 2. Check for orphaned badge progress
SELECT 'Orphaned user_badges' as issue,
  COUNT(*) as count
FROM user_badges ub
WHERE NOT EXISTS (
  SELECT 1 FROM badges b WHERE b.id = ub.badge_id
);
-- Should be 0

-- 3. Check for invalid quest sources
SELECT 'Invalid quest sources' as issue,
  COUNT(*) as count
FROM quests
WHERE source NOT IN ('optio', 'lms');
-- Should be 0

-- 4. Check for invalid user roles
SELECT 'Invalid user roles' as issue,
  COUNT(*) as count
FROM users
WHERE role NOT IN ('student', 'parent', 'admin', 'advisor', 'observer');
-- Should be 0

-- 5. Check badge requirements are set
SELECT 'Badges without requirements' as issue,
  COUNT(*) as count
FROM badges
WHERE min_xp_required IS NULL
   OR min_quests_required IS NULL;
-- Should be 0

-- 6. Verify no leftover subscription data
SELECT 'Users with subscription data' as issue,
  COUNT(*) as count
FROM users
WHERE subscription_tier IS NOT NULL;
-- Should be 0 (if column deleted) or fail (if column doesn't exist)
```

**Tasks:**
- [ ] Create validation script
- [ ] Run on dev database
- [ ] Verify all checks pass
- [ ] Fix any integrity issues
- [ ] Run again on production (after deployment)

---

## Task 5.5: Performance Testing

**Test these key queries:**

```sql
-- 1. Quest list query
EXPLAIN ANALYZE
SELECT * FROM quests
WHERE source = 'optio'
ORDER BY created_at DESC
LIMIT 20;

-- 2. Badge progress query
EXPLAIN ANALYZE
SELECT 
  b.*,
  COALESCE(usk.xp_amount, 0) as current_xp,
  COUNT(uq.id) as completed_quests
FROM badges b
LEFT JOIN user_skill_xp usk ON usk.pillar = b.pillar AND usk.user_id = 'test-user-id'
LEFT JOIN user_quests uq ON uq.user_id = 'test-user-id' AND uq.completed = true
WHERE b.pillar = 'stem'
GROUP BY b.id, usk.xp_amount;

-- 3. Portfolio query
EXPLAIN ANALYZE
SELECT u.*, 
  (SELECT COUNT(*) FROM user_quests WHERE user_id = u.id AND completed = true) as completed_quests,
  (SELECT COUNT(*) FROM user_badges WHERE user_id = u.id) as earned_badges
FROM users u
WHERE u.id = 'test-user-id';
```

**Tasks:**
- [ ] Run performance tests on dev
- [ ] Check query execution times
- [ ] Add indexes if needed
- [ ] Verify < 100ms response times
- [ ] Test with larger datasets

---

# PHASE 6: DOCUMENTATION UPDATES

## Task 6.1: Update README.md

**File:** `README.md`

**Changes:**
- Remove references to subscription tiers
- Remove references to collaboration/team-ups
- Remove references to quest ratings
- Update feature list
- Add LMS integration section

**Tasks:**
- [ ] Open `README.md`
- [ ] Update feature list
- [ ] Add LMS integration features
- [ ] Remove deleted features
- [ ] Update screenshots (or mark as TODO)
- [ ] Test all links work

---

## Task 6.2: Update Technical Documentation

**File:** `docs/CLAUDE.md`

**Changes:**
- Remove tier-based instructions
- Remove collaboration endpoints
- Add LMS integration endpoints
- Update database schema documentation

**Tasks:**
- [ ] Open `docs/CLAUDE.md`
- [ ] Remove deleted feature documentation
- [ ] Add LMS integration section
- [ ] Update database schema
- [ ] Update API endpoint list
- [ ] Add observer role documentation

---

## Task 6.3: Update API Documentation

**File:** `docs/API_DOCS.md` (NEW or UPDATE)

**Create comprehensive API documentation:**

```markdown
# Optio API Documentation

## Authentication

All endpoints require JWT token in httpOnly cookie except public portfolio.

## Quest Endpoints

### GET /api/quests
List all quests

**Query Parameters:**
- `source` (optional): 'optio' or 'lms'
- `pillar` (optional): Filter by skill pillar
- `limit` (optional): Number of results (default: 20)

**Response:**
```json
{
  "quests": [
    {
      "id": "uuid",
      "title": "Learn Python",
      "source": "optio",
      "tasks": [...],
      "xp_value": 300
    }
  ]
}
```

[Continue with all endpoints...]

## Badge Endpoints

### GET /api/badges/:id
Get badge details with recommended pathway

**Response:**
```json
{
  "id": "uuid",
  "title": "Python Master",
  "min_xp_required": 500,
  "min_quests_required": 5,
  "recommended_pathway": [
    {
      "quest": {...},
      "sequence_order": 1,
      "difficulty_level": "beginner"
    }
  ]
}
```

[etc...]
```

**Tasks:**
- [ ] Create or update `docs/API_DOCS.md`
- [ ] Document all endpoints
- [ ] Include request/response examples
- [ ] Add error response examples
- [ ] Document authentication requirements

---

## Task 6.4: Create Migration Guide

**File:** `docs/MIGRATION_GUIDE.md` (NEW)

```markdown
# Migration Guide: Optio Platform Refactor

This guide explains changes for existing users after the platform refactoring.

## What Changed

### Removed Features

1. **Subscription Tiers** - All features now available to all users
2. **Quest Collaborations** - Team-ups removed, 1:1 connections remain
3. **Quest Ratings** - Rating system removed
4. **5-Level Badge Progression** - Badges now have single earning requirement
5. **Achievement Levels & Momentum Ranks** - Simplified to XP milestones

### New Features

1. **LMS Integration** - Login through Canvas, Google Classroom, etc.
2. **Badge Quest Pathways** - Recommended learning sequences for each badge
3. **Observer Role** - Family members can follow your learning journey
4. **Simplified Badge Earning** - Clear XP + quest count requirements

## Impact on Your Account

### Your Progress is Safe

All your completed quests, earned badges, and XP remain intact.

### Badges

- If you were progressing through badge levels, you now have the XP toward the complete badge
- New requirement: Both XP AND quest count needed to earn badge
- See recommended pathway to guide your learning

### Connections

- Your connections remain
- Team-up invitations were removed
- Activity feed still shows what your connections are learning

### Subscriptions

- If you had a paid subscription, you've been refunded
- All features are now free for all users

## FAQ

**Q: What happened to my in-progress team-up quests?**
A: They remain as solo quests. You can still complete them on your own.

**Q: How do I earn badges now?**
A: Each badge shows its XP requirement and quest count requirement. Complete enough quests in that pillar to meet both requirements.

**Q: Can I still access my portfolio?**
A: Yes! Your portfolio is unchanged and contains all your evidence.

**Q: What about LMS integration?**
A: If your school uses Canvas, Google Classroom, etc., you can now login directly from your LMS.

## Support

Questions? Email support@optioeducation.com
```

**Tasks:**
- [ ] Create `docs/MIGRATION_GUIDE.md`
- [ ] Explain all changes clearly
- [ ] Address user concerns
- [ ] Add FAQ section
- [ ] Review for clarity

---

## Task 6.5: Update Environment Variables Documentation

**File:** `docs/ENVIRONMENT_VARIABLES.md` (NEW)

```markdown
# Environment Variables

## Required Variables

### Database
```
DATABASE_URL=postgresql://user:password@host:port/dbname
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

### Authentication
```
FLASK_SECRET_KEY=your-64-character-secret-key
JWT_SECRET=your-jwt-secret
```

### AI Services
```
GEMINI_API_KEY=your-gemini-api-key
```

### Email (SendGrid)
```
SMTP_HOST=smtp.sendgrid.net
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
FROM_EMAIL=noreply@optioeducation.com
```

### Image Services
```
PEXELS_API_KEY=your-pexels-api-key
```

## LMS Integration Variables

### Canvas LMS
```
CANVAS_CLIENT_ID=your-canvas-client-id
CANVAS_CLIENT_SECRET=your-canvas-client-secret
```

### Google Classroom
```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### SAML (Enterprise)
```
SAML_IDP_URL=https://your-idp.com/saml
SAML_CERT_PATH=/path/to/cert.pem
```

## Feature Flags
```
ENABLE_LMS_SYNC=true
ENABLE_GRADE_PASSBACK=false
```

## Removed Variables

These are NO LONGER NEEDED:
- ~~STRIPE_SECRET_KEY~~
- ~~STRIPE_WEBHOOK_SECRET~~
- ~~STRIPE_PUBLISHABLE_KEY~~
```

**Tasks:**
- [ ] Create `docs/ENVIRONMENT_VARIABLES.md`
- [ ] List all required variables
- [ ] Add descriptions for each
- [ ] Mark removed variables
- [ ] Update `.env.example`

---

## Task 6.6: Create Deployment Checklist

**File:** `docs/DEPLOYMENT_CHECKLIST.md` (NEW)

```markdown
# Deployment Checklist

## Pre-Deployment

- [ ] All tests passing in dev environment
- [ ] Database backup completed
- [ ] Rollback scripts prepared and tested
- [ ] Team notified of deployment window
- [ ] Monitoring alerts configured

## Deployment Steps

### 1. Database Migration
- [ ] Run backup script
- [ ] Execute migration scripts in order
- [ ] Validate migration with validation script
- [ ] Verify all checks pass

### 2. Backend Deployment
- [ ] Update environment variables on Render
- [ ] Remove Stripe variables
- [ ] Add LMS integration variables
- [ ] Deploy backend to production
- [ ] Verify backend health check passes

### 3. Frontend Deployment
- [ ] Build production bundle
- [ ] Deploy frontend to production
- [ ] Verify frontend loads correctly
- [ ] Test critical user flows

### 4. Smoke Testing
- [ ] Test user login
- [ ] Test quest browsing
- [ ] Test quest completion
- [ ] Test badge progress
- [ ] Test portfolio page
- [ ] Test parent dashboard
- [ ] Test admin dashboard

### 5. Monitor
- [ ] Watch error logs for 1 hour
- [ ] Check database performance
- [ ] Monitor API response times
- [ ] Verify no user-reported issues

## Post-Deployment

- [ ] Send announcement to users
- [ ] Update status page
- [ ] Document any issues encountered
- [ ] Schedule post-mortem meeting

## Rollback Procedure

If issues occur:
1. Immediately notify team
2. Run rollback scripts
3. Restore database from backup
4. Redeploy previous version
5. Document what went wrong
```

**Tasks:**
- [ ] Create `docs/DEPLOYMENT_CHECKLIST.md`
- [ ] Review checklist with team
- [ ] Print physical checklist for deployment day
- [ ] Assign responsibilities for each step

---

# FINAL VALIDATION

## Task 7.1: Complete Feature Audit

**Checklist:** Verify each deleted feature is completely removed

**Collaboration/Team-ups:**
- [ ] Database: `quest_collaborations` table deleted
- [ ] Backend: `collaboration_service.py` deleted
- [ ] Backend: Collaboration routes deleted
- [ ] Frontend: Collaboration components deleted
- [ ] Frontend: Invitations tab removed
- [ ] No references to "collaborate" or "team-up" in codebase

**Quest Ratings:**
- [ ] Database: `quest_ratings` table deleted
- [ ] Backend: Rating service deleted
- [ ] Backend: Rating routes deleted
- [ ] Frontend: Rating components deleted
- [ ] No star ratings on quest pages

**Subscription Tiers:**
- [ ] Database: `subscription_tiers` table deleted
- [ ] Database: `promo_codes` table deleted
- [ ] Database: Users table subscription columns deleted
- [ ] Backend: Stripe service deleted
- [ ] Backend: Subscription routes deleted
- [ ] Backend: Tier decorators removed
- [ ] Frontend: Pricing page deleted
- [ ] Frontend: Upgrade prompts removed
- [ ] Frontend: No tier-gated features
- [ ] Environment: Stripe variables removed

**Achievement Levels/Momentum:**
- [ ] Database: Achievement/momentum columns deleted
- [ ] Backend: Achievement level logic removed
- [ ] Backend: Momentum rank logic removed
- [ ] Frontend: Achievement titles removed
- [ ] Frontend: Momentum badges removed

**5-Level Badge Progression:**
- [ ] Database: Badge level columns deleted
- [ ] Backend: Level progression logic removed
- [ ] Frontend: Level indicators removed
- [ ] Frontend: Shows single earned/not-earned state

---

## Task 7.2: Verify New Features Work

**Badge Quest Pathways:**
- [ ] Database: `badge_quest_pathways` table exists
- [ ] Backend: Pathway service implemented
- [ ] Backend: Pathways included in badge API
- [ ] Frontend: Pathways display on badge detail page
- [ ] Admin: Can create/edit pathways

**LMS Integration:**
- [ ] Database: LMS integration tables exist
- [ ] Backend: LTI service implemented
- [ ] Backend: SSO service implemented
- [ ] Backend: LMS routes implemented
- [ ] Frontend: LMS login buttons work
- [ ] Frontend: LMS callback page works
- [ ] Admin: LMS integration panel works

**Observer Role:**
- [ ] Database: Observer role in users table
- [ ] Backend: Observer decorators work
- [ ] Backend: Observer routes implemented
- [ ] Frontend: Observer dashboard works
- [ ] Observer can view portfolios
- [ ] Observer cannot upload evidence
- [ ] Observer cannot message students

**Simplified Badges:**
- [ ] Badges show XP requirement
- [ ] Badges show quest count requirement
- [ ] Both requirements must be met
- [ ] Progress bars show both metrics

---

## Task 7.3: User Acceptance Testing

**Recruit 5-10 beta testers:**
- [ ] 2-3 students
- [ ] 1-2 parents
- [ ] 1 admin
- [ ] 1 observer

**Test scenarios:**
- [ ] Student: Browse quests, complete tasks, earn badge
- [ ] Student: View own portfolio, check XP progress
- [ ] Student: Connect with friend, view activity feed
- [ ] Parent: View child's dashboard and calendar
- [ ] Admin: Manage users, create badge pathway
- [ ] Observer: View student portfolio (read-only)

**Gather feedback:**
- [ ] Survey after testing
- [ ] Document issues found
- [ ] Prioritize fixes
- [ ] Implement critical fixes

---

## Task 7.4: Production Deployment

**Deployment Day Checklist:**

- [ ] All dev testing complete
- [ ] All staging testing complete
- [ ] User acceptance testing complete
- [ ] Database backup verified
- [ ] Team on standby
- [ ] Rollback plan ready

**Execute deployment:**
- [ ] 9:00 AM - Start database migration
- [ ] 9:30 AM - Deploy backend
- [ ] 10:00 AM - Deploy frontend
- [ ] 10:30 AM - Smoke testing
- [ ] 11:00 AM - Monitor for 1 hour
- [ ] 12:00 PM - Send user announcement
- [ ] 1:00 PM - Continue monitoring

**Success criteria:**
- [ ] Zero critical errors
- [ ] All smoke tests pass
- [ ] API response time < 200ms
- [ ] Database query time < 100ms
- [ ] No user-reported blocking issues

---

# SUMMARY CHECKLIST

## Phase Completion Status

- [ ] **Phase 0:** Safety Prep & Backups
- [ ] **Phase 1:** Database Migration
- [ ] **Phase 2:** Backend Refactoring
- [ ] **Phase 3:** Frontend Refactoring
- [ ] **Phase 4:** LMS Integration Foundation
- [ ] **Phase 5:** Testing & Validation
- [ ] **Phase 6:** Documentation Updates
- [ ] **Phase 7:** Production Deployment

## Hours Estimate by Phase

| Phase | Hours | Status |
|-------|-------|--------|
| Phase 0 | 4 hours | |
| Phase 1 | 16 hours | |
| Phase 2 | 60 hours | |
| Phase 3 | 50 hours | |
| Phase 4 | 40 hours | |
| Phase 5 | 40 hours | |
| Phase 6 | 20 hours | |
| Phase 7 | 10 hours | |
| **TOTAL** | **240 hours** | |

---

**Notes:**
- Start with Phase 0 and work sequentially
- Do not skip safety steps
- Test thoroughly in dev before production
- Keep team informed throughout process
- Document any deviations from plan

**Version:** 1.0  
**Last Updated:** October 20, 2025  
**Status:** Ready for Implementation