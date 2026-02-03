# Database Migration Execution Guide

## Overview
This directory contains SQL migration scripts for the Optio platform refactoring.

## Migration Order

**IMPORTANT: Execute in this exact order**

1. `001_create_backup_schema.sql` - Create backups before ANY changes
2. `002_soft_delete_tables.sql` - Rename tables (safety net)
3. Wait 3-5 days for testing
4. `003_hard_delete_tables.sql` - Permanently delete tables
5. `004_cleanup_users_table.sql` - Remove subscription columns
6. `005_update_users_roles.sql` - Add observer role
7. `006_simplify_quest_sources.sql` - Simplify quest sources

## Execution via Supabase MCP

```bash
# Step 1: Create backups
mcp__supabase__apply_migration(
  project_id="your-project-id",
  name="001_create_backup_schema",
  query=<contents of 001_create_backup_schema.sql>
)

# Step 2: Soft delete tables
mcp__supabase__apply_migration(
  project_id="your-project-id",
  name="002_soft_delete_tables",
  query=<contents of 002_soft_delete_tables.sql>
)

# Step 3: TEST APPLICATION FOR 3-5 DAYS

# Step 4: Hard delete (only if no issues)
mcp__supabase__apply_migration(
  project_id="your-project-id",
  name="003_hard_delete_tables",
  query=<contents of 003_hard_delete_tables.sql>
)

# Continue with remaining migrations...
```

## Safety Checklist

Before running migrations:
- [ ] Full database backup completed
- [ ] Backup schema creation verified
- [ ] Team notified of maintenance window
- [ ] Rollback script tested on dev database
- [ ] Monitoring alerts configured

## Rollback Procedure

If migrations cause issues:
1. Stop immediately
2. Run `ROLLBACK.sql`
3. Verify tables restored
4. Investigate issue before retrying

## Verification After Each Step

Run these queries after each migration:

```sql
-- Check backup schema exists
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'backup_schema';

-- Verify deprecated tables (after step 2)
SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%_deprecated';

-- Verify tables deleted (after step 3)
SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE '%_deprecated';
-- Should return 0

-- Verify user columns removed (after step 4)
SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name LIKE '%subscription%';
-- Should return 0

-- Verify observer role added (after step 5)
SELECT constraint_name, check_clause FROM information_schema.check_constraints WHERE constraint_name = 'users_role_check';
```

## Notes

- All migrations use `IF EXISTS` / `IF NOT EXISTS` for safety
- Migrations are idempotent (can be run multiple times safely)
- Backup schema remains until manually deleted
- Development database (optio-dev) should be tested first
- Production deployment only after dev testing complete

## Contact

Questions? Contact development team before proceeding.
