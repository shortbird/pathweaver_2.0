# Spark LMS Integration - Comprehensive Testing Guide

**Audience:** Optio Development Team
**Purpose:** Step-by-step testing procedures for validating Spark LMS integration

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Test Environment Setup](#test-environment-setup)
4. [Test 1: Database Verification](#test-1-database-verification)
5. [Test 2: SSO Token Generation & Validation](#test-2-sso-token-generation--validation)
6. [Test 3: OAuth Authorization Code Flow](#test-3-oauth-authorization-code-flow)
7. [Test 4: Webhook Signature Validation](#test-4-webhook-signature-validation)
8. [Test 5: Complete Submission Flow](#test-5-complete-submission-flow)
9. [Test 6: Error Scenarios](#test-6-error-scenarios)
10. [Troubleshooting](#troubleshooting)
11. [Manual Verification Checklist](#manual-verification-checklist)

---

## Overview

This guide walks through comprehensive testing of the Spark LMS integration to ensure all components work correctly before coordinating with the Spark team.

### What Can Be Tested Without Spark

✅ **Testable Now:**
- JWT token validation
- HMAC signature verification
- OAuth authorization code flow
- Database operations
- Error handling
- File upload security (with mock URLs)

❌ **Requires Spark Integration:**
- Live SSO button in Spark
- Automatic webhook delivery on assignment submission
- Real file URLs from Spark storage

---

## Prerequisites

### 1. Software Requirements

- **Node.js**: Version 14 or higher
- **npm packages**: Install required dependencies
  ```bash
  npm install jsonwebtoken
  ```

### 2. Environment Variables

Set the following environment variables (development secrets only):

```bash
# SSO secret (for JWT signing/validation)
export OPTIO_SHARED_SECRET=3d69457249381391c19f7f7a64ec1d5b9e78adab7583c343d2087a47b4a7cb00

# Webhook secret (for HMAC signature calculation)
export OPTIO_WEBHOOK_SECRET=616bf3413b37e8a213c8252b12ecc923fed22a577ce6a9ff1c12a2178077aad5

# Supabase service key (for test data setup)
export SUPABASE_SERVICE_KEY=<your-supabase-service-key>
```

**⚠️ CRITICAL SECURITY NOTE:**
- These are DEVELOPMENT secrets ONLY
- Production must use different secrets
- Never commit secrets to version control
- Never use dev secrets in production

### 3. Test Account

Verify test account exists in database:

```sql
SELECT id, email, display_name, role
FROM users
WHERE email = 'spark-test@optioeducation.com';
```

Expected result:
```
id: 64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8
email: spark-test@optioeducation.com
display_name: Spark TestStudent
role: student
```

### 4. Test Scripts

Ensure all test scripts are present:
- ✅ `test_spark_sso.js` (SSO token generation)
- ✅ `test_spark_webhook.js` (Webhook submission)
- ✅ `setup_spark_test_data.js` (Test data creation)

---

## Test Environment Setup

### Step 1: Verify Database Migration

Check that `spark_auth_codes` table exists:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'spark_auth_codes'
ORDER BY ordinal_position;
```

Expected columns:
- `code` (text, primary key)
- `user_id` (uuid, foreign key)
- `expires_at` (timestamp with time zone)
- `used` (boolean)
- `created_at` (timestamp with time zone)

### Step 2: Create Test Quest Data

Run the setup script:

```bash
node setup_spark_test_data.js
```

**Expected Output:**
```
Setting up Spark integration test data...

Step 1: Verifying test student exists...
✓ Test student found: test_student_001
  User ID: 64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8
  Email: spark-test@optioeducation.com

Step 2: Creating test quest...
✓ Test quest created successfully
  Quest ID: <uuid>
  Title: Spark Test Assignment
  LMS Assignment ID: test_assignment_001

Step 3: Creating quest tasks...
✓ Created 3 tasks for test quest

Step 4: Enrolling student in quest...
✓ Student enrolled in quest

Setup complete! You can now run test_spark_sso.js and test_spark_webhook.js
```

**If errors occur:**
- Verify `SUPABASE_SERVICE_KEY` is set correctly
- Check test student email matches `spark-test@optioeducation.com`
- Verify Supabase connection is working

### Step 3: Verify Test Data in Database

```sql
-- Check test quest exists
SELECT id, title, lms_assignment_id, lms_platform, quest_type
FROM quests
WHERE lms_assignment_id = 'test_assignment_001';

-- Check student enrollment
SELECT uq.*, q.title
FROM user_quests uq
JOIN quests q ON uq.quest_id = q.id
WHERE uq.user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8'
AND q.lms_assignment_id = 'test_assignment_001';

-- Check tasks exist
SELECT id, title, pillar, xp_value
FROM user_quest_tasks
WHERE quest_id = (
  SELECT id FROM quests WHERE lms_assignment_id = 'test_assignment_001'
)
AND user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8';
```

---

## Test 1: Database Verification

**Purpose:** Verify all required database tables and relationships exist

### Test Steps

1. **Verify LMS Integration Table:**
   ```sql
   SELECT * FROM lms_integrations
   WHERE lms_user_id = 'test_student_001'
   AND lms_platform = 'spark';
   ```

   Expected: Should find existing record or create one during SSO test

2. **Verify spark_auth_codes Table:**
   ```sql
   SELECT COUNT(*) FROM spark_auth_codes;
   ```

   Expected: Table exists (may be empty initially)

3. **Verify Quest Schema:**
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'quests'
   AND column_name IN ('lms_course_id', 'lms_assignment_id', 'lms_platform');
   ```

   Expected: All three columns exist

### Success Criteria

- ✅ All required tables exist
- ✅ Foreign key relationships are valid
- ✅ Indexes are in place
- ✅ Test data is correctly structured

---

## Test 2: SSO Token Generation & Validation

**Purpose:** Verify JWT token signing and validation works correctly

### Test Steps

1. **Generate SSO Token:**
   ```bash
   node test_spark_sso.js
   ```

2. **Expected Output:**
   ```
   Generating Spark SSO token for test student...

   Test Student Details:
     Spark User ID: test_student_001
     Email: spark-test@optioeducation.com
     Name: Spark TestStudent

   SSO URL (valid for 10 minutes):
   https://optio-dev-backend.onrender.com/spark/sso?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

   Testing Instructions:
   1. Copy the URL above
   2. Open it in your browser
   3. You should be redirected to the Optio dashboard
   4. Verify you're logged in as "Spark TestStudent"
   ```

3. **Copy the URL** from the output

4. **Open URL in browser**

5. **Observe the flow:**
   - Initial URL: `https://optio-dev-backend.onrender.com/spark/sso?token=...`
   - Redirect 1: `https://optio-dev-frontend.onrender.com/auth/callback?code=...`
   - Redirect 2: `https://optio-dev-frontend.onrender.com/dashboard`

### Success Criteria

- ✅ Token generates without errors
- ✅ Token is valid JWT with HS256 algorithm
- ✅ Token expires in 10 minutes (600 seconds)
- ✅ Token contains all required claims (sub, email, given_name, family_name, role, iat, exp)
- ✅ Backend accepts and validates token

### Verification

**Decode the JWT token** (use [jwt.io](https://jwt.io)):

Expected payload structure:
```json
{
  "sub": "test_student_001",
  "email": "spark-test@optioeducation.com",
  "given_name": "Spark",
  "family_name": "TestStudent",
  "role": "student",
  "iat": 1704499200,
  "exp": 1704499800
}
```

**Check backend logs** (optional):
```bash
# Via Render MCP
mcp__render__list_logs(resource=['srv-d2tnvlvfte5s73ae8npg'], limit=50, text=['Spark SSO'])
```

Look for: `"Spark SSO login attempt: user_id=test_student_001, email=spark-test@optioeducation.com"`

---

## Test 3: OAuth Authorization Code Flow

**Purpose:** Verify authorization code generation, storage, and exchange

### Test Steps

1. **Open SSO URL from Test 2** (must be fresh, within 10 minutes)

2. **Watch Network Tab** in browser DevTools:
   - Filter by "callback" to see the redirect with authorization code
   - Look for POST request to `/spark/token`

3. **Check authorization code in database:**
   ```sql
   SELECT code, user_id, expires_at, used, created_at
   FROM spark_auth_codes
   WHERE user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

4. **Verify code properties:**
   - Code is 32-byte URL-safe string
   - `expires_at` is 60 seconds from `created_at`
   - `used` becomes `true` after token exchange

5. **Complete the flow:**
   - Let the redirect complete
   - Should land on `/dashboard`
   - Should be logged in

### Success Criteria

- ✅ Authorization code is generated
- ✅ Code is stored in `spark_auth_codes` table
- ✅ Code expires in 60 seconds
- ✅ Code is marked as `used=true` after exchange
- ✅ Frontend receives access and refresh tokens
- ✅ User is redirected to dashboard
- ✅ User is logged in (check header shows "Spark TestStudent")

### Troubleshooting

**If redirect fails:**
- Check browser console for errors
- Verify `FRONTEND_URL` environment variable is correct
- Check CORS configuration

**If token exchange fails:**
- Verify authorization code hasn't expired (60 seconds)
- Check code hasn't already been used
- Verify POST request includes code in body

---

## Test 4: Webhook Signature Validation

**Purpose:** Verify HMAC-SHA256 signature calculation and validation

### Test Steps

1. **Run webhook test script:**
   ```bash
   node test_spark_webhook.js
   ```

2. **Expected Output:**
   ```
   Sending test Spark webhook submission...

   Webhook Details:
     User ID: test_student_001
     Assignment ID: test_assignment_001
     Submission Text: This is a test assignment submission...

   Calculating HMAC signature...
   Signature: abc123def456789...

   Sending POST request to: https://optio-dev-backend.onrender.com/spark/webhook/submission

   Response Status: 200
   ✓ Webhook processed successfully!

   Response:
   {
     "status": "success",
     "completion_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
     "xp_awarded": 150,
     "user_id": "64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8"
   }
   ```

3. **Verify signature calculation:**
   - Script shows the calculated HMAC signature
   - Backend validates the signature
   - Request succeeds with 200 status

### Success Criteria

- ✅ HMAC signature is calculated correctly
- ✅ Signature is included in `X-Spark-Signature` header
- ✅ Backend validates signature using constant-time comparison
- ✅ Invalid signatures are rejected with 401 error
- ✅ Valid signatures are accepted and processed

### Manual Signature Verification

To manually verify HMAC calculation:

```javascript
const crypto = require('crypto');

const payload = JSON.stringify({
  spark_user_id: 'test_student_001',
  spark_assignment_id: 'test_assignment_001',
  spark_course_id: 'test_course_001',
  submission_text: 'Test text...',
  submission_files: [],
  submitted_at: new Date().toISOString(),
  grade: 100
});

const secret = process.env.OPTIO_WEBHOOK_SECRET;
const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

console.log('HMAC Signature:', signature);
```

---

## Test 5: Complete Submission Flow

**Purpose:** End-to-end test of assignment submission workflow

### Test Steps

1. **Ensure test data is set up** (from Test Environment Setup)

2. **Run webhook test:**
   ```bash
   node test_spark_webhook.js
   ```

3. **Note the response:**
   - `completion_id`: UUID of the completed task
   - `xp_awarded`: XP points awarded
   - `user_id`: Optio user ID

4. **Verify in database:**
   ```sql
   -- Check task completion
   SELECT * FROM quest_task_completions
   WHERE id = '<completion_id_from_response>';

   -- Check XP was awarded
   SELECT pillar, xp_amount
   FROM user_skill_xp
   WHERE user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8';

   -- Check evidence was stored
   SELECT evidence_text, evidence_url, completed_at
   FROM quest_task_completions
   WHERE user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8'
   ORDER BY completed_at DESC
   LIMIT 1;
   ```

5. **Verify in frontend:**
   - Navigate to: `https://optio-dev-frontend.onrender.com/diploma/64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8`
   - Look for the completed quest
   - Click to expand evidence
   - Verify submission text is visible

6. **Check dashboard:**
   - Login as test student (use SSO test from Test 2)
   - Navigate to dashboard
   - Verify XP was awarded
   - Check quest progress shows completed task

### Success Criteria

- ✅ Webhook is received and validated
- ✅ User is identified via `lms_integrations` table
- ✅ Quest is found via `lms_assignment_id`
- ✅ Task is marked as complete
- ✅ Evidence is stored correctly
- ✅ XP is awarded to correct pillar
- ✅ Evidence appears on diploma page
- ✅ Dashboard reflects updated XP and progress

---

## Test 6: Error Scenarios

**Purpose:** Verify error handling and edge cases

### Test 6A: Expired JWT Token

1. **Generate a token with past expiration:**
   ```javascript
   const jwt = require('jsonwebtoken');
   const token = jwt.sign({
     sub: 'test_student_001',
     email: 'spark-test@optioeducation.com',
     given_name: 'Test',
     family_name: 'Student',
     role: 'student',
     iat: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
     exp: Math.floor(Date.now() / 1000) - 3000  // 50 minutes ago
   }, process.env.OPTIO_SHARED_SECRET, { algorithm: 'HS256' });

   console.log(`https://optio-dev-backend.onrender.com/spark/sso?token=${token}`);
   ```

2. **Open URL in browser**

3. **Expected result:**
   - HTTP 401 Unauthorized
   - Error message: "Token expired. Please try again."

### Test 6B: Invalid Signature

1. **Modify webhook secret:**
   ```bash
   # Temporarily change secret
   export OPTIO_WEBHOOK_SECRET=incorrect_secret_for_testing
   node test_spark_webhook.js
   ```

2. **Expected result:**
   - HTTP 401 Unauthorized
   - Error message: "Invalid signature"

3. **Restore correct secret:**
   ```bash
   export OPTIO_WEBHOOK_SECRET=616bf3413b37e8a213c8252b12ecc923fed22a577ce6a9ff1c12a2178077aad5
   ```

### Test 6C: Old Webhook Timestamp (Replay Protection)

1. **Create payload with old timestamp:**
   ```javascript
   const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
   const payload = {
     spark_user_id: 'test_student_001',
     spark_assignment_id: 'test_assignment_001',
     spark_course_id: 'test_course_001',
     submission_text: 'Test submission',
     submission_files: [],
     submitted_at: oldTimestamp.toISOString(),
     grade: 100
   };
   // Send webhook with this payload
   ```

2. **Expected result:**
   - HTTP 400 Bad Request
   - Error message: "Submission timestamp too old"

### Test 6D: Non-Existent User

1. **Send webhook with invalid user ID:**
   ```javascript
   const payload = {
     spark_user_id: 'nonexistent_user_999',
     spark_assignment_id: 'test_assignment_001',
     spark_course_id: 'test_course_001',
     submission_text: 'Test submission',
     submission_files: [],
     submitted_at: new Date().toISOString(),
     grade: 100
   };
   // Send webhook with this payload
   ```

2. **Expected result:**
   - HTTP 404 Not Found
   - Error message: "User not found. Student must log in via SSO first."

### Test 6E: Non-Existent Assignment

1. **Send webhook with invalid assignment ID:**
   ```javascript
   const payload = {
     spark_user_id: 'test_student_001',
     spark_assignment_id: 'nonexistent_assignment_999',
     spark_course_id: 'test_course_001',
     submission_text: 'Test submission',
     submission_files: [],
     submitted_at: new Date().toISOString(),
     grade: 100
   };
   // Send webhook with this payload
   ```

2. **Expected result:**
   - HTTP 400 Bad Request
   - Error message: "Quest not found for assignment nonexistent_assignment_999"

### Success Criteria for Error Tests

- ✅ All error scenarios return appropriate HTTP status codes
- ✅ Error messages are clear and actionable
- ✅ No sensitive information leaked in error responses
- ✅ Invalid requests are logged for debugging
- ✅ System remains stable under error conditions

---

## Troubleshooting

### Issue: "SUPABASE_SERVICE_KEY not found"

**Cause:** Environment variable not set

**Solution:**
```bash
export SUPABASE_SERVICE_KEY=<your-key-here>
```

### Issue: "Test student not found"

**Cause:** Test account doesn't exist in database

**Solution:**
```sql
-- Check if user exists
SELECT * FROM users WHERE email = 'spark-test@optioeducation.com';

-- If not, contact Optio team to create test account
```

### Issue: "Cannot find module 'jsonwebtoken'"

**Cause:** Missing npm package

**Solution:**
```bash
npm install jsonwebtoken
```

### Issue: "Invalid signature" when testing webhook

**Cause:** Wrong secret or payload formatting

**Solution:**
1. Verify `OPTIO_WEBHOOK_SECRET` matches backend
2. Ensure payload is stringified exactly as sent
3. Check header is `X-Spark-Signature` (case-sensitive)

### Issue: "Token expired" immediately after generation

**Cause:** System clock skew

**Solution:**
- Verify system time is accurate
- Check server time matches local time
- Increase token expiry for testing (not recommended for production)

### Issue: "Quest not found for assignment"

**Cause:** Test quest not created or wrong assignment ID

**Solution:**
```bash
# Re-run setup script
node setup_spark_test_data.js

# Verify quest exists
# (See Test Environment Setup, Step 3)
```

### Issue: Browser shows "Cannot GET /auth/callback"

**Cause:** Frontend not running or wrong URL

**Solution:**
- Verify `FRONTEND_URL` environment variable is correct
- Check frontend is deployed and accessible
- Try accessing frontend directly: `https://optio-dev-frontend.onrender.com`

---

## Manual Verification Checklist

Use this checklist to verify all components manually:

### Database Verification

- [ ] `spark_auth_codes` table exists with correct schema
- [ ] Test student exists in `users` table
- [ ] Test quest exists in `quests` table with `lms_assignment_id`
- [ ] Student is enrolled in test quest (`user_quests` table)
- [ ] Tasks exist for test quest (`user_quest_tasks` table)
- [ ] `lms_integrations` table has schema with spark support

### SSO Flow Verification

- [ ] JWT token generates successfully
- [ ] Token contains all required claims
- [ ] Token expires in 10 minutes
- [ ] SSO URL opens without errors
- [ ] Backend validates token correctly
- [ ] Authorization code is generated
- [ ] Authorization code is stored in database
- [ ] Authorization code expires in 60 seconds
- [ ] Frontend exchanges code for tokens
- [ ] User is redirected to dashboard
- [ ] User is logged in with correct identity

### Webhook Flow Verification

- [ ] HMAC signature calculates correctly
- [ ] Signature is included in header
- [ ] Backend validates signature
- [ ] Invalid signatures are rejected
- [ ] User is identified via LMS integration
- [ ] Quest is found via assignment ID
- [ ] Task is marked as complete
- [ ] Evidence is stored with submission text
- [ ] XP is awarded to correct pillar
- [ ] Evidence appears on diploma page
- [ ] Dashboard shows updated XP

### Error Handling Verification

- [ ] Expired tokens are rejected with 401
- [ ] Invalid signatures are rejected with 401
- [ ] Old timestamps are rejected with 400
- [ ] Non-existent users return 404
- [ ] Non-existent assignments return 400
- [ ] Error messages are clear and helpful
- [ ] No sensitive data in error responses

### Security Verification

- [ ] Secrets are not hardcoded
- [ ] Secrets are loaded from environment variables
- [ ] HMAC uses constant-time comparison
- [ ] Authorization codes are single-use
- [ ] Authorization codes expire quickly
- [ ] File URLs are validated (domain allowlist)
- [ ] Rate limiting is in place

---

## Next Steps

After completing all tests successfully:

1. **Document Results:** Note any issues or unexpected behavior
2. **Share with Team:** Review findings with development team
3. **Coordinate with Spark:** Share documentation and test results
4. **Staging Testing:** Set up staging environment for Spark team integration
5. **Production Deployment:** Deploy to production only after successful staging tests

---

## Support

For questions or issues during testing:

- **Technical Documentation:** See [SPARK_INTEGRATION.md](SPARK_INTEGRATION.md)
- **Setup Guide for Spark Team:** See [SPARK_SETUP_GUIDE.md](SPARK_SETUP_GUIDE.md)
- **Backend Implementation:** See `backend/routes/spark_integration.py`

---

**Testing Complete!**

If all tests pass, the Spark integration is ready for coordination with the Spark development team.
