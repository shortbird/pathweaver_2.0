# Spark Integration Testing Guide

**For Optio Team - Pre-Delivery Testing**

This guide walks you through testing the Spark integration before delivering credentials to the Spark team.

---

## Prerequisites

- Node.js installed
- `jsonwebtoken` package installed (run `npm install jsonwebtoken` if needed)
- Access to Optio dev environment
- Render dashboard access (to check logs if needed)

---

## Test 1: SSO Authentication Flow

### Step 1: Generate SSO URL

```bash
node test_spark_sso.js
```

This will output:
- JWT payload with test student details
- Generated JWT token
- SSO URL for dev environment

### Step 2: Test SSO Login

1. **Copy the DEV ENVIRONMENT URL** from the script output
2. **Open in browser** (or incognito window for clean test)
3. **Expected behavior:**
   - Automatic redirect to Optio dev dashboard
   - No password prompt
   - Logged in as "Spark TestStudent"

### Step 3: Verify Account Creation

1. **Check user profile:**
   - Click on profile/settings in dashboard
   - Verify name shows: "Spark TestStudent"
   - Verify email shows: "spark-test@optioeducation.com"

2. **Check database (optional):**
   ```javascript
   // Use Supabase MCP
   SELECT id, email, first_name, last_name, display_name, role
   FROM users
   WHERE email = 'spark-test@optioeducation.com';
   ```

3. **Check Spark user ID mapping (optional):**
   ```javascript
   // Use Supabase MCP
   SELECT * FROM lms_integrations
   WHERE user_id = (
     SELECT id FROM users WHERE email = 'spark-test@optioeducation.com'
   );
   ```

### Expected Results:

✅ **Success indicators:**
- Automatic login without password
- Dashboard loads correctly
- User profile shows correct name and email
- No error messages in browser console

❌ **Failure indicators:**
- 401 Unauthorized error → SSO secret mismatch
- 404 Not Found error → SSO endpoint not registered
- 400 Bad Request → JWT format issue
- Redirect to login page → Token validation failed

---

## Test 2: Webhook Submission

**IMPORTANT:** Run Test 1 first to create the test student account!

### Step 1: Send Test Webhook

```bash
node test_spark_webhook.js
```

This will:
- Create a test submission payload
- Calculate HMAC-SHA256 signature
- Send POST request to webhook endpoint
- Display response

### Step 2: Check Response

The script will show:
- HTTP status code
- Response headers
- Response body

**Expected responses:**

| Status | Meaning | Next Action |
|--------|---------|-------------|
| 200 OK | Success! | Proceed to Step 3 |
| 401 Unauthorized | Signature mismatch | Check WEBHOOK_SECRET |
| 404 Not Found | User not found | Run SSO test first |
| 400 Bad Request | Invalid payload | Check error details |
| 500 Server Error | Backend error | Check Render logs |

### Step 3: Verify Evidence in Dashboard

1. **Log into Optio dev** as spark-test@optioeducation.com (use SSO URL if logged out)
2. **Navigate to Dashboard**
3. **Look for evidence of submission:**
   - Check active quests
   - Check completed tasks
   - Check portfolio/diploma page

4. **Verify submission details:**
   - Submission text appears
   - Timestamp is correct
   - Grade (if applicable) is recorded

### Step 4: Check Backend Logs (if issues)

If webhook fails, check Render logs:

```bash
# Using Render MCP
mcp__render__list_logs(
  resource: ["srv-d2tnvlvfte5s73ae8npg"],
  limit: 50,
  text: ["spark", "webhook"]
)
```

Look for:
- Signature validation errors
- User lookup errors
- Database errors
- File download errors

---

## Test 3: Webhook with File Attachments (Optional)

This test requires hosting a temporary file URL.

### Step 1: Create Test File URL

Option A: Use a temporary file hosting service
- Upload a test PDF/image to https://tmpfiles.org/
- Get public URL

Option B: Use your own hosting
- Upload to Supabase storage temporarily
- Generate public URL with 24-hour expiry

### Step 2: Modify Webhook Script

Edit `test_spark_webhook.js`:

```javascript
submission_files: [
  {
    url: "https://your-temp-file-url.com/test.pdf",
    type: "application/pdf",
    filename: "test_document.pdf"
  }
]
```

### Step 3: Send Webhook

```bash
node test_spark_webhook.js
```

### Step 4: Verify File Download

1. **Check if file was downloaded** to Optio storage
2. **View in dashboard** - file should appear in evidence
3. **Check Render logs** for download success/failure

---

## Test 4: Edge Cases & Error Handling

### Test 4a: Expired JWT Token

1. **Generate token with past expiry:**
   - Edit `test_spark_sso.js`
   - Change `exp: Math.floor(Date.now() / 1000) - 100` (expired 100 seconds ago)
   - Run script and test URL

2. **Expected result:** 401 Unauthorized or token expired error

### Test 4b: Invalid Signature

1. **Generate token with wrong secret:**
   - Edit `test_spark_sso.js`
   - Change SSO_SECRET to a different value
   - Run script and test URL

2. **Expected result:** 401 Unauthorized

### Test 4c: Tampered Webhook Payload

1. **Send webhook with mismatched signature:**
   - Edit `test_spark_webhook.js`
   - Change payload after calculating signature
   - Run script

2. **Expected result:** 401 Unauthorized

### Test 4d: Missing Required Fields

1. **Send webhook without required fields:**
   - Remove `spark_user_id` from payload
   - Run script

2. **Expected result:** 400 Bad Request

---

## Test 5: Rate Limiting

### Test SSO Rate Limit

The SSO endpoint has a rate limit of **10 requests per minute per IP**.

1. **Run SSO test 11 times rapidly:**
   ```bash
   for i in {1..11}; do node test_spark_sso.js; done
   ```

2. **Expected result:** 11th request should return 429 Too Many Requests

### Test Webhook Rate Limit

The webhook endpoint has a rate limit of **100 requests per minute per IP**.

1. **Run webhook test 101 times rapidly** (careful!)
2. **Expected result:** 101st request should return 429 Too Many Requests

---

## Troubleshooting Guide

### Issue: SSO redirects to login page

**Possible causes:**
1. JWT signature invalid
2. JWT expired
3. JWT missing required claims
4. Backend secret not configured

**Debug steps:**
1. Check Render environment variables (SPARK_SSO_SECRET)
2. Verify secret matches in test script
3. Check JWT payload includes all required fields
4. Check backend logs for validation errors

### Issue: Webhook returns 401

**Possible causes:**
1. HMAC signature invalid
2. Signature missing from header
3. Payload was modified after signing

**Debug steps:**
1. Verify WEBHOOK_SECRET matches Render environment
2. Check signature calculation (HMAC-SHA256, hex digest)
3. Ensure payload is JSON stringified before signing
4. Check X-Spark-Signature header is present

### Issue: Webhook returns 404

**Possible causes:**
1. Test user doesn't exist
2. Spark user ID not mapped
3. Assignment/course doesn't exist

**Debug steps:**
1. Run SSO test first to create user
2. Check database for user with email
3. Verify lms_integrations table has mapping

### Issue: Files not downloading

**Possible causes:**
1. File URL requires authentication
2. File URL expired
3. SSRF protection blocking URL
4. File too large

**Debug steps:**
1. Test URL in browser (should download without login)
2. Check URL expiry time
3. Verify URL uses https://
4. Check file size (< 50MB recommended)

---

## Checklist Before Sending to Spark Team

Use this checklist to ensure everything works:

### SSO Integration
- [ ] JWT token generates correctly
- [ ] SSO URL redirects to dashboard
- [ ] User account created automatically
- [ ] User profile shows correct name/email
- [ ] Spark user ID mapping created
- [ ] Expired tokens are rejected
- [ ] Invalid signatures are rejected
- [ ] Rate limiting works (10 req/min)

### Webhook Integration
- [ ] Webhook accepts valid submissions
- [ ] HMAC signature validates correctly
- [ ] Evidence appears in dashboard
- [ ] Submission text is recorded
- [ ] Timestamp is correct
- [ ] Grade (if applicable) is recorded
- [ ] Invalid signatures are rejected
- [ ] Missing fields return 400 error
- [ ] Rate limiting works (100 req/min)

### File Downloads (if applicable)
- [ ] Public file URLs download successfully
- [ ] Files appear in evidence
- [ ] Multiple files work
- [ ] Large files work (test with 5MB+)

### Documentation
- [ ] SPARK_CREDENTIALS.md is complete
- [ ] All secrets are correct
- [ ] Test account details are accurate
- [ ] Example code works
- [ ] Endpoints are correct (dev vs prod)

---

## Ready to Send?

Once all tests pass:

1. **Review SPARK_CREDENTIALS.md** - ensure all information is accurate
2. **Add testing results** - note any issues found and resolved
3. **Include test scripts** - send test_spark_sso.js and test_spark_webhook.js
4. **Schedule kickoff call** - walk Spark through testing process
5. **Provide support channel** - ensure they can reach you with questions

---

## Test Results Template

Document your test results:

```
SPARK INTEGRATION TEST RESULTS
Date: [DATE]
Tester: [YOUR NAME]
Environment: Optio Dev

SSO Integration:
✅ JWT generation works
✅ SSO login successful
✅ User account created
✅ Profile data correct
✅ Error handling works

Webhook Integration:
✅ Webhook accepted (200 OK)
✅ Signature validation works
✅ Evidence appears in dashboard
✅ Error handling works

Issues Found:
[None / List any issues]

Notes:
[Any additional observations]

Status: READY TO SHARE WITH SPARK TEAM
```

---

**Good luck with testing!**
