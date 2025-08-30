# Railway-Supabase Connection Debug Guide

## Issue
Railway backend cannot communicate with Supabase database.

## Common Causes & Solutions

### 1. Environment Variables
Railway requires specific environment variable names. In your Railway dashboard, ensure these are set:

**Required Variables:**
```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_KEY=your_anon_public_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here
FLASK_SECRET_KEY=generate_a_secure_32+_char_string
```

**Note:** Railway uses `SUPABASE_KEY` instead of `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_KEY` instead of `SUPABASE_SERVICE_ROLE_KEY`.

### 2. Finding Your Supabase Keys
1. Go to https://app.supabase.com
2. Select your project
3. Go to Settings → API
4. Copy:
   - `URL` → Set as `SUPABASE_URL` in Railway
   - `anon public` key → Set as `SUPABASE_KEY` in Railway  
   - `service_role` key → Set as `SUPABASE_SERVICE_KEY` in Railway

### 3. Test Connection
After setting variables in Railway:

1. **Restart the Railway service:**
   - Go to your Railway dashboard
   - Click on your service
   - Click "Redeploy"

2. **Check Railway logs:**
   - Look for startup diagnostics output
   - Should show "Supabase configured: True"

3. **Run the test script:**
   - Deploy the included `test_supabase_connection.py`
   - Check logs for connection status

### 4. RLS Policy Issues
If connection works but queries fail:

1. **Run the RLS fix migration:**
   - Go to Supabase SQL Editor
   - Run the contents of `supabase/migrations/20250830_fix_rls_initialization.sql`
   - This fixes common RLS blocking issues

2. **Verify with test query:**
   ```sql
   SELECT * FROM public.test_rls_access();
   ```
   All tests should show 'PASS' or 'NO_AUTH' (for unauthenticated tests).

### 5. Network/CORS Issues
The backend is configured to accept requests from Railway's domain. If you have a custom domain:

1. Add it to `ALLOWED_ORIGINS` in `backend/app.py`
2. Set `FRONTEND_URL` environment variable in Railway

### 6. Debugging Steps

**Step 1: Verify Environment**
```bash
# In Railway console or logs, check:
echo $SUPABASE_URL
echo $SUPABASE_KEY
echo $SUPABASE_SERVICE_KEY
```

**Step 2: Test Basic Connection**
```python
# Run in Railway console:
python backend/test_supabase_connection.py
```

**Step 3: Check Application Logs**
Look for these in Railway logs:
- "SUPABASE CONNECTION TEST"
- "Supabase configured: True/False"
- Any error messages mentioning Supabase

**Step 4: Verify Supabase Project Status**
1. Go to https://app.supabase.com
2. Ensure project is not paused
3. Check project has not exceeded limits

### 7. Common Error Messages

**"Missing Supabase configuration"**
- Environment variables not set correctly in Railway

**"Invalid API key"**
- Wrong key used or key copied incorrectly
- Ensure no extra spaces or newlines

**"Network Error" or timeout**
- Supabase project might be paused
- Network connectivity issue from Railway

**"Permission denied" on queries**
- RLS policies blocking access
- Run the RLS fix migration

### 8. Quick Fix Checklist

- [ ] Set SUPABASE_URL in Railway
- [ ] Set SUPABASE_KEY in Railway  
- [ ] Set SUPABASE_SERVICE_KEY in Railway
- [ ] Set FLASK_SECRET_KEY in Railway
- [ ] Redeploy Railway service
- [ ] Run RLS fix migration in Supabase
- [ ] Verify Supabase project is active
- [ ] Check Railway logs for errors

## Files Modified
1. `backend/database.py` - Fixed auth header setting for RLS
2. `backend/config.py` - Improved error messages for missing config
3. `backend/test_supabase_connection.py` - Connection test script
4. `supabase/migrations/20250830_fix_rls_initialization.sql` - RLS fixes

## Next Steps
1. Set environment variables in Railway dashboard
2. Run the RLS fix migration in Supabase SQL Editor
3. Redeploy Railway service
4. Monitor logs for connection status