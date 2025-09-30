# Monitoring Setup Guide - Quick Start

This guide will help you set up essential monitoring for Optio Platform in ~5 hours with $0 cost using free tiers.

## Prerequisites
- Access to Render dashboard
- Admin email account
- (Optional) Slack workspace for notifications

## Step 1: UptimeRobot Setup (30 minutes)

### 1.1 Create Account
1. Go to https://uptimerobot.com
2. Sign up with admin email
3. Confirm email verification

### 1.2 Add Monitors
Create monitors for all four services:

**Development Frontend:**
- Monitor Type: HTTP(S)
- Friendly Name: Optio Dev Frontend
- URL: `https://optio-dev-frontend.onrender.com`
- Monitoring Interval: 5 minutes
- Alert When Down For: 3 checks (15 minutes)

**Development Backend:**
- Monitor Type: HTTP(S)
- Friendly Name: Optio Dev Backend
- URL: `https://optio-dev-backend.onrender.com/api/health`
- Monitoring Interval: 5 minutes
- Keyword: `healthy` (alert if not found in response)
- Alert When Down For: 3 checks (15 minutes)

**Production Frontend:**
- Monitor Type: HTTP(S)
- Friendly Name: Optio Prod Frontend
- URL: `https://www.optioeducation.com`
- Monitoring Interval: 5 minutes
- Alert When Down For: 3 checks (15 minutes)

**Production Backend:**
- Monitor Type: HTTP(S)
- Friendly Name: Optio Prod Backend
- URL: `https://optio-prod-backend.onrender.com/api/health`
- Monitoring Interval: 5 minutes
- Keyword: `healthy` (alert if not found in response)
- Alert When Down For: 3 checks (15 minutes)

### 1.3 Configure Alerts
1. Go to "My Settings" → "Alert Contacts"
2. Add email: Your admin email
3. (Optional) Add Slack: Create webhook URL from Slack
4. Test alerts by clicking "Test Alert Contact"

### 1.4 SSL Monitoring
1. Add SSL monitoring to each HTTPS monitor
2. Set alert threshold: 30 days before expiry

**Expected Result:** You'll receive email alerts when services are down or SSL certificates are expiring.

---

## Step 2: Sentry Error Tracking (2 hours)

### 2.1 Create Sentry Account
1. Go to https://sentry.io
2. Sign up (free tier: 5,000 errors/month)
3. Create new project: "optio-backend" (Flask/Python)
4. Create second project: "optio-frontend" (React)

### 2.2 Backend Integration

**Install Sentry SDK:**
```bash
cd backend
../venv/Scripts/pip install sentry-sdk[flask]
```

**Update requirements.txt:**
```bash
../venv/Scripts/pip freeze > requirements.txt
```

**Add to `backend/app.py` (after imports, before app creation):**
```python
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

# Initialize Sentry
if os.environ.get('SENTRY_DSN'):
    sentry_sdk.init(
        dsn=os.environ.get('SENTRY_DSN'),
        integrations=[FlaskIntegration()],
        environment=os.environ.get('FLASK_ENV', 'production'),

        # Performance monitoring
        traces_sample_rate=0.1,  # 10% of transactions

        # Additional context
        send_default_pii=False,  # Don't send user data automatically
        attach_stacktrace=True,

        # Release tracking
        release=os.environ.get('APP_VERSION', 'unknown'),
    )
```

**Add Environment Variables to Render:**

For **optio-dev-backend** service:
1. Go to Render dashboard → optio-dev-backend
2. Environment → Add Environment Variable
3. Key: `SENTRY_DSN`, Value: `<your-dev-sentry-dsn>`
4. Key: `APP_VERSION`, Value: `dev-latest`

For **optio-prod-backend** service:
1. Go to Render dashboard → optio-prod-backend
2. Environment → Add Environment Variable
3. Key: `SENTRY_DSN`, Value: `<your-prod-sentry-dsn>`
4. Key: `APP_VERSION`, Value: `prod-latest`

**Deploy Changes:**
```bash
git add backend/app.py backend/requirements.txt
git commit -m "Add Sentry error tracking"
git push origin develop  # Test in dev first
# After verification:
git checkout main
git merge develop
git push origin main
```

### 2.3 Frontend Integration

**Install Sentry SDK:**
```bash
cd frontend
npm install @sentry/react
```

**Update `frontend/src/main.jsx` (at the top):**
```javascript
import * as Sentry from "@sentry/react";

// Initialize Sentry
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],

    // Performance monitoring
    tracesSampleRate: 0.1, // 10% of transactions

    // Session replay
    replaysSessionSampleRate: 0.1, // 10% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors
  });
}
```

**Add Environment Variables to Render:**

For **optio-dev-frontend**:
- Key: `VITE_SENTRY_DSN`, Value: `<your-frontend-dev-dsn>`

For **optio-prod-frontend**:
- Key: `VITE_SENTRY_DSN`, Value: `<your-frontend-prod-dsn>`

### 2.4 Test Sentry Integration

**Backend test:**
```python
# Add temporary test endpoint
@app.route('/test-error')
def test_error():
    1 / 0  # This will trigger an error
```

Visit: `https://optio-dev-backend.onrender.com/test-error`
Check Sentry dashboard for the error.

**Frontend test:**
Add temporary button in any page:
```jsx
<button onClick={() => { throw new Error("Test error"); }}>
  Test Sentry
</button>
```

### 2.5 Configure Sentry Alerts
1. Go to Sentry → Alerts
2. Create alert rule:
   - Alert Type: "Issues"
   - Conditions: "When an issue is first seen"
   - Actions: "Send notification to email"
3. Create second alert:
   - Conditions: "When an issue happens more than 10 times in 1 hour"

---

## Step 3: Render Monitoring Configuration (30 minutes)

### 3.1 Health Check Configuration
For each backend service (dev and prod):
1. Go to Render dashboard → Service → Settings
2. Health Check Path: `/api/health`
3. Save changes

### 3.2 Deploy Notifications
1. Go to Settings → Notifications
2. Enable "Deploy Notifications"
3. Add email: Your admin email
4. (Optional) Add Slack webhook

### 3.3 Auto-Deploy Settings
Verify auto-deploy is enabled:
- Dev services: Auto-deploy from `develop` branch ✓
- Prod services: Auto-deploy from `main` branch ✓

---

## Step 4: Log Review Process (30 minutes setup)

### 4.1 Daily Log Review Checklist
Create a daily routine (5-10 minutes):

1. **Check Render Logs** (both dev and prod):
   - Go to Service → Logs
   - Filter for ERROR and CRITICAL
   - Look for patterns or recurring issues

2. **Check Sentry Dashboard**:
   - Review new issues
   - Check error trends
   - Triage critical issues

3. **Check UptimeRobot**:
   - Review uptime percentage (target: >99.5%)
   - Check response time trends
   - Verify no SSL issues

### 4.2 Log Retention
- **Render Free**: 1 day retention
- **Render Starter**: 7 days retention (recommended)
- **Supabase**: 7 days retention (built-in)

**Action:** Upgrade Render services to Starter tier for better log retention.

---

## Step 5: Alert Response Plan (1 hour documentation)

### 5.1 Alert Types and Response Times

**Critical (Respond immediately):**
- Service down >15 minutes
- Database unreachable
- Error rate >5% of requests
- Payment processing failures

**High (Respond within 1 hour):**
- Error rate >1% of requests
- API response time >2s
- Failed login rate >10%

**Medium (Respond within 4 hours):**
- SSL certificate expiring <30 days
- Storage usage >80%
- Slow query warnings

**Low (Review daily):**
- New error types
- Performance degradation
- Failed background jobs

### 5.2 Incident Response Checklist

When alert is received:

1. **Assess Severity**
   - Check Sentry for error details
   - Check Render logs for context
   - Check Supabase dashboard for database issues

2. **Triage**
   - Is service completely down? (Critical)
   - Partial functionality affected? (High)
   - Single feature broken? (Medium)

3. **Investigate**
   - Recent deploys? (rollback if needed)
   - External service issues? (Supabase, Stripe, Render status pages)
   - Database connectivity?

4. **Resolve**
   - Apply fix
   - Deploy to dev first
   - Test thoroughly
   - Deploy to production

5. **Document**
   - Record incident in incident log
   - Note root cause
   - Document prevention steps

### 5.3 Rollback Procedure

If production is broken:

```bash
# Quick rollback in Render dashboard:
# 1. Go to Service → Deploys
# 2. Find last working deploy
# 3. Click "Redeploy"

# Or via git:
git log --oneline  # Find last good commit
git revert <bad-commit>
git push origin main
```

---

## Step 6: Monitoring Dashboard (1 hour)

### 6.1 Create Simple Dashboard

Create a bookmark folder with:
1. UptimeRobot Dashboard
2. Sentry Backend Issues
3. Sentry Frontend Issues
4. Render Dev Backend Logs
5. Render Prod Backend Logs
6. Supabase Dashboard
7. Stripe Dashboard

### 6.2 Weekly Metrics Review

Every Monday, review:
- Uptime percentage (target: >99.9%)
- Error count trend (target: <10 errors/day)
- API response times (target: p95 <2s)
- Active users (monitor growth)
- Failed payments (target: <1%)

---

## Monitoring Checklist

### ✅ Essential Setup (Complete before launch)
- [ ] UptimeRobot monitors configured (4 services)
- [ ] Email alerts enabled
- [ ] Sentry backend integration complete
- [ ] Sentry frontend integration complete
- [ ] Sentry alerts configured
- [ ] Render health checks configured
- [ ] Deploy notifications enabled
- [ ] Alert response plan documented
- [ ] Rollback procedure tested

### 📊 Nice to Have (Can add later)
- [ ] Slack alert integration
- [ ] Custom Grafana dashboard
- [ ] Performance monitoring
- [ ] Business metrics tracking
- [ ] On-call rotation schedule

---

## Testing Your Setup

### Test 1: Uptime Monitoring
1. Temporarily break health endpoint
2. Wait 15 minutes
3. Verify you receive UptimeRobot alert
4. Fix health endpoint
5. Verify "back up" notification

### Test 2: Error Tracking
1. Trigger test error in backend
2. Check Sentry dashboard (should appear within 1 minute)
3. Verify email alert received
4. Mark as resolved in Sentry

### Test 3: Deploy Notifications
1. Push minor change to develop branch
2. Verify deploy notification received
3. Check service is healthy after deploy

---

## Monitoring Costs

**Free Tier (Recommended for Launch):**
- UptimeRobot: $0 (50 monitors, 5-min intervals)
- Sentry: $0 (5,000 errors/month, 10,000 transactions)
- Render: Built-in monitoring included
- Supabase: Built-in monitoring included

**Total: $0/month**

**Paid Upgrade (When needed):**
- UptimeRobot Pro: $7/month (1-min intervals, more monitors)
- Sentry Team: $26/month (50,000 errors, more features)
- Render Starter: $7/service/month (better logs, metrics)

**Total: ~$50-100/month** (scale as needed)

---

## Next Steps

After completing this setup:
1. Monitor for 1 week in development
2. Test alert workflows
3. Document any issues encountered
4. Deploy to production with confidence
5. Continue to Phase 7.4: Documentation Review

---

## Support & Resources

- UptimeRobot Docs: https://uptimerobot.com/blog/
- Sentry Docs: https://docs.sentry.io
- Render Monitoring: https://render.com/docs/monitoring
- Supabase Monitoring: https://supabase.com/docs/guides/platform/metrics

---

**Estimated Total Setup Time: 5 hours**
**Total Cost: $0 (using free tiers)**
**Maintenance Time: 30 min/week**