# Session Persistence Across Deployments

## Overview

This document explains the session persistence improvements made to prevent users from being logged out after code deployments.

## Problem

Previously, users were being logged out after every deployment because:
1. JWT tokens were signed with `FLASK_SECRET_KEY`
2. If this key changed (or wasn't set) between deployments, all existing tokens became invalid
3. Users appeared logged in on frontend but all API calls failed → forced logout

## Solution

We implemented a comprehensive 4-phase solution:

### Phase 1: Persistent FLASK_SECRET_KEY

**Critical Fix - Must be done first!**

Two secure 64-character keys have been generated for dev and prod environments:

- **Dev Backend**: `3609553095e956d826a876f4b1d9b50915113cd604edcf71deada07573f7e36d`
- **Prod Backend**: `46e9163dbe647c89fa4b3bb172fba947f2650c7701ce75ec3c6584a6dc173e9b`

**Action Required:**
1. Go to Render dashboard for dev backend: https://dashboard.render.com/web/srv-d2tnvlvfte5s73ae8npg
2. Add environment variable: `FLASK_SECRET_KEY` = `3609553095e956d826a876f4b1d9b50915113cd604edcf71deada07573f7e36d`
3. Go to Render dashboard for prod backend: https://dashboard.render.com/web/srv-d2to00vfte5s73ae9310
4. Add environment variable: `FLASK_SECRET_KEY` = `46e9163dbe647c89fa4b3bb172fba947f2650c7701ce75ec3c6584a6dc173e9b`

**Important:** Once these are set, they will persist across ALL future deployments. Users will need to log in ONE TIME after this change, then sessions will persist forever.

### Phase 2: Token Versioning

**File:** `backend/utils/session_manager.py`

**What Changed:**
- Added support for graceful secret key rotation
- All tokens now include a `version` field
- Token verification supports both current AND previous secret keys
- Environment variables:
  - `FLASK_SECRET_KEY` - Current secret key (required)
  - `FLASK_SECRET_KEY_OLD` - Previous secret key (optional, for rotation)
  - `TOKEN_VERSION` - Token version identifier (default: 'v1')

**How to Rotate Secret Keys (Future):**

If you ever need to change the secret key:

1. Set `FLASK_SECRET_KEY_OLD` to current `FLASK_SECRET_KEY` value
2. Set new `FLASK_SECRET_KEY`
3. Optionally update `TOKEN_VERSION` (e.g., 'v2')
4. Deploy
5. Wait 7 days (refresh token expiry)
6. Remove `FLASK_SECRET_KEY_OLD`

**Benefits:**
- Zero downtime during key rotation
- Gradual token migration
- No user disruption

### Phase 3: Always Use httpOnly Cookies

**File:** `backend/utils/session_manager.py`

**What Changed:**
- Removed cross-origin cookie skip logic
- Cookies are now set for BOTH same-origin and cross-origin deployments
- Cookies use `SameSite=None; Secure=true` for cross-origin compatibility
- Dual-layer authentication: cookies + Authorization header

**Benefits:**
- More secure (httpOnly cookies can't be accessed by JavaScript)
- Tokens survive even if localStorage is cleared
- Works in both same-origin and cross-origin deployments

### Phase 4: Token Health Monitoring

**Backend File:** `backend/routes/auth.py`
**Frontend File:** `frontend/src/services/authService.js`

**What Changed:**

1. **New Backend Endpoint:** `GET /api/auth/token-health`
   - Checks if current token is compatible with server secret
   - Returns: `{ compatible, authenticated, token_version, server_version }`

2. **Frontend Monitoring:**
   - Automatically checks token health every 5 minutes
   - Starts monitoring after login/initialization
   - Stops monitoring after logout
   - Gracefully handles incompatibility by prompting re-login

**Benefits:**
- Proactive detection of token incompatibility
- Graceful user experience during issues
- Can detect secret key changes before errors occur

## Testing Checklist

### Local Testing

1. **Test normal login flow:**
   - Login → verify tokens are stored
   - Refresh page → verify still logged in
   - Check browser DevTools → verify httpOnly cookies are set

2. **Test token health monitoring:**
   - Login → check console for health check logs
   - Wait 5 minutes → verify health check runs
   - Check Network tab → verify `/api/auth/token-health` requests

3. **Test logout flow:**
   - Logout → verify health monitoring stops
   - Check console → no more health check logs

### Deployment Testing (Dev Environment)

1. **Deploy to develop branch:**
   ```bash
   git push origin develop
   ```

2. **Login to dev environment:** https://optio-dev-frontend.onrender.com

3. **Wait for next deployment:**
   - Make any small code change
   - Push to develop again
   - After deployment completes, check if you're still logged in

4. **Expected Result:**
   - If `FLASK_SECRET_KEY` is set: Still logged in ✅
   - If `FLASK_SECRET_KEY` is not set: Logged out (one-time) ⚠️

### Production Testing (After Dev Verification)

1. **Merge to main:**
   ```bash
   git checkout main
   git merge develop
   git push origin main
   ```

2. **Test on production:** https://www.optioeducation.com

3. **Monitor for 24-48 hours:**
   - Check user complaints about logout issues
   - Monitor Render logs for token errors
   - Verify health check endpoint is working

## Monitoring & Debugging

### Check Token Health from Browser Console

```javascript
// Check current token health
fetch('/api/auth/token-health', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  }
})
.then(r => r.json())
.then(console.log)
```

### Backend Logs to Monitor

Look for these log messages in Render:

- `[SessionManager] Token versioning enabled (version: v1)`
- `[SessionManager] Auth cookies set (cross-origin mode, SameSite=None, Secure=True)`
- `[SessionManager] Token validated with previous secret (version: v1)`
- `[TOKEN_HEALTH] Error checking token health: ...`

### Frontend Console Logs

Look for these messages:

- `Token incompatibility detected - logging out user`
- `Token health check failed: ...`

## Environment Variables Summary

### Required (Already Set)

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_KEY` - Supabase service role key
- `FLASK_ENV` - 'production' for main, 'development' for develop
- `FRONTEND_URL` - CORS configuration

### New/Updated (Action Required)

- `FLASK_SECRET_KEY` - **MUST SET THIS IN RENDER** (see Phase 1)

### Optional (For Future Key Rotation)

- `FLASK_SECRET_KEY_OLD` - Previous secret key (for rotation)
- `TOKEN_VERSION` - Token version identifier (default: 'v1')

## Rollback Plan

If issues occur after deployment:

1. **Immediate Rollback:**
   ```bash
   git revert HEAD
   git push origin develop
   ```

2. **Check Render Logs:**
   - Go to Render dashboard
   - Check recent deployments
   - Look for error messages

3. **Verify Environment Variables:**
   - Ensure `FLASK_SECRET_KEY` is set correctly
   - Check for typos or incorrect values

4. **Contact Users:**
   - If rollback is needed, inform users they may need to log in again

## Success Metrics

After deployment, monitor these metrics:

1. **User Complaints:** Decrease in "logged out after update" reports
2. **Session Persistence:** Users stay logged in across deployments
3. **Error Rates:** No increase in authentication errors
4. **Health Check Success:** `/api/auth/token-health` endpoint working

## Future Improvements

1. **Extend Token Expiry:**
   - Current: 7 days (refresh token)
   - Consider: 30 days for better UX

2. **Add Admin Dashboard:**
   - Show token version distribution
   - Monitor health check failures
   - Alert on secret key issues

3. **Implement Token Blacklist:**
   - For security: revoke specific tokens
   - Store revoked tokens in database
   - Check blacklist during verification

## References

- Token versioning: `backend/utils/session_manager.py`
- Health endpoint: `backend/routes/auth.py`
- Frontend monitoring: `frontend/src/services/authService.js`
- Environment config: `backend/app_config.py`

## Questions?

Contact the development team or check the main documentation at `/docs/CLAUDE.md`.
