# SPARK Integration - Quick Testing Guide
**Time Required**: 30 minutes
**For**: Tanner (pre-Spark developer integration verification)

---

## Prerequisites

### 1. Get Secrets from Render Dashboard
```
Navigate to: https://dashboard.render.com/web/srv-d2tnvlvfte5s73ae8npg/env

Find and copy:
- SPARK_SSO_SECRET
- SPARK_WEBHOOK_SECRET

If missing, generate new ones:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Set Environment Variables
```bash
export SPARK_SSO_SECRET="paste_value_here"
export SPARK_WEBHOOK_SECRET="paste_value_here"
```

---

## Step 1: Create Test Data (5 min)

### Via Supabase Dashboard
```
1. Go to: https://supabase.com/dashboard/project/vvfgxcykxjybtvpfzwyx/sql
2. Click "New Query"
3. Open: setup_spark_test_data.sql
4. Copy entire file contents
5. Paste into Supabase SQL Editor
6. Click "Run"
```

### Expected Output
```
✓ Created new test quest with ID: [uuid]
✓ Created 3 preset tasks for quest
✓ Shows quest details and tasks
```

### Verify Test Data
```sql
-- Copy/paste this into Supabase SQL Editor
SELECT id, title, lms_assignment_id, lms_platform, is_active
FROM quests
WHERE lms_assignment_id = 'test_assignment_001' AND lms_platform = 'spark';
```

**Expected Result**: 1 row with title "Spark Test Assignment - Introduction to Python"

---

## Step 2: Test SSO Login (10 min)

### Generate SSO Token
```bash
node test_spark_sso.js
```

### Expected Output
```
============================================================
SPARK SSO TEST - Generating JWT Token
============================================================

JWT Payload:
{
  "sub": "test_student_001",
  "email": "spark-test@optioeducation.com",
  "given_name": "Spark",
  "family_name": "TestStudent",
  "role": "student",
  ...
}

============================================================
SSO TEST URLS
============================================================

DEV ENVIRONMENT:
https://optio-dev-backend.onrender.com/spark/sso?token=eyJhbGciOi...

[Copy this URL]
```

### Test the SSO Flow
```
1. Copy the DEV ENVIRONMENT URL from output above
2. Open browser in INCOGNITO MODE (to avoid auth conflicts)
3. Paste URL into address bar
4. Press Enter
```

### Expected Behavior
```
✓ Browser redirects to: /auth/callback?code=...
✓ Shows "Completing Sign In..." loading screen
✓ Redirects to: /dashboard
✓ Top-right shows: "Spark TestStudent"
✓ No login prompt appears
```

### If It Fails
```
Error: "SSO not configured"
→ SPARK_SSO_SECRET not set in Render
→ Go to Render dashboard and set it

Error: "Invalid token signature"
→ Wrong secret or expired token
→ Regenerate token with correct secret

Error: "Token expired"
→ Token older than 10 minutes
→ Regenerate fresh token
```

### Verify in Database
```sql
-- Check user created
SELECT id, email, display_name, role
FROM users
WHERE email = 'spark-test@optioeducation.com';
-- Expected: 1 row, role = 'student'

-- Check LMS integration created
SELECT lms_platform, lms_user_id, sync_enabled
FROM lms_integrations
WHERE lms_user_id = 'test_student_001';
-- Expected: 1 row, lms_platform = 'spark'
```

---

## Step 3: Start Test Quest (5 min)

### Option A: Via UI (Recommended)
```
1. Stay logged in as Spark TestStudent
2. Navigate to: Quest Badge Hub
3. Find quest: "Spark Test Assignment - Introduction to Python"
4. Click: "Pick Up Quest"
5. Verify: 3 tasks appear in quest details
```

### Option B: Via API (Advanced)
```bash
# Get access token from browser
# Open DevTools → Application → Local Storage → app_access_token
# Copy the token value

# Get quest ID from database
curl -X POST https://optio-dev-backend.onrender.com/api/quests/[QUEST_ID]/pickup \
  -H "Authorization: Bearer [ACCESS_TOKEN]" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Verify Enrollment
```sql
-- Check user enrolled in quest
SELECT uq.id, uq.is_active, uq.started_at, q.title
FROM user_quests uq
JOIN quests q ON uq.quest_id = q.id
WHERE uq.user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com')
AND q.lms_platform = 'spark';
-- Expected: 1 row, is_active = true

-- Check tasks copied to user
SELECT id, title, pillar, xp_value
FROM user_quest_tasks
WHERE user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com')
AND quest_id = (SELECT id FROM quests WHERE lms_assignment_id = 'test_assignment_001');
-- Expected: 3 rows (tasks from preset)
```

---

## Step 4: Test Text-Only Webhook (5 min)

### Send Test Webhook
```bash
node test_spark_webhook.js
```

### Expected Output
```
============================================================
SPARK WEBHOOK TEST - Sending Test Submission
============================================================

Submission Payload:
{
  "spark_user_id": "test_student_001",
  "spark_assignment_id": "test_assignment_001",
  ...
}

HMAC-SHA256 Signature: abc123...

============================================================
RESPONSE FROM OPTIO
============================================================

Status Code: 200
Status Message: OK

Response Body:
{
  "status": "success",
  "completion_id": "a1b2c3d4-..."
}

============================================================
TEST RESULTS
============================================================

✅ SUCCESS! Webhook accepted by Optio.
```

### If It Fails
```
Status 401: Invalid signature
→ Wrong SPARK_WEBHOOK_SECRET
→ Verify secret matches Render

Status 404: User not found
→ SSO login not completed (Step 2)
→ Re-run SSO test first

Status 404: User has not started quest
→ Quest not started (Step 3)
→ Pick up quest in UI

Status 400: Quest not found for assignment
→ Test data not created (Step 1)
→ Re-run setup_spark_test_data.sql
```

### Verify Evidence Created
```
1. Refresh dashboard
2. Check XP increased (should be +100 or +150)
3. Navigate to: Diploma/Portfolio page
4. Find: Test submission
5. Verify: Submission text appears
```

### Database Verification
```sql
-- Check task completion
SELECT qtc.id, qtc.completed_at, uqt.title
FROM quest_task_completions qtc
JOIN user_quest_tasks uqt ON qtc.user_quest_task_id = uqt.id
WHERE qtc.user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com')
ORDER BY qtc.completed_at DESC
LIMIT 1;
-- Expected: 1 row with today's timestamp

-- Check evidence blocks
SELECT b.block_type, b.content->>'text' as text_content
FROM evidence_document_blocks b
JOIN user_task_evidence_documents d ON b.document_id = d.id
WHERE d.user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com')
ORDER BY d.created_at DESC, b.order_index;
-- Expected: 1 row, block_type = 'text'

-- Check XP awarded
SELECT pillar, xp_amount
FROM user_skill_xp
WHERE user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com');
-- Expected: XP in 'stem' pillar
```

---

## Step 5: Test File Upload Webhook (5 min)

### Send Multipart Webhook
```bash
node test_spark_webhook_multipart.js
```

### Expected Output
```
============================================================
SPARK WEBHOOK TEST - Multipart File Upload
============================================================

Created test files:
  - calculator.py (Python code)
  - test_results.txt (Test results)

Sending multipart request...

============================================================
RESPONSE FROM OPTIO
============================================================

Status Code: 200

Response Body:
{
  "status": "success",
  "completion_id": "b2c3d4e5-..."
}

✅ SUCCESS! Multipart webhook with files accepted.
```

### Verify Files in UI
```
1. Navigate to: Diploma/Portfolio page
2. Find: Latest submission (multipart)
3. Verify: 3 blocks appear
   - 1 text block (submission_text)
   - 1 document block (calculator.py)
   - 1 document block (test_results.txt)
4. Click: File blocks to open them
5. Verify: Files open correctly
```

### Database Verification
```sql
-- Check evidence blocks created
SELECT b.block_type, b.content->>'filename' as filename, b.content->>'url' as url
FROM evidence_document_blocks b
JOIN user_task_evidence_documents d ON b.document_id = d.id
WHERE d.user_id = (SELECT id FROM users WHERE email = 'spark-test@optioeducation.com')
ORDER BY d.created_at DESC, b.order_index
LIMIT 5;
-- Expected: 3 rows (1 text, 2 document)
```

---

## Quick Verification Checklist

### ✅ All Tests Pass Criteria
- [ ] Test data created (1 quest, 3 tasks)
- [ ] SSO login redirects to dashboard
- [ ] User appears as "Spark TestStudent"
- [ ] Quest picked up successfully (3 tasks visible)
- [ ] Text webhook returns 200 + completion_id
- [ ] Evidence appears in portfolio
- [ ] XP increased
- [ ] File webhook returns 200 + completion_id
- [ ] Files appear in portfolio (2 files)
- [ ] Files open correctly when clicked

### ❌ If Any Test Fails
1. Note the exact error message
2. Check Render logs: https://dashboard.render.com/web/srv-d2tnvlvfte5s73ae8npg/logs
3. Search logs for "spark" or "SPARK" (case-insensitive)
4. Copy error stack trace
5. Reference SPARK_INTEGRATION_FIX_PLAN.md troubleshooting section

---

## What to Check in Render Dashboard

### Environment Tab
```
Navigate to: https://dashboard.render.com/web/srv-d2tnvlvfte5s73ae8npg/environment

Verify these exist:
✓ SPARK_SSO_SECRET (64 char hex)
✓ SPARK_WEBHOOK_SECRET (64 char hex)
✓ FRONTEND_URL (https://optio-dev-frontend.onrender.com)
```

### Logs Tab
```
Navigate to: https://dashboard.render.com/web/srv-d2tnvlvfte5s73ae8npg/logs

Look for these messages after testing:
✓ "Spark SSO login attempt: user_id=test_student_001"
✓ "Spark SSO successful: user_id=[uuid], code issued"
✓ "Token exchange successful: user_id=[uuid]"
✓ "Processing Spark webhook submission"
✓ "Task completed successfully with ID: [uuid]"
✓ "Uploaded Spark file calculator.py to [path]"

🚫 Should NOT see:
✗ "SPARK_SSO_SECRET not configured"
✗ "Invalid signature"
✗ "User not found"
✗ "Quest not found"
```

---

## After All Tests Pass

### 1. Commit Changes
```bash
git add backend/routes/spark_integration.py
git add SPARK_INTEGRATION.md
git add test_spark_webhook_multipart.js
git add setup_spark_test_data.sql
git add SPARK_INTEGRATION_*.md
git commit -m "Fix: SPARK integration - missing import, updated OAuth docs, added multipart test

- Fixed missing import of get_course_tasks_for_quest in spark_integration.py
- Updated SPARK_INTEGRATION.md to document OAuth 2.0 authorization code flow
- Clarified file upload pattern (multipart/form-data instead of URLs)
- Added multipart webhook test script with auto-generated test files
- Added SQL setup script for test data creation
- Created comprehensive testing plan (39 test cases)

All 3 identified issues resolved. Integration ready for Spark developer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### 2. Share with Spark Developer

**Send via Email/Slack**:
```
Subject: Optio-Spark Integration Ready for Development

Hi [Spark Developer],

The Optio-Spark LMS integration is ready for your development work. All issues have been resolved and the system has been tested end-to-end.

📄 Main Integration Guide:
https://github.com/[your-repo]/blob/develop/SPARK_INTEGRATION.md

🔧 Test Scripts (reference implementations):
- test_spark_sso.js (SSO token generation)
- test_spark_webhook.js (text-only webhook)
- test_spark_webhook_multipart.js (file upload webhook)

🔐 Secrets (via separate secure channel):
- SPARK_SSO_SECRET: [share via password manager]
- SPARK_WEBHOOK_SECRET: [share via password manager]

🧪 Test Environment:
- Dev Backend: https://optio-dev-backend.onrender.com
- Dev Frontend: https://optio-dev-frontend.onrender.com

Key Integration Points:
1. SSO: POST JWT to /spark/sso endpoint (see SPARK_INTEGRATION.md lines 256-322)
2. Webhook: POST to /spark/webhook/submission (lines 323-436)
3. Files: Use multipart/form-data (lines 363-423)

Let me know when you're ready to schedule a kickoff meeting to review the integration flow.

Best,
Tanner
```

### 3. Schedule Kickoff Meeting

**Agenda**:
- Review OAuth 2.0 flow (10 min)
- Review webhook structure (10 min)
- Discuss error handling (5 min)
- Live demo of test scripts (10 min)
- Q&A (15 min)

---

## Troubleshooting Quick Reference

| Error | Cause | Fix |
|-------|-------|-----|
| SSO not configured | Missing env var | Set SPARK_SSO_SECRET in Render |
| Invalid signature | Wrong secret | Verify secrets match |
| User not found | No SSO login | Run test_spark_sso.js first |
| Quest not found | Missing test data | Run setup_spark_test_data.sql |
| User has not started quest | Quest not picked up | Pick up quest in UI |
| 500 error on webhook | Backend error | Check Render logs |
| Files not appearing | Wrong upload method | Use multipart/form-data |

---

## Time Breakdown

| Step | Task | Time |
|------|------|------|
| 1 | Create test data | 5 min |
| 2 | Test SSO login | 10 min |
| 3 | Start test quest | 5 min |
| 4 | Test text webhook | 5 min |
| 5 | Test file webhook | 5 min |
| **Total** | | **30 min** |

---

## Success! 🎉

If all tests pass, the integration is ready for production. The Spark developer can begin their integration work with confidence that the Optio side is fully functional.

**Next**: Share integration guide and secrets with Spark developer, then monitor initial integration progress.
