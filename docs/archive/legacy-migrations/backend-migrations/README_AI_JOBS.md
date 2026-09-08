# AI Jobs Tables Migration

## Quick Setup Instructions

The AI Content Pipeline requires two new database tables that don't exist yet.

### Option 1: Run SQL in Supabase Dashboard (RECOMMENDED)

1. **Go to Supabase SQL Editor:**
   - Visit: https://supabase.com/dashboard
   - Select your project
   - Navigate to **SQL Editor** (left sidebar)

2. **Copy and Run the SQL:**
   - Copy the entire contents of `add_ai_jobs_tables.sql`
   - Paste into the SQL Editor
   - Click **"Run"** or press Ctrl+Enter

3. **Verify Tables Created:**
   - Navigate to **Table Editor** (left sidebar)
   - You should see two new tables:
     - `scheduled_jobs`
     - `quality_action_logs`

### Option 2: Use Python Script

```bash
cd backend
python scripts/run_ai_jobs_migration.py
```

This will print the SQL you need to copy-paste into Supabase SQL Editor.

## Tables Created

### `scheduled_jobs`
Stores background jobs for AI content generation and quality monitoring.

**Columns:**
- `id` - UUID primary key
- `job_type` - Type of job (content_generation, quality_monitor, etc.)
- `job_data` - JSONB job configuration
- `status` - pending, running, completed, failed
- `priority` - 1 (low) to 10 (high)
- `scheduled_for` - When to run the job
- `started_at`, `completed_at` - Execution timestamps
- `result_data` - JSONB job results
- `error_message` - Error details if failed

### `quality_action_logs`
Logs automated and manual quality actions on content.

**Columns:**
- `id` - UUID primary key
- `content_type` - quest, badge, task
- `content_id` - UUID of content
- `action_type` - archive, deactivate, approve, reject, flag
- `reason` - Why the action was taken
- `automated` - Boolean (true if automated)
- `performed_by` - UUID of admin who performed it
- `created_at` - When action was taken

## Quest Table Updates

The migration also adds these columns to the `quests` table:
- `archived_at` - When quest was archived
- `archive_reason` - Why it was archived
- `deactivated_at` - When quest was deactivated
- `deactivation_reason` - Why it was deactivated
- `requires_review` - Whether quest needs admin review
- `created_by` - UUID of user who created the quest

## Security

Both tables have Row Level Security (RLS) enabled with admin-only access policies.

## After Migration

Once tables are created, the AI Pipeline admin page will work:
- ✅ Job History
- ✅ Quality Report
- ✅ Trigger Quality Audit
- ✅ Setup Recurring Jobs
- ✅ All other AI pipeline features
