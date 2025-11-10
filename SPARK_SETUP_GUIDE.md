# Spark Integration Setup Guide

**Audience:** Spark Development Team
**Purpose:** Step-by-step instructions for integrating Spark LMS with Optio platform

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Integration Secrets](#integration-secrets)
4. [Feature 1: SSO Authentication](#feature-1-sso-authentication)
5. [Feature 2: Submission Webhooks](#feature-2-submission-webhooks)
6. [Testing](#testing)
7. [Production Checklist](#production-checklist)
8. [Support](#support)

---

## Overview

### What You're Building

Two features that connect Spark LMS to Optio:

1. **SSO Authentication** - "View Optio Portfolio" button that logs students into Optio automatically
2. **Submission Webhooks** - Auto-sync completed assignments to student portfolios

---

## Prerequisites

### Required Knowledge

- JWT token generation (HS256 algorithm)
- HMAC signature calculation (HMAC-SHA256)
- HTTP POST requests with custom headers
- Asynchronous file upload handling

### Required Infrastructure

- Ability to generate temporary public URLs for file downloads (24+ hour expiry)
- Webhook delivery system with retry logic
- Secure storage for shared secrets (environment variables)

### Node.js Version

- Node.js 14+ recommended
- Dependencies: `jsonwebtoken`, `crypto` (built-in)

---

## Integration Secrets

### Shared Secrets

You will receive two 64-character hexadecimal secrets from the Optio team:

```bash
# For SSO (JWT signing)
OPTIO_SHARED_SECRET=<64_hex_chars>

# For Webhooks (HMAC signatures)
OPTIO_WEBHOOK_SECRET=<64_hex_chars>
```

**Security Requirements:**
- Store in environment variables (never hardcode)
- Never commit to version control
- Never log or expose in error messages
- Rotate if accidentally exposed

### Development vs Production

**Development Endpoints:**
```
SSO:     https://optio-dev-backend.onrender.com/spark/sso?token={jwt}
Webhook: https://optio-dev-backend.onrender.com/spark/webhook/submission
```

**Production Endpoints:**
```
SSO:     https://optio-prod-backend.onrender.com/spark/sso?token={jwt}
Webhook: https://optio-prod-backend.onrender.com/spark/webhook/submission
```

Use separate secrets for dev and production environments.

---

## Feature 1: SSO Authentication

### What You Need to Build

A "View Optio Portfolio" button that:
1. Generates a JWT token (signed with shared secret)
2. Redirects student to Optio with token in URL
3. Student is automatically logged in

### Step 1: Install Dependencies

```bash
npm install jsonwebtoken
```

### Step 2: Generate JWT Token

**JWT Payload Structure:**
```javascript
{
  "sub": "spark_user_123",          // Your internal user ID (required)
  "email": "student@example.com",   // Student's email (required)
  "given_name": "Sarah",            // First name (required)
  "family_name": "Johnson",         // Last name (required)
  "role": "student",                // Always "student" (required)
  "iat": 1234567890,                // Current Unix timestamp (required)
  "exp": 1234568490                 // Expires in 10 minutes (required)
}
```

**Implementation Example:**

```javascript
const jwt = require('jsonwebtoken');

function generateOptioSSOToken(user) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    sub: user.sparkUserId,        // Your internal user ID
    email: user.email,             // Student's email
    given_name: user.firstName,    // First name
    family_name: user.lastName,    // Last name
    role: 'student',               // Always "student"
    iat: now,                      // Issued at
    exp: now + 600                 // Expires in 10 minutes
  };

  const secret = process.env.OPTIO_SHARED_SECRET;

  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}
```

### Step 3: Implement "View Portfolio" Button

**Backend Route Example (Express.js):**

```javascript
app.get('/optio/redirect', async (req, res) => {
  // Get current user from session
  const user = req.session.user;

  // Generate SSO token
  const token = generateOptioSSOToken(user);

  // Redirect to Optio with token
  const optioUrl = process.env.OPTIO_SSO_URL || 'https://optioeducation.com';
  res.redirect(`${optioUrl}/spark/sso?token=${token}`);
});
```

**Frontend Button Example (React/HTML):**

```html
<a href="/optio/redirect" class="btn btn-primary">
  View Optio Portfolio
</a>
```

### Step 4: Test SSO

**Test Checklist:**
- [ ] Click "View Portfolio" button
- [ ] Student redirected to Optio
- [ ] Student logged in automatically
- [ ] Student sees their dashboard
- [ ] Student name displayed correctly

**Common Issues:**
| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid token signature" | Wrong secret | Verify OPTIO_SHARED_SECRET matches |
| "Token expired" | Clock skew | Check server time is accurate |
| "Missing required field" | Incomplete payload | Include all required JWT claims |

---

## Feature 2: Submission Webhooks

### What You Need to Build

When a student submits an assignment:
1. Generate temporary public URLs for submitted files (24+ hour expiry)
2. Build webhook payload with submission data
3. Calculate HMAC signature
4. POST to Optio webhook endpoint
5. Retry on failure (exponential backoff)

### Step 1: Generate Temporary File URLs

**Requirements:**
- URLs must be publicly accessible (no authentication required)
- URLs must be valid for at least 24 hours
- URLs must return actual file content (not HTML pages)
- URLs must use HTTPS (not HTTP)
- URLs must include correct Content-Type headers

**Example Implementation:**

```javascript
// Using AWS S3 pre-signed URLs
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

function generateTemporaryFileUrl(fileKey) {
  const params = {
    Bucket: 'spark-submissions',
    Key: fileKey,
    Expires: 86400  // 24 hours in seconds
  };

  return s3.getSignedUrl('getObject', params);
}
```

### Step 2: Build Webhook Payload

**Payload Structure:**
```javascript
{
  "spark_user_id": "user_123",              // Your user ID (required)
  "spark_assignment_id": "assignment_456",  // Your assignment ID (required)
  "spark_course_id": "course_789",          // Your course ID (required)
  "submission_text": "Student essay...",    // Text response (required)
  "submission_files": [                     // File attachments (optional)
    {
      "url": "https://...",                 // Temporary public URL
      "type": "application/pdf",            // MIME type
      "filename": "essay.pdf"               // Original filename
    }
  ],
  "submitted_at": "2025-01-15T14:30:00Z",  // ISO 8601 timestamp (required)
  "grade": 95.5                             // Numeric grade (optional)
}
```

**Implementation Example:**

```javascript
function buildWebhookPayload(submission) {
  return {
    spark_user_id: submission.userId,
    spark_assignment_id: submission.assignmentId,
    spark_course_id: submission.courseId,
    submission_text: submission.text || '',
    submission_files: submission.files.map(file => ({
      url: generateTemporaryFileUrl(file.key),
      type: file.mimeType,
      filename: file.originalName
    })),
    submitted_at: submission.timestamp.toISOString(),
    grade: submission.grade
  };
}
```

### Step 3: Calculate HMAC Signature

**HMAC Signature Algorithm:**
1. Serialize payload to JSON string
2. Calculate HMAC-SHA256 using webhook secret
3. Convert to hexadecimal string
4. Include in `X-Spark-Signature` header

**Implementation Example:**

```javascript
const crypto = require('crypto');

function calculateHMAC(payload) {
  const payloadString = JSON.stringify(payload);
  const secret = process.env.OPTIO_WEBHOOK_SECRET;

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');

  return hmac;
}
```

### Step 4: Send Webhook with Retry Logic

**Implementation Example:**

```javascript
async function sendOptioWebhook(submission, maxAttempts = 3) {
  const payload = buildWebhookPayload(submission);
  const signature = calculateHMAC(payload);

  const optioWebhookUrl = process.env.OPTIO_WEBHOOK_URL ||
    'https://optio-prod-backend.onrender.com/spark/webhook/submission';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(optioWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Spark-Signature': signature
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Webhook success:', result.completion_id);
        return result;
      }

      // Don't retry 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        const error = await response.json();
        console.error('Webhook failed:', error);
        throw new Error(`Client error: ${error.error}`);
      }

      // Retry 5xx errors (server errors)
      console.warn(`Webhook attempt ${attempt} failed with ${response.status}`);

    } catch (error) {
      console.error(`Webhook attempt ${attempt} error:`, error.message);

      if (attempt === maxAttempts) {
        throw error;
      }

      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Step 5: Integrate with Submission Flow

**Example Integration:**

```javascript
// In your assignment submission handler
app.post('/assignments/:id/submit', async (req, res) => {
  const { userId, assignmentId } = req.params;
  const { text, files } = req.body;

  // 1. Save submission to your database
  const submission = await saveSubmission({
    userId,
    assignmentId,
    text,
    files
  });

  // 2. Send webhook to Optio (async - don't block response)
  sendOptioWebhook(submission).catch(error => {
    console.error('Failed to send Optio webhook:', error);
    // Queue for retry or alert admin
  });

  // 3. Return success to student immediately
  res.json({ success: true, submissionId: submission.id });
});
```

### Step 6: Test Webhooks

**Test Checklist:**
- [ ] Submit test assignment
- [ ] Webhook received by Optio (check response is 200)
- [ ] Evidence appears in Optio portfolio within 5 minutes
- [ ] Student XP increased correctly
- [ ] File attachments visible in portfolio

**Common Issues:**
| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid signature" | Wrong secret or payload format | Verify OPTIO_WEBHOOK_SECRET and sign raw JSON |
| "User not found" | Student hasn't used SSO yet | Student must log in via SSO first |
| "Quest not found" | Assignment not in Optio | Create quest in Optio with matching assignment ID |
| "Failed to download file" | File URL not accessible | Verify URL works in browser, check expiry |

---

## Testing

### Prerequisites

Before running any tests, ensure you have:

1. **Node.js installed** (version 14 or higher)
2. **Required dependencies**:
   ```bash
   npm install jsonwebtoken
   ```

3. **Environment variables set**:
   ```bash
   # For test scripts - obtain secret values from Optio team
   export SPARK_SSO_SECRET=[obtain from Optio team]
   export SPARK_WEBHOOK_SECRET=[obtain from Optio team]

   # For setup script
   export SUPABASE_SERVICE_KEY=[obtain from Optio team]
   ```

   **⚠️ IMPORTANT**: Secret values are NOT documented for security reasons. Contact Tanner to obtain values. Production secrets must be different from development secrets and stored securely in environment variables.

4. **Test account created** in Optio database (contact Tanner)

### Test Account Setup

**Contact Optio team to create test account:**
```
Email: spark-test@yourdomain.com
Spark User ID: test_student_001
```

**Testing**

```javascript
const jwt = require('jsonwebtoken');

const testToken = jwt.sign({
  sub: 'your_spark_user_id',
  email: 'your-test@yourdomain.com',
  given_name: 'Test',
  family_name: 'Student',
  role: 'student',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 600
}, process.env.OPTIO_SHARED_SECRET, { algorithm: 'HS256' });

console.log('SSO URL:', `https://optio-dev-backend.onrender.com/spark/sso?token=${testToken}`);
```

### Webhook Testing

```javascript
const testPayload = {
  spark_user_id: 'your_test_user_id',
  spark_assignment_id: 'your_assignment_id',
  spark_course_id: 'your_course_id',
  submission_text: 'Your test submission text...',
  submission_files: [],
  submitted_at: new Date().toISOString(),
  grade: 95
};

// Calculate HMAC signature and send POST request
// (See test_spark_webhook.js for complete implementation)
```

**Verify in Optio**
- Log in as test student
- Navigate to portfolio
- Verify submission appears with evidence

### Edge Case Testing

**Test Case 1: Duplicate Submission (Idempotency)**
```javascript
// Send same webhook twice
await sendOptioWebhook(testPayload);
await sendOptioWebhook(testPayload);
// Both should succeed with same completion_id
```

**Test Case 2: Old Timestamp (Replay Protection)**
```javascript
// Modify timestamp to 10 minutes ago
testPayload.submitted_at = new Date(Date.now() - 10 * 60 * 1000).toISOString();
// Should return 400: "Submission timestamp too old"
```

**Test Case 3: Invalid Signature**
```javascript
// Use wrong secret
const wrongSecret = 'incorrect_secret';
const signature = crypto.createHmac('sha256', wrongSecret)
  .update(JSON.stringify(testPayload))
  .digest('hex');
// Should return 401: "Invalid signature"
```
---

## Appendix: Complete Code Examples

### Complete SSO Implementation

```javascript
// sso.js - Complete SSO implementation
const jwt = require('jsonwebtoken');

class OptioSSO {
  constructor(sharedSecret, optioBaseUrl) {
    this.sharedSecret = sharedSecret;
    this.optioBaseUrl = optioBaseUrl;
  }

  generateToken(user) {
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      sub: user.sparkUserId,
      email: user.email,
      given_name: user.firstName,
      family_name: user.lastName,
      role: 'student',
      iat: now,
      exp: now + 600  // 10 minutes
    };

    return jwt.sign(payload, this.sharedSecret, { algorithm: 'HS256' });
  }

  getRedirectUrl(user) {
    const token = this.generateToken(user);
    return `${this.optioBaseUrl}/spark/sso?token=${token}`;
  }
}

// Usage
const sso = new OptioSSO(
  process.env.OPTIO_SHARED_SECRET,
  'https://optioeducation.com'
);

app.get('/optio/redirect', (req, res) => {
  const user = req.session.user;
  const redirectUrl = sso.getRedirectUrl(user);
  res.redirect(redirectUrl);
});

module.exports = OptioSSO;
```

### Complete Webhook Implementation

```javascript
// webhook.js - Complete webhook implementation
const crypto = require('crypto');

class OptioWebhook {
  constructor(webhookSecret, webhookUrl) {
    this.webhookSecret = webhookSecret;
    this.webhookUrl = webhookUrl;
  }

  calculateSignature(payload) {
    const payloadString = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payloadString)
      .digest('hex');
  }

  async send(submission, maxAttempts = 3) {
    const payload = {
      spark_user_id: submission.userId,
      spark_assignment_id: submission.assignmentId,
      spark_course_id: submission.courseId,
      submission_text: submission.text || '',
      submission_files: submission.files.map(f => ({
        url: f.temporaryUrl,
        type: f.mimeType,
        filename: f.originalName
      })),
      submitted_at: submission.timestamp.toISOString(),
      grade: submission.grade
    };

    const signature = this.calculateSignature(payload);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Spark-Signature': signature
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          return await response.json();
        }

        if (response.status >= 400 && response.status < 500) {
          const error = await response.json();
          throw new Error(`Client error: ${error.error}`);
        }

        console.warn(`Attempt ${attempt} failed with ${response.status}`);

      } catch (error) {
        if (attempt === maxAttempts) throw error;

        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

// Usage
const webhook = new OptioWebhook(
  process.env.OPTIO_WEBHOOK_SECRET,
  'https://optio-prod-backend.onrender.com/spark/webhook/submission'
);

app.post('/assignments/:id/submit', async (req, res) => {
  const submission = await saveSubmission(req.body);

  webhook.send(submission).catch(error => {
    console.error('Webhook failed:', error);
    // Queue for retry
  });

  res.json({ success: true });
});

module.exports = OptioWebhook;
```