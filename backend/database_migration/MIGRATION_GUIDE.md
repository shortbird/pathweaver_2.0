# Database Migration Guide: Supabase to Render PostgreSQL

## Overview
This guide walks you through migrating your Optio platform database from Supabase to a self-hosted PostgreSQL instance on Render, including data cleanup and schema optimization.

## Benefits of Migration
- **Full control** over your database
- **Cost optimization** - Render's PostgreSQL can be more cost-effective
- **Better performance** - Direct connections without API overhead
- **Schema flexibility** - Customize without Supabase constraints
- **Simplified auth** - No dependency on Supabase Auth

## Migration Steps

### Step 1: Export Data from Supabase

1. **Using Supabase Dashboard:**
   - Go to your Supabase project
   - Navigate to Settings > Database
   - Click "Export Data" and download the SQL dump

2. **Using pg_dump (recommended):**
   ```bash
   # Get your Supabase connection string from dashboard
   pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
     --data-only \
     --column-inserts \
     --no-owner \
     --no-privileges \
     > supabase_backup.sql
   ```

3. **Export to CSV (alternative):**
   Run the queries in `01_export_from_supabase.sql` in Supabase SQL Editor

### Step 2: Create Render PostgreSQL Database

1. **Create new PostgreSQL instance on Render:**
   - Log into Render Dashboard
   - Click "New +" → "PostgreSQL"
   - Choose your plan (Starter is fine for development)
   - Name it (e.g., "optio-db")
   - Click "Create Database"

2. **Get connection details:**
   - Internal Database URL (for your backend)
   - External Database URL (for migrations)
   - Note down both URLs

### Step 3: Create Schema on Render

1. **Connect to Render database:**
   ```bash
   psql "your-external-database-url"
   ```

2. **Run schema creation:**
   ```bash
   psql "your-external-database-url" < 02_render_schema.sql
   ```

### Step 4: Migrate Data

1. **Set environment variables:**
   ```bash
   export SUPABASE_DATABASE_URL="your-supabase-url"
   export RENDER_DATABASE_URL="your-render-external-url"
   ```

2. **Run migration script:**
   ```bash
   cd backend/database_migration
   pip install psycopg2-binary
   python 03_data_migration.py
   ```

3. **Verify migration:**
   ```bash
   psql "your-render-url" -c "SELECT COUNT(*) FROM users;"
   psql "your-render-url" -c "SELECT COUNT(*) FROM quests;"
   ```

### Step 5: Update Backend Configuration

1. **Update environment variables on Render:**
   - Go to your backend service on Render
   - Add environment variable: `DATABASE_URL` with Internal Database URL
   - Remove Supabase-related variables

2. **Update config.py:**
   ```bash
   cp database_migration/04_render_config.py backend/config.py
   ```

3. **Update database connections:**
   ```bash
   cp database_migration/05_db_connection.py backend/services/db_connection.py
   ```

4. **Update imports in route files:**
   ```python
   # Old (Supabase)
   from services.supabase_client import supabase
   
   # New (Render PostgreSQL)
   from services.db_connection import get_client
   client = get_client()
   ```

### Step 6: Deploy and Test

1. **Deploy backend:**
   ```bash
   git add .
   git commit -m "Migrate database from Supabase to Render PostgreSQL"
   git push origin main
   ```

2. **Test critical endpoints:**
   - User authentication
   - Quest listing
   - Task completions
   - XP calculations

3. **Run integration tests:**
   ```bash
   python -m pytest tests/
   ```

## Data Cleanup Performed

### Schema Improvements:
- **Normalized enums** - Consistent use of PostgreSQL enums
- **Removed legacy fields** - Cleaned up V1/V2 quest system remnants
- **Added indexes** - Improved query performance
- **Better constraints** - Data integrity enforcement

### Data Improvements:
- **XP recalculation** - Ensured accurate XP totals
- **Progress tracking** - Calculated quest progress percentages
- **Role normalization** - Standardized user roles
- **Subscription tiers** - Fixed enum inconsistencies

## Rollback Plan

If issues arise, you can rollback:

1. **Keep Supabase running** during initial migration
2. **Point backend to Supabase** by updating DATABASE_URL
3. **Re-sync if needed** using the migration script in reverse

## Post-Migration Tasks

1. **Monitor performance:**
   - Check query execution times
   - Monitor connection pool usage
   - Watch for slow queries

2. **Set up backups:**
   ```bash
   # Daily backups on Render
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
   ```

3. **Update documentation:**
   - Update CLAUDE.md with new database details
   - Update README with Render setup

## Common Issues & Solutions

### Issue: Connection refused
**Solution:** Check if you're using Internal URL from within Render, External URL from outside

### Issue: Permission denied
**Solution:** Ensure user has proper grants:
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
```

### Issue: Enum type already exists
**Solution:** Drop and recreate:
```sql
DROP TYPE IF EXISTS user_role CASCADE;
CREATE TYPE user_role AS ENUM (...);
```

### Issue: Foreign key violations
**Solution:** Migrate in order: users → quests → tasks → completions

## Performance Optimization

After migration, run these optimizations:

```sql
-- Analyze tables for query planner
ANALYZE;

-- Vacuum to reclaim space
VACUUM ANALYZE;

-- Create additional indexes if needed
CREATE INDEX CONCURRENTLY idx_completions_date 
ON quest_task_completions(completed_at DESC);
```

## Support

For issues or questions:
- Check Render logs: `render logs`
- Database metrics: Render Dashboard → Database → Metrics
- PostgreSQL logs: Available in Render Dashboard