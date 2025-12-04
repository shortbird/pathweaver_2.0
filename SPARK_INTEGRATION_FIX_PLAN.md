# SPARK Integration Fix Plan
**Created**: December 3, 2025
**Timeline**: 1-2 hours total
**Priority**: High (before Spark developer integration)

---

## Issue Summary

| # | Issue | Priority | Time | Status |
|---|-------|----------|------|--------|
| 1 | Missing import in spark_integration.py | HIGH | 5 min | Ready to fix |
| 2 | OAuth documentation inconsistency | MEDIUM | 15 min | Ready to fix |
| 3 | File upload pattern clarification | MEDIUM | 10 min | Ready to fix |
| 4 | Verify Render environment variables | HIGH | Manual check | Need access |

---

## Issue #1: Missing Import

### Problem
Line 686 in `backend/routes/spark_integration.py` calls `get_course_tasks_for_quest()` but the function is not imported.

### Location
```python
# Line 686 in backend/routes/spark_integration.py
preset_tasks = get_course_tasks_for_quest(quest_id)  # ❌ Function not imported
```

### Impact
- Auto-enrollment will fail when Spark sends webhook for course-type quests
- Students won't get tasks copied to their `user_quest_tasks` table
- Webhook will return 500 error

### Fix
Add import at top of file (after line 30):

```python
from routes.quest_types import get_course_tasks_for_quest
```

### Testing
1. Create test course quest with preset tasks
2. Send webhook submission for that quest
3. Verify tasks are copied to user_quest_tasks
4. Verify no 500 error

**Status**: Ready to apply

---

## Issue #2: OAuth Documentation Inconsistency

### Problem
SPARK_INTEGRATION.md describes old authentication pattern (httpOnly cookies only) but code implements OAuth 2.0 authorization code flow.

### Locations to Update

#### Section 1: Lines 459-462 (Session Management)
**Current**:
```markdown
**Session Management:**
- httpOnly cookies for CSRF protection
- Access tokens in URL (for cross-origin scenarios where cookies may be blocked)
- Refresh tokens for long-lived sessions
```

**Should be**:
```markdown
**Session Management:**
- OAuth 2.0 authorization code flow (industry standard for SSO)
- One-time authorization codes (60-second expiry, single-use)
- Tokens returned in response body AND httpOnly cookies (cross-origin support)
- Access tokens for API authentication (1-hour expiry)
- Refresh tokens for session renewal (30-day expiry)
```

#### Section 2: Lines 286-299 (Why Use Authorization Code Flow)
**Current**: Explains cross-origin cookie issues

**Should add**:
```markdown
**Implementation Details:**
The backend returns tokens in BOTH response body and httpOnly cookies:
- Response body tokens: Used by frontend for API requests (Authorization header)
- httpOnly cookies: Fallback for same-origin deployments
- Frontend stores tokens using tokenStore.setTokens() for persistence
- This matches the regular /api/auth/login authentication pattern
```

#### Section 3: Lines 56-70 (Architecture Flow)
**Current**: Step 6 says "Create auth session (httpOnly cookies + URL tokens)"

**Should be**: "Create auth session (OAuth 2.0 authorization code)"

### Testing
- Review updated documentation for clarity
- Verify code matches documented flow

**Status**: Ready to apply

---

## Issue #3: File Upload Pattern Clarification

### Problem
Documentation (lines 363-369) says Spark should provide **file URLs** for Optio to download, but code (lines 755-813) expects **multipart file uploads**.

### Current Documentation Says
```markdown
**File URL Requirements:**
- Publicly accessible - No authentication required
- Valid for 24+ hours - Optio needs time to download
- HTTPS only - HTTP URLs rejected for security
- Correct Content-Type headers - Must match file type
- No redirects - Must return file content directly
```

### Code Actually Does
```python
# Lines 755-813: Direct multipart file upload processing
for file_key in files:
    file = files[file_key]
    file_content = file.read()  # Reads from multipart upload
    # Validates size, MIME type
    # Uploads directly to Supabase storage
```

### Decision Required
**Option A**: Keep multipart uploads, update documentation
- **Pros**: Simpler for Spark (no temporary file hosting), already implemented
- **Cons**: Larger webhook payload size
- **Recommendation**: CHOOSE THIS (easier for Spark)

**Option B**: Implement URL downloads as documented
- **Pros**: Smaller webhook payload, matches documentation
- **Cons**: Requires Spark to host files temporarily, adds complexity
- **Recommendation**: Only if Spark specifically requests this

### Fix for Option A (Recommended)
Update SPARK_INTEGRATION.md lines 363-369:

**Replace**:
```markdown
**File URL Requirements:**
- Publicly accessible - No authentication required
- Valid for 24+ hours - Optio needs time to download
```

**With**:
```markdown
**File Upload Method:**
Use multipart/form-data for submissions with files:
- Content-Type: multipart/form-data
- metadata: JSON string with submission data (spark_user_id, spark_assignment_id, etc.)
- file1, file2, ...: File attachments (binary data)

**File Constraints:**
- 50MB per file maximum
- 200MB total upload size
- Allowed types: images (JPEG, PNG, GIF, WebP), videos (MP4, MOV, AVI), documents (PDF, Word, TXT)

**Signature Calculation:**
Sign the metadata JSON string ONLY (not the entire multipart body):
```

Update lines 336-343 (Request Body section) to emphasize multipart structure.

### Testing
- Send multipart webhook with files
- Verify files upload to Supabase storage
- Verify evidence blocks created correctly

**Status**: Ready to apply after decision

---

## Issue #4: Verify Environment Variables

### Required Variables

#### Development (srv-d2tnvlvfte5s73ae8npg)
- `SPARK_SSO_SECRET` - 64-char hex secret for JWT validation
- `SPARK_WEBHOOK_SECRET` - 64-char hex secret for HMAC validation
- `SPARK_STORAGE_DOMAINS` - "spark-storage.com,spark-cdn.com" (SSRF protection)
- `FRONTEND_URL` - "https://optio-dev-frontend.onrender.com"

#### Production (srv-d2to00vfte5s73ae9310)
- `SPARK_SSO_SECRET` - Same as dev (or different for security isolation)
- `SPARK_WEBHOOK_SECRET` - Same as dev (or different)
- `SPARK_STORAGE_DOMAINS` - "spark-storage.com,spark-cdn.com"
- `FRONTEND_URL` - "https://www.optioeducation.com"

### How to Verify
1. Go to Render Dashboard: https://dashboard.render.com
2. Navigate to Services → optio-dev-backend → Environment
3. Check if these variables exist and have values set
4. Repeat for optio-prod-backend

### If Missing
Generate new secrets:
```bash
# Generate 64-character hex secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set in Render dashboard:
1. Click "Add Environment Variable"
2. Key: SPARK_SSO_SECRET
3. Value: [generated secret]
4. Save and redeploy

**Status**: Manual verification required (need Render dashboard access)

---

## Complete Testing Plan

### Phase 1: Environment Setup (10 minutes)

#### Step 1.1: Verify Environment Variables
```bash
# Check Render dashboard for all SPARK_* variables
# If missing, generate and set them
```

#### Step 1.2: Create Test Data
```sql
-- Run via Supabase MCP execute_sql
-- Create test quest for Spark integration
INSERT INTO quests (id, title, quest_type, lms_platform, lms_assignment_id, lms_course_id, is_active)
VALUES (
  gen_random_uuid(),
  'Spark Test Assignment - Introduction to Python',
  'course',
  'spark',
  'test_assignment_001',
  'test_course_001',
  true
);

-- Create preset tasks for the quest (get quest_id from above insert)
INSERT INTO quest_preset_tasks (quest_id, title, description, pillar, xp_value, order_index)
VALUES
  ('[quest_id]', 'Complete Python Basics Module', 'Learn variables, loops, and functions', 'stem', 100, 1),
  ('[quest_id]', 'Build Calculator Program', 'Create a simple calculator', 'stem', 150, 2),
  ('[quest_id]', 'Debug Existing Code', 'Fix 5 common Python errors', 'stem', 100, 3);
```

**Deliverable**: Test quest exists with 3 preset tasks

---

### Phase 2: SSO Testing (15 minutes)

#### Step 2.1: Generate Test Token
```bash
# Set environment variable
export SPARK_SSO_SECRET="[value from Render]"

# Run test script
node test_spark_sso.js

# Expected output:
# - JWT token generated
# - Dev URL displayed
```

#### Step 2.2: Test SSO Flow
1. Copy dev URL from test script output
2. Paste into browser (incognito mode)
3. Observe redirect behavior

**Expected Results**:
- ✅ Redirects to `/auth/callback?code=...`
- ✅ Shows "Completing Sign In..." loading screen
- ✅ Redirects to `/dashboard`
- ✅ User logged in as "Spark TestStudent"
- ✅ Email shows "spark-test@optioeducation.com"

**Verify in Database**:
```sql
-- Check user created
SELECT id, email, display_name, role FROM users WHERE email = 'spark-test@optioeducation.com';

-- Check LMS integration created
SELECT * FROM lms_integrations WHERE lms_platform = 'spark' AND lms_user_id = 'test_student_001';

-- Check auth code was used
SELECT code, user_id, used, expires_at FROM spark_auth_codes ORDER BY created_at DESC LIMIT 1;
```

**Test Cases**:
- ✅ First-time login (creates user)
- ✅ Repeat login (links to existing user)
- ✅ Expired token (should show error)
- ✅ Invalid signature (should show error)

**Deliverable**: SSO flow working end-to-end

---

### Phase 3: Webhook Testing - Text Only (20 minutes)

#### Step 3.1: Verify Test User Enrolled
**Before sending webhook, user must start the quest**:
1. Log in as spark-test@optioeducation.com (via SSO)
2. Navigate to Quest Badge Hub
3. Find "Spark Test Assignment - Introduction to Python"
4. Click "Pick Up Quest"
5. Verify quest appears in active quests

**Or via API**:
```bash
# Get access token from browser dev tools (Application → Local Storage → app_access_token)
curl -X POST https://optio-dev-backend.onrender.com/api/quests/[quest_id]/pickup \
  -H "Authorization: Bearer [access_token]" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Step 3.2: Send Text-Only Webhook
```bash
# Set environment variable
export SPARK_WEBHOOK_SECRET="[value from Render]"

# Run test script
node test_spark_webhook.js

# Expected output:
# - Signature calculated
# - Request sent to dev backend
# - Response: {"status": "success", "completion_id": "..."}
```

#### Step 3.3: Verify Evidence Created
**Check in UI**:
1. Refresh dashboard
2. Check XP increased
3. Navigate to diploma page
4. Verify test submission appears

**Check in Database**:
```sql
-- Check task completion
SELECT * FROM quest_task_completions
WHERE user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com')
ORDER BY completed_at DESC LIMIT 1;

-- Check evidence document
SELECT * FROM user_task_evidence_documents
WHERE user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com')
ORDER BY created_at DESC LIMIT 1;

-- Check evidence blocks
SELECT b.block_type, b.content, b.order_index
FROM evidence_document_blocks b
JOIN user_task_evidence_documents d ON b.document_id = d.id
WHERE d.user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com')
ORDER BY d.created_at DESC, b.order_index;

-- Check XP awarded
SELECT * FROM user_skill_xp
WHERE user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com');
```

**Test Cases**:
- ✅ Valid signature (accepted)
- ✅ Invalid signature (rejected with 401)
- ✅ Missing fields (rejected with 400)
- ✅ Old timestamp (rejected with 400 - replay protection)
- ✅ Duplicate submission (returns existing completion_id)
- ✅ User not enrolled (rejected with 404)

**Deliverable**: Webhook processes text submissions correctly

---

### Phase 4: Webhook Testing - With Files (30 minutes)

#### Step 4.1: Create Test Files
```bash
# Create test files directory
mkdir -p spark_test_files

# Create test text file
echo "This is my Python calculator program.

def add(a, b):
    return a + b

def subtract(a, b):
    return a - b

print(add(5, 3))  # Output: 8
" > spark_test_files/calculator.py

# Download sample image (or use any image)
curl -o spark_test_files/screenshot.png https://via.placeholder.com/800x600.png

# Create test PDF (if you have wkhtmltopdf installed)
# Or just copy any existing PDF file
```

#### Step 4.2: Create Multipart Webhook Script
**Create `test_spark_webhook_multipart.js`**:
```javascript
const crypto = require('crypto');
const FormData = require('form-data');
const fs = require('fs');
const https = require('https');

const WEBHOOK_SECRET = process.env.SPARK_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error('ERROR: SPARK_WEBHOOK_SECRET not set');
  process.exit(1);
}

// Metadata (signed)
const metadata = {
  spark_user_id: 'test_student_001',
  spark_assignment_id: 'test_assignment_001',
  spark_course_id: 'test_course_001',
  submission_text: 'I completed the Python calculator assignment. See attached code and screenshot of working output.',
  submitted_at: new Date().toISOString(),
  grade: 95
};

const metadataJson = JSON.stringify(metadata);

// Calculate signature on metadata only
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(metadataJson)
  .digest('hex');

// Create form data
const form = new FormData();
form.append('metadata', metadataJson);
form.append('file1', fs.createReadStream('spark_test_files/calculator.py'), {
  filename: 'calculator.py',
  contentType: 'text/plain'
});
form.append('file2', fs.createReadStream('spark_test_files/screenshot.png'), {
  filename: 'screenshot.png',
  contentType: 'image/png'
});

console.log('Sending multipart webhook with 2 files...');
console.log('Signature:', signature);

// Send request
const req = https.request({
  hostname: 'optio-dev-backend.onrender.com',
  path: '/spark/webhook/submission',
  method: 'POST',
  headers: {
    'X-Spark-Signature': signature,
    ...form.getHeaders()
  }
}, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Response:', JSON.parse(data));
    if (res.statusCode === 200) {
      console.log('✅ SUCCESS! Files uploaded.');
    }
  });
});

form.pipe(req);
```

#### Step 4.3: Send Multipart Webhook
```bash
# Install form-data if needed
npm install form-data

# Run test
node test_spark_webhook_multipart.js
```

#### Step 4.4: Verify Files Uploaded
**Check in UI**:
1. Navigate to diploma page
2. Find the submission
3. Verify 2 file blocks appear (calculator.py, screenshot.png)
4. Click files to verify they open correctly

**Check in Database**:
```sql
-- Check evidence blocks
SELECT b.block_type, b.content->>'filename' as filename, b.content->>'url' as url
FROM evidence_document_blocks b
JOIN user_task_evidence_documents d ON b.document_id = d.id
WHERE d.user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com')
ORDER BY d.created_at DESC, b.order_index;
```

**Check in Supabase Storage**:
1. Go to Supabase Dashboard
2. Navigate to Storage → evidence-files bucket
3. Find uploaded files (organized by user_id)
4. Verify files are accessible

**Test Cases**:
- ✅ Text file upload (.py, .txt)
- ✅ Image file upload (.png, .jpg)
- ✅ Document file upload (.pdf)
- ✅ Multiple files in one submission
- ✅ Large file (near 50MB limit)
- ✅ File size limit exceeded (rejected)
- ✅ Invalid MIME type (rejected)

**Deliverable**: Webhook processes file uploads correctly

---

### Phase 5: Evidence Editing Test (10 minutes)

#### Step 5.1: Edit Evidence in UI
1. Log in as spark-test@optioeducation.com
2. Navigate to diploma page
3. Find Spark submission
4. Click "Edit Evidence"
5. Add new text block
6. Reorder blocks
7. Save changes

#### Step 5.2: Verify Changes Persist
**Check in UI**:
- Refresh page
- Verify edits saved

**Check in Database**:
```sql
-- Check evidence blocks updated
SELECT b.block_type, b.content, b.order_index, d.updated_at
FROM evidence_document_blocks b
JOIN user_task_evidence_documents d ON b.document_id = d.id
WHERE d.user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com')
ORDER BY d.created_at DESC, b.order_index;
```

**Deliverable**: Evidence is editable after webhook submission (unified evidence system)

---

### Phase 6: Edge Cases & Error Handling (20 minutes)

#### Test 6.1: Expired JWT Token
```bash
# Modify test_spark_sso.js to use old expiry
exp: Math.floor(Date.now() / 1000) - 600  # 10 minutes ago

# Run test
node test_spark_sso.js
# Open URL, expect 401 error
```

#### Test 6.2: Invalid JWT Signature
```bash
# Modify test_spark_sso.js to use wrong secret
const token = jwt.sign(payload, 'wrong_secret', { algorithm: 'HS256' });

# Run test
node test_spark_sso.js
# Open URL, expect 401 error
```

#### Test 6.3: Invalid Webhook Signature
```bash
# Modify test_spark_webhook.js to use wrong secret
const signature = crypto.createHmac('sha256', 'wrong_secret')...

# Run test
node test_spark_webhook.js
# Expect 401 error
```

#### Test 6.4: Replay Attack Protection
```bash
# Modify webhook to use old timestamp
submitted_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()  # 10 minutes ago

# Run test
node test_spark_webhook.js
# Expect 400 error: "Submission timestamp too old"
```

#### Test 6.5: User Not Enrolled
```bash
# Create new test user without enrolling in quest
# Send webhook for that user
# Expect 404 error: "User has not started quest"
```

#### Test 6.6: Assignment Not Found
```bash
# Send webhook with non-existent assignment ID
spark_assignment_id: 'nonexistent_assignment'

# Run test
# Expect 400 error: "Quest not found for assignment"
```

#### Test 6.7: Duplicate Submission (Idempotency)
```bash
# Send same webhook twice
node test_spark_webhook.js
node test_spark_webhook.js

# Both should return 200 with same completion_id
# Check database - only 1 completion record exists
```

**Deliverable**: All error cases handled gracefully

---

### Phase 7: Performance & Monitoring (10 minutes)

#### Test 7.1: Check Activity Tracking
```sql
-- Check SSO activity events
SELECT event_type, event_data, created_at
FROM user_activity_events
WHERE event_type LIKE 'spark_%'
ORDER BY created_at DESC
LIMIT 20;

-- Expected events:
-- spark_sso_success
-- spark_token_exchange_success
-- spark_webhook_success
```

#### Test 7.2: Check Webhook Processing Time
```sql
-- Check processing time from activity events
SELECT
  event_data->>'processing_time_ms' as processing_time_ms,
  event_data->>'file_count' as file_count,
  created_at
FROM user_activity_events
WHERE event_type = 'spark_webhook_success'
ORDER BY created_at DESC
LIMIT 10;

-- Processing time should be < 2000ms for most submissions
```

#### Test 7.3: Check Error Logs
Go to Render Dashboard:
1. Services → optio-dev-backend → Logs
2. Search for "spark" (case-insensitive)
3. Look for any ERROR or WARNING logs
4. Verify no unexpected errors

**Deliverable**: Monitoring and tracking working correctly

---

### Phase 8: Production Readiness (5 minutes)

#### Checklist
- [ ] All test cases pass in dev environment
- [ ] Environment variables set in prod environment
- [ ] Documentation updated and accurate
- [ ] Test scripts work with prod URLs
- [ ] Error handling covers all edge cases
- [ ] Activity tracking captures all events
- [ ] No sensitive data logged
- [ ] Rate limiting configured (10/min SSO, 100/min webhook)

#### Pre-Production Test
```bash
# Generate prod SSO token (if ready)
export SPARK_SSO_SECRET="[prod secret]"
node test_spark_sso.js

# Use prod URL from output (confirm with team before opening)
```

**Deliverable**: Production environment ready for Spark integration

---

## Testing Summary

| Phase | Duration | Test Cases | Success Criteria |
|-------|----------|------------|------------------|
| 1. Setup | 10 min | 2 | Test data exists |
| 2. SSO | 15 min | 4 | User login works |
| 3. Webhook Text | 20 min | 6 | Text submissions work |
| 4. Webhook Files | 30 min | 7 | File uploads work |
| 5. Evidence Edit | 10 min | 2 | Edits persist |
| 6. Edge Cases | 20 min | 7 | Errors handled |
| 7. Performance | 10 min | 3 | Tracking works |
| 8. Production | 5 min | 8 | Ready for launch |
| **Total** | **120 min** | **39 test cases** | **All pass** |

---

## Success Metrics

### Functional Requirements
- ✅ SSO login creates user account
- ✅ Webhook creates task completion
- ✅ Evidence appears in portfolio
- ✅ XP awarded correctly
- ✅ Files upload to storage
- ✅ Evidence is editable after webhook

### Security Requirements
- ✅ JWT signature validation works
- ✅ HMAC signature validation works
- ✅ Replay protection works
- ✅ One-time code enforcement works
- ✅ File type validation works
- ✅ File size limits enforced

### Performance Requirements
- ✅ Webhook processing < 2 seconds
- ✅ SSO redirect < 500ms
- ✅ Token exchange < 200ms
- ✅ File upload < 5 seconds per file

### Monitoring Requirements
- ✅ All events tracked in user_activity_events
- ✅ Error logs contain actionable information
- ✅ No sensitive data in logs

---

## Post-Testing Actions

### If All Tests Pass
1. ✅ Mark integration as production-ready
2. ✅ Notify Spark developer integration can begin
3. ✅ Schedule monitoring review (1 week after launch)
4. ✅ Document any unexpected behaviors

### If Tests Fail
1. ❌ Document failure details (logs, database state, screenshots)
2. ❌ Identify root cause
3. ❌ Apply fix
4. ❌ Re-run failed test case
5. ❌ Re-run full test suite to verify no regressions

---

## Next Steps After Testing

1. **Share with Spark Developer**:
   - SPARK_INTEGRATION.md (updated)
   - Test scripts (test_spark_sso.js, test_spark_webhook.js)
   - Environment variable values (secure channel)
   - Expected response formats

2. **Coordinate Integration**:
   - Schedule kickoff meeting
   - Review authentication flow
   - Review webhook payload structure
   - Agree on error handling approach
   - Set up shared testing environment

3. **Monitor Initial Integration**:
   - Watch Render logs for webhook activity
   - Track activity events for error patterns
   - Review user feedback (if any)
   - Measure performance metrics

4. **Post-Launch Review** (1 week):
   - Webhook success rate (target: >99%)
   - Average processing time (target: <2s)
   - Error rate (target: <1%)
   - User feedback (target: positive)

---

## Contact Information

**For Issues During Testing**:
- Check SPARK_INTEGRATION.md Troubleshooting section (lines 621-732)
- Review Render logs for error messages
- Check Supabase database for data consistency

**For Questions**:
- SSO authentication: Review OAuth 2.0 flow diagram (SPARK_INTEGRATION.md lines 49-89)
- Webhook processing: Review architecture diagram (lines 91-125)
- Evidence system: Review block-based evidence docs (lines 398-405)
