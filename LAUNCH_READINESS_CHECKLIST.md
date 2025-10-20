# Optio Launch Readiness Checklist
**Date Created:** October 17, 2025
**Launch Date:** [YOUR LAUNCH DATE HERE]

---

## Executive Summary

This document identifies all rate limiting configurations across your tech stack and provides a comprehensive checklist for launch readiness. Several critical bottlenecks have been identified that require immediate attention before launch.

---

## Complete Tech Stack

### Hosting & Infrastructure
- **Render.com** - Web services (4 active services on Starter plan)
  - `optio-prod-backend` (srv-d2to00vfte5s73ae9310) - Python/Flask backend
  - `optio-prod-frontend` (srv-d2to04vfte5s73ae97ag) - React/Vite static site
  - `optio-dev-backend` (srv-d2tnvlvfte5s73ae8npg) - Development backend
  - `optio-dev-frontend` (srv-d2tnvrffte5s73ae8s4g) - Development frontend
- **Supabase** - PostgreSQL database (shared across dev/prod)
- **Custom Domain** - www.optioeducation.com → optio-prod-frontend

### External API Services
1. **Stripe** - Payment processing & subscription management
2. **SendGrid** - Transactional email delivery (SMTP)
3. **Pexels API** - Quest & badge image generation
4. **Google Gemini API** - AI features (model: gemini-2.5-flash-lite)

### Application Components
- **Backend:** Flask 3.0.0 with Gunicorn WSGI server
- **Frontend:** React 18.3.1 with Vite build system
- **Authentication:** JWT with httpOnly cookies + CSRF protection
- **Rate Limiting:** Custom in-memory rate limiter (Python)

---

## Critical Issues Found

### 🚨 CRITICAL PRIORITY - Must Fix Before Launch

#### 1. Gunicorn Server Configuration - MAJOR BOTTLENECK
**Location:** `backend/gunicorn.conf.py`
**Current Configuration:**
```python
workers = 1                    # Single worker process
worker_connections = 100       # Max 100 connections per worker
threads = 2                    # 2 threads per worker
timeout = 120                  # 2 minute timeout
worker_rlimit_as = 400MB      # Memory limited to 400MB per worker
```

**Maximum Concurrent Users:** ~200 (1 worker × 100 connections × 2 threads)

**Problem:** Configured for memory optimization on 512MB Render Starter plan, NOT for handling traffic spikes.

**Impact:** During launch spike, users will experience:
- Timeouts after 120 seconds
- Connection refused errors
- Slow response times as requests queue

**Recommendation:** See "Action Items" section below.

---

#### 2. Application Rate Limiter - TOO RESTRICTIVE
**Location:** `backend/middleware/rate_limiter.py`
**Current Configuration:**
- **Auth endpoints:** 5 attempts per minute (production) / 50 per minute (dev)
- **General endpoints:** 60 requests per 60 seconds per IP address
- **Storage:** In-memory (resets on restart/redeploy)
- **Identifier:** IP address

**Problems:**
1. **In-memory storage:** Counters reset every deploy, can't scale across multiple workers
2. **Too strict:** 5 auth attempts/minute is easily hit by legitimate users (typos, password resets)
3. **Per-IP limiting:** Hurts users on shared IPs (schools, offices, coffee shops, mobile carriers)
4. **No distributed coordination:** If scaling to multiple servers, each has separate limits

**Impact:** Legitimate users may be blocked during signup/login surge.

---

#### 3. SendGrid Email Service - FREE TIER EXHAUSTION RISK
**Location:** `backend/services/email_service.py`
**Current Usage:**
- Welcome emails on signup
- Email confirmation links
- Quest completion notifications
- Parent invitation emails
- Subscription request notifications
- Parental consent emails

**Free Tier Limit:** 100 emails per day

**Problem:** With even modest launch success (50+ signups), you'll hit the limit within hours.

**Impact:**
- New users can't verify email addresses
- Account activation blocked
- Professional credibility damaged

---

#### 4. Pexels API - Image Generation Rate Limit
**Location:** `backend/services/image_service.py`
**Current Configuration:**
- In-memory tracker: 200 requests per hour
- Used for quest images and badge images
- Falls back to generic images if quota exceeded

**Free Tier Limit:** 200 requests per hour (Pexels API)

**Problem:** If adding many quests or badges during launch, you'll exhaust quota quickly.

**Impact:** New quests/badges won't have relevant images, degrading user experience.

---

### ⚠️ HIGH PRIORITY - Address Within First Week

#### 5. Render Starter Plan Resource Constraints
**Current Plan:** Starter ($0/month during trial, then $7/service/month)
- **CPU:** 0.5 shared CPU core
- **RAM:** 512MB per service
- **Bandwidth:** 100GB/month (static sites)
- **Build minutes:** 400 minutes/month shared
- **Autoscaling:** Not available
- **Metrics:** Basic only

**Problem:** Minimal resources for production traffic, no autoscaling to handle spikes.

---

#### 6. Supabase Free Tier Limitations
**Assumed Current Plan:** Free tier
- **Database connections:** 20 concurrent max
- **Database size:** 500MB
- **Bandwidth:** 500MB/month
- **Storage:** 1GB
- **Auth rate limit:** 30 requests/hour per IP (signup/login)
- **Backups:** None (manual exports only)

**Problem:** 20 database connections can be exhausted quickly with concurrent users.

---

## Manual Verification Checklist

### 1. Supabase Dashboard
**URL:** https://supabase.com/dashboard

#### Database Settings
- [ ] **Project:** [YOUR_PROJECT_NAME]
- [ ] **Current Plan:** ☐ Free  ☐ Pro ($25/mo)  ☐ Team  ☐ Enterprise
- [ ] **Database Connections:**
  - Max connections: _________ (Free: 20, Pro: 60)
  - Current usage: _________ connections
  - Connection pooling enabled: ☐ Yes  ☐ No
- [ ] **Database Size:**
  - Current size: _________ MB / _________ MB limit
  - Storage for evidence uploads: _________ MB / _________ GB limit

#### Performance Tab
- [ ] **Peak connection usage (last 7 days):** _________ connections
- [ ] **Slow queries identified:** ☐ Yes  ☐ No
  - If yes, list tables: _________________________________

#### Auth Settings
- [ ] **Auth rate limiting (signup/login):** _________ requests/hour per IP
- [ ] **Email confirmation required:** ☐ Yes  ☐ No
- [ ] **Email provider configured:** ☐ Supabase  ☐ Custom SMTP
- [ ] **Password requirements match app config:** ☐ Yes  ☐ No

#### API Settings
- [ ] **API bandwidth usage (last 30 days):** _________ MB / 500MB (free tier)
- [ ] **Row Level Security (RLS) enabled on tables:** ☐ Yes  ☐ No
  - Critical tables to verify: users, quests, quest_task_completions, friendships

#### Recommendations Based on Launch Scale:
- [ ] **If expecting 100+ users Day 1:** Upgrade to Pro ($25/mo)
- [ ] **If expecting 500+ users Day 1:** Upgrade to Team plan or enable connection pooling

---

### 2. Stripe Dashboard
**URL:** https://dashboard.stripe.com

#### API Configuration
- [ ] **Current mode:** ☐ Test Mode  ☐ Live Mode
- [ ] **Production backend using Live API keys:** ☐ Yes  ☐ No  ☐ Need to verify
- [ ] **Webhook endpoint configured:**
  - URL: _________________________________
  - Status: ☐ Active  ☐ Inactive
  - Events subscribed: _________________________________

#### Products & Pricing
- [ ] **Subscription tiers configured in Stripe:**
  - [ ] Free tier (no Stripe product)
  - [ ] Parent Supported ($50/month) - Price ID: _________________________________
  - [ ] Weekly ($300/month) - Price ID: _________________________________
  - [ ] Daily ($600/month) - Price ID: _________________________________
- [ ] **Price IDs match backend config.py:** ☐ Yes  ☐ No

#### Rate Limits (Auto-enforced by Stripe)
- [ ] **Read requests:** 100/second (automatic)
- [ ] **Write requests:** 100/second (automatic)
- [ ] **Webhook delivery:** Automatic retries enabled

#### Tax & Compliance
- [ ] **Tax collection configured:** ☐ Yes  ☐ No  ☐ Not needed
- [ ] **Business information complete:** ☐ Yes  ☐ No

---

### 3. SendGrid Dashboard
**URL:** https://app.sendgrid.com

#### Account Status
- [ ] **Current plan:** ☐ Free (100 emails/day)  ☐ Essentials ($19.95/mo, 50K emails)  ☐ Pro
- [ ] **Sender authentication status:**
  - Domain authentication: ☐ Verified  ☐ Pending  ☐ Not configured
  - SPF record: ☐ Valid  ☐ Invalid  ☐ Not found
  - DKIM record: ☐ Valid  ☐ Invalid  ☐ Not found
- [ ] **Sender email:** _________________________________
- [ ] **Sender domain:** _________________________________

#### API Configuration
- [ ] **API key active:** ☐ Yes  ☐ No
- [ ] **API key name:** _________________________________
- [ ] **Permissions:** ☐ Full Access  ☐ Restricted Access
- [ ] **Backend SMTP_PASS environment variable set:** ☐ Yes  ☐ No

#### Usage Stats (Last 30 Days)
- [ ] **Emails sent:** _________ / _________ limit
- [ ] **Bounce rate:** _________% (should be <5%)
- [ ] **Spam report rate:** _________% (should be <0.1%)

#### Suppression Lists
- [ ] **Bounces:** _________ addresses
- [ ] **Spam reports:** _________ addresses
- [ ] **Unsubscribes:** _________ addresses
- [ ] **Invalid emails:** _________ addresses

#### Email Templates in Use
- [ ] welcome.html - Welcome email to new users
- [ ] email_confirmation.html - Email verification
- [ ] quest_completion.html - Quest completion notifications
- [ ] parent_invitation.html - Parent invitation emails
- [ ] subscription_request_user.html - User subscription confirmation
- [ ] subscription_request_admin.html - Admin subscription notification
- [ ] parental_consent.html - COPPA parental consent

#### CRITICAL Decision Point:
- [ ] **If free plan:** Can handle approximately 2 signups/day with multi-email workflows
- [ ] **Upgrade to Essentials ($19.95/mo) before launch:** ☐ Yes  ☐ No  ☐ Undecided

---

### 4. Render Dashboard
**URL:** https://dashboard.render.com

#### Service: optio-prod-backend (srv-d2to00vfte5s73ae9310)
- [ ] **Current plan:** ☐ Starter ($7/mo)  ☐ Standard ($25/mo)  ☐ Pro
- [ ] **Resources:**
  - CPU: _________ cores
  - RAM: _________ MB
  - Disk: _________ GB
- [ ] **Deployment status:** ☐ Live  ☐ Failed  ☐ Building
- [ ] **Last deploy:** _________ (date/time)
- [ ] **Environment variables set:**
  - [ ] SUPABASE_URL
  - [ ] SUPABASE_SERVICE_KEY
  - [ ] FLASK_SECRET_KEY (64 characters)
  - [ ] FLASK_ENV=production
  - [ ] FRONTEND_URL=https://www.optioeducation.com
  - [ ] GEMINI_API_KEY
  - [ ] STRIPE_SECRET_KEY
  - [ ] SMTP_HOST, SMTP_USER, SMTP_PASS (SendGrid)
  - [ ] PEXELS_API_KEY

#### Service: optio-prod-frontend (srv-d2to04vfte5s73ae97ag)
- [ ] **Current plan:** ☐ Starter ($0)  ☐ Standard ($25/mo)
- [ ] **Custom domain:** www.optioeducation.com
  - Status: ☐ Active  ☐ Pending  ☐ Not configured
- [ ] **SSL certificate:** ☐ Active  ☐ Pending
- [ ] **Build command:** cd frontend && npm install && npm run build
- [ ] **Publish directory:** frontend/dist
- [ ] **_redirects file present:** ☐ Yes  ☐ No

#### Build & Deploy
- [ ] **Build minutes used (current month):** _________ / 400 minutes
- [ ] **Average build time:** _________ minutes
- [ ] **Estimated deploys possible:** _________ (400 ÷ avg_build_time)

#### Bandwidth & Performance
- [ ] **Bandwidth used (current month):** _________ GB / 100GB (free tier)
- [ ] **Average response time:** _________ ms
- [ ] **Error rate:** _________%

#### Metrics & Monitoring
- [ ] **Metrics available:** ☐ Yes  ☐ No (requires Standard plan)
- [ ] **Alerts configured:** ☐ Yes  ☐ No
  - CPU usage alerts: ☐ Yes  ☐ No
  - Memory usage alerts: ☐ Yes  ☐ No
  - Error rate alerts: ☐ Yes  ☐ No

---

### 5. Google Cloud Console (Gemini API)
**URL:** https://console.cloud.google.com

#### API & Services → Enabled APIs → Generative Language API
- [ ] **API enabled:** ☐ Yes  ☐ No
- [ ] **API key active:** ☐ Yes  ☐ No
- [ ] **Key name:** _________________________________

#### Quotas & System Limits
- [ ] **Current quotas (free tier):**
  - Requests per minute: _________ (default: 15 RPM)
  - Requests per day: _________ (default: 1,500 RPD)
  - Tokens per minute: _________ (default: 1,000,000 TPM)
- [ ] **Usage in last 7 days:**
  - Total requests: _________
  - Peak requests/minute: _________
  - Average tokens/request: _________

#### Billing
- [ ] **Billing account linked:** ☐ Yes  ☐ No
- [ ] **Current plan:** ☐ Free tier  ☐ Pay-as-you-go
- [ ] **Spending limit set:** ☐ Yes ($________)  ☐ No

#### AI Usage in Application
Used for:
- Quest image search term generation (image_service.py)
- Badge image search term optimization (image_service.py)
- AI tutor conversations (ai_tutor_service.py)
- Quest AI generation (quest_ai_service.py)
- Student AI assistance (student_ai_assistant_service.py)

#### Risk Assessment:
- [ ] **Free tier sufficient for launch:** ☐ Yes  ☐ No  ☐ Monitor closely
- [ ] **If 100+ users use AI tutor on Day 1:** May hit 1,500 requests/day limit

---

### 6. Pexels API Account
**URL:** https://www.pexels.com/api/

#### Account Status
- [ ] **API key active:** ☐ Yes  ☐ No
- [ ] **Current plan:** ☐ Free (200/hour)  ☐ Premium
- [ ] **Requests in last 24 hours:** _________

#### Usage in Application
- Quest header images: Auto-fetched on quest creation using AI-generated search terms
- Badge images: Auto-fetched on badge creation with "teenage teen student" keywords
- Fallback strategies: Multiple search terms tried if primary fails

#### Rate Limit Management
- In-memory tracker: `backend/services/api_usage_tracker.py`
- Limit: 200 requests per hour
- Resets: Every hour on the hour

#### Pre-Launch Action Items:
- [ ] **Count existing quests without images:** _________
- [ ] **Count existing badges without images:** _________
- [ ] **Pre-generate images before launch:** ☐ Yes  ☐ No  ☐ Scheduled for: _________

---

## Launch Preparation Questions

### Traffic Expectations
**Question 1:** What is your expected Day 1 signup volume?
- ☐ 1-50 users (soft launch, friends & family)
- ☐ 50-200 users (social media announcement)
- ☐ 200-500 users (marketing campaign)
- ☐ 500-1000 users (press coverage, viral potential)
- ☐ 1000+ users (major marketing push)

**Answer:** _________________________________

---

**Question 2:** What is your user acquisition strategy?
- ☐ Organic (word of mouth, SEO)
- ☐ Social media (which platforms: _________________________)
- ☐ Paid ads (budget: $_________)
- ☐ Press coverage (publications: _________________________)
- ☐ Partnerships (schools, organizations)
- ☐ Other: _________________________________

**Answer:** _________________________________

---

**Question 3:** Are you doing a soft launch or full public launch?
- ☐ Soft launch (limited audience, testing phase)
- ☐ Public launch (open to all)
- ☐ Phased rollout (expanding gradually)

**Answer:** _________________________________

---

### Monitoring & Alerting

**Question 4:** Do you have monitoring/alerting set up?
- ☐ Render built-in metrics (requires Standard plan)
- ☐ External service (Datadog, New Relic, etc.)
- ☐ Custom logging/monitoring
- ☐ None currently

**Answer:** _________________________________

---

**Question 5:** Who will be on-call during launch?
- Primary: _________________________________
- Secondary: _________________________________
- Contact method: _________________________________

---

**Question 6:** What is your incident response plan?
- Supabase down: _________________________________
- Render backend down: _________________________________
- Email delivery failing: _________________________________
- High error rate: _________________________________

**Answer:** _________________________________

---

### Budget & Resources

**Question 7:** What is your monthly infrastructure budget?
- ☐ <$50/month (minimal)
- ☐ $50-$150/month (standard)
- ☐ $150-$500/month (comfortable)
- ☐ $500+/month (enterprise-ready)

**Answer:** $_________ per month

---

**Question 8:** Are you comfortable upgrading services mid-launch if needed?
- ☐ Yes, have credit card ready
- ☐ Yes, but need approval process
- ☐ No, locked into current budget

**Answer:** _________________________________

---

### Backup & Recovery

**Question 9:** Do you have database backups configured?
- ☐ Manual exports (when: _________________________)
- ☐ Automated daily backups (Supabase Pro)
- ☐ No backups currently

**Answer:** _________________________________

---

**Question 10:** If your database is corrupted/deleted, what is your recovery plan?

**Answer:** _________________________________

---

## Recommended Action Items

### CRITICAL - Do Before Launch (Tomorrow)

#### 1. Upgrade SendGrid Plan
**Priority:** CRITICAL
**Cost:** $19.95/month (Essentials plan, 50K emails/month)
**Time Required:** 5 minutes
**Impact:** Prevents complete email delivery failure

**Action Steps:**
1. Go to https://app.sendgrid.com/settings/billing
2. Upgrade to Essentials plan
3. Verify upgrade in dashboard
4. Test email delivery

**Status:** ☐ Complete  ☐ In Progress  ☐ Not Started
**Notes:** _________________________________

---

#### 2. Increase Gunicorn Workers (If Upgrading Render)
**Priority:** CRITICAL
**Cost:** $18/month (Render Standard: $25/mo - $7/mo Starter)
**Time Required:** 30 minutes (upgrade + config + deploy)
**Impact:** 10x capacity increase (200 → 2000 concurrent users)

**Option A: Upgrade Render + Optimize Gunicorn (RECOMMENDED)**
1. Upgrade optio-prod-backend to Standard plan ($25/mo) for 2GB RAM
2. Update `backend/gunicorn.conf.py`:
```python
workers = 4                    # 4 workers instead of 1
worker_connections = 500       # 500 connections instead of 100
threads = 4                    # 4 threads instead of 2
max_requests = 5000           # 5000 instead of 1000
timeout = 60                  # 60 seconds instead of 120
worker_rlimit_as = None       # Remove memory limit
```
3. Commit and push to main branch (auto-deploys)
4. Monitor logs: `mcp__render__list_logs` or dashboard

**Expected Capacity:** ~8,000 concurrent connections (4 workers × 500 conn × 4 threads)

**Option B: Stay on Starter, Optimize Slightly**
1. Update `backend/gunicorn.conf.py`:
```python
workers = 2                    # 2 workers (still within 512MB)
worker_connections = 250       # 250 connections
threads = 2                    # Keep at 2
```
2. Commit and push

**Expected Capacity:** ~1,000 concurrent connections (2 workers × 250 conn × 2 threads)

**Status:** ☐ Option A Complete  ☐ Option B Complete  ☐ Not Started
**Notes:** _________________________________

---

#### 3. Relax Rate Limiting or Disable Temporarily
**Priority:** HIGH
**Cost:** $0
**Time Required:** 10 minutes
**Impact:** Prevents legitimate users from being blocked during signup surge

**Action Steps:**
1. Edit `backend/middleware/rate_limiter.py`:
```python
# For auth endpoints (line 82)
max_req = 20  # Increase from 5 to 20 in production
window = 60

# For general endpoints (line 85)
max_req = 200  # Increase from 60 to 200
window = 60
```

**OR (Simpler Option):** Disable rate limiting entirely for launch:
1. Edit `backend/app.py`
2. Comment out rate limiter imports and initialization
3. Rely on Supabase/Render built-in protections

**Status:** ☐ Increased Limits  ☐ Disabled  ☐ Keeping Current
**Notes:** _________________________________

---

#### 4. Pre-generate All Quest & Badge Images
**Priority:** HIGH
**Cost:** $0 (uses existing Pexels free tier)
**Time Required:** 1-2 hours (depending on number of quests)
**Impact:** Avoids hitting 200/hour limit during launch traffic

**Action Steps:**
1. Create admin script: `backend/scripts/regenerate_all_images.py`
2. Run locally or via Render shell
3. Verify all quests/badges have image_url populated
4. Monitor Pexels usage in `api_usage_tracker.py`

**Status:** ☐ Complete  ☐ In Progress  ☐ Not Started
**Quest Count:** _________ total quests
**Badge Count:** _________ total badges
**Notes:** _________________________________

---

### HIGH PRIORITY - Do This Week

#### 5. Upgrade Supabase to Pro
**Priority:** HIGH
**Cost:** $25/month
**Time Required:** 5 minutes
**Impact:** 3x database connections (20 → 60), daily backups, better performance

**When to do this:**
- If expecting 100+ concurrent users
- If you value automated backups
- If current connection usage >15 (check dashboard)

**Action Steps:**
1. Go to https://supabase.com/dashboard → Project Settings → Billing
2. Upgrade to Pro plan
3. Enable connection pooling in Database settings
4. Configure automated backups

**Status:** ☐ Complete  ☐ Scheduled  ☐ Not Needed
**Notes:** _________________________________

---

#### 6. Set Up Error Monitoring & Alerting
**Priority:** HIGH
**Cost:** $0 (Render basic alerts) or $15-30/mo (Sentry, Datadog)
**Time Required:** 30-60 minutes
**Impact:** Early detection of issues during launch

**Option A: Render Built-in Alerts (Free with Standard plan)**
1. Upgrade to Standard plan (already recommended)
2. Go to Service Settings → Notifications
3. Configure email alerts for:
   - CPU usage >80%
   - Memory usage >80%
   - Error rate >5%
   - Service crashes

**Option B: Sentry (Recommended for detailed error tracking)**
1. Sign up at https://sentry.io (free tier: 5K errors/month)
2. Install: `pip install sentry-sdk[flask]`
3. Add to `backend/app.py`:
```python
import sentry_sdk
sentry_sdk.init(dsn="YOUR_SENTRY_DSN")
```
4. Deploy

**Status:** ☐ Render Alerts  ☐ Sentry  ☐ Other: _________  ☐ Not Started
**Notes:** _________________________________

---

#### 7. Load Test Your Application
**Priority:** HIGH
**Cost:** $0 (use free tools)
**Time Required:** 2-3 hours (setup + testing + analysis)
**Impact:** Identify bottlenecks before real users hit them

**Recommended Tool: k6 (https://k6.io)**

**Action Steps:**
1. Install k6: https://k6.io/docs/get-started/installation/
2. Create load test script: `load-test.js`
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '1m', target: 100 },   // Ramp up to 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
};

export default function () {
  const res = http.get('https://optio-prod-backend.onrender.com/api/health');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```
3. Run: `k6 run load-test.js`
4. Analyze results: response times, error rates, throughput

**Test Scenarios:**
- [ ] Health check endpoint
- [ ] User registration flow
- [ ] User login flow
- [ ] Quest listing page
- [ ] Quest start/completion flow

**Status:** ☐ Complete  ☐ In Progress  ☐ Not Started
**Test Date:** _________
**Results:** _________________________________

---

### MEDIUM PRIORITY - First Month

#### 8. Implement Redis-based Rate Limiting
**Priority:** MEDIUM
**Cost:** $5-10/month (Render Redis addon or Upstash)
**Time Required:** 2-3 hours
**Impact:** Persistent, scalable rate limiting across deploys

**Status:** ☐ Complete  ☐ Scheduled  ☐ Not Needed
**Notes:** _________________________________

---

#### 9. Move Images to CDN/Object Storage
**Priority:** MEDIUM
**Cost:** $1-5/month (AWS S3 + CloudFront or Cloudflare R2)
**Time Required:** 3-4 hours
**Impact:** Faster image loading, reduced Render bandwidth usage

**Status:** ☐ Complete  ☐ Scheduled  ☐ Not Needed
**Notes:** _________________________________

---

#### 10. Database Query Optimization
**Priority:** MEDIUM
**Cost:** $0
**Time Required:** 2-4 hours
**Impact:** Faster page loads, reduced database load

**Action Steps:**
1. Review slow query logs in Supabase dashboard
2. Add indexes to frequently queried columns
3. Optimize N+1 queries (already done for quests via quest_optimization.py)
4. Consider database connection pooling

**Status:** ☐ Complete  ☐ Scheduled  ☐ Not Needed
**Notes:** _________________________________

---

## Cost Summary

### Minimum Viable Launch Configuration
| Service | Current Plan | Recommended Plan | Monthly Cost | Annual Cost |
|---------|-------------|------------------|--------------|-------------|
| SendGrid | Free (100/day) | Essentials (50K/mo) | $19.95 | $239.40 |
| Render Backend | Starter ($7) | Standard ($25) | $25.00 | $300.00 |
| Render Frontend | Free | Free | $0.00 | $0.00 |
| Supabase | Free | Free (acceptable for launch) | $0.00 | $0.00 |
| Stripe | Free | Free (pay per transaction) | $0.00 | $0.00 |
| Google Gemini | Free | Free (monitor usage) | $0.00 | $0.00 |
| Pexels API | Free | Free | $0.00 | $0.00 |
| **Total** | | | **$44.95/mo** | **$539.40/yr** |

### Recommended Stable Configuration
| Service | Plan | Monthly Cost | Annual Cost |
|---------|------|--------------|-------------|
| SendGrid | Essentials (50K emails/mo) | $19.95 | $239.40 |
| Render Backend | Standard (2GB RAM) | $25.00 | $300.00 |
| Render Frontend | Free | $0.00 | $0.00 |
| Supabase | Pro (60 connections, backups) | $25.00 | $300.00 |
| Monitoring | Sentry (5K errors/mo) | $0.00 | $0.00 |
| **Total** | | **$69.95/mo** | **$839.40/yr** |

### Enterprise-Ready Configuration
| Service | Plan | Monthly Cost | Annual Cost |
|---------|------|--------------|-------------|
| SendGrid | Pro (100K emails/mo) | $89.95 | $1,079.40 |
| Render Backend | Pro (4GB RAM, autoscale) | $85.00 | $1,020.00 |
| Render Frontend | Standard (CDN, custom headers) | $25.00 | $300.00 |
| Supabase | Team (120 connections, SLA) | $599.00 | $7,188.00 |
| Redis | Upstash (rate limiting) | $10.00 | $120.00 |
| Monitoring | Sentry Standard | $26.00 | $312.00 |
| CDN | Cloudflare Pro | $20.00 | $240.00 |
| **Total** | | **$854.95/mo** | **$10,259.40/yr** |

---

## Implementation Checklist

### Pre-Launch (Day Before)
- [ ] All manual verification sections completed above
- [ ] SendGrid upgraded and tested
- [ ] Gunicorn configuration optimized
- [ ] Rate limiting relaxed or disabled
- [ ] All quest/badge images pre-generated
- [ ] Environment variables verified in Render dashboard
- [ ] Custom domain SSL certificate active
- [ ] Test user flows (signup, login, quest start/complete)
- [ ] Database backup taken manually
- [ ] On-call contact information distributed

### Launch Day
- [ ] Monitor Render logs every 30 minutes
- [ ] Check Supabase connection usage every hour
- [ ] Monitor SendGrid email delivery rate
- [ ] Watch for error spikes in application logs
- [ ] Be ready to upgrade services mid-day if needed
- [ ] Have credit card info ready for emergency upgrades

### Post-Launch (First Week)
- [ ] Review error logs daily
- [ ] Monitor user signup conversion rate
- [ ] Check database growth rate
- [ ] Analyze performance metrics
- [ ] Schedule load testing if not done pre-launch
- [ ] Plan Supabase upgrade if nearing limits
- [ ] Consider implementing Redis rate limiting
- [ ] Review cost vs. budget

---

## Emergency Contacts

**Service Provider Support:**
- Render Support: https://render.com/support (email: support@render.com)
- Supabase Support: https://supabase.com/support (Discord: https://discord.supabase.com)
- SendGrid Support: https://support.sendgrid.com
- Stripe Support: https://support.stripe.com

**Internal Team:**
- Primary Contact: _________________________________
- Secondary Contact: _________________________________
- Escalation Path: _________________________________

---

## Notes & Observations

**Date:** _________________
**Who Completed This:** _________________________________

**Additional Notes:**

---

## Next Steps After Completing This Checklist

1. Share this document with your team
2. Schedule a "Launch Readiness Review" meeting
3. Make upgrade decisions based on budget and expected traffic
4. Implement critical action items (SendGrid, Gunicorn, rate limiting)
5. Run load tests to validate capacity
6. Create a launch day monitoring plan
7. Set up on-call rotation
8. Draft incident response procedures

**Ready to Launch?** ☐ Yes  ☐ No - Needs work on: _________________________________
