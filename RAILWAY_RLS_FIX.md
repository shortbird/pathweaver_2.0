# Railway Deployment - RLS Recursion Fix

## Current Issue
There's an infinite recursion in the Supabase RLS (Row Level Security) policies for the `users` table. This causes all queries to fail with error: `infinite recursion detected in policy for relation "users"`.

## Temporary Workaround (Immediate Fix)

### Step 1: Set Environment Variable in Railway
Add this environment variable to your Railway deployment:
```
TEMP_USE_SERVICE_ROLE=true
```

This will make the backend use the service role key temporarily, which bypasses RLS. The application will work normally but with reduced security isolation.

### Step 2: Ensure Service Key is Set
Make sure you have these environment variables in Railway:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Your Supabase service role key (not the anon key)
- `FLASK_SECRET_KEY` - A secure random string

## Permanent Fix (Apply ASAP)

### Step 1: Go to Supabase Dashboard
1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**

### Step 2: Run the Migration
Copy and paste the ENTIRE contents of this file:
```
supabase/migrations/20250830_fix_users_table_recursion.sql
```

### Step 3: Execute the Migration
1. Click **Run** to execute the SQL
2. You should see success messages indicating the policies were fixed

### Step 4: Verify the Fix
Run this test query in SQL Editor:
```sql
SELECT * FROM public.test_users_table_access();
```

All tests should show "PASS".

### Step 5: Remove Temporary Workaround
Once the migration is applied successfully:
1. Go to Railway dashboard
2. Remove the `TEMP_USE_SERVICE_ROLE` environment variable
3. Redeploy the application

## What the Fix Does

The issue was that the `users` table RLS policy was checking if a user is an admin by querying the same `users` table, creating infinite recursion.

The fix:
1. Simplifies the users table policy to only allow users to see their own records
2. Uses JWT claims to check for admin role instead of querying the database
3. Creates a SECURITY DEFINER function for safe admin checks
4. Updates related policies to avoid the recursion

## Testing After Fix

To verify everything works:
1. Try logging in as a regular user
2. Create a quest
3. View the quest hub
4. Check the diploma page

All features should work normally with proper security isolation restored.

## Security Notes

- The temporary workaround (`TEMP_USE_SERVICE_ROLE=true`) reduces security isolation
- Apply the permanent fix as soon as possible
- After applying the fix, the backend will properly enforce RLS policies again
- User data isolation will be restored