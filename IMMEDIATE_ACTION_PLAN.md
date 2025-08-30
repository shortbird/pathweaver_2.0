# IMMEDIATE ACTION PLAN - Fix Railway Deployment

## THE REAL PROBLEM
The root cause is **RLS infinite recursion** in Supabase. Everything else (CORS, etc.) is a symptom.

## STEP 1: FIX THE DATABASE (DO THIS NOW!)

### Go to Supabase Dashboard → SQL Editor
Run this ENTIRE migration:

```sql
-- Fix infinite recursion in users table RLS policy
DROP POLICY IF EXISTS "users_own_read" ON public.users;

CREATE POLICY "users_own_read" ON public.users
    FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "users_admin_read" ON public.users
    FOR SELECT
    USING (
        (auth.jwt() ->> 'role')::text = 'admin'
        OR 
        (auth.jwt() ->> 'role')::text = 'service_role'
    );

DROP POLICY IF EXISTS "users_own_update" ON public.users;
DROP POLICY IF EXISTS "users_own_insert" ON public.users;

CREATE POLICY "users_own_update" ON public.users
    FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "users_own_insert" ON public.users
    FOR INSERT
    WITH CHECK (id = auth.uid());

-- Test it worked
SELECT * FROM public.test_users_table_access();
```

## STEP 2: TEST WITH CLEAN APP

### Option A: Use the clean test app
1. In Railway, temporarily rename Procfile:
   ```bash
   mv Procfile Procfile.backup
   mv Procfile.test Procfile
   ```
2. Push to deploy the clean app
3. Test: `https://pathweaver20-production.up.railway.app/api/health`

### Option B: Keep using main app
1. Ensure `TEMP_USE_SERVICE_ROLE=true` is set in Railway
2. This bypasses RLS until you fix it

## STEP 3: VERIFY ENVIRONMENT VARIABLES

In Railway dashboard, ensure these are set:
```
SUPABASE_URL=<your-url>
SUPABASE_KEY=<your-anon-key>
SUPABASE_SERVICE_KEY=<your-service-key>
FRONTEND_URL=https://optioeducation.com
```

## STEP 4: TEST WITHOUT BROWSER

```bash
# From your terminal (no CORS issues):
curl https://pathweaver20-production.up.railway.app/api/health
```

If this works, the backend is fine and it's just CORS.

## EXPECTED RESULTS AFTER FIX

1. ✅ No more "infinite recursion" errors
2. ✅ Health check returns `{"status": "healthy"}`  
3. ✅ Frontend can connect without CORS errors
4. ✅ Users can login normally

## IF STILL HAVING ISSUES

The clean app (`app_clean.py`) is a minimal, working version that:
- Uses Flask-CORS properly (no duplicate handlers)
- Has clear error messages
- Tests connection explicitly
- Bypasses all complexity

Use it to verify Railway ↔️ Supabase connection works before fixing the main app.

## CRITICAL: Order Matters!

1. **FIRST**: Fix RLS in Supabase (the migration above)
2. **THEN**: Remove `TEMP_USE_SERVICE_ROLE` from Railway
3. **FINALLY**: Test the application

Without step 1, nothing else will work properly.