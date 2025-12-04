# SPARK Course Sync Integration Guide

**Purpose**: Automatically sync SPARK courses to Optio quests via webhook
**Audience**: SPARK Developer
**Last Updated**: January 4, 2025

---

## Overview

When you create or update a course in SPARK, you can now automatically create/update the corresponding quest in Optio by sending a webhook. This eliminates manual setup and ensures courses are always in sync.

### How It Works

```
SPARK Course Created/Updated
    ↓
SPARK sends POST to: /spark/webhook/course
    ↓
Optio validates HMAC signature
    ↓
Optio creates/updates quest
    ↓
Optio creates task library entries for assignments
    ↓
Returns success with quest_id
```

### Benefits

- **Zero manual work**: No need to manually create quests in Optio admin panel
- **Always in sync**: Course changes in SPARK automatically update Optio quests
- **Assignment mapping**: Assignments get IDs mapped for submission webhooks
- **Idempotent**: Safe to resend - won't create duplicates

---

## Webhook Endpoint Details

### Production URL
```
POST https://optio-prod-backend.onrender.com/spark/webhook/course
```

### Dev URL (Testing)
```
POST https://optio-dev-backend.onrender.com/spark/webhook/course
```

### Authentication
HMAC-SHA256 signature using `SPARK_WEBHOOK_SECRET` (same secret as submission webhooks)

### Rate Limit
50 requests per minute per IP

---

## Request Format

### Headers
```
Content-Type: application/json
X-Spark-Signature: <hmac_sha256_hex_digest>
```

### Body (JSON)
```json
{
  "spark_org_id": "24",
  "spark_course_id": "course_bio101",
  "course_title": "Biology 101",
  "course_description": "Introduction to cellular biology and life sciences",
  "assignments": [
    {
      "spark_assignment_id": "assign_bio_001",
      "title": "Cell Structure Lab Report",
      "description": "Document your observations of cell structures under microscope",
      "due_date": "2025-02-15T23:59:59Z"
    },
    {
      "spark_assignment_id": "assign_bio_002",
      "title": "Photosynthesis Essay",
      "description": "Explain the process of photosynthesis in detail"
    }
  ]
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spark_org_id` | string | Yes | SPARK organization ID (e.g., "24") |
| `spark_course_id` | string | Yes | Unique course identifier in SPARK |
| `course_title` | string | Yes | Course name (becomes quest title) |
| `course_description` | string | No | Course description (optional) |
| `assignments` | array | No | Array of assignment objects |
| `assignments[].spark_assignment_id` | string | Yes | Unique assignment identifier |
| `assignments[].title` | string | Yes | Assignment title (becomes task title) |
| `assignments[].description` | string | No | Assignment description (optional) |
| `assignments[].due_date` | string (ISO 8601) | No | Assignment due date (optional) |

---

## HMAC Signature Calculation

### Algorithm: HMAC-SHA256

**Step 1**: Convert JSON body to string (no whitespace, sorted keys)
```javascript
const payload = JSON.stringify(data, null, 0);  // Compact JSON
```

**Step 2**: Calculate HMAC
```javascript
const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', SPARK_WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');
```

**Step 3**: Add to request header
```javascript
headers: {
  'Content-Type': 'application/json',
  'X-Spark-Signature': signature
}
```

### Full Example (Node.js)
```javascript
const crypto = require('crypto');
const axios = require('axios');

const WEBHOOK_SECRET = process.env.SPARK_WEBHOOK_SECRET;
const OPTIO_URL = 'https://optio-prod-backend.onrender.com/spark/webhook/course';

const courseData = {
  spark_org_id: "24",
  spark_course_id: "course_bio101",
  course_title: "Biology 101",
  course_description: "Intro to biology",
  assignments: [
    {
      spark_assignment_id: "assign_001",
      title: "Lab Report",
      description: "Document observations"
    }
  ]
};

// Calculate signature
const payload = JSON.stringify(courseData);
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');

// Send webhook
try {
  const response = await axios.post(OPTIO_URL, courseData, {
    headers: {
      'Content-Type': 'application/json',
      'X-Spark-Signature': signature
    }
  });

  console.log('Success:', response.data);
  // { success: true, quest_id: "uuid", task_count: 1, message: "Quest synced" }
} catch (error) {
  console.error('Error:', error.response?.data);
}
```

---

## Response Format

### Success Response (200 OK)
```json
{
  "success": true,
  "quest_id": "550e8400-e29b-41d4-a716-446655440000",
  "task_count": 3,
  "message": "Quest 'Biology 101' synced successfully"
}
```

### Error Responses

#### 400 Bad Request - Missing Required Fields
```json
{
  "error": "Missing spark_course_id or course_title"
}
```

#### 401 Unauthorized - Invalid Signature
```json
{
  "error": "Invalid signature"
}
```

#### 401 Unauthorized - Missing Signature
```json
{
  "error": "Missing signature"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Course sync failed"
}
```

---

## What Optio Does

### On First Webhook (Course Creation)
1. Creates new quest with:
   - `title` = `course_title`
   - `description` = `course_description`
   - `quest_type` = `"course"`
   - `lms_course_id` = `spark_course_id`
   - `is_public` = `false` (course quests are not public)
   - `is_active` = `true`

2. Creates task library entries for each assignment:
   - `title` = assignment title
   - `description` = assignment description
   - `spark_assignment_id` = assignment ID (for submission mapping)
   - `pillar` = `"stem"` (default)
   - `xp_value` = `100` (default)

3. Returns quest_id and task count

### On Subsequent Webhooks (Course Update)
1. Finds existing quest by `lms_course_id` = `spark_course_id`
2. Updates quest title and description
3. Updates existing tasks that match `spark_assignment_id`
4. Creates new tasks for new assignments
5. Returns same quest_id with updated task count

**Note**: Optio does NOT delete tasks if you remove assignments. This preserves student work. If you need to remove assignments, do it manually in Optio admin panel.

---

## Integration Steps

### Step 1: Identify Trigger Events

Determine when to send webhooks:
- ✅ **Course created** in SPARK
- ✅ **Course title/description updated**
- ✅ **Assignment added** to course
- ✅ **Assignment title/description updated**
- ⚠️ **Assignment deleted** (optional - Optio won't delete existing tasks)

### Step 2: Implement Webhook Sender

Create a function in your SPARK codebase:

```javascript
async function syncCourseToOptio(course) {
  const webhookUrl = process.env.OPTIO_WEBHOOK_URL;
  const webhookSecret = process.env.SPARK_WEBHOOK_SECRET;

  // Build payload
  const payload = {
    spark_org_id: course.organization_id,
    spark_course_id: course.id,
    course_title: course.title,
    course_description: course.description,
    assignments: course.assignments.map(a => ({
      spark_assignment_id: a.id,
      title: a.title,
      description: a.description,
      due_date: a.due_date  // ISO 8601 format
    }))
  };

  // Calculate signature
  const payloadStr = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadStr)
    .digest('hex');

  // Send webhook
  try {
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Spark-Signature': signature
      },
      timeout: 10000  // 10 second timeout
    });

    console.log(`✅ Course ${course.id} synced to Optio quest ${response.data.quest_id}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to sync course ${course.id}:`, error.message);
    throw error;
  }
}
```

### Step 3: Call on Course Events

```javascript
// When course is created
async function createCourse(courseData) {
  const course = await db.courses.create(courseData);

  // Sync to Optio
  try {
    await syncCourseToOptio(course);
  } catch (error) {
    // Log error but don't block course creation
    logger.error('Optio sync failed', error);
  }

  return course;
}

// When course is updated
async function updateCourse(courseId, updates) {
  const course = await db.courses.update(courseId, updates);

  // Sync to Optio
  try {
    await syncCourseToOptio(course);
  } catch (error) {
    logger.error('Optio sync failed', error);
  }

  return course;
}
```

### Step 4: Test in Dev Environment

Use the test script provided:

```bash
# Set dev webhook secret
export SPARK_WEBHOOK_SECRET="your_dev_secret"

# Run test script
node test_spark_course_webhook.js

# Copy curl command from output and run it
curl -X POST https://optio-dev-backend.onrender.com/spark/webhook/course \
  -H "Content-Type: application/json" \
  -H "X-Spark-Signature: <signature>" \
  -d '<payload>'
```

Verify in Optio dev environment:
1. Log into https://optio-dev-frontend.onrender.com/admin
2. Navigate to Quests
3. Find "Biology 101" (or your test course)
4. Verify quest exists with correct data

### Step 5: Deploy to Production

1. Set production environment variables:
   ```bash
   OPTIO_WEBHOOK_URL=https://optio-prod-backend.onrender.com/spark/webhook/course
   SPARK_WEBHOOK_SECRET=<production_secret>
   ```

2. Deploy your webhook sender code

3. Test with one real course in demo org (ID: 24)

4. Monitor logs for webhook success/failure

5. Verify quest creation in Optio production

---

## Testing Checklist

### Create Test
- [ ] Send webhook with new course
- [ ] Verify quest created in Optio
- [ ] Check quest_type = "course"
- [ ] Check lms_course_id matches spark_course_id
- [ ] Verify task library entries created
- [ ] Check spark_assignment_id mapping

### Update Test
- [ ] Send webhook again with same spark_course_id but different title
- [ ] Verify quest title updated (not duplicated)
- [ ] Add new assignment to payload
- [ ] Verify new task created
- [ ] Check existing tasks unchanged

### Error Handling
- [ ] Send webhook without signature → 401
- [ ] Send webhook with wrong signature → 401
- [ ] Send webhook with missing spark_course_id → 400
- [ ] Send webhook with missing course_title → 400

### Submission Integration
- [ ] Create course via webhook
- [ ] Student logs in via SSO
- [ ] Student enrolls in quest
- [ ] Student submits assignment in SPARK
- [ ] SPARK sends submission webhook with spark_assignment_id
- [ ] Verify evidence appears under correct task in Optio

---

## Troubleshooting

### Webhook Returns 401 "Invalid signature"

**Cause**: HMAC signature doesn't match

**Solutions**:
1. Verify you're using the correct SPARK_WEBHOOK_SECRET
2. Ensure JSON payload has no extra whitespace: `JSON.stringify(data, null, 0)`
3. Check payload string matches exactly what you're signing
4. Verify HMAC algorithm is SHA256 (not SHA1 or MD5)
5. Check signature is lowercase hex string

**Debug**:
```javascript
console.log('Payload:', payload);
console.log('Secret (first 10 chars):', webhookSecret.substring(0, 10));
console.log('Signature:', signature);
```

### Webhook Returns 400 "Missing spark_course_id or course_title"

**Cause**: Required fields not in payload

**Solutions**:
1. Verify `spark_course_id` is present and non-empty
2. Verify `course_title` is present and non-empty
3. Check field names match exactly (case-sensitive)

### Quest Created but Assignments Missing

**Cause**: Assignments array empty or malformed

**Solutions**:
1. Check `assignments` is an array
2. Verify each assignment has `spark_assignment_id` and `title`
3. Check for null/undefined values

### Webhook Times Out

**Cause**: Network issue or Optio server slow

**Solutions**:
1. Increase timeout to 30 seconds
2. Implement retry logic with exponential backoff
3. Check Optio server status at https://status.optioeducation.com (if available)

### Duplicate Quests Created

**Cause**: Using different `spark_course_id` for same course

**Solutions**:
1. Ensure `spark_course_id` is truly unique and stable
2. Don't include timestamps or version numbers in course ID
3. Use database primary key as `spark_course_id`

---

## Best Practices

### 1. Async Processing
Send webhooks asynchronously to avoid blocking course creation:
```javascript
// Fire and forget
syncCourseToOptio(course).catch(err => logger.error(err));
```

### 2. Retry Logic
Implement exponential backoff for failed webhooks:
```javascript
async function syncWithRetry(course, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await syncCourseToOptio(course);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i));  // 1s, 2s, 4s
    }
  }
}
```

### 3. Idempotency
Safe to resend webhooks - Optio handles duplicates gracefully:
```javascript
// Can call multiple times with same data
await syncCourseToOptio(course);  // Creates quest
await syncCourseToOptio(course);  // Updates same quest (no duplicate)
```

### 4. Logging
Log webhook success/failure for debugging:
```javascript
logger.info('Syncing course to Optio', {
  spark_course_id: course.id,
  course_title: course.title,
  assignment_count: course.assignments.length
});
```

### 5. Monitoring
Track webhook metrics:
- Success rate
- Average response time
- Error types (401, 400, 500)
- Retry counts

---

## FAQ

### Q: What happens if I send the webhook multiple times for the same course?
**A**: Optio will update the existing quest instead of creating a duplicate. It's safe to resend.

### Q: Can I remove assignments via webhook?
**A**: No, Optio doesn't delete tasks automatically (preserves student work). Remove manually in admin panel if needed.

### Q: What if submission webhook comes before course webhook?
**A**: Submission will fail with 404 (task not found). Send course webhook first, or handle 404 by creating quest manually.

### Q: Do I need to resend the entire assignments array every time?
**A**: Yes, send the complete current state. Optio will create/update as needed.

### Q: Can I update just the course title without resending assignments?
**A**: Yes, send the webhook with updated title and empty assignments array. Existing tasks will be preserved.

### Q: What's the difference between this and the submission webhook?
**A**:
- **Course webhook**: Creates quest structure (course → quest, assignments → tasks)
- **Submission webhook**: Records student work (submissions → evidence)

### Q: Is the webhook synchronous or asynchronous?
**A**: Synchronous. Optio processes the course sync and returns immediately. Response time ~100-500ms.

---

## Contact & Support

**Questions about integration?**
- Email: support@optioeducation.com
- Test webhook issues: Check logs in Render dashboard

**Production monitoring:**
- Webhook URL: https://optio-prod-backend.onrender.com/spark/webhook/course
- Status: Check response times and error rates

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-04 | 1.0 | Initial release - course sync webhook |

---

**Ready to integrate?** Start with dev environment testing, then move to production after successful tests.
