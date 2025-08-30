# Railway Deployment Strategy - Complete Restructure

## Current Situation
- RLS infinite recursion blocking all database queries
- Complex CORS setup causing confusion
- Multiple workarounds making debugging difficult

## Step-by-Step Fix Process

### Step 1: Apply RLS Fix in Supabase (DO THIS FIRST)
1. Go to Supabase Dashboard → SQL Editor
2. Copy the entire contents of `supabase/migrations/20250830_fix_users_table_recursion.sql`
3. Paste and run it
4. Verify with: `SELECT * FROM public.test_users_table_access();`

### Step 2: Set Railway Environment Variables
Ensure these are set in Railway dashboard:
```
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_KEY=<your-supabase-service-role-key>
FRONTEND_URL=https://optioeducation.com
FLASK_ENV=production
```

### Step 3: Test with Clean App
1. Temporarily use `app_clean.py` to test the connection:
   ```python
   # In Procfile, temporarily change to:
   web: gunicorn app_clean:app --bind 0.0.0.0:$PORT
   ```

2. Deploy and test these endpoints:
   - `https://pathweaver20-production.up.railway.app/` - Basic check
   - `https://pathweaver20-production.up.railway.app/api/health` - Health check
   - `https://pathweaver20-production.up.railway.app/api/test-connection` - Detailed test

### Step 4: Verify from Command Line (No CORS)
```bash
# Test from your local machine
curl https://pathweaver20-production.up.railway.app/api/health

# Test from Railway console if available
curl http://localhost:$PORT/api/health
```

### Step 5: Fix Main App
Once clean app works:
1. Simplify `app.py` CORS configuration
2. Remove duplicate handlers
3. Use single source of truth for allowed origins
4. Remove all temporary workarounds

### Step 6: Clean Up
1. Remove `TEMP_USE_SERVICE_ROLE` environment variable
2. Remove workaround code from `database.py`
3. Use proper RLS-aware clients

## Testing Checklist

### Backend Tests (No Frontend)
- [ ] Root endpoint returns JSON
- [ ] Health check shows database connected
- [ ] Test-connection shows all tests passing
- [ ] No "infinite recursion" errors

### Frontend Integration Tests
- [ ] Can load homepage
- [ ] Can reach login page
- [ ] Can successfully login
- [ ] Can view quests
- [ ] Can view diploma

## Debugging Commands

### Check Railway Logs
```bash
railway logs
```

### Test Endpoints with curl
```bash
# Basic test
curl -X GET https://pathweaver20-production.up.railway.app/api/health

# Test with Origin header
curl -X GET https://pathweaver20-production.up.railway.app/api/health \
  -H "Origin: https://www.optioeducation.com"

# Test OPTIONS preflight
curl -X OPTIONS https://pathweaver20-production.up.railway.app/api/auth/login \
  -H "Origin: https://www.optioeducation.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type"
```

## Common Issues and Solutions

### Issue: "infinite recursion detected in policy for relation users"
**Solution**: Apply the RLS migration immediately

### Issue: CORS errors from frontend
**Solution**: Use the clean app configuration with Flask-CORS

### Issue: Can't connect to Supabase at all
**Solution**: Verify environment variables are set correctly in Railway

### Issue: Service works locally but not on Railway
**Solution**: Check for hardcoded localhost URLs, ensure PORT is used from environment

## Success Criteria
1. Backend responds to health checks without errors
2. Database queries work without infinite recursion
3. Frontend can make API calls without CORS errors
4. Users can login and use the application normally

## Next Steps After Fix
1. Monitor application logs for any remaining issues
2. Consider implementing proper logging service
3. Add monitoring/alerting for critical endpoints
4. Document the final working configuration