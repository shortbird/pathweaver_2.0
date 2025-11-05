# Spark Integration Testing Guide

**Last Updated:** 2025-11-05
**Environment:** Development (optio-dev-backend.onrender.com)
**Status:** Ready for Testing (with setup required)

---

## Quick Start

### Prerequisites
- Node.js installed
- `jsonwebtoken` package: `npm install jsonwebtoken`
- `@supabase/supabase-js` package: `npm install @supabase/supabase-js`

### 3-Step Testing Process

```bash
# Step 1: Setup test data (run ONCE)
node setup_spark_test_data.js

# Step 2: Test SSO login
node test_spark_sso.js
# Copy the URL from output and open in browser

# Step 3: Test webhook submission
node test_spark_webhook.js
# Should return 200 status with completion_id
```

---

## Current Test Results (2025-11-05)

### ✅ SSO Authentication - WORKING
- **Test Account Created:** spark-test@optioeducation.com
- **User ID:** 64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8
- **SSO URL Format:** `https://optio-dev-backend.onrender.com/spark/sso?token={jwt}`
- **Token Expiry:** 10 minutes
- **Result:** User successfully logs in and redirects to dashboard

**Test Evidence:**
```bash
node test_spark_sso.js
# Output: Valid SSO URL
# Action: Opened in browser → Logged in successfully ✓
```

### 🔧 Webhook Submission - FIXED (Deployment Pending)
- **Issue Found:** Schema mismatch - webhook was querying `user_quest_tasks.lms_assignment_id` column that doesn't exist
- **Fix Applied:** Updated webhook to query `quests.lms_assignment_id` then find user tasks
- **Status:** Code committed to develop branch, awaiting deployment
- **Next Steps:** After deployment, run `setup_spark_test_data.js` then retest webhook

**Previous Test Result (Before Fix):**
```json
{
  "status": 500,
  "error": "Failed to process submission"
}
```

**Expected Result (After Fix + Setup):**
```json
{
  "status": "success",
  "completion_id": "uuid-here"
}
```

### ⏳ Pending Tests
- Webhook with file attachments
- Expired JWT token handling
- Invalid HMAC signature rejection
- Missing required fields
- Evidence visibility in portfolio

---

## Detailed Testing Instructions

### 1. SSO Testing

#### Generate Fresh Token
```bash
node test_spark_sso.js
```

**Expected Output:**
- JWT token (long string)
- SSO URL for dev environment
- Token expiration timestamp

#### Test Valid Login
1. Copy the dev environment URL from output
2. Paste into browser
3. **Expected:** Automatic login, redirect to `/dashboard?lti=true&access_token=...&refresh_token=...`
4. **Verify:** User profile shows "Spark TestStudent"

#### Test Expired Token
The script also generates an expired token. Test it to verify:
- **Expected:** 401 Unauthorized
- **Error Message:** "Token expired. Please try again."

#### Test Invalid Signature
The script generates a token with wrong secret. Test it to verify:
- **Expected:** 401 Unauthorized
- **Error Message:** "Invalid token"

---

### 2. Webhook Testing

#### Setup Test Data (One-Time)
```bash
# Set your Supabase service key
export SUPABASE_SERVICE_KEY="your-key-here"

# Run setup script
node setup_spark_test_data.js
```

**What This Does:**
- Creates a test quest linked to `test_assignment_001`
- Enrolls the test student in the quest
- Creates a task "Complete Spark Assignment" (100 XP, STEM pillar)

**Expected Output:**
```
✓ Created new quest: [quest-id]
✓ Enrolled student in quest
✓ Created 1 task(s) for student
```

#### Send Test Webhook
```bash
node test_spark_webhook.js
```

**Expected Success Response:**
```json
{
  "status": "success",
  "completion_id": "uuid-here"
}
```

**Status Codes:**
| Code | Meaning | Troubleshooting |
|------|---------|-----------------|
| 200 | Success | Evidence should appear in portfolio |
| 400 | Bad Request | Check payload format, timestamp not too old |
| 401 | Invalid Signature | Verify WEBHOOK_SECRET matches on both sides |
| 404 | Not Found | Run SSO test first, then setup script |
| 500 | Server Error | Check backend logs, may need schema updates |

---

### 3. Verify Evidence in Portfolio

After successful webhook submission:

1. **Login as Test Student**
   - Use SSO URL from `test_spark_sso.js`
   - Or login directly with email: `spark-test@optioeducation.com`

2. **Check Dashboard**
   - Navigate to `/dashboard`
   - Look for "Test Spark Assignment" quest
   - Should show 1/1 tasks complete

3. **View Portfolio**
   - Navigate to `/diploma/64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8`
   - Should see completed quest with evidence:
     - Evidence text: "This is a test submission from Spark LMS..."
     - Submitted timestamp
     - Grade: 100

4. **Check XP Awarded**
   - Dashboard should show +100 XP
   - STEM pillar should increase by 100 XP

---

## Testing with File Attachments

### Update Test Script
Edit `test_spark_webhook.js` and add file URLs:

```javascript
submission_files: [
  {
    url: 'https://your-spark-storage.com/files/test.pdf?expires=...',
    type: 'application/pdf',
    filename: 'test_submission.pdf'
  }
]
```

### File URL Requirements
⚠️ **CRITICAL:** File URLs must be:
- **Publicly accessible** (no authentication required for 24+ hours)
- **HTTPS only** (HTTP will be rejected)
- **From allowed domains** (configure `SPARK_STORAGE_DOMAINS` env var)
- **Return actual files** (not HTML login pages)

### Expected Behavior
1. Optio downloads file from temporary URL
2. Uploads to Supabase storage bucket `evidence-files`
3. Stores public URL in `evidence_document_blocks` table
4. Files accessible in student portfolio

### File Download Errors
If file download fails:
- Webhook still succeeds (200 status)
- Error logged but not returned to Spark
- Evidence text is saved without attachments

---

## Edge Case Testing

### 1. Duplicate Submission (Idempotency)
Send the same webhook twice:
```bash
node test_spark_webhook.js
node test_spark_webhook.js  # Second time
```

**Expected:**
- First call: Creates new completion
- Second call: Returns existing completion_id
- No duplicate XP awarded

### 2. Old Timestamp (Replay Protection)
Edit `test_spark_webhook.js`:
```javascript
submitted_at: '2025-01-01T10:00:00Z'  // Old date
```

**Expected:**
- 400 Bad Request
- Error: "Submission timestamp too old"

### 3. Missing Required Fields
Remove fields from webhook payload:
```javascript
// Remove submission_text
const submission = {
  spark_user_id: 'test_student_001',
  spark_assignment_id: 'test_assignment_001',
  // submission_text: 'Missing!',  // Removed
  ...
};
```

**Expected:**
- 400 Bad Request
- Error: "Missing required field: submission_text"

### 4. Invalid Spark User ID
```javascript
spark_user_id: 'nonexistent_user_123'
```

**Expected:**
- 400 Bad Request (or 404)
- Error: "User not found for Spark ID: nonexistent_user_123"

### 5. Assignment Not Found
```javascript
spark_assignment_id: 'unknown_assignment'
```

**Expected:**
- 400 Bad Request
- Error: "Quest not found for assignment: unknown_assignment"

---

## Troubleshooting

### SSO Issues

**Problem:** "SSO not configured" error
**Solution:** Check that `SPARK_SSO_SECRET` is set in Render environment variables

**Problem:** Token validation fails
**Solution:** Verify the secret matches exactly on both sides (64 hex characters)

**Problem:** Redirect loop after login
**Solution:** Check `FRONTEND_URL` environment variable points to correct frontend

### Webhook Issues

**Problem:** 401 Invalid signature
**Solution:**
- Verify `SPARK_WEBHOOK_SECRET` matches on both sides
- Ensure signature is calculated on raw request body (not parsed JSON)
- Use HMAC-SHA256 (not SHA256 alone)

**Problem:** 404 User not found
**Solution:**
- Run SSO test first to create user
- Check `lms_integrations` table has entry for spark platform

**Problem:** 500 Quest not found
**Solution:**
- Run `setup_spark_test_data.js` to create test quest
- Verify quest has `lms_assignment_id` and `lms_platform='spark'`

**Problem:** File download fails
**Solution:**
- Check file URLs are publicly accessible (test in browser)
- Verify URLs use HTTPS
- Ensure URLs don't require authentication
- Check domain is in `SPARK_STORAGE_DOMAINS` allowlist

### Database Queries

**Check if user exists:**
```sql
SELECT id, email, display_name FROM users WHERE email = 'spark-test@optioeducation.com';
```

**Check LMS integration:**
```sql
SELECT * FROM lms_integrations WHERE lms_platform = 'spark';
```

**Check quest setup:**
```sql
SELECT id, title, lms_assignment_id, lms_platform FROM quests
WHERE lms_assignment_id = 'test_assignment_001';
```

**Check task completion:**
```sql
SELECT * FROM quest_task_completions
WHERE user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8'
ORDER BY completed_at DESC;
```

---

## Production Deployment Checklist

Before going live with Spark team:

### Environment Variables (Production)
- [ ] `SPARK_SSO_SECRET` - Set to production shared secret
- [ ] `SPARK_WEBHOOK_SECRET` - Set to production webhook secret
- [ ] `SPARK_STORAGE_DOMAINS` - Configure allowed file domains
- [ ] `FRONTEND_URL` - Set to `https://www.optioeducation.com`

### Endpoint URLs (Production)
- [ ] SSO: `https://optio-prod-backend.onrender.com/spark/sso?token={jwt}`
- [ ] Webhook: `https://optio-prod-backend.onrender.com/spark/webhook/submission`

### Testing in Production
1. Create production test account via SSO
2. Send test webhook to production endpoint
3. Verify evidence appears in production portfolio
4. Monitor logs for any errors
5. Test with real Spark student data

### Security Review
- [ ] Verify rate limiting is active (10 SSO/min, 100 webhooks/min)
- [ ] Confirm SSRF protection is enabled for file downloads
- [ ] Test replay attack protection (old timestamps rejected)
- [ ] Validate signature verification works correctly
- [ ] Ensure proper error messages (no sensitive data leaked)

### Monitoring Setup
- [ ] Configure alerts for repeated webhook failures
- [ ] Monitor SSO success/failure rates
- [ ] Track file download errors
- [ ] Set up logging for Spark-specific events

---

## API Reference

### SSO Endpoint

**URL:** `GET /spark/sso`

**Query Parameters:**
| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| token | Yes | String | JWT signed with HS256 |

**JWT Claims:**
| Claim | Required | Type | Description |
|-------|----------|------|-------------|
| sub | Yes | String | Spark user ID |
| email | Yes | String | Student email |
| given_name | Yes | String | First name |
| family_name | Yes | String | Last name |
| role | Yes | String | Must be "student" |
| iat | Yes | Number | Issued at timestamp |
| exp | Yes | Number | Expiration timestamp |

**Success Response:**
- Status: 302 Redirect
- Location: `{FRONTEND_URL}/dashboard?lti=true&access_token=...&refresh_token=...`
- Sets auth cookies (may be blocked in cross-origin mode)

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | Missing token parameter | No token in query string |
| 401 | Token expired | Token past expiration time |
| 401 | Invalid token | Signature validation failed |
| 500 | Failed to create user account | Database error |
| 503 | SSO not configured | Missing SPARK_SSO_SECRET |

### Webhook Endpoint

**URL:** `POST /spark/webhook/submission`

**Headers:**
| Header | Required | Value |
|--------|----------|-------|
| Content-Type | Yes | application/json |
| X-Spark-Signature | Yes | HMAC-SHA256 hex digest |

**Request Body:**
```json
{
  "spark_user_id": "string",
  "spark_assignment_id": "string",
  "spark_course_id": "string",
  "submission_text": "string",
  "submission_files": [
    {
      "url": "https://...",
      "type": "application/pdf",
      "filename": "essay.pdf"
    }
  ],
  "submitted_at": "2025-11-05T17:30:00Z",
  "grade": 95.5
}
```

**Success Response:**
```json
{
  "status": "success",
  "completion_id": "uuid"
}
```

**Error Responses:**
| Status | Error | Description |
|--------|-------|-------------|
| 400 | Missing required field | Payload missing required field |
| 400 | Submission timestamp too old | Timestamp > 5 minutes old (replay protection) |
| 401 | Missing signature | No X-Spark-Signature header |
| 401 | Invalid signature | HMAC validation failed |
| 404 | User not found | No LMS integration for spark_user_id |
| 404 | Quest not found | No quest for spark_assignment_id |
| 404 | User has not started quest | User not enrolled in quest |
| 500 | Failed to process submission | Server error (check logs) |

---

## Support Contacts

**Primary Contact:** Tanner (Optio Product Team)
**Technical Documentation:** [SPARK_CREDENTIALS.md](SPARK_CREDENTIALS.md)
**Integration Guide:** [docs/LMS_INTEGRATION.md](backend/docs/LMS_INTEGRATION.md)

---

## Changelog

**2025-11-05:**
- ✅ SSO authentication tested and working
- 🔧 Fixed webhook schema mismatch (lms_assignment_id location)
- 📝 Created comprehensive testing guide
- 🛠️ Created test scripts and setup automation
- ⏳ Awaiting deployment for webhook testing

**Next Steps:**
1. Deploy fix to dev environment
2. Run setup script to create test data
3. Complete webhook testing with files
4. Test all edge cases
5. Document final results
6. Prepare for production deployment
