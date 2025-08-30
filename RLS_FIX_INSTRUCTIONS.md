# URGENT: Fix Database Access Issue

## The Problem
Your Supabase tables have RLS (Row Level Security) enabled but no policies were created. This means **NO data can be accessed** through the API, breaking your entire application.

## Immediate Fix (Do This First!)

1. Go to your Supabase Dashboard
2. Click on "SQL Editor" in the left sidebar
3. Copy and paste the contents of `supabase/migrations/20250830_quick_rls_fix.sql`
4. Click "Run" to execute the SQL

This will immediately restore access to your database by creating basic security policies.

## What This Fixes

The quick fix creates essential policies for:
- **Users table**: Allows users to see all users, update their own profile
- **Quests table**: Allows everyone to view quests
- **User_quests**: Allows users to manage their own quest progress
- **Quest_tasks**: Allows everyone to view tasks
- **Quest_task_completions**: Allows users to manage their own completions
- **Learning_logs**: Allows users to manage their own logs
- **Diplomas**: Allows public diploma viewing and users to manage their own
- **User_skill_xp**: Allows XP viewing and users to manage their own

## Complete Fix (Do This After)

After your app is working again, run the comprehensive migration:
1. In SQL Editor, run `supabase/migrations/20250830_check_and_fix_rls_policies.sql`
2. This creates more granular policies for better security

## Why This Happened

When RLS is enabled on a table without any policies, Supabase blocks ALL access as a security measure. This prevents accidental data exposure but can break your app if policies aren't set up.

## Prevention

Always create RLS policies immediately after enabling RLS on a table. The pattern is:
```sql
-- Enable RLS
ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;

-- Create at least one policy
CREATE POLICY "basic_read" ON your_table FOR SELECT USING (true);
```