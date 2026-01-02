# Badge Tables Drop Migration

## Status: READY TO EXECUTE

## Context
Part of Phase 1: Badge Feature Removal
- Frontend code: ✅ Cleaned up
- Backend code: ✅ Cleaned up
- Database: ⏳ Pending manual execution

## Migration File
`drop_badge_tables.sql`

## Tables to Drop
1. `user_badges` - User-to-badge assignments
2. `badge_quests` - Badge-to-quest relationships
3. `badge_requirements` - Badge earning requirements
4. `badges` - Badge definitions

## Execution Instructions

### Option 1: Supabase Dashboard
1. Log into Supabase: https://supabase.com/dashboard
2. Navigate to project: vvfgxcykxjybtvpfzwyx
3. Go to SQL Editor
4. Copy contents of `drop_badge_tables.sql`
5. Execute the SQL
6. Verify with the verification query in the file

### Option 2: Command Line (if you have direct DB access)
```bash
psql $DATABASE_URL -f migrations/drop_badge_tables.sql
```

## Verification
After execution, run:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('user_badges', 'badge_quests', 'badge_requirements', 'badges');
```

Expected result: 0 rows (all tables dropped)

## Rollback
Not applicable - this is a destructive operation. Badge data will be permanently deleted.
Ensure you have backups if needed before executing.
