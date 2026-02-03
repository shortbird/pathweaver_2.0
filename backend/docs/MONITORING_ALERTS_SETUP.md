# Monitoring & Alerts Setup - Phase 7.3

## Current State Assessment

### ✅ Implemented Monitoring Features

#### Error Handling & Logging
- **Structured Error Handler**: `backend/middleware/error_handler.py`
  - Custom error classes (ValidationError, AuthenticationError, etc.)
  - Standardized error response format
  - Request ID tracking for all requests
  - Contextual error logging with user_id, path, IP
  - Different log levels (WARNING for client errors, ERROR for server errors)
  - Production mode hides internal error details

#### Health Check Endpoints
- **Backend Health**: `/api/health` (GET)
  - Database connectivity check
  - Service status verification
  - Response time monitoring

#### Performance Monitoring
- **Database**: Supabase built-in monitoring
  - Query performance tracking
  - Connection pool monitoring
  - RLS policy performance optimized (Phase 4)

#### Security Monitoring
- **Rate Limiting**: Implemented on sensitive endpoints
  - Registration: 5 requests per 5 minutes
  - Login: Rate limited
  - Password reset: Rate limited

- **Authentication Logs**: Request context includes user_id
- **CSRF Protection**: Token-based protection on state changes

### ⚠️ Missing Monitoring Components

#### Application Performance Monitoring (APM)
- [ ] No centralized error tracking (Sentry, Rollbar, etc.)
- [ ] No performance metrics collection
- [ ] No request tracing
- [ ] No slow query detection
- [ ] No memory usage monitoring
- [ ] No CPU usage tracking

#### Uptime Monitoring
- [ ] No external uptime checks
- [ ] No ping monitoring
- [ ] No SSL certificate expiry monitoring
- [ ] No DNS monitoring

#### Business Metrics
- [ ] No user activity dashboards
- [ ] No revenue tracking dashboards
- [ ] No conversion funnel monitoring
- [ ] No churn rate tracking

#### Alerting System
- [ ] No alert configuration
- [ ] No on-call rotation
- [ ] No escalation policies
- [ ] No alert thresholds defined
- [ ] No notification channels (email, Slack, PagerDuty)

#### Database Monitoring
- [ ] No query performance alerts
- [ ] No connection pool alerts
- [ ] No storage usage alerts
- [ ] No backup verification

## Recommended Monitoring Stack

### Option 1: Minimal Setup (Good for MVP/Launch)

**Tools Required:**
1. **Render Built-in Monitoring** (FREE)
   - Service health checks
   - Deploy status
   - Basic metrics (CPU, memory, requests)
   - Log streaming

2. **Supabase Dashboard** (FREE)
   - Database metrics
   - Query performance
   - Storage usage
   - Authentication stats

3. **UptimeRobot** (FREE tier available)
   - HTTP(S) monitoring
   - 50 monitors on free tier
   - 5-minute check intervals
   - Email/Slack/webhook alerts

4. **Sentry** (FREE tier: 5k errors/month)
   - Error tracking
   - Performance monitoring
   - Release tracking
   - User impact analysis

**Estimated Setup Time:** 4-6 hours
**Monthly Cost:** $0 (using free tiers)

### Option 2: Production-Grade Setup

**Additional Tools:**
1. **DataDog or New Relic**
   - Full APM
   - Infrastructure monitoring
   - Custom dashboards
   - Cost: $15-50/month

2. **PagerDuty** (For on-call)
   - Incident management
   - Escalation policies
   - On-call scheduling
   - Cost: $19/user/month

3. **LogDNA or Papertrail**
   - Centralized logging
   - Log aggregation
   - Search and filtering
   - Cost: $10-50/month

**Estimated Setup Time:** 16-24 hours
**Monthly Cost:** $50-150

## Immediate Action Plan: Minimal Setup

### Step 1: Sentry Error Tracking (1-2 hours)

**Installation:**
```bash
pip install sentry-sdk[flask]
```

**Configuration** (`backend/app.py`):
```python
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

sentry_sdk.init(
    dsn=os.environ.get('SENTRY_DSN'),
    integrations=[FlaskIntegration()],
    environment=os.environ.get('FLASK_ENV', 'production'),
    traces_sample_rate=0.1,  # 10% of transactions for performance monitoring
    profiles_sample_rate=0.1,  # 10% for profiling
)
```

**Environment Variable:**
- Add `SENTRY_DSN` to Render environment variables (both dev and prod)

**Benefits:**
- Real-time error notifications
- Stack traces with context
- User impact analysis
- Release tracking
- Performance monitoring

### Step 2: UptimeRobot Monitoring (30 minutes)

**Setup:**
1. Create UptimeRobot account (free)
2. Add monitors for:
   - Frontend dev: https://optio-dev-frontend.onrender.com (5-min interval)
   - Backend dev: https://optio-dev-backend.onrender.com/api/health (5-min interval)
   - Frontend prod: https://www.optioeducation.com (5-min interval)
   - Backend prod: https://optio-prod-backend.onrender.com/api/health (5-min interval)

**Alert Channels:**
- Email notifications to admin@optioeducation.com
- Optional: Slack webhook integration

**Threshold:**
- Alert when service is down for 3 consecutive checks (15 minutes)

### Step 3: Enhanced Health Check Endpoint (1 hour)

**Improvements to `/api/health`:**
```python
@health_bp.route('/health', methods=['GET'])
def health_check():
    """Comprehensive health check"""
    health_status = {
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': os.environ.get('APP_VERSION', 'unknown'),
        'environment': os.environ.get('FLASK_ENV', 'production')
    }

    checks = {}
    overall_healthy = True

    # Database check
    try:
        supabase = get_supabase_client()
        start = time.time()
        supabase.table('users').select('id').limit(1).execute()
        checks['database'] = {
            'status': 'healthy',
            'response_time_ms': int((time.time() - start) * 1000)
        }
    except Exception as e:
        checks['database'] = {'status': 'unhealthy', 'error': str(e)}
        overall_healthy = False

    # Stripe check (optional, can be slow)
    if request.args.get('full') == 'true':
        try:
            import stripe
            stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
            start = time.time()
            stripe.Balance.retrieve()
            checks['stripe'] = {
                'status': 'healthy',
                'response_time_ms': int((time.time() - start) * 1000)
            }
        except Exception as e:
            checks['stripe'] = {'status': 'unhealthy', 'error': str(e)}
            # Don't mark overall as unhealthy for Stripe issues

    health_status['checks'] = checks
    health_status['status'] = 'healthy' if overall_healthy else 'unhealthy'

    status_code = 200 if overall_healthy else 503
    return jsonify(health_status), status_code
```

### Step 4: Render Monitoring Configuration (30 minutes)

**Health Check Path:**
- Set health check path to `/api/health` in Render dashboard
- Set interval to 60 seconds
- Set timeout to 10 seconds

**Log Retention:**
- Ensure logs are retained for 7 days minimum
- Review logs daily for errors

**Deploy Notifications:**
- Enable deploy notifications via email
- Optional: Add Slack webhook for deploy alerts

### Step 5: Basic Alerting Rules (1 hour)

**Create alert monitoring script** (`backend/scripts/check_system_health.py`):
```python
"""
System health check script
Run as cron job every 5 minutes to monitor critical metrics
"""

import os
import sys
from datetime import datetime, timedelta
from database import get_supabase_admin_client

def check_error_rate():
    """Check for elevated error rates"""
    # Implementation: Query logs or database for recent errors
    pass

def check_active_users():
    """Check if active user count dropped significantly"""
    # Implementation: Compare recent activity to baseline
    pass

def send_alert(alert_type, message, severity='warning'):
    """Send alert via configured channel"""
    # Implementation: Email, Slack, or webhook
    print(f"[{severity.upper()}] {alert_type}: {message}")

if __name__ == '__main__':
    # Run checks
    pass
```

## Monitoring Checklist

### ✅ Quick Wins (Can implement today)

**Health Checks:**
- [x] Basic health endpoint exists (`/api/health`)
- [ ] Enhanced health check with database connectivity
- [ ] Health check monitoring response times
- [ ] Frontend health check endpoint

**External Monitoring:**
- [ ] UptimeRobot configured for all services (30 min)
- [ ] SSL certificate expiry monitoring (UptimeRobot)
- [ ] Email alerts configured
- [ ] Test alert workflow

**Error Tracking:**
- [ ] Sentry account created (15 min)
- [ ] Sentry SDK installed in backend (15 min)
- [ ] Sentry configured in app.py (15 min)
- [ ] Test error reporting
- [ ] Configure error alert thresholds

**Logging:**
- [x] Structured logging implemented
- [x] Request ID tracking
- [ ] Log aggregation configured
- [ ] Log retention policy set (Render: 7 days)

### ⚠️ Should Implement Soon (1-2 weeks)

**Performance Monitoring:**
- [ ] Add request duration logging
- [ ] Track slow queries (>1s)
- [ ] Monitor API endpoint response times
- [ ] Set up performance budgets

**Business Metrics:**
- [ ] Daily active users dashboard
- [ ] Quest completion rates
- [ ] Subscription conversion tracking
- [ ] Churn rate monitoring

**Database Monitoring:**
- [ ] Storage usage alerts (>80%)
- [ ] Connection pool monitoring
- [ ] Query performance regression detection
- [ ] Backup verification automation

**Security Monitoring:**
- [ ] Failed login attempt tracking
- [ ] Unusual activity detection
- [ ] Rate limit hit monitoring
- [ ] CSRF token validation failures

### 📊 Nice to Have (Post-launch)

**Advanced APM:**
- [ ] Distributed tracing
- [ ] Custom metrics
- [ ] User session replay
- [ ] Performance profiling

**Alerting:**
- [ ] On-call rotation schedule
- [ ] Escalation policies
- [ ] Alert fatigue prevention
- [ ] Runbook documentation

**Analytics:**
- [ ] User behavior analytics
- [ ] A/B testing framework
- [ ] Funnel analysis
- [ ] Cohort analysis

## Alert Thresholds (Recommendations)

### Critical Alerts (Immediate Action)
- Service down for >5 minutes
- Error rate >5% of requests
- Database connection failures
- Payment processing failures
- Authentication service down

### Warning Alerts (Review within 1 hour)
- Error rate >1% of requests
- API response time >2s (p95)
- Database query time >1s (p95)
- Failed login rate >10%
- Storage usage >80%

### Info Alerts (Review daily)
- New user signups
- Subscription changes
- Deploy notifications
- SSL certificate expiring in <30 days

## Monitoring Dashboard Requirements

### Key Metrics to Track

**System Health:**
- Uptime percentage (target: 99.9%)
- Error rate (target: <0.1%)
- API response time p50, p95, p99
- Database query time p50, p95, p99

**Business Metrics:**
- Daily active users (DAU)
- Monthly active users (MAU)
- New registrations per day
- Quest completions per day
- Active subscriptions
- Monthly recurring revenue (MRR)

**User Experience:**
- Page load time (target: <2s)
- Time to interactive (target: <3s)
- API error rate by endpoint
- Failed payment rate

**Infrastructure:**
- CPU usage (alert at >80%)
- Memory usage (alert at >80%)
- Database storage (alert at >80%)
- Request rate (requests/minute)

## Implementation Priority

### Phase 1: Essential (Before Production Launch)
1. ✅ Sentry error tracking (2 hours)
2. ✅ UptimeRobot external monitoring (30 min)
3. ✅ Enhanced health checks (1 hour)
4. ✅ Basic alert configuration (1 hour)

**Total Time:** 4.5 hours
**Cost:** $0 (free tiers)

### Phase 2: Important (First Month)
1. Request duration logging
2. Slow query monitoring
3. Business metrics dashboard
4. Log aggregation setup

**Total Time:** 8-12 hours
**Cost:** $0-50/month

### Phase 3: Advanced (After First Month)
1. Full APM solution
2. On-call rotation
3. Advanced analytics
4. Custom dashboards

**Total Time:** 16-24 hours
**Cost:** $50-150/month

## Current Status

**Monitoring Score:** 30% Complete
- ✅ Basic error handling
- ✅ Health check endpoint
- ✅ Structured logging
- ⚠️ No external monitoring
- ⚠️ No error tracking service
- ⚠️ No alerting system
- ⚠️ No performance monitoring
- ⚠️ No business metrics

**Recommendation:** Implement Phase 1 (Essential) monitoring before production launch. This provides minimum viable monitoring with ~5 hours of work and $0 cost.