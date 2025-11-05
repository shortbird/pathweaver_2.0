# Spark Integration - Internal Testing Checklist

**Purpose:** Validate all integration points before sending instructions to Spark team
**Tester:** Tanner
**Environment:** Development (optio-dev-backend.onrender.com)

---

## ✅ Testing Checklist

Use this checklist to verify everything works before Spark team begins integration.

---

## PHASE 1: SSO Authentication Testing

### Test 1.1: Valid SSO Token - First Login ✅

**Objective:** Verify new user creation via SSO

**Steps:**
1. Generate a fresh SSO token:
   ```bash
   node test_spark_sso.js
   ```

2. Copy the "Valid SSO Token" URL from output

3. **Open in incognito/private browser window** (important - simulates first login)

4. Paste the URL and press Enter

**Expected Results:**
- ✅ Automatic redirect (no login prompt)
- ✅ Land on dashboard with query params: `?lti=true&access_token=...&refresh_token=...`
- ✅ User profile shows "Spark TestStudent"
- ✅ Email shows `spark-test@optioeducation.com`

**Verify in Database:**
```sql
SELECT id, email, display_name, role, created_at
FROM users
WHERE email = 'spark-test@optioeducation.com';
```

Expected:
- ✅ User record exists
- ✅ Role = 'student'
- ✅ Display name matches JWT claims

---

### Test 1.2: Valid SSO Token - Repeat Login ✅

**Objective:** Verify existing user login (no duplicate creation)

**Steps:**
1. Generate another SSO token:
   ```bash
   node test_spark_sso.js
   ```

2. Open in **same browser** (already logged in elsewhere)

3. Paste URL and press Enter

**Expected Results:**
- ✅ Still logs in successfully
- ✅ Redirects to dashboard
- ✅ No duplicate user created

**Verify in Database:**
```sql
SELECT COUNT(*) as user_count
FROM users
WHERE email = 'spark-test@optioeducation.com';
```

Expected:
- ✅ Count = 1 (no duplicates)

---

### Test 1.3: Expired Token ❌

**Objective:** Verify expired tokens are rejected

**Steps:**
1. Look for "Expired Token" URL in `test_spark_sso.js` output

2. Open in browser

**Expected Results:**
- ❌ Should NOT log in
- ✅ Error message: "Token expired"
- ✅ HTTP 401 status

---

### Test 1.4: Invalid Signature ❌

**Objective:** Verify tampered tokens are rejected

**Steps:**
1. Look for "Invalid Signature" URL in `test_spark_sso.js` output

2. Open in browser

**Expected Results:**
- ❌ Should NOT log in
- ✅ Error message: "Invalid token"
- ✅ HTTP 401 status

---

### Test 1.5: Missing Token ❌

**Objective:** Verify missing token parameter is caught

**Steps:**
1. Navigate to:
   ```
   https://optio-dev-backend.onrender.com/spark/sso
   ```
   (no token parameter)

**Expected Results:**
- ❌ Should NOT log in
- ✅ Error message: "Missing token parameter"
- ✅ HTTP 400 status

---

## PHASE 2: Webhook Testing (Basic)

### Test 2.1: Valid Webhook - First Submission ✅

**Objective:** Verify webhook creates completion and awards XP

**Steps:**
1. Send webhook:
   ```bash
   node test_spark_webhook.js
   ```

**Expected Results:**
- ✅ HTTP 200 status
- ✅ Response: `{"status": "success", "completion_id": "uuid"}`

**Verify in Database:**
```sql
-- Check completion
SELECT id, user_id, evidence_text, completed_at
FROM quest_task_completions
WHERE user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8'
ORDER BY completed_at DESC
LIMIT 1;

-- Check XP award
SELECT user_id, pillar, xp_amount
FROM user_skill_xp
WHERE user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8'
AND pillar = 'stem';
```

Expected:
- ✅ Completion record exists
- ✅ Evidence text matches webhook payload
- ✅ XP = 100 for STEM pillar

---

### Test 2.2: Duplicate Webhook (Idempotency) ✅

**Objective:** Verify duplicate submissions don't create duplicates

**Steps:**
1. Send same webhook again:
   ```bash
   node test_spark_webhook.js
   ```

**Expected Results:**
- ✅ HTTP 200 status (still success)
- ✅ Returns same completion_id as Test 2.1
- ✅ No duplicate XP awarded

**Verify in Database:**
```sql
-- Count completions for this task
SELECT COUNT(*) as completion_count
FROM quest_task_completions
WHERE task_id = 'fc034ad0-69e5-4bd8-9871-950085a85ff7'
AND user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8';

-- Check XP hasn't doubled
SELECT xp_amount
FROM user_skill_xp
WHERE user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8'
AND pillar = 'stem';
```

Expected:
- ✅ Completion count = 1 (not 2)
- ✅ XP still = 100 (not 200)

---

### Test 2.3: Invalid Signature ❌

**Objective:** Verify tampered webhooks are rejected

**Steps:**
1. Edit `test_spark_webhook.js` temporarily:
   ```javascript
   // Line ~40 - Change the secret
   const WEBHOOK_SECRET = 'wrong_secret_12345678901234567890123456789012';
   ```

2. Run test:
   ```bash
   node test_spark_webhook.js
   ```

3. **IMPORTANT:** Restore the correct secret after test!

**Expected Results:**
- ❌ HTTP 401 status
- ✅ Error: "Invalid signature"

---

### Test 2.4: Missing Signature Header ❌

**Objective:** Verify missing signature is caught

**Steps:**
1. Use curl to send webhook without signature:
   ```bash
   curl -X POST https://optio-dev-backend.onrender.com/spark/webhook/submission \
     -H "Content-Type: application/json" \
     -d '{"spark_user_id":"test_student_001","spark_assignment_id":"test_assignment_001","spark_course_id":"test_course_001","submission_text":"test","submission_files":[],"submitted_at":"2025-11-05T18:00:00Z","grade":100}'
   ```

**Expected Results:**
- ❌ HTTP 401 status
- ✅ Error: "Missing signature"

---

### Test 2.5: Old Timestamp (Replay Protection) ❌

**Objective:** Verify old submissions are rejected

**Steps:**
1. Edit `test_spark_webhook.js` temporarily:
   ```javascript
   // Line ~23 - Change submitted_at to old date
   submitted_at: '2025-11-04T10:00:00Z',  // 24+ hours ago
   ```

2. Run test:
   ```bash
   node test_spark_webhook.js
   ```

3. **IMPORTANT:** Restore current timestamp after test!

**Expected Results:**
- ❌ HTTP 400 status
- ✅ Error: "Submission timestamp too old"

---

### Test 2.6: Missing Required Fields ❌

**Objective:** Verify payload validation

**Steps:**
1. Edit `test_spark_webhook.js` temporarily:
   ```javascript
   // Remove a required field
   const submission = {
     spark_user_id: 'test_student_001',
     // spark_assignment_id: 'test_assignment_001',  // REMOVED
     spark_course_id: 'test_course_001',
     // ... rest of fields
   };
   ```

2. Run test:
   ```bash
   node test_spark_webhook.js
   ```

3. **IMPORTANT:** Restore the field after test!

**Expected Results:**
- ❌ HTTP 400 status
- ✅ Error mentions missing field name

---

### Test 2.7: Nonexistent User ❌

**Objective:** Verify user validation

**Steps:**
1. Edit `test_spark_webhook.js` temporarily:
   ```javascript
   // Change to nonexistent user
   spark_user_id: 'nonexistent_user_999',
   ```

2. Run test:
   ```bash
   node test_spark_webhook.js
   ```

3. **IMPORTANT:** Restore correct user ID after test!

**Expected Results:**
- ❌ HTTP 400 or 404 status
- ✅ Error: "User not found for Spark ID: nonexistent_user_999"

---

### Test 2.8: Nonexistent Assignment ❌

**Objective:** Verify assignment validation

**Steps:**
1. Edit `test_spark_webhook.js` temporarily:
   ```javascript
   // Change to nonexistent assignment
   spark_assignment_id: 'nonexistent_assignment_999',
   ```

2. Run test:
   ```bash
   node test_spark_webhook.js
   ```

3. **IMPORTANT:** Restore correct assignment ID after test!

**Expected Results:**
- ❌ HTTP 400 status
- ✅ Error: "Quest not found for assignment: nonexistent_assignment_999"

---

## PHASE 3: Portfolio Verification

### Test 3.1: Evidence Appears in Dashboard ✅

**Objective:** Verify completed quest shows in student dashboard

**Steps:**
1. Generate fresh SSO token:
   ```bash
   node test_spark_sso.js
   ```

2. Log in as test student

3. Navigate to Dashboard

**Expected Results:**
- ✅ "Test Spark Assignment" quest appears
- ✅ Shows as completed (green checkmark or "Completed" status)
- ✅ XP shows 100 points earned

---

### Test 3.2: Evidence Appears in Portfolio/Diploma ✅

**Objective:** Verify evidence is publicly visible

**Steps:**
1. Navigate to test student's public portfolio:
   ```
   https://optio-dev-frontend.onrender.com/diploma/64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8
   ```

2. Look for "Test Spark Assignment" quest

**Expected Results:**
- ✅ Quest title appears
- ✅ Evidence text displayed: "This is a test submission from Spark LMS..."
- ✅ Completion date shown
- ✅ XP reflected in total or pillar breakdown

---

### Test 3.3: XP Reflected in User Stats ✅

**Objective:** Verify XP updates user level/stats

**Steps:**
1. Check user's total XP in dashboard or profile

2. Verify STEM pillar specifically

**Expected Results:**
- ✅ Total XP includes the 100 points
- ✅ STEM pillar shows 100 XP
- ✅ Level/progress bar updated (if applicable)

---

## PHASE 4: File Upload Testing (Advanced)

### Test 4.1: Webhook with Mock File URLs ⚠️

**Objective:** Verify file download and upload logic

**Note:** This test requires setting up mock file URLs or using real accessible files

**Steps:**
1. Edit `test_spark_webhook.js`:
   ```javascript
   submission_files: [
     {
       url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
       type: 'application/pdf',
       filename: 'test_file.pdf'
     }
   ]
   ```

2. **IMPORTANT:** Also update `SPARK_STORAGE_DOMAINS` env var in Render:
   ```
   SPARK_STORAGE_DOMAINS=www.w3.org
   ```

3. Run test:
   ```bash
   node test_spark_webhook.js
   ```

**Expected Results:**
- ✅ HTTP 200 status (even if file download fails)
- ✅ Completion still created
- ✅ Check logs for file download attempt

**Note:** File download may fail due to SSRF protection or invalid domain. This is expected unless you configure allowed domains.

---

## PHASE 5: Rate Limiting & Security

### Test 5.1: SSO Rate Limiting ⚠️

**Objective:** Verify rate limiting prevents abuse

**Steps:**
1. Run SSO test 15 times rapidly:
   ```bash
   for i in {1..15}; do curl -s "https://optio-dev-backend.onrender.com/spark/sso?token=$(node -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'test',email:'test@test.com',given_name:'T',family_name:'T',role:'student',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600},'3d69457249381391c19f7f7a64ec1d5b9e78adab7583c343d2087a47b4a7cb00'))")"; done
   ```

**Expected Results:**
- ✅ First 10 requests succeed
- ✅ Requests 11-15 return HTTP 429 (Too Many Requests)
- ✅ Error: Rate limit exceeded

**Note:** Rate limit resets after 1 minute

---

### Test 5.2: Webhook Rate Limiting ⚠️

**Objective:** Verify webhook rate limiting

**Steps:**
1. Run webhook test 105 times rapidly (limit is 100/min)

**Expected Results:**
- ✅ First 100 requests succeed
- ✅ Requests 101+ return HTTP 429
- ✅ Error: Rate limit exceeded

**Note:** May be difficult to test manually - can verify in logs

---

## PHASE 6: Cross-Browser Testing

### Test 6.1: Chrome/Edge ✅

**Steps:**
1. Test SSO login in Chrome or Edge
2. Verify cookies are set
3. Check localStorage/sessionStorage (should be empty - we use httpOnly cookies)

**Expected Results:**
- ✅ Login works
- ✅ Can navigate platform
- ✅ No tokens in localStorage

---

### Test 6.2: Firefox ✅

**Steps:**
1. Test SSO login in Firefox
2. Same verification as Chrome

**Expected Results:**
- ✅ Login works
- ✅ All features functional

---

### Test 6.3: Safari ⚠️

**Steps:**
1. Test SSO login in Safari
2. Check if cross-origin cookies work

**Expected Results:**
- ✅ Login should work (tokens in URL as fallback)
- ⚠️ May have cookie issues (Safari blocks cross-origin cookies)

**Note:** URL token method ensures compatibility even if cookies blocked

---

## PHASE 7: Error Recovery & Logging

### Test 7.1: Check Backend Logs ✅

**Objective:** Verify logging is working

**Steps:**
1. In Render Dashboard → optio-dev-backend → Logs

2. Filter by "spark" or "webhook"

3. Review recent logs from tests

**Expected Results:**
- ✅ See successful SSO logins logged
- ✅ See webhook processing logs
- ✅ See XP award logs
- ✅ Errors are properly logged with context

---

### Test 7.2: Database Audit Trail ✅

**Objective:** Verify all operations are recorded

**Steps:**
```sql
-- Check lms_integrations
SELECT * FROM lms_integrations
WHERE lms_platform = 'spark';

-- Check lms_sessions
SELECT * FROM lms_sessions
WHERE lms_platform = 'spark'
ORDER BY created_at DESC;

-- Check quest_task_completions
SELECT * FROM quest_task_completions
WHERE user_id = '64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8';
```

**Expected Results:**
- ✅ Integration record exists
- ✅ Session records exist
- ✅ Completions are recorded
- ✅ Timestamps are accurate

---

## PHASE 8: Production Readiness

### Test 8.1: Environment Variables ✅

**Objective:** Verify all required env vars are set

**Steps:**
1. Check Render Dashboard → optio-dev-backend → Environment

**Required Variables:**
- ✅ `SPARK_SSO_SECRET`
- ✅ `SPARK_WEBHOOK_SECRET`
- ✅ `FRONTEND_URL`
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_SERVICE_KEY`

---

### Test 8.2: Documentation Review ✅

**Objective:** Ensure all docs are accurate

**Steps:**
1. Read through `SPARK_CREDENTIALS.md`
2. Verify all endpoints, secrets, examples match current implementation
3. Check for any outdated information

---

### Test 8.3: Test Scripts Work ✅

**Objective:** Verify Spark team can run tests

**Steps:**
1. Delete `node_modules` folder
2. Run `npm install` (if needed)
3. Run all test scripts fresh

**Expected Results:**
- ✅ `test_spark_sso.js` runs and generates valid URLs
- ✅ `test_spark_webhook.js` runs and gets 200 response

---

## 📊 Final Verification Checklist

Before sending to Spark team, verify:

### SSO
- ✅ Valid tokens log in successfully
- ✅ Expired tokens are rejected (401)
- ✅ Invalid signatures are rejected (401)
- ✅ User creation works
- ✅ Repeat logins work (no duplicates)
- ✅ Cross-browser compatibility

### Webhooks
- ✅ Valid webhooks return 200 + completion_id
- ✅ Evidence is recorded in database
- ✅ XP is awarded correctly
- ✅ Duplicate submissions are idempotent
- ✅ Invalid signatures are rejected (401)
- ✅ Old timestamps are rejected (400)
- ✅ Missing fields are caught (400)
- ✅ Invalid users/assignments are caught

### Portfolio
- ✅ Evidence appears in dashboard
- ✅ Evidence appears in public portfolio
- ✅ XP is reflected in user stats

### Documentation
- ✅ All documentation files accurate
- ✅ Test scripts work
- ✅ Examples are up-to-date
- ✅ Credentials are correct

### Security
- ✅ Rate limiting active
- ✅ Signature validation working
- ✅ Replay protection working
- ✅ Proper error messages (no sensitive data leaked)

### Monitoring
- ✅ Logs are working
- ✅ Errors are logged with context
- ✅ Database audit trail complete

---

## 🎯 When All Tests Pass

You're ready to send instructions to Spark team!

**Handoff Package:**
1. ✅ `SPARK_CREDENTIALS.md` - Main integration guide
2. ✅ `SPARK_TESTING_GUIDE.md` - Their testing instructions
3. ✅ `SPARK_QUICK_REFERENCE.md` - Quick reference
4. ✅ Test scripts (`test_spark_*.js`)

**Next Steps:**
1. Email Spark team with documentation
2. Offer to schedule integration kickoff call
3. Monitor logs during their integration
4. Be available for questions/support

---

**Testing Completed By:** _________________
**Date:** _________________
**All Tests Passed:** ✅ / ❌
**Ready for Spark Team:** ✅ / ❌

---

**Notes:**
