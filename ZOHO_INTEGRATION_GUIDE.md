# Zoho CRM Integration Implementation Guide
**Optio Education Platform**
**Created**: January 2025
**Status**: Planning Phase

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Phase 1: Foundation Setup](#phase-1-foundation-setup)
3. [Phase 2: Core Integration](#phase-2-core-integration)
4. [Phase 3: Email Migration](#phase-3-email-migration)
5. [Phase 4: Monitoring & Optimization](#phase-4-monitoring--optimization)
6. [Technical Architecture](#technical-architecture)
7. [Code Implementation Examples](#code-implementation-examples)
8. [Environment Variables](#environment-variables)
9. [Testing Checklist](#testing-checklist)
10. [Troubleshooting Guide](#troubleshooting-guide)
11. [How to Use This Guide with Claude Code](#how-to-use-this-guide-with-claude-code)

---

## Project Overview

### Goals
Integrate Zoho CRM with Optio to:
- Track user lifecycle and engagement metrics
- Replace SendGrid with ZeptoMail (cost-effective transactional email)
- Enable marketing automation and customer relationship management
- Provide admin dashboard visibility into user activity

### Business Value
- **Cost Neutral**: $15/mo (same as current SendGrid cost)
- **CRM Capabilities**: User lifecycle tracking, engagement scoring, automated workflows
- **Better Email Deliverability**: Separate transactional (ZeptoMail) from marketing emails
- **Scalability**: Support 10,000+ users with bulk API optimization

### Integration Pattern
**Hybrid Approach**: Real-time webhooks + Batch sync + Celery queue
- Real-time: User signup, quest completion, badge earned → immediate sync
- Batch: Daily activity rollups → bulk API (1 credit for 25k records)
- Queue: Celery + Redis for async processing with retry logic

### Timeline
**6 weeks total** (can be compressed to 4 weeks with focused effort)

### Success Metrics
- [ ] Sync success rate >99%
- [ ] Real-time sync latency <2s
- [ ] Batch sync latency <5min
- [ ] API credit usage <4,000/day (80% of Standard plan limit)
- [ ] Email deliverability ≥95%

---

## Phase 1: Foundation Setup
**Timeline**: Week 1-2
**Goal**: Establish Zoho CRM account, OAuth authentication, and backend infrastructure

### 1.1 Zoho CRM Account Setup
- [ ] Create Zoho CRM account at https://www.zoho.com/crm/signup.html
  - Choose **Standard plan** ($14/user/month)
  - Use optioeducation.com email for account
  - Select **US data center** (or closest to your users)
- [ ] Verify account and complete initial setup wizard
- [ ] Enable **API access** in Settings → Developer Space → API Access

### 1.2 Custom Fields Configuration
Create custom fields on the **Contacts** module:

#### User Identity Fields
- [ ] Create custom field: `External_ID__c` (Text, 255 chars, Unique)
  - Purpose: Store Optio user UUID for deduplication
  - Settings → Modules → Contacts → Custom Fields → Add Field
- [ ] Create custom field: `Display_Name__c` (Text, 100 chars)
- [ ] Create custom field: `User_Type__c` (Picklist)
  - Values: Student, Parent, Advisor, Admin, Observer
- [ ] Create custom field: `Signup_Date__c` (Date)

#### Engagement Fields
- [ ] Create custom field: `Total_XP__c` (Number, 0 decimals)
- [ ] Create custom field: `Level__c` (Text, 50 chars)
  - Values: Explorer, Builder, Creator, Scholar, Sage
- [ ] Create custom field: `Active_Quests__c` (Number, 0 decimals)
- [ ] Create custom field: `Completed_Quests__c` (Number, 0 decimals)
- [ ] Create custom field: `Tasks_Completed__c` (Number, 0 decimals)
- [ ] Create custom field: `Badges_Earned__c` (Number, 0 decimals)
- [ ] Create custom field: `Current_Streak__c` (Number, 0 decimals)

#### Pillar XP Fields
- [ ] Create custom field: `XP_STEM__c` (Number, 0 decimals)
- [ ] Create custom field: `XP_Wellness__c` (Number, 0 decimals)
- [ ] Create custom field: `XP_Communication__c` (Number, 0 decimals)
- [ ] Create custom field: `XP_Civics__c` (Number, 0 decimals)
- [ ] Create custom field: `XP_Art__c` (Number, 0 decimals)

#### Status Fields
- [ ] Create custom field: `Portfolio_URL__c` (URL, 255 chars)
- [ ] Create custom field: `Parent_Linked__c` (Boolean)
- [ ] Create custom field: `LMS_Platform__c` (Picklist)
  - Values: None, Canvas, Google Classroom, Schoology, Moodle

### 1.3 OAuth 2.0 App Setup
- [ ] Go to Zoho API Console: https://api-console.zoho.com/
- [ ] Click "Add Client" → Choose "Server-based Applications"
- [ ] Configure client:
  - Client Name: `Optio Education Platform`
  - Homepage URL: `https://www.optioeducation.com`
  - Authorized Redirect URI: `https://optio-prod-backend.onrender.com/api/zoho/oauth/callback`
  - (Add dev URI): `https://optio-dev-backend.onrender.com/api/zoho/oauth/callback`
- [ ] Copy **Client ID** and **Client Secret** → save to password manager
- [ ] Select scopes:
  - `ZohoCRM.modules.ALL` (read/write contacts, activities)
  - `ZohoCRM.settings.ALL` (read custom fields)
  - `ZohoCRM.bulk.ALL` (bulk read/write operations)

### 1.4 Generate Initial Refresh Token
**IMPORTANT**: This is a one-time manual process to get the refresh token.

- [ ] Generate authorization code:
  1. Open browser and visit (replace `{CLIENT_ID}` and `{REDIRECT_URI}`):
     ```
     https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.bulk.ALL&client_id={CLIENT_ID}&response_type=code&access_type=offline&redirect_uri={REDIRECT_URI}
     ```
  2. Authorize the app → copy the `code` from redirect URL
  3. Code expires in 60 seconds - use immediately

- [ ] Exchange code for refresh token using curl:
  ```bash
  curl -X POST https://accounts.zoho.com/oauth/v2/token \
    -d "code={AUTHORIZATION_CODE}" \
    -d "redirect_uri={REDIRECT_URI}" \
    -d "client_id={CLIENT_ID}" \
    -d "client_secret={CLIENT_SECRET}" \
    -d "grant_type=authorization_code"
  ```

- [ ] Extract `refresh_token` from response → save to password manager
  - **CRITICAL**: This refresh token never expires (until revoked)
  - Store securely - it's equivalent to a password

### 1.5 Backend Infrastructure Setup

#### Install Dependencies
- [ ] Add to root `requirements.txt`:
  ```
  # Zoho CRM Integration
  zohocrmsdk3-0==3.0.0
  celery==5.3.6
  redis==5.0.1
  backoff==2.2.1
  ```

- [ ] Update Render environment (or run locally):
  ```bash
  pip install -r requirements.txt
  ```

#### Create Directory Structure
- [ ] Create directory: `backend/services/zoho/`
- [ ] Create file: `backend/services/zoho/__init__.py`
- [ ] Create directory: `backend/routes/webhooks/`
- [ ] Create file: `backend/routes/webhooks/__init__.py`
- [ ] Create directory: `backend/tasks/`
- [ ] Create file: `backend/tasks/__init__.py`
- [ ] Create directory: `backend/config/`
- [ ] Create file: `backend/config/zoho_config.py`

#### Set Up Redis (Local Development)
- [ ] Install Redis:
  - **Windows**: Download from https://github.com/microsoftarchive/redis/releases
  - **Mac**: `brew install redis`
  - **Linux**: `sudo apt-get install redis-server`
- [ ] Start Redis server: `redis-server`
- [ ] Verify Redis is running: `redis-cli ping` (should return "PONG")

#### Set Up Celery
- [ ] Create Celery app configuration in `backend/tasks/__init__.py`
- [ ] Test Celery worker: `celery -A backend.tasks worker --loglevel=info`

---

## Phase 2: Core Integration
**Timeline**: Week 3-4
**Goal**: Implement sync services, webhooks, and Celery tasks for real-time + batch sync

### 2.1 Zoho Configuration Service
- [ ] Create `backend/config/zoho_config.py`
  - Define Zoho API endpoints
  - Set up data center URLs (US/EU/IN/CN/AU)
  - Configure retry settings (max attempts, backoff multiplier)
  - Define API credit limits by plan

### 2.2 Zoho Auth Service
- [ ] Create `backend/services/zoho/zoho_auth_service.py`
  - Implement `ZohoAuthService` class extending `BaseService`
  - Method: `get_access_token()` - fetch/refresh access token
  - Method: `refresh_access_token()` - exchange refresh token for new access token
  - Method: `store_tokens()` - securely store tokens in database (encrypted)
  - Method: `is_token_expired()` - check if access token needs refresh
  - Add auto-refresh logic (tokens expire every 1 hour)
  - Store tokens in `admin_settings` table or new `zoho_tokens` table

### 2.3 Zoho Transform Service
- [ ] Create `backend/services/zoho/zoho_transform_service.py`
  - Implement `ZohoTransformService` class extending `BaseService`
  - Method: `user_to_contact(user: Dict) -> Dict` - transform Optio user to Zoho Contact
  - Method: `quest_completion_to_activity(completion: Dict) -> Dict` - transform to Activity
  - Method: `badge_earned_to_note(badge: Dict) -> Dict` - transform to Note
  - Add pillar mapping constants (stem → STEM, wellness → Wellness, etc.)
  - Add role mapping constants (student → Student, parent → Parent, etc.)
  - Handle null values and data validation

### 2.4 Zoho Sync Service
- [ ] Create `backend/services/zoho/zoho_sync_service.py`
  - Implement `ZohoSyncService` class extending `BaseService`
  - Method: `sync_user_to_crm(user_id: str)` - sync single user
  - Method: `batch_sync_users(user_ids: List[str])` - bulk sync multiple users
  - Method: `sync_quest_completion(completion_id: str)` - sync quest completion as Activity
  - Method: `sync_badge_earned(user_id: str, badge_id: str)` - sync badge as Note
  - Add exponential backoff retry using `@backoff.on_exception` decorator
  - Handle rate limiting (429 status code with Retry-After header)
  - Implement upsert logic using `External_ID__c` as duplicate check field

### 2.5 Zoho Credit Tracker
- [ ] Create `backend/services/zoho/zoho_credit_tracker.py`
  - Implement `ZohoCreditTracker` class extending `BaseService`
  - Method: `consume_credit(credits: int)` - track credit usage in Redis
  - Method: `get_remaining_credits()` - fetch remaining credits for today
  - Method: `reset_daily_credits()` - reset counter at midnight UTC
  - Add threshold alerts (90% usage warning)
  - Raise `ZohoCRMRateLimitError` if daily limit exceeded

### 2.6 Celery Tasks
- [ ] Create `backend/tasks/zoho_tasks.py`
  - Task: `async_sync_user(user_id: str)` - async user sync
  - Task: `async_sync_quest_completion(completion_id: str)` - async quest completion sync
  - Task: `async_sync_badge_earned(user_id: str, badge_id: str)` - async badge sync
  - Task: `batch_sync_all_users()` - nightly batch sync for all users
  - Task: `reconcile_zoho_data()` - data consistency check
  - Configure Celery beat schedule for recurring tasks (daily at 2 AM UTC)

### 2.7 Webhook Endpoints
- [ ] Create `backend/routes/webhooks/zoho_webhooks.py`
  - Endpoint: `POST /api/webhooks/zoho/user-signup` - trigger user sync on signup
  - Endpoint: `POST /api/webhooks/zoho/quest-complete` - trigger quest completion sync
  - Endpoint: `POST /api/webhooks/zoho/badge-earned` - trigger badge sync
  - Add CSRF exemption for webhooks (use secret token validation instead)
  - Add request signature verification
  - Return 200 OK immediately, enqueue Celery task

### 2.8 Integration Points in Existing Routes
- [ ] Modify `backend/routes/auth.py`:
  - Add Celery task queue in `register()` after user creation
  - Queue: `async_sync_user.delay(user_id)`

- [ ] Modify `backend/routes/quests.py`:
  - Add Celery task queue in quest completion endpoint
  - Queue: `async_sync_quest_completion.delay(completion_id)`

- [ ] Modify `backend/services/badge_service.py`:
  - Add Celery task queue in `award_badge()` method
  - Queue: `async_sync_badge_earned.delay(user_id, badge_id)`

### 2.9 Database Schema Updates
- [ ] Create migration: `zoho_integration_tables.sql`
  - Table: `zoho_tokens` (store OAuth tokens)
    - `id` (UUID, PK)
    - `access_token` (TEXT, encrypted)
    - `refresh_token` (TEXT, encrypted)
    - `expires_at` (TIMESTAMP)
    - `created_at`, `updated_at`
  - Table: `zoho_sync_log` (audit trail)
    - `id` (UUID, PK)
    - `user_id` (UUID, FK to users, nullable)
    - `sync_type` (TEXT: user_sync, quest_completion, badge_earned, batch_sync)
    - `status` (TEXT: success, failed, retrying)
    - `zoho_record_id` (TEXT, nullable)
    - `error_message` (TEXT, nullable)
    - `attempts` (INTEGER, default 0)
    - `synced_at` (TIMESTAMP)
    - `created_at`

- [ ] Apply migration to Supabase database

### 2.10 One-Time User Migration
- [ ] Create script: `backend/scripts/migrate_users_to_zoho.py`
  - Fetch all existing users from Supabase
  - Transform to Zoho Contact format
  - Batch sync in chunks of 100 (to stay within rate limits)
  - Log results to `zoho_sync_log` table
  - Run script: `python backend/scripts/migrate_users_to_zoho.py`

---

## Phase 3: Email Migration
**Timeline**: Week 5
**Goal**: Replace SendGrid with ZeptoMail for transactional emails + CRM logging

### 3.1 ZeptoMail Account Setup
- [ ] Create ZeptoMail account at https://www.zoho.com/zeptomail/
- [ ] Verify domain: optioeducation.com
  - Add SPF, DKIM, and DMARC DNS records
  - Wait for verification (can take up to 48 hours)
- [ ] Create Mail Agent: "Optio Transactional Emails"
- [ ] Generate Send Mail Token → save to password manager

### 3.2 ZeptoMail Service Implementation
- [ ] Create `backend/services/zoho/zeptomail_service.py`
  - Implement `ZeptoMailService` class extending `BaseService`
  - Method: `send_email(to: str, subject: str, html_body: str, from_name: str)`
  - Method: `send_template_email(to: str, template_id: str, variables: Dict)`
  - Add retry logic with backoff
  - Log all sent emails to `zoho_sync_log` table

### 3.3 Email Templates Migration
- [ ] Audit existing email templates in `backend/services/email_service.py`:
  - Welcome email
  - Password reset email
  - Quest completion notification
  - Badge earned notification
  - Parent invitation email
  - LMS integration notification

- [ ] Create ZeptoMail templates (optional - can use HTML directly):
  - Go to ZeptoMail → Templates → Create Template
  - Migrate each template HTML from SendGrid format
  - Test variable substitution

### 3.4 Update Email Service
- [ ] Modify `backend/services/email_service.py`:
  - Add conditional logic: if `USE_ZEPTOMAIL=true`, use `ZeptoMailService`, else use SendGrid
  - Replace SMTP calls with ZeptoMail REST API calls
  - Keep SendGrid as fallback during transition period
  - Add logging for email delivery status

### 3.5 CRM Email Logging
- [ ] Enable ZeptoMail → Zoho CRM integration:
  - Go to ZeptoMail → Settings → Integrations
  - Connect to Zoho CRM account
  - Enable "Log emails in CRM"
  - Configure: Log all transactional emails to Contact timeline

### 3.6 Testing
- [ ] Test each email type with ZeptoMail:
  - [ ] Welcome email (new user signup)
  - [ ] Password reset email
  - [ ] Quest completion notification
  - [ ] Badge earned notification
  - [ ] Parent invitation email
  - [ ] LMS integration notification

- [ ] Verify emails appear in Zoho CRM Contact timeline
- [ ] Check deliverability rates in ZeptoMail dashboard

### 3.7 Production Cutover
- [ ] **Week 5, Day 1-3**: Parallel run (send via both SendGrid and ZeptoMail)
- [ ] **Week 5, Day 4**: Monitor deliverability metrics (target >95%)
- [ ] **Week 5, Day 5**: If metrics pass, switch `USE_ZEPTOMAIL=true` in production
- [ ] **Week 5, Day 6-7**: Monitor for issues, rollback to SendGrid if needed
- [ ] **Week 6**: If stable, cancel SendGrid subscription

---

## Phase 4: Monitoring & Optimization
**Timeline**: Week 6+
**Goal**: Add admin dashboard visibility, alerts, and performance optimization

### 4.1 Admin Dashboard - Zoho Sync Panel
- [ ] Create component: `frontend/src/components/admin/ZohoSyncPanel.jsx`
  - Display API credit usage (daily limit and current usage)
  - Show sync queue depth (pending tasks in Celery)
  - Display recent sync activity (success/failed/retrying)
  - Show failed sync errors with retry button

- [ ] Create API endpoint: `GET /api/admin/zoho/sync-status`
  - Return: API credit usage, queue depth, recent sync log
  - Restrict to admin role only

- [ ] Add panel to `frontend/src/pages/AdminPage.jsx`

### 4.2 Sync Monitoring & Alerts
- [ ] Create alert service: `backend/services/zoho/zoho_alert_service.py`
  - Method: `check_credit_usage()` - alert if >90% of daily limit
  - Method: `check_failed_syncs()` - alert if >10 failed syncs in last hour
  - Method: `check_queue_depth()` - alert if queue depth >100
  - Send alerts via email (to admin) or Slack webhook

- [ ] Create Celery beat task: `monitor_zoho_health()`
  - Runs every 15 minutes
  - Calls alert service methods
  - Logs to `zoho_sync_log` table

### 4.3 Data Reconciliation Job
- [ ] Create script: `backend/scripts/reconcile_zoho_data.py`
  - Fetch all users from Supabase
  - Fetch all contacts from Zoho CRM (using External_ID__c)
  - Compare data for discrepancies:
    - Users in Optio but not in Zoho
    - Users with mismatched XP or quest counts
  - Generate reconciliation report
  - Auto-sync discrepancies if delta is small (<5%)

- [ ] Create Celery beat task: `reconcile_zoho_data()`
  - Runs daily at 3 AM UTC
  - Emails report to admin

### 4.4 Performance Optimization
- [ ] Implement batch aggregation buffer:
  - Collect events for 5 minutes in Redis
  - Flush buffer every 5 minutes via Celery beat
  - Use Zoho Bulk Write API (1 credit for 100 records)

- [ ] Add database indexes for sync queries:
  ```sql
  CREATE INDEX idx_zoho_sync_log_user_id ON zoho_sync_log(user_id);
  CREATE INDEX idx_zoho_sync_log_status ON zoho_sync_log(status);
  CREATE INDEX idx_zoho_sync_log_created_at ON zoho_sync_log(created_at);
  ```

- [ ] Optimize Celery worker scaling:
  - Use Celery autoscaler: `celery -A backend.tasks worker --autoscale=10,3`
  - 3 workers minimum, scale up to 10 based on queue depth

### 4.5 Documentation
- [ ] Update `CLAUDE.md`:
  - Add Zoho CRM integration section
  - Document new services and routes
  - Add environment variables

- [ ] Create `docs/ZOHO_INTEGRATION.md`:
  - Architecture overview
  - Data flow diagrams
  - Troubleshooting guide
  - API endpoints reference

- [ ] Create runbook: `docs/ZOHO_RUNBOOK.md`:
  - How to regenerate OAuth refresh token
  - How to manually trigger sync for a user
  - How to handle API rate limit errors
  - How to roll back to SendGrid

---

## Technical Architecture

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Optio Events                            │
│  (User Signup, Quest Completion, Badge Earned, Daily Rollup)   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            v
                ┌───────────────────────┐
                │   Flask Endpoint      │
                │  (auth.py, quests.py) │
                └───────────┬───────────┘
                            │
                            v
                ┌───────────────────────┐
                │   Celery Queue        │
                │  (Redis Broker)       │
                └───────────┬───────────┘
                            │
                            v
         ┌──────────────────┴──────────────────┐
         │                                     │
         v                                     v
┌────────────────────┐              ┌────────────────────┐
│  Celery Worker 1   │              │  Celery Worker 2   │
│  (async_sync_user) │              │ (batch_sync_users) │
└─────────┬──────────┘              └─────────┬──────────┘
          │                                   │
          v                                   v
┌─────────────────────────────────────────────────────────┐
│              ZohoSyncService                            │
│  - Fetch user data from Supabase                        │
│  - Transform via ZohoTransformService                   │
│  - Authenticate via ZohoAuthService                     │
│  - Track credits via ZohoCreditTracker                  │
└─────────────────────────────┬───────────────────────────┘
                              │
                              v
                  ┌───────────────────────┐
                  │   Zoho CRM API        │
                  │  (Upsert Contact)     │
                  └───────────────────────┘
```

### Service Layer Architecture

All Zoho services extend `BaseService` for consistent error handling and retry logic:

```
BaseService (backend/services/base_service.py)
    │
    ├── ZohoAuthService
    │   └── Manages OAuth tokens (access + refresh)
    │
    ├── ZohoTransformService
    │   └── Transforms Optio data models to Zoho schema
    │
    ├── ZohoSyncService
    │   └── Orchestrates sync operations
    │
    ├── ZohoCreditTracker
    │   └── Tracks API credit usage
    │
    ├── ZeptoMailService
    │   └── Sends transactional emails
    │
    └── ZohoAlertService
        └── Monitors health and sends alerts
```

### Database Schema

#### `zoho_tokens` Table
```sql
CREATE TABLE zoho_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    access_token TEXT NOT NULL,          -- Encrypted
    refresh_token TEXT NOT NULL,         -- Encrypted
    expires_at TIMESTAMP NOT NULL,       -- Access token expiry
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `zoho_sync_log` Table
```sql
CREATE TABLE zoho_sync_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),   -- Nullable for batch operations
    sync_type TEXT NOT NULL,             -- user_sync, quest_completion, badge_earned, batch_sync
    status TEXT NOT NULL,                -- success, failed, retrying
    zoho_record_id TEXT,                 -- Zoho CRM record ID
    error_message TEXT,                  -- Error details if failed
    attempts INTEGER DEFAULT 0,          -- Retry count
    synced_at TIMESTAMP,                 -- When sync completed
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_zoho_sync_log_user_id ON zoho_sync_log(user_id);
CREATE INDEX idx_zoho_sync_log_status ON zoho_sync_log(status);
CREATE INDEX idx_zoho_sync_log_created_at ON zoho_sync_log(created_at);
```

### API Rate Limit Strategy

**Zoho CRM Standard Plan**: 5,000 API credits/day

**Credit Consumption**:
- Single record CRUD: 1 credit
- Bulk write (up to 100 records): 1 credit
- Bulk read (up to 200 records per page): 1 credit

**Optimization Strategy**:
1. **Real-time events** (signup, quest complete): Immediate sync (1 credit each)
2. **Batch aggregation**: Collect updates for 5 minutes → bulk write (1 credit for 100 records)
3. **Nightly rollup**: Single bulk write for all users (1 credit per 100 users)

**Daily Credit Budget**:
- New signups: ~10/day = 10 credits
- Quest completions: ~330/day → batch to ~4 bulk writes = 4 credits
- Badge earned: ~20/day = 20 credits
- Nightly rollup: 1,000 users → 10 bulk writes = 10 credits
- **Total**: ~50 credits/day (1% of 5,000 limit)

**Buffer**: 4,950 credits/day remaining for growth

---

## Code Implementation Examples

### Example 1: ZohoAuthService

```python
# backend/services/zoho/zoho_auth_service.py
import os
import requests
from datetime import datetime, timedelta
from services.base_service import BaseService, ServiceError
from utils.logger import get_logger
from backend.database import get_supabase_admin_client

logger = get_logger(__name__)

class ZohoAuthService(BaseService):
    """Manages Zoho CRM OAuth authentication and token refresh"""

    TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token"
    TOKEN_EXPIRY_BUFFER = 300  # Refresh 5 minutes before expiry

    def __init__(self):
        super().__init__()
        self.client_id = os.getenv('ZOHO_CLIENT_ID')
        self.client_secret = os.getenv('ZOHO_CLIENT_SECRET')
        self.refresh_token = os.getenv('ZOHO_REFRESH_TOKEN')

        if not all([self.client_id, self.client_secret, self.refresh_token]):
            raise ServiceError("Missing required Zoho OAuth credentials in environment")

    def get_access_token(self) -> str:
        """
        Get valid access token, refreshing if needed.
        Returns cached token if still valid.
        """
        return self.execute(
            operation=self._get_or_refresh_token,
            operation_name="get_access_token",
            retries=3,
            retry_delay=2.0
        )

    def _get_or_refresh_token(self) -> str:
        """Internal method to fetch or refresh token"""
        # Check if we have a valid cached token
        token_data = self._fetch_token_from_db()

        if token_data:
            expires_at = token_data['expires_at']
            if datetime.now() < expires_at - timedelta(seconds=self.TOKEN_EXPIRY_BUFFER):
                logger.info("Using cached Zoho access token")
                return token_data['access_token']

        # Token expired or not found - refresh it
        logger.info("Refreshing Zoho access token")
        return self._refresh_access_token()

    def _refresh_access_token(self) -> str:
        """Exchange refresh token for new access token"""
        payload = {
            'refresh_token': self.refresh_token,
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'grant_type': 'refresh_token'
        }

        response = requests.post(self.TOKEN_URL, data=payload)
        response.raise_for_status()

        data = response.json()

        if 'error' in data:
            raise ServiceError(f"Zoho token refresh failed: {data['error']}")

        access_token = data['access_token']
        expires_in = data.get('expires_in', 3600)  # Default 1 hour
        expires_at = datetime.now() + timedelta(seconds=expires_in)

        # Store new token in database
        self._store_token_in_db(access_token, expires_at)

        logger.info(f"Zoho access token refreshed, expires at {expires_at}")
        return access_token

    def _fetch_token_from_db(self):
        """Fetch token from database"""
        result = self.supabase.table('zoho_tokens').select('*').order('created_at', desc=True).limit(1).execute()

        if result.data:
            return result.data[0]
        return None

    def _store_token_in_db(self, access_token: str, expires_at: datetime):
        """Store token in database (encrypted)"""
        # TODO: Add encryption for access_token before storing
        self.supabase.table('zoho_tokens').insert({
            'access_token': access_token,
            'refresh_token': self.refresh_token,  # Store refresh token for reference
            'expires_at': expires_at.isoformat()
        }).execute()
```

### Example 2: ZohoTransformService

```python
# backend/services/zoho/zoho_transform_service.py
from typing import Dict, Optional
from services.base_service import BaseService
from datetime import datetime

class ZohoTransformService(BaseService):
    """Transform Optio data models to Zoho CRM schema"""

    PILLAR_TO_ZOHO = {
        'stem': 'STEM',
        'wellness': 'Wellness',
        'communication': 'Communication',
        'civics': 'Civics',
        'art': 'Art'
    }

    ROLE_TO_ZOHO = {
        'student': 'Student',
        'parent': 'Parent',
        'advisor': 'Advisor',
        'admin': 'Admin',
        'observer': 'Observer'
    }

    def user_to_contact(self, user: Dict) -> Dict:
        """
        Transform Optio user to Zoho Contact format.

        Args:
            user: User dict from Supabase users table

        Returns:
            Dict formatted for Zoho CRM Contacts API
        """
        # Fetch additional engagement data
        active_quests = self._count_active_quests(user['id'])
        completed_quests = self._count_completed_quests(user['id'])
        xp_by_pillar = self._get_xp_by_pillar(user['id'])

        contact = {
            # Standard fields
            "Email": user.get('email'),
            "First_Name": user.get('first_name', ''),
            "Last_Name": user.get('last_name', 'Unknown'),
            "Description": user.get('bio', ''),

            # Custom fields
            "External_ID__c": user['id'],  # UUID for deduplication
            "Display_Name__c": user.get('display_name', ''),
            "User_Type__c": self.ROLE_TO_ZOHO.get(user.get('role', 'student'), 'Student'),
            "Signup_Date__c": self._format_date(user.get('created_at')),
            "Total_XP__c": user.get('total_xp', 0),
            "Level__c": user.get('level', 'Explorer'),
            "Portfolio_URL__c": f"https://www.optioeducation.com/diploma/{user['id']}",
            "Last_Activity_Date": self._format_datetime(user.get('last_active')),

            # Engagement metrics
            "Active_Quests__c": active_quests,
            "Completed_Quests__c": completed_quests,
            "Badges_Earned__c": user.get('achievements_count', 0),
            "Current_Streak__c": user.get('streak_days', 0),

            # Pillar XP
            "XP_STEM__c": xp_by_pillar.get('stem', 0),
            "XP_Wellness__c": xp_by_pillar.get('wellness', 0),
            "XP_Communication__c": xp_by_pillar.get('communication', 0),
            "XP_Civics__c": xp_by_pillar.get('civics', 0),
            "XP_Art__c": xp_by_pillar.get('art', 0),
        }

        # Remove None values
        return {k: v for k, v in contact.items() if v is not None}

    def quest_completion_to_activity(self, completion: Dict, quest: Dict, user: Dict) -> Dict:
        """
        Transform quest completion to Zoho Activity/Note.

        Args:
            completion: Quest completion dict
            quest: Quest dict
            user: User dict

        Returns:
            Dict formatted for Zoho CRM Activities API
        """
        return {
            "$se_module": "Contacts",  # Parent module
            "Parent_Id": user['id'],   # Link to Contact using External_ID__c
            "Activity_Type": "Quest Completed",
            "Subject": f"Completed: {quest['title']}",
            "Description": self._format_completion_description(completion, quest),
            "Activity_Date_Time": self._format_datetime(completion['completed_at']),

            # Custom fields
            "Event_Type__c": "Quest Completion",
            "XP_Earned__c": completion.get('xp_awarded', 0),
            "Quest_ID__c": quest['id'],
        }

    def _format_completion_description(self, completion: Dict, quest: Dict) -> str:
        """Format quest completion description for CRM"""
        lines = [
            f"**Quest**: {quest['title']}",
            f"**XP Earned**: {completion.get('xp_awarded', 0)}",
            f"**Evidence**: {completion.get('evidence_text', 'N/A')[:200]}",
        ]

        if completion.get('evidence_url'):
            lines.append(f"**Evidence URL**: {completion['evidence_url']}")

        return "\n".join(lines)

    def _count_active_quests(self, user_id: str) -> int:
        """Count active quests for user"""
        result = self.supabase.table('user_quests').select('id', count='exact').eq('user_id', user_id).eq('is_active', True).is_('completed_at', 'null').execute()
        return result.count or 0

    def _count_completed_quests(self, user_id: str) -> int:
        """Count completed quests for user"""
        result = self.supabase.table('user_quests').select('id', count='exact').eq('user_id', user_id).not_.is_('completed_at', 'null').execute()
        return result.count or 0

    def _get_xp_by_pillar(self, user_id: str) -> Dict[str, int]:
        """Get XP breakdown by pillar"""
        result = self.supabase.table('user_skill_xp').select('pillar, xp_amount').eq('user_id', user_id).execute()

        xp_map = {}
        for row in result.data:
            xp_map[row['pillar']] = row['xp_amount']

        return xp_map

    def _format_date(self, dt_str: Optional[str]) -> Optional[str]:
        """Format datetime string to YYYY-MM-DD"""
        if not dt_str:
            return None
        return dt_str[:10]  # Extract YYYY-MM-DD from ISO format

    def _format_datetime(self, dt_str: Optional[str]) -> Optional[str]:
        """Format datetime string to ISO 8601"""
        if not dt_str:
            return None
        # Ensure proper ISO 8601 format
        if 'T' in dt_str:
            return dt_str
        return f"{dt_str}T00:00:00Z"
```

### Example 3: ZohoSyncService

```python
# backend/services/zoho/zoho_sync_service.py
import requests
import backoff
from typing import Dict, List
from services.base_service import BaseService, ServiceError
from services.zoho.zoho_auth_service import ZohoAuthService
from services.zoho.zoho_transform_service import ZohoTransformService
from services.zoho.zoho_credit_tracker import ZohoCreditTracker
from utils.logger import get_logger

logger = get_logger(__name__)

class ZohoCRMRateLimitError(ServiceError):
    """Raised when Zoho API rate limit is exceeded"""
    pass

class ZohoSyncService(BaseService):
    """Orchestrates sync operations between Optio and Zoho CRM"""

    CRM_API_BASE = "https://www.zohoapis.com/crm/v3"

    def __init__(self):
        super().__init__()
        self.auth_service = ZohoAuthService()
        self.transform_service = ZohoTransformService()
        self.credit_tracker = ZohoCreditTracker()

    def sync_user_to_crm(self, user_id: str) -> Dict:
        """
        Sync single user to Zoho CRM Contacts.
        Uses upsert logic based on External_ID__c.

        Args:
            user_id: Optio user UUID

        Returns:
            Zoho API response with record ID
        """
        return self.execute(
            operation=lambda: self._perform_user_sync(user_id),
            operation_name="sync_user_to_crm",
            user_id=user_id,
            retries=5,
            retry_delay=2.0
        )

    def _perform_user_sync(self, user_id: str) -> Dict:
        """Internal method to perform user sync"""
        # Fetch user from Supabase
        user_result = self.supabase.table('users').select('*').eq('id', user_id).execute()

        if not user_result.data:
            raise ServiceError(f"User {user_id} not found in database")

        user = user_result.data[0]

        # Transform to Zoho format
        zoho_contact = self.transform_service.user_to_contact(user)

        # Upsert to Zoho CRM
        response = self._upsert_contact(zoho_contact)

        # Log to sync log table
        self._log_sync_event(
            user_id=user_id,
            sync_type='user_sync',
            status='success',
            zoho_record_id=response.get('id')
        )

        logger.info(f"Successfully synced user {user_id} to Zoho CRM")
        return response

    @backoff.on_exception(
        backoff.expo,
        (requests.exceptions.RequestException, ZohoCRMRateLimitError),
        max_tries=5,
        max_time=300,
        jitter=backoff.random_jitter,
        giveup=lambda e: isinstance(e, requests.exceptions.HTTPError) and 400 <= e.response.status_code < 500
    )
    def _upsert_contact(self, contact_data: Dict) -> Dict:
        """
        Upsert contact to Zoho CRM using External_ID__c as duplicate check.

        Args:
            contact_data: Contact dict in Zoho format

        Returns:
            Zoho API response
        """
        # Track credit usage
        self.credit_tracker.consume_credit(1)

        access_token = self.auth_service.get_access_token()

        headers = {
            "Authorization": f"Zoho-oauthtoken {access_token}",
            "Content-Type": "application/json"
        }

        payload = {
            "data": [contact_data],
            "duplicate_check_fields": ["External_ID__c"],  # Upsert based on External_ID__c
            "trigger": ["approval", "workflow", "blueprint"]
        }

        url = f"{self.CRM_API_BASE}/Contacts/upsert"
        response = requests.post(url, json=payload, headers=headers)

        # Handle rate limiting
        if response.status_code == 429:
            retry_after = int(response.headers.get('Retry-After', 60))
            logger.warning(f"Zoho API rate limited. Retry after {retry_after}s")
            raise ZohoCRMRateLimitError(f"Rate limited, retry after {retry_after}s")

        response.raise_for_status()
        result = response.json()

        if result.get('data'):
            return result['data'][0]['details']

        raise ServiceError(f"Zoho upsert failed: {result}")

    def batch_sync_users(self, user_ids: List[str]) -> Dict:
        """
        Bulk sync multiple users using Zoho Bulk Write API.
        Processes up to 25,000 records per call.

        Args:
            user_ids: List of user UUIDs to sync

        Returns:
            Dict with sync results
        """
        if len(user_ids) > 25000:
            # Split into chunks
            chunks = [user_ids[i:i+25000] for i in range(0, len(user_ids), 25000)]
            results = []
            for chunk in chunks:
                results.append(self._bulk_sync_chunk(chunk))
            return {"chunks_processed": len(chunks), "results": results}

        return self._bulk_sync_chunk(user_ids)

    def _bulk_sync_chunk(self, user_ids: List[str]) -> Dict:
        """Bulk sync a chunk of users (up to 25,000)"""
        # Fetch all users
        users_result = self.supabase.table('users').select('*').in_('id', user_ids).execute()

        if not users_result.data:
            raise ServiceError("No users found for bulk sync")

        # Transform all users
        contacts = [self.transform_service.user_to_contact(user) for user in users_result.data]

        # Use Zoho Bulk Write API
        access_token = self.auth_service.get_access_token()

        headers = {
            "Authorization": f"Zoho-oauthtoken {access_token}",
            "Content-Type": "application/json"
        }

        payload = {
            "operation": "insert",
            "resource": [
                {
                    "type": "data",
                    "module": "Contacts",
                    "field_mappings": [{"api_name": k} for k in contacts[0].keys()],
                    "data": contacts
                }
            ]
        }

        url = f"{self.CRM_API_BASE}/bulk/write"
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()

        # Track credit (1 credit for bulk operation)
        self.credit_tracker.consume_credit(1)

        result = response.json()
        logger.info(f"Bulk sync initiated for {len(user_ids)} users. Job ID: {result.get('id')}")

        return result

    def _log_sync_event(self, user_id: str, sync_type: str, status: str, zoho_record_id: str = None, error_message: str = None):
        """Log sync event to database"""
        self.supabase.table('zoho_sync_log').insert({
            'user_id': user_id,
            'sync_type': sync_type,
            'status': status,
            'zoho_record_id': zoho_record_id,
            'error_message': error_message,
            'synced_at': 'now()' if status == 'success' else None
        }).execute()
```

### Example 4: Celery Task

```python
# backend/tasks/zoho_tasks.py
from celery import Celery
from services.zoho.zoho_sync_service import ZohoSyncService
from utils.logger import get_logger
import os

logger = get_logger(__name__)

# Initialize Celery
celery_app = Celery(
    'zoho_sync',
    broker=os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
    backend=os.getenv('REDIS_URL', 'redis://localhost:6379/0')
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)

@celery_app.task(bind=True, max_retries=5)
def async_sync_user(self, user_id: str):
    """
    Async task to sync user to Zoho CRM.
    Retries up to 5 times with exponential backoff.

    Args:
        user_id: User UUID to sync
    """
    try:
        logger.info(f"[Celery] Starting sync for user {user_id}")
        sync_service = ZohoSyncService()
        result = sync_service.sync_user_to_crm(user_id)
        logger.info(f"[Celery] Successfully synced user {user_id}")
        return result
    except Exception as exc:
        logger.error(f"[Celery] Failed to sync user {user_id}: {exc}")
        # Retry with exponential backoff: 2^retry seconds
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)

@celery_app.task(bind=True, max_retries=5)
def async_sync_quest_completion(self, completion_id: str):
    """
    Async task to sync quest completion as Zoho CRM Activity.

    Args:
        completion_id: Quest completion UUID
    """
    try:
        logger.info(f"[Celery] Starting sync for quest completion {completion_id}")
        sync_service = ZohoSyncService()
        # TODO: Implement sync_quest_completion method in ZohoSyncService
        result = sync_service.sync_quest_completion(completion_id)
        logger.info(f"[Celery] Successfully synced quest completion {completion_id}")
        return result
    except Exception as exc:
        logger.error(f"[Celery] Failed to sync quest completion {completion_id}: {exc}")
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)

@celery_app.task
def batch_sync_all_users():
    """
    Scheduled task to batch sync all users nightly.
    Runs at 2 AM UTC via Celery Beat.
    """
    logger.info("[Celery] Starting nightly batch sync of all users")
    sync_service = ZohoSyncService()

    # Fetch all user IDs
    from backend.database import get_supabase_admin_client
    supabase = get_supabase_admin_client()
    result = supabase.table('users').select('id').execute()

    user_ids = [row['id'] for row in result.data]
    logger.info(f"[Celery] Batch syncing {len(user_ids)} users")

    sync_result = sync_service.batch_sync_users(user_ids)
    logger.info(f"[Celery] Batch sync completed: {sync_result}")

    return sync_result

# Celery Beat schedule (for periodic tasks)
celery_app.conf.beat_schedule = {
    'nightly-batch-sync': {
        'task': 'backend.tasks.zoho_tasks.batch_sync_all_users',
        'schedule': 3600.0 * 24,  # Every 24 hours
        'options': {'expires': 3600.0 * 2}  # Expire after 2 hours if not started
    },
}
```

### Example 5: Webhook Endpoint

```python
# backend/routes/webhooks/zoho_webhooks.py
from flask import Blueprint, request, jsonify
from tasks.zoho_tasks import async_sync_user, async_sync_quest_completion
from utils.logger import get_logger
import os

logger = get_logger(__name__)

zoho_webhooks_bp = Blueprint('zoho_webhooks', __name__, url_prefix='/api/webhooks/zoho')

# Webhook secret for validation (set in .env)
WEBHOOK_SECRET = os.getenv('ZOHO_WEBHOOK_SECRET', 'change-me-in-production')

def validate_webhook_signature(request):
    """Validate webhook request signature"""
    signature = request.headers.get('X-Zoho-Signature')
    if not signature or signature != WEBHOOK_SECRET:
        logger.warning(f"Invalid webhook signature from {request.remote_addr}")
        return False
    return True

@zoho_webhooks_bp.route('/user-signup', methods=['POST'])
def user_signup_webhook():
    """
    Webhook triggered on user signup.
    Enqueues Celery task to sync user to Zoho CRM.
    """
    if not validate_webhook_signature(request):
        return jsonify({"error": "Invalid signature"}), 403

    data = request.get_json()
    user_id = data.get('user_id')

    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400

    # Enqueue async task
    async_sync_user.delay(user_id)

    logger.info(f"Webhook: User signup for {user_id} - task enqueued")
    return jsonify({"status": "queued", "user_id": user_id}), 200

@zoho_webhooks_bp.route('/quest-complete', methods=['POST'])
def quest_complete_webhook():
    """
    Webhook triggered on quest completion.
    Enqueues Celery task to sync quest completion to Zoho CRM.
    """
    if not validate_webhook_signature(request):
        return jsonify({"error": "Invalid signature"}), 403

    data = request.get_json()
    completion_id = data.get('completion_id')

    if not completion_id:
        return jsonify({"error": "Missing completion_id"}), 400

    # Enqueue async task
    async_sync_quest_completion.delay(completion_id)

    logger.info(f"Webhook: Quest completion {completion_id} - task enqueued")
    return jsonify({"status": "queued", "completion_id": completion_id}), 200
```

---

## Environment Variables

### Required Environment Variables

Add these to your `.env` file (local development) and Render environment variables (production):

```bash
# Zoho CRM OAuth Credentials
ZOHO_CLIENT_ID=1000.XXXXXXXXXXXXXX
ZOHO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ZOHO_REFRESH_TOKEN=1000.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ZOHO_REDIRECT_URI=https://optio-prod-backend.onrender.com/api/zoho/oauth/callback

# Zoho API Configuration
ZOHO_DATA_CENTER=US  # Options: US, EU, IN, CN, AU
ZOHO_API_DOMAIN=https://www.zohoapis.com  # US domain

# ZeptoMail Configuration
ZEPTOMAIL_API_TOKEN=Zoho-enczapikey xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ZEPTOMAIL_FROM_EMAIL=noreply@optioeducation.com
ZEPTOMAIL_FROM_NAME=Optio Education

# Celery/Redis Configuration
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# Webhook Security
ZOHO_WEBHOOK_SECRET=your-random-secret-token-here

# Feature Flags
USE_ZEPTOMAIL=false  # Set to true after email migration complete
ZOHO_SYNC_ENABLED=true
```

### Environment-Specific Values

**Development (optio-dev-backend)**:
```bash
ZOHO_REDIRECT_URI=https://optio-dev-backend.onrender.com/api/zoho/oauth/callback
REDIS_URL=redis://red-xxxxx.render.com:6379  # Render Redis URL
```

**Production (optio-prod-backend)**:
```bash
ZOHO_REDIRECT_URI=https://optio-prod-backend.onrender.com/api/zoho/oauth/callback
REDIS_URL=redis://red-yyyyy.render.com:6379  # Render Redis URL
```

---

## Testing Checklist

### Phase 1 Testing
- [ ] Verify Zoho CRM account creation and API access enabled
- [ ] Confirm all custom fields created on Contacts module
- [ ] Test OAuth flow: Generate authorization code → Exchange for refresh token
- [ ] Verify refresh token stored securely and can generate access tokens
- [ ] Test Redis connection: `redis-cli ping` returns PONG
- [ ] Test Celery worker: Start worker and verify it connects to Redis
- [ ] Create test user in Supabase and verify data structure

### Phase 2 Testing
- [ ] Test `ZohoAuthService.get_access_token()` - should return valid token
- [ ] Test `ZohoAuthService._refresh_access_token()` - should refresh token successfully
- [ ] Test `ZohoTransformService.user_to_contact()` - verify data transformation
- [ ] Test `ZohoSyncService.sync_user_to_crm()` - sync test user to Zoho
- [ ] Verify test user appears in Zoho CRM Contacts with correct data
- [ ] Test duplicate sync - should update existing record, not create duplicate
- [ ] Test Celery task: `async_sync_user.delay(user_id)` - verify task executes
- [ ] Test webhook endpoint: POST to `/api/webhooks/zoho/user-signup` with test data
- [ ] Test batch sync: Create 10 test users, bulk sync to Zoho
- [ ] Test error handling: Sync with invalid user_id, verify error logged
- [ ] Test retry logic: Disconnect internet, verify task retries with backoff
- [ ] Test rate limit tracking: Verify `ZohoCreditTracker` increments usage

### Phase 3 Testing
- [ ] Test ZeptoMail API: Send test email via `ZeptoMailService`
- [ ] Verify email deliverability: Check inbox for test email
- [ ] Test all email templates:
  - [ ] Welcome email
  - [ ] Password reset email
  - [ ] Quest completion notification
  - [ ] Badge earned notification
  - [ ] Parent invitation email
- [ ] Verify emails appear in Zoho CRM Contact timeline (after CRM linking)
- [ ] Parallel run: Send via both SendGrid and ZeptoMail, compare deliverability
- [ ] Production cutover: Switch `USE_ZEPTOMAIL=true`, monitor for 48 hours

### Phase 4 Testing
- [ ] Test admin dashboard: Verify Zoho sync panel displays correct data
- [ ] Test API endpoint: `GET /api/admin/zoho/sync-status` returns expected data
- [ ] Test alerts: Trigger 90% credit usage, verify alert sent
- [ ] Test reconciliation job: Run `reconcile_zoho_data()`, verify report generated
- [ ] Load test: Simulate 100 concurrent user signups, verify queue handles load
- [ ] Monitor production metrics for 1 week:
  - Sync success rate should be >99%
  - Real-time sync latency <2s
  - No rate limit errors

---

## Troubleshooting Guide

### Issue 1: OAuth Refresh Token Invalid
**Symptoms**: `ZohoAuthService` fails with "invalid_token" error

**Causes**:
- Refresh token revoked in Zoho console
- Refresh token expired (should never expire unless revoked)
- Wrong data center (US token used with EU API)

**Solutions**:
1. Regenerate refresh token following steps in Phase 1.4
2. Verify `ZOHO_DATA_CENTER` matches your account region
3. Check if app was deleted/recreated in Zoho API Console

### Issue 2: Celery Tasks Not Executing
**Symptoms**: Tasks enqueued but never process

**Causes**:
- Celery worker not running
- Redis connection issue
- Worker crashed due to error

**Solutions**:
1. Check Celery worker is running: `ps aux | grep celery`
2. Restart worker: `celery -A backend.tasks worker --loglevel=info`
3. Check Redis connection: `redis-cli ping`
4. Check worker logs for errors: `tail -f /var/log/celery_worker.log`

### Issue 3: API Rate Limit Exceeded
**Symptoms**: `ZohoCRMRateLimitError` raised, 429 status code

**Causes**:
- Too many individual API calls (not using bulk API)
- Daily credit limit exceeded (5,000 for Standard plan)

**Solutions**:
1. Check credit usage in `ZohoCreditTracker`
2. Implement batch aggregation (collect events for 5 min, bulk sync)
3. Upgrade to Professional plan (15,000 credits/day)
4. Review sync logic - are you syncing the same user multiple times?

### Issue 4: Duplicate Contacts in Zoho CRM
**Symptoms**: Multiple contact records for same user

**Causes**:
- `External_ID__c` not set correctly
- Upsert not using `duplicate_check_fields`
- Manual contact creation in Zoho CRM

**Solutions**:
1. Verify `External_ID__c` is set in `user_to_contact()` transformation
2. Check upsert payload includes: `"duplicate_check_fields": ["External_ID__c"]`
3. Run reconciliation script to merge duplicates
4. Set Zoho CRM duplicate rules to prevent manual duplicates

### Issue 5: Emails Not Logged in CRM
**Symptoms**: ZeptoMail emails sent but not appearing in Zoho CRM timeline

**Causes**:
- ZeptoMail → CRM integration not enabled
- Email recipient not in CRM (no matching Contact)
- Integration delay (can take 5-10 minutes)

**Solutions**:
1. Check ZeptoMail → CRM integration in ZeptoMail settings
2. Verify recipient email matches a Contact in Zoho CRM
3. Wait 10 minutes and refresh CRM Contact page
4. Check ZeptoMail logs for integration errors

### Issue 6: Data Inconsistency (XP Mismatch)
**Symptoms**: XP in Optio doesn't match XP in Zoho CRM

**Causes**:
- Sync failed silently (error not logged)
- Race condition (XP updated after sync)
- Manual edit in Zoho CRM

**Solutions**:
1. Run reconciliation job: `python backend/scripts/reconcile_zoho_data.py`
2. Check `zoho_sync_log` table for failed syncs
3. Manually trigger sync for affected users: `async_sync_user.delay(user_id)`
4. Set up daily reconciliation job via Celery Beat

---

## How to Use This Guide with Claude Code

### Updating Checkboxes

**When you complete a task**, tell Claude Code:
```
Mark task "Create Zoho CRM account" as complete in ZOHO_INTEGRATION_GUIDE.md
```

Claude Code will change:
```markdown
- [ ] Create Zoho CRM account
```
to:
```markdown
- [x] Create Zoho CRM account
```

### Adding Notes to Completed Tasks

**When you want to add notes** about a completed task:
```
Add note to task "Create Zoho CRM account": "Used email tanner@optioeducation.com, account ID: 12345"
```

Claude Code will update:
```markdown
- [x] Create Zoho CRM account
  - **Note**: Used email tanner@optioeducation.com, account ID: 12345
```

### Marking Blocked Tasks

**If a task is blocked**:
```
Mark task "Test ZeptoMail API" as blocked: "Waiting for domain verification (48 hours)"
```

Claude Code will update:
```markdown
- [ ] Test ZeptoMail API
  - **BLOCKED**: Waiting for domain verification (48 hours)
```

### Adding New Tasks

**When you discover new tasks**:
```
Add new task to Phase 2 after "Create ZohoSyncService": "Add error handling for network timeouts"
```

Claude Code will insert:
```markdown
- [ ] Create `backend/services/zoho/zoho_sync_service.py`
- [ ] Add error handling for network timeouts  # <-- NEW
- [ ] Add webhook endpoints
```

### Viewing Progress

**To see current progress**:
```
Show progress summary for Phase 1 in ZOHO_INTEGRATION_GUIDE.md
```

Claude Code will respond:
```
Phase 1: Foundation Setup
- Total tasks: 25
- Completed: 18 (72%)
- Remaining: 7 (28%)
- Blocked: 2
```

### Tracking Issues

**To track issues encountered**:
```
Add issue to troubleshooting: "Celery worker crashes when Redis connection drops"
```

Claude Code will add a new entry to the Troubleshooting Guide section.

---

## Progress Tracking

### Overall Progress

**Phase 1: Foundation Setup**
- Total tasks: 32
- Completed: 0
- Remaining: 32
- Estimated time: 2 weeks

**Phase 2: Core Integration**
- Total tasks: 28
- Completed: 0
- Remaining: 28
- Estimated time: 2 weeks

**Phase 3: Email Migration**
- Total tasks: 17
- Completed: 0
- Remaining: 17
- Estimated time: 1 week

**Phase 4: Monitoring & Optimization**
- Total tasks: 15
- Completed: 0
- Remaining: 15
- Estimated time: 1+ weeks

**Grand Total**: 92 tasks, 0 completed (0%)

---

## Next Steps

1. **Review this guide** with your team
2. **Set up Zoho CRM account** (Phase 1.1)
3. **Configure OAuth credentials** (Phase 1.3-1.4)
4. **Start implementing services** (Phase 2)
5. **Update checkboxes** as you complete tasks

---

## Questions or Issues?

If you encounter any issues or have questions about this integration:

1. Check the Troubleshooting Guide section
2. Review Zoho CRM API documentation: https://www.zoho.com/crm/developer/docs/api/v3/
3. Ask Claude Code for help: "How do I fix [specific issue] in Zoho integration?"
4. Update this guide with new issues and solutions you discover

---

**Last Updated**: January 2025
**Document Version**: 1.0
**Status**: Ready for implementation
