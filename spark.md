Spark → Optio Integration Guide
What This Integration Does
When Spark students complete assignments, their work automatically populates their Optio portfolio. Students submit once in Spark, and it appears on both platforms instantly.

Result: Students build impressive, shareable portfolios at optioeducation.com/portfolio/[student-name] with zero extra effort.




What Spark Needs to Build
3 simple features:
1. SSO Token Generation
2. Submission Webhooks
3. Course API Endpoints




Feature 1: SSO Token Generation
What It Does
When a student clicks "View Optio Portfolio" in Spark, they're instantly logged into Optio (no separate login required).
How It Works
Step-by-step:
Student clicks "View Optio Portfolio" button in Spark
Spark generates a JWT token (signed with a shared secret)
Spark redirects student to: https://optioeducation.com/spark/sso?token={jwt}
Optio validates the token and logs the student in
Student lands on their Optio dashboard
JWT Token Format
Required Claims:

{
  "sub": "spark_user_123",          // Spark's internal user ID
  "email": "student@example.com",   // Student's email
  "given_name": "Sarah",            // First name
  "family_name": "Johnson",         // Last name
  "role": "student",                // Always "student"
  "iat": 1234567890,                // Issued at (Unix timestamp)
  "exp": 1234567900                 // Expires in 10 minutes
}

Signature: HS256 algorithm with shared secret (we'll provide the secret via secure channel)
Example Code (Node.js)

const jwt = require('jsonwebtoken');

function redirectToOptioPortfolio(student) {
  // Generate JWT token
  const token = jwt.sign({
    sub: student.sparkUserId,           // Your internal ID
    email: student.email,
    given_name: student.firstName,
    family_name: student.lastName,
    role: 'student',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600  // 10 minutes
  }, process.env.OPTIO_SHARED_SECRET);  // Shared secret from Optio

  // Redirect to Optio
  res.redirect(`https://optioeducation.com/spark/sso?token=${token}`);
}


Feature 2: Submission Webhooks
What It Does
When a student submits an assignment in Spark, you send a webhook to Optio. We download the files, mark the task complete, award XP, and update the portfolio.
Webhook Endpoint
POST to: https://optio-prod-backend.onrender.com/spark/webhook/submission
Content-Type: application/json
Header: X-Spark-Signature (HMAC-SHA256 signature of request body)
Webhook Payload Format

{
  "spark_user_id": "user_123",
  "spark_assignment_id": "assignment_456",
  "spark_course_id": "course_789",
  "submission_text": "Here is my essay on photosynthesis...",
  "submission_files": [
    {
      "url": "https://spark-storage.com/temp/file_abc?expires=...",
      "type": "application/pdf",
      "filename": "photosynthesis_essay.pdf"
    },
    {
      "url": "https://spark-storage.com/temp/image_xyz?expires=...",
      "type": "image/jpeg",
      "filename": "plant_diagram.jpg"
    }
  ],
  "submitted_at": "2025-01-15T14:30:00Z",
  "grade": 95.5
}

Important:
spark_user_id: Your internal user ID (same as JWT sub claim)
spark_assignment_id: Your internal assignment ID
submission_files: Array of files with temporary public URLs (24-hour expiry)
submitted_at: ISO 8601 timestamp
File URL Requirements
Critical: File URLs must be:
Publicly accessible (no authentication required)
Valid for at least 24 hours
Return actual file content (not an HTML login page)

We'll download the files and upload them to our own storage, so you don't need to host them long-term.
Webhook Signature
Sign the request body to prevent unauthorized submissions:

const crypto = require('crypto');

function generateSignature(payload) {
  return crypto
    .createHmac('sha256', process.env.OPTIO_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

Include the signature in the X-Spark-Signature header.
Example Code (Node.js)

const crypto = require('crypto');

async function sendSubmissionToOptio(submission) {
  const payload = {
    spark_user_id: submission.userId,
    spark_assignment_id: submission.assignmentId,
    spark_course_id: submission.courseId,
    submission_text: submission.text,
    submission_files: submission.files.map(f => ({
      url: generateTemporaryUrl(f, 24 * 60 * 60), // 24-hour expiry
      type: f.mimeType,
      filename: f.name
    })),
    submitted_at: submission.timestamp.toISOString(),
    grade: submission.grade
  };

  // Sign the payload
  const signature = crypto
    .createHmac('sha256', process.env.OPTIO_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  // Send to Optio
  await fetch('https://optio-prod-backend.onrender.com/spark/webhook/submission', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Spark-Signature': signature
    },
    body: JSON.stringify(payload)
  });
}

function generateTemporaryUrl(file, expirySeconds) {
  // Generate a temporary public URL for the file
  // Implementation depends on your file storage system
  // Must return a URL that expires after expirySeconds
  return file.getSignedUrl(expirySeconds);
}


Response Codes
Optio will respond with:
200 OK - Submission processed successfully
400 Bad Request - Invalid payload format
401 Unauthorized - Invalid signature
404 Not Found - User or assignment not found
500 Server Error - Processing failed (retry with exponential backoff)
Retry Logic
If you get a 500 error, retry up to 3 times with exponential backoff:

async function sendWithRetry(payload, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return response;  // Success
      }

      if (response.status < 500) {
        throw new Error('Client error - do not retry');
      }

      // Server error - wait and retry
      await sleep(Math.pow(2, attempt) * 1000);  // 2s, 4s, 8s

    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;  // Give up after 3 attempts
      }
    }
  }
}


Feature 3: Course API Endpoints
What It Does
Optio admins can sync Spark courses/assignments to automatically create Optio quests/tasks. Students then complete those tasks by submitting in Spark (via webhooks from Feature 2).
API Endpoints to Build
Endpoint 1: List All Courses
GET /api/courses

Authentication: Bearer token (API key)

Response:

{
  "courses": [
    {
      "id": "course_123",
      "title": "Biology - Photosynthesis Unit",
      "description": "Learn how plants convert sunlight to energy",
      "category": "science",
      "grade_level": "9-12",
      "duration_hours": 20
    },
    {
      "id": "course_456",
      "title": "Creative Writing - Personal Narratives",
      "description": "Write compelling stories from your own experiences",
      "category": "english",
      "grade_level": "7-9",
      "duration_hours": 15
    }
  ]
}


Endpoint 2: Get Course Assignments
GET /api/courses/{course_id}/assignments

Authentication: Bearer token (API key)

Response:

{
  "course_id": "course_123",
  "assignments": [
    {
      "id": "assignment_456",
      "title": "Essay: How Plants Convert Sunlight",
      "description": "Write a 500-word essay explaining photosynthesis",
      "assignment_type": "essay",
      "estimated_hours": 3,
      "max_points": 100
    },
    {
      "id": "assignment_789",
      "title": "Lab Report: Photosynthesis Experiment",
      "description": "Document your observations from the lab experiment",
      "assignment_type": "lab_report",
      "estimated_hours": 2,
      "max_points": 50
    }
  ]
}


Authentication
API Key: We'll provide you with an API key to include in requests from Optio.

Request Header:

Authorization: Bearer {api_key}


Rate Limits
Please support at least 100 requests per minute from Optio.
API Design Notes
Read-only endpoints (no writes from Optio to Spark)
JSON responses
Standard HTTP status codes (200, 401, 404, 500)
Example Implementation (Express.js)

const express = require('express');
const app = express();

// Middleware to check API key
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (apiKey !== process.env.OPTIO_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
}

// List all courses
app.get('/api/courses', authenticateApiKey, async (req, res) => {
  const courses = await db.getCourses();
  res.json({ courses });
});

// Get course assignments
app.get('/api/courses/:courseId/assignments', authenticateApiKey, async (req, res) => {
  const assignments = await db.getAssignments(req.params.courseId);
  res.json({
    course_id: req.params.courseId,
    assignments
  });
});


Security Requirements
Shared Secrets
We'll exchange two secrets via secure channel:
SSO Secret (OPTIO_SHARED_SECRET) - For signing JWT tokens
Webhook Secret (OPTIO_WEBHOOK_SECRET) - For signing webhook payloads

Secret Format: 64 hexadecimal characters (32 bytes)

Generate with:

openssl rand -hex 32


API Key
You'll provide us with an API key for course sync endpoints:
Store it securely (environment variable)
Notify us if compromised
HTTPS Only
All communication must be over TLS (HTTPS). No plain HTTP.




Integration Timeline
Phase 1: SSO (Your Side)
What to build:
JWT token generation function
"View Optio Portfolio" button in Spark UI
Redirect logic to Optio

Testing:
Generate test JWT tokens
Test SSO flow with Optio dev environment
Verify user creation in Optio
Phase 2: Webhooks (Your Side)
What to build:
Webhook trigger when student submits assignment
Temporary file URL generation (24-hour expiry)
HMAC signature calculation
HTTP POST to Optio webhook endpoint

Testing:
Send test webhooks to Optio dev environment
Verify signatures validate correctly
Test file download from temporary URLs
Verify evidence appears in Optio portfolios
Phase 3: Course API (Your Side)
What to build:
/api/courses endpoint
/api/courses/:id/assignments endpoint
API key authentication
Rate limiting (100 req/min)

Testing:
Provide sandbox API credentials to Optio
Test course sync in Optio dev environment
Verify quests created correctly




What Optio Provides
Dev Environment:
SSO URL: https://optio-dev-frontend.onrender.com/spark/sso
Webhook URL: https://optio-dev-backend.onrender.com/spark/webhook/submission

Production Environment:
SSO URL: https://optioeducation.com/spark/sso
Webhook URL: https://optio-prod-backend.onrender.com/spark/webhook/submission

Test Accounts:
We'll create test student accounts in Optio dev environment
You can verify SSO creates/links accounts correctly

Documentation:
Comprehensive integration guide (this document)
Example code in Node.js (easily adaptable to other languages)
Postman collection for webhook testing




Testing Checklist
Before going live, verify:

SSO:
[ ] JWT tokens generate correctly with all required claims
[ ] Signature validation passes in Optio
[ ] Students can SSO from Spark to Optio
[ ] Optio creates/links user accounts correctly
[ ] Students land on Optio dashboard after SSO

Webhooks:
[ ] Webhooks trigger when student submits assignment
[ ] Payload includes all required fields
[ ] Signature calculation is correct
[ ] File URLs are publicly accessible for 24 hours
[ ] Optio processes submissions and marks tasks complete
[ ] Evidence appears in Optio portfolios within 5 minutes

Course API:
[ ] API endpoints return correct data
[ ] API key authentication works
[ ] Rate limiting configured (100 req/min)
[ ] Optio can sync courses and create quests
[ ] Assignments map to Optio tasks correctly
Summary: What You're Building
SSO: Generate JWT, redirect to Optio
Webhooks: POST submission data when student completes assignment
Course API: Two read-only endpoints for courses and assignments

