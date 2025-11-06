# Spark Integration - Complete Technical Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Implementation Details](#implementation-details)
4. [API Reference](#api-reference)
5. [Database Schema](#database-schema)
6. [Security](#security)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)
9. [Deployment](#deployment)

---

## Overview

### What is the Spark Integration?

The Spark integration enables seamless connectivity between Spark LMS (Learning Management System) and the Optio education platform. When Spark students complete assignments in their LMS, the work automatically populates their Optio portfolio with zero additional effort from students.

### Value Proposition

**For Students:**
- Submit assignments once in Spark → evidence automatically appears in Optio portfolio
- Build impressive, shareable portfolios at `optioeducation.com/portfolio/[student-name]`
- Single Sign-On (SSO) for seamless access
- Professional presentation for employers, colleges, and family

**For Educators:**
- No duplicate data entry
- Automatic portfolio building for all students
- Easy integration with existing Spark workflow

### Key Features

1. **SSO Authentication** - Students click "View Portfolio" in Spark → automatically logged into Optio
2. **Webhook Integration** - Assignment submissions automatically sync to Optio
3. **File Support** - PDFs, images, videos, essays all supported
4. **XP System** - Students earn experience points across 5 skill pillars (STEM, Wellness, Communication, Civics, Art)
5. **Public Portfolios** - Resume-ready showcase of all completed work

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      SPARK LMS PLATFORM                          │
│                                                                   │
│  1. Student clicks "View Optio Portfolio"                        │
│     ↓                                                            │
│  2. Generate JWT token (HS256, 10-min expiry)                   │
│     ↓                                                            │
│  3. Redirect: optioeducation.com/spark/sso?token={jwt}          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      OPTIO PLATFORM                              │
│                                                                   │
│  4. Validate JWT signature                                       │
│     ↓                                                            │
│  5. Create/update user account                                   │
│     ↓                                                            │
│  6. Create auth session (httpOnly cookies + URL tokens)          │
│     ↓                                                            │
│  7. Redirect to dashboard                                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    ASSIGNMENT SUBMISSION FLOW                     │
│                                                                   │
│  1. Student submits assignment in Spark                          │
│     ↓                                                            │
│  2. Spark sends webhook POST to Optio                           │
│     - Includes submission text, files, metadata                  │
│     - HMAC-SHA256 signature for security                        │
│     ↓                                                            │
│  3. Optio validates HMAC signature                              │
│     ↓                                                            │
│  4. Download files to Supabase storage                          │
│     ↓                                                            │
│  5. Mark task complete, award XP                                │
│     ↓                                                            │
│  6. Evidence appears in student portfolio                        │
└─────────────────────────────────────────────────────────────────┘
```

### Component Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                          Frontend (React)                         │
│  - AuthCallback.jsx (handles OAuth token exchange)               │
│  - DiplomaPage.jsx (displays portfolio with evidence)            │
│  - DashboardPage.jsx (student dashboard after SSO)               │
└──────────────────────────────────────────────────────────────────┘
                              ↓ HTTP/REST
┌──────────────────────────────────────────────────────────────────┐
│                      Backend (Flask + Python)                     │
│                                                                   │
│  spark_integration.py:                                           │
│    - GET /spark/sso?token={jwt}         (SSO endpoint)          │
│    - POST /spark/webhook/submission     (webhook receiver)       │
│                                                                   │
│  Services:                                                        │
│    - XPService (awards XP when tasks complete)                   │
│    - BaseService (error handling, retry logic)                   │
└──────────────────────────────────────────────────────────────────┘
                              ↓ SQL
┌──────────────────────────────────────────────────────────────────┐
│                    Database (Supabase/PostgreSQL)                 │
│                                                                   │
│  Tables:                                                          │
│    - users (student accounts)                                    │
│    - lms_integrations (links Spark user IDs to Optio user IDs)  │
│    - quests (assignments with lms_assignment_id)                 │
│    - user_quest_tasks (per-student tasks)                        │
│    - quest_task_completions (completed tasks with evidence)      │
│    - evidence_document_blocks (file uploads)                     │
│    - user_skill_xp (XP tracking by pillar)                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### Backend Files

**Primary Implementation:**
- **`backend/routes/spark_integration.py`** (~300 lines)
  - SSO endpoint with JWT validation
  - Webhook endpoint with HMAC validation
  - User account creation/lookup
  - File download and upload to Supabase storage
  - Task completion and XP awarding

**Configuration:**
- **`backend/config/lms_platforms.py`** - Spark platform configuration

**Registration:**
- **`backend/main.py`** - Registers spark_integration blueprint

### Frontend Files

**SSO Callback Handler:**
- **`frontend/src/pages/AuthCallback.jsx`** - Handles OAuth authorization code exchange
  - Receives auth code from SSO redirect
  - Exchanges code for access/refresh tokens
  - Stores tokens in memory + localStorage
  - Redirects to dashboard using React Router (no page reload)

**Key Fix Applied (January 2025):**
```javascript
// BEFORE (broken - race condition):
window.location.href = '/dashboard'  // Forces full page reload

// AFTER (fixed):
navigate('/dashboard', { replace: true })  // Preserves in-memory tokens
```

### Database Schema

**No schema changes required** - uses existing tables:

**users table:**
```sql
- id (UUID, PK)
- display_name, first_name, last_name, email
- role (student/parent/advisor/admin/observer)
- portfolio_slug
```

**lms_integrations table:**
```sql
- id (UUID, PK)
- user_id (FK to users)
- lms_platform (e.g., 'spark')
- lms_user_id (Spark's user ID)
- sync_enabled (boolean)
```

**quests table:**
```sql
- id (UUID, PK)
- title, description
- quest_type (optio/course)
- lms_course_id (Spark course ID)
- lms_assignment_id (Spark assignment ID)
- lms_platform ('spark')
```

**user_quest_tasks table:**
```sql
- id (UUID, PK)
- user_id (FK to users)
- quest_id (FK to quests)
- title, description
- pillar (stem/wellness/communication/civics/art)
- xp_value (XP awarded on completion)
```

**quest_task_completions table:**
```sql
- id (UUID, PK)
- user_id, quest_id, task_id
- evidence_url, evidence_text
- completed_at
```

**evidence_document_blocks table:**
```sql
- id (UUID, PK)
- user_id
- task_completion_id
- file_name, file_type, file_size
- file_url (Supabase storage URL)
```

### Code Fixes Applied

**Fix #1: Schema Mismatch (Commit 60b500c - January 2025)**
- **Problem:** Webhook queried `user_quest_tasks.lms_assignment_id` but column only exists in `quests` table
- **Solution:** Updated query to search `quests` table first, then find user's tasks via join

**Fix #2: Missing Column (Commit dca649f - January 2025)**
- **Problem:** Code tried to insert `xp_awarded` into `quest_task_completions` but column doesn't exist
- **Solution:** Removed `xp_awarded` from insert (XP tracked separately via XPService in `user_skill_xp` table)

**Fix #3: SSO Redirect Race Condition (Commit 9c096f8 - January 2025)**
- **Problem:** `window.location.href` caused full page reload, clearing tokens before localStorage write completed
- **Solution:** Changed to React Router's `navigate()` to preserve in-memory token state

---

## API Reference

### SSO Endpoint

**Purpose:** Authenticate Spark users via JWT token and redirect to Optio dashboard

**URL:** `GET /spark/sso`

**Query Parameters:**
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| token | Yes | String | JWT signed with HS256 algorithm using shared secret |

**JWT Token Structure:**
```json
{
  "sub": "spark_user_123",          // Spark's internal user ID (required)
  "email": "student@example.com",   // Student's email (required)
  "given_name": "Sarah",            // First name (required)
  "family_name": "Johnson",         // Last name (required)
  "role": "student",                // Always "student" (required)
  "iat": 1234567890,                // Issued at Unix timestamp (required)
  "exp": 1234568490                 // Expiration timestamp (10 minutes) (required)
}
```

**Success Response:**
- **Status:** 302 Redirect
- **Location:** `{FRONTEND_URL}/auth/callback?code={auth_code}`
- **Description:** Redirects to OAuth callback with one-time authorization code

**OAuth Token Exchange:**
- Frontend exchanges code for tokens via `POST /spark/token`
- Returns `access_token` and `refresh_token`
- Frontend stores tokens and navigates to `/dashboard`

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | Missing token parameter | No token in query string |
| 401 | Token expired | Token past expiration time |
| 401 | Invalid token signature | Signature validation failed with shared secret |
| 500 | Failed to create user account | Database error during user creation |
| 503 | SSO not configured | Missing SPARK_SSO_SECRET environment variable |

**Example Request:**
```
GET /spark/sso?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Implementation Notes:**
- Token expiry enforced (10-minute window)
- User account created automatically if doesn't exist
- Email marked as confirmed for SSO users
- LMS integration record created linking Spark user ID to Optio user ID

---

### Webhook Endpoint

**Purpose:** Receive assignment submission notifications from Spark

**URL:** `POST /spark/webhook/submission`

**Headers:**
| Header | Required | Value |
|--------|----------|-------|
| Content-Type | Yes | application/json |
| X-Spark-Signature | Yes | HMAC-SHA256 hex digest of raw request body |

**HMAC Signature Calculation:**
```javascript
const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', OPTIO_WEBHOOK_SECRET)
  .update(JSON.stringify(payload))  // Raw request body
  .digest('hex');
```

**Request Body:**
```json
{
  "spark_user_id": "user_123",              // Spark's user ID (required)
  "spark_assignment_id": "assignment_456",  // Spark's assignment ID (required)
  "spark_course_id": "course_789",          // Spark's course ID (required)
  "submission_text": "Student essay...",    // Essay/text response (required)
  "submission_files": [                     // File attachments (optional)
    {
      "url": "https://spark-storage.com/temp/file.pdf?expires=...",
      "type": "application/pdf",
      "filename": "essay.pdf"
    }
  ],
  "submitted_at": "2025-01-15T14:30:00Z",  // ISO 8601 timestamp (required)
  "grade": 95.5                             // Numeric grade (optional)
}
```

**File URL Requirements:**
- **Publicly accessible** - No authentication required
- **Valid for 24+ hours** - Optio needs time to download
- **HTTPS only** - HTTP URLs rejected for security
- **Correct Content-Type headers** - Must match file type
- **No redirects** - Must return file content directly

**Success Response:**
```json
{
  "status": "success",
  "completion_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | Missing required field: {field} | Payload missing required field |
| 400 | Submission timestamp too old | Timestamp > 5 minutes old (replay protection) |
| 400 | Quest not found for assignment | No quest with matching lms_assignment_id |
| 401 | Missing signature | No X-Spark-Signature header |
| 401 | Invalid signature | HMAC validation failed |
| 404 | User not found | No LMS integration for spark_user_id |
| 404 | User has not started quest | User not enrolled in quest |
| 500 | Failed to process submission | Internal server error (retry with backoff) |

**Idempotency:**
- Duplicate submissions (same user + task) return existing `completion_id`
- Safe to retry failed webhooks

**Implementation Notes:**
- Webhook validates HMAC signature using constant-time comparison
- Files downloaded to Supabase storage bucket `evidence-documents`
- Task marked complete in `quest_task_completions` table
- XP awarded to student via `XPService`
- Evidence appears in portfolio within minutes

---

### OAuth Token Endpoint

**Purpose:** Exchange authorization code for access tokens (internal, used by frontend)

**URL:** `POST /spark/token`

**Request Body:**
```json
{
  "code": "auth_code_from_callback"
}
```

**Success Response:**
```json
{
  "access_token": "jwt_access_token",
  "refresh_token": "jwt_refresh_token",
  "user_id": "optio_user_uuid"
}
```

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | Missing authorization code | No code in request body |
| 401 | Invalid authorization code | Code not found or expired |

---

## Security

### JWT-Based SSO

**Algorithm:** HS256 (HMAC with SHA-256)

**Shared Secret:**
- 64 hexadecimal characters (32 bytes)
- Stored in environment variable `SPARK_SSO_SECRET`
- Used by both Spark (signing) and Optio (verification)

**Token Expiry:**
- 10-minute window (600 seconds)
- Short-lived for security
- Prevents token reuse/replay attacks

**Email Confirmation:**
- SSO users auto-confirmed (no email verification required)
- Trusted identity from Spark platform

**Session Management:**
- httpOnly cookies for CSRF protection
- Access tokens in URL (for cross-origin scenarios where cookies may be blocked)
- Refresh tokens for long-lived sessions

### HMAC Webhook Signatures

**Algorithm:** HMAC-SHA256

**Shared Secret:**
- 64 hexadecimal characters (32 bytes)
- Stored in environment variable `SPARK_WEBHOOK_SECRET`
- Used by both Spark (signing) and Optio (verification)

**Signature Header:**
```
X-Spark-Signature: abc123def456...
```

**Validation:**
```python
import hmac
import hashlib

def validate_signature(payload_bytes, signature_header, secret):
    expected = hmac.new(
        secret.encode('utf-8'),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()

    # Constant-time comparison (prevents timing attacks)
    return hmac.compare_digest(expected, signature_header)
```

**Replay Protection:**
- Webhook `submitted_at` timestamp must be within 5 minutes of server time
- Prevents replay of old webhooks

### File Download Protection

**SSRF Prevention:**
- Domain allowlist via `SPARK_STORAGE_DOMAINS` environment variable
- Default: `spark-storage.com,spark-cdn.com`
- Only HTTPS URLs allowed (no HTTP)

**Download Safety:**
- 30-second timeout per file
- No redirect following
- Size limits enforced (max 100MB per file)

**Storage Security:**
- Files uploaded to Supabase storage with RLS policies
- Publicly accessible for portfolio viewing
- Stored with unique UUIDs to prevent enumeration

### Rate Limiting

**SSO Endpoint:**
- 10 requests per minute per IP
- Prevents brute-force token guessing

**Webhook Endpoint:**
- 100 requests per minute per IP
- Allows high-volume submission processing

---

## Testing

### Test Account

**Student Credentials:**
```
Email: spark-test@optioeducation.com
Spark User ID: test_student_001
Optio User ID: 64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8
```

**Portfolio URL:**
```
Dev: https://optio-dev-frontend.onrender.com/diploma/64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8
Prod: https://www.optioeducation.com/diploma/64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8
```

### Test Scripts

**Generate SSO Token:**
```bash
node test_spark_sso.js
# Outputs SSO URL with valid JWT token (10-minute expiry)
```

**Send Test Webhook:**
```bash
node test_spark_webhook.js
# Sends sample submission webhook to dev backend
```

**Setup Test Data:**
```bash
node setup_spark_test_data.js
# Creates test quest/task in database
```

### Manual Testing Process

**Test SSO Login:**
1. Run `node test_spark_sso.js` to generate token
2. Copy URL from output
3. Open URL in browser
4. Verify redirect to `/dashboard`
5. Check user is logged in (see display name in header)

**Test Webhook Submission:**
1. Ensure test user has active quest with incomplete tasks
2. Run `node test_spark_webhook.js`
3. Verify 200 response with `completion_id`
4. Check portfolio page - evidence should appear
5. Verify XP awarded in dashboard

### Edge Cases to Test

**Idempotency Test:**
```bash
# Send same webhook twice
node test_spark_webhook.js
node test_spark_webhook.js
# Both should return 200 with same completion_id
```

**Replay Protection Test:**
```bash
# Modify test script to use old timestamp (> 5 minutes ago)
# Should return 400: "Submission timestamp too old"
```

**Invalid Signature Test:**
```bash
# Modify webhook secret in test script
# Should return 401: "Invalid signature"
```

**Missing User Test:**
```bash
# Send webhook with non-existent spark_user_id
# Should return 404: "User not found"
```

### Test Results (January 2025)

| Feature | Status | Notes |
|---------|--------|-------|
| SSO Login | ✅ WORKING | Valid tokens authenticate successfully |
| User Creation | ✅ WORKING | New accounts created automatically |
| Webhook Validation | ✅ WORKING | HMAC signatures verified correctly |
| File Downloads | ✅ WORKING | Files downloaded and stored successfully |
| Task Completion | ✅ WORKING | Tasks marked complete with evidence |
| XP Awards | ✅ WORKING | XP tracked in user_skill_xp table |
| Portfolio Display | ✅ WORKING | Evidence appears in public portfolios |

---

## Troubleshooting

### Common Issues

**Issue: "SSO not configured" (503 error)**
- **Cause:** Missing `SPARK_SSO_SECRET` environment variable
- **Solution:** Set `SPARK_SSO_SECRET` in Render dashboard
- **Verification:** Check backend logs for "SPARK_SSO_SECRET not configured"

**Issue: "Invalid token signature" (401 error)**
- **Cause:** Mismatched secrets between Spark and Optio, or token tampering
- **Solution:** Verify both platforms use same 64-char secret
- **Verification:** Generate test token with correct secret and retry

**Issue: "Token expired" (401 error)**
- **Cause:** Token older than 10 minutes
- **Solution:** Generate fresh token (tokens have 10-minute lifetime)
- **Verification:** Check `exp` claim in JWT payload

**Issue: "Invalid signature" on webhook (401 error)**
- **Cause:** Incorrect HMAC signature calculation
- **Solution:**
  1. Verify using same webhook secret on both sides
  2. Ensure signing raw request body (not formatted JSON)
  3. Use hex digest output (not base64)
- **Verification:** Log expected vs actual signature on Optio side

**Issue: "User not found" (404 error on webhook)**
- **Cause:** No LMS integration record for `spark_user_id`
- **Solution:** User must log in via SSO at least once before webhook can work
- **Verification:** Check `lms_integrations` table for matching `lms_user_id`

**Issue: "Quest not found for assignment" (400 error)**
- **Cause:** No quest with matching `lms_assignment_id` in database
- **Solution:** Ensure quest created with correct `lms_assignment_id` before submission
- **Verification:** Query `quests` table for matching `lms_assignment_id`

**Issue: "User has not started quest" (404 error)**
- **Cause:** No enrollment record in `user_quests` table
- **Solution:** User must start quest in Optio before webhook can complete tasks
- **Verification:** Check `user_quests` for matching `user_id` + `quest_id`

**Issue: "Failed to download file" (500 error)**
- **Cause:** File URL not publicly accessible, expired, or invalid
- **Solution:**
  1. Ensure URL returns actual file content (not HTML login page)
  2. Verify URL valid for 24+ hours
  3. Use HTTPS (not HTTP)
  4. Check URL in browser/curl to confirm accessibility
- **Verification:** Log file download error messages

**Issue: User logged in but seeing login screen**
- **Cause:** Race condition between localStorage token write and page reload
- **Solution:** Fixed in commit 9c096f8 (use React Router navigate instead of window.location)
- **Verification:** Update to latest develop branch code

### Debug Logging

**Enable verbose logging:**
```python
# In spark_integration.py
logger.setLevel(logging.DEBUG)
```

**Key log messages:**
- "Processing SSO token for user: {email}"
- "User {email} authenticated via Spark SSO"
- "Processing Spark webhook submission"
- "Task completed successfully with ID: {completion_id}"

**Check logs in Render:**
```bash
# Via Render dashboard: Services → optio-dev-backend → Logs
# Or via MCP:
mcp__render__list_logs(resource=['srv-d2tnvlvfte5s73ae8npg'], limit=100)
```

### Database Queries for Debugging

**Check LMS integration:**
```sql
SELECT * FROM lms_integrations
WHERE lms_platform = 'spark'
AND lms_user_id = 'test_student_001';
```

**Check quest setup:**
```sql
SELECT * FROM quests
WHERE lms_assignment_id = 'assignment_456'
AND lms_platform = 'spark';
```

**Check user quest enrollment:**
```sql
SELECT uq.*, q.title
FROM user_quests uq
JOIN quests q ON uq.quest_id = q.id
WHERE uq.user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8'
AND q.lms_platform = 'spark';
```

**Check task completions:**
```sql
SELECT qtc.*, uqt.title AS task_title
FROM quest_task_completions qtc
JOIN user_quest_tasks uqt ON qtc.task_id = uqt.id
WHERE qtc.user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8'
ORDER BY qtc.completed_at DESC;
```

---

## Deployment

### Environment Variables

**Backend (Render) - Development:**
```bash
SPARK_SSO_SECRET=3d69457249381391c19f7f7a64ec1d5b9e78adab7583c343d2087a47b4a7cb00
SPARK_WEBHOOK_SECRET=616bf3413b37e8a213c8252b12ecc923fed22a577ce6a9ff1c12a2178077aad5
SPARK_STORAGE_DOMAINS=spark-storage.com,spark-cdn.com
FRONTEND_URL=https://optio-dev-frontend.onrender.com
```

**Backend (Render) - Production:**
```bash
SPARK_SSO_SECRET=3d69457249381391c19f7f7a64ec1d5b9e78adab7583c343d2087a47b4a7cb00
SPARK_WEBHOOK_SECRET=616bf3413b37e8a213c8252b12ecc923fed22a577ce6a9ff1c12a2178077aad5
SPARK_STORAGE_DOMAINS=spark-storage.com,spark-cdn.com
FRONTEND_URL=https://www.optioeducation.com
```

### Deployment Process

**Development Deployment:**
```bash
git push origin develop
# Auto-deploys to:
# - Backend: optio-dev-backend.onrender.com
# - Frontend: optio-dev-frontend.onrender.com
```

**Production Deployment:**
```bash
git checkout main
git merge develop
git push origin main
# Auto-deploys to:
# - Backend: optio-prod-backend.onrender.com
# - Frontend: www.optioeducation.com
```

### Post-Deployment Verification

**Step 1: Check environment variables:**
```bash
# Via Render dashboard:
# Services → optio-prod-backend → Environment
# Verify SPARK_SSO_SECRET and SPARK_WEBHOOK_SECRET are set
```

**Step 2: Test SSO endpoint:**
```bash
# Generate test token
node test_spark_sso.js

# Open URL in browser
# Verify redirect to dashboard
```

**Step 3: Test webhook endpoint:**
```bash
# Send test webhook
node test_spark_webhook.js

# Check response is 200 with completion_id
```

**Step 4: Monitor logs:**
```bash
# Check for errors in Render dashboard logs
# Look for "Processing SSO token" and "Task completed successfully" messages
```

### Monitoring

**Key Metrics to Monitor:**
- SSO login success rate (expect >99%)
- Webhook processing success rate (expect >95%)
- Average file download time (expect <5 seconds)
- XP award failures (expect 0)

**Alert Conditions:**
- 5+ SSO failures in 1 minute (possible secret mismatch)
- 10+ webhook signature failures in 1 minute (possible secret mismatch)
- File download failures >10% (check Spark file URL accessibility)

### Rollback Procedure

**If issues arise in production:**

1. **Identify bad commit:**
```bash
git log --oneline
```

2. **Revert to previous working commit:**
```bash
git revert <bad_commit_hash>
git push origin main
```

3. **Or rollback via Render:**
- Render dashboard → Services → optio-prod-backend → Manual Deploy
- Select previous working deployment
- Click "Deploy"

4. **Verify rollback:**
```bash
# Test SSO and webhook endpoints
node test_spark_sso.js
node test_spark_webhook.js
```

---

## Support

For issues or questions regarding the Spark integration:

**Optio Development Team:**
- Email: support@optioeducation.com
- Documentation: This file (SPARK_INTEGRATION.md)

**Spark Development Team:**
- Refer to SPARK_SETUP_GUIDE.md for integration instructions
- Secrets shared via secure channel (not committed to version control)
