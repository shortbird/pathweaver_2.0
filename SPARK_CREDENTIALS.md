# Optio-Spark Integration Credentials

**CONFIDENTIAL - For Spark Development Team Only**

---

## 1. Shared Secrets

### SSO Secret (OPTIO_SHARED_SECRET)
Used for signing JWT tokens for SSO authentication.

```
3d69457249381391c19f7f7a64ec1d5b9e78adab7583c343d2087a47b4a7cb00
```

**Usage:** Sign JWT tokens with HS256 algorithm using this secret.

### Webhook Secret (OPTIO_WEBHOOK_SECRET)
Used for signing webhook payloads via HMAC-SHA256.

```
616bf3413b37e8a213c8252b12ecc923fed22a577ce6a9ff1c12a2178077aad5
```

**Usage:** Calculate HMAC-SHA256 signature and include in `X-Spark-Signature` header.

---

## 2. Integration Endpoints

### Development Environment (For Testing)
- **SSO URL:** `https://optio-dev-backend.onrender.com/spark/sso?token={jwt}`
- **Webhook URL:** `https://optio-dev-backend.onrender.com/spark/webhook/submission`

### Production Environment (Go-Live)
- **SSO URL:** `https://optio-prod-backend.onrender.com/spark/sso?token={jwt}`
- **Webhook URL:** `https://optio-prod-backend.onrender.com/spark/webhook/submission`

---

## 3. Test Student Account

The test account will be **auto-created on first SSO login**. Use these credentials for testing:

```json
{
  "spark_user_id": "test_student_001",
  "email": "spark-test@optioeducation.com",
  "first_name": "Spark",
  "last_name": "TestStudent",
  "role": "student"
}
```

**Important:** The account is created automatically when you send the first valid JWT token with these details. No manual account creation needed.

---

## 4. JWT Token Format & Example

### Required Claims

```json
{
  "sub": "test_student_001",
  "email": "spark-test@optioeducation.com",
  "given_name": "Spark",
  "family_name": "TestStudent",
  "role": "student",
  "iat": 1234567890,
  "exp": 1234567900
}
```

### Node.js Example Code

```javascript
const jwt = require('jsonwebtoken');

function generateOptioSSOToken(student) {
  const payload = {
    sub: student.sparkUserId,           // Your internal Spark user ID
    email: student.email,
    given_name: student.firstName,
    family_name: student.lastName,
    role: 'student',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600  // 10 minutes from now
  };

  // Sign with OPTIO_SHARED_SECRET
  const token = jwt.sign(
    payload,
    '3d69457249381391c19f7f7a64ec1d5b9e78adab7583c343d2087a47b4a7cb00',
    { algorithm: 'HS256' }
  );

  return token;
}

// Usage example
function redirectToOptioPortfolio(student) {
  const token = generateOptioSSOToken(student);
  const ssoUrl = `https://optio-dev-frontend.onrender.com/spark/sso?token=${token}`;

  // Redirect user to Optio
  res.redirect(ssoUrl);
}
```

### Test Command (Generate Sample Token)

```bash
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign({
  sub: 'test_student_001',
  email: 'spark-test@optioeducation.com',
  given_name: 'Spark',
  family_name: 'TestStudent',
  role: 'student',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 600
}, '3d69457249381391c19f7f7a64ec1d5b9e78adab7583c343d2087a47b4a7cb00');
console.log('SSO URL: https://optio-dev-frontend.onrender.com/spark/sso?token=' + token);
"
```

---

## 5. Webhook Payload Format & Example

### Payload Structure

```json
{
  "spark_user_id": "test_student_001",
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
```

### Node.js Example Code

```javascript
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

  // Calculate HMAC-SHA256 signature
  const signature = crypto
    .createHmac('sha256', '616bf3413b37e8a213c8252b12ecc923fed22a577ce6a9ff1c12a2178077aad5')
    .update(JSON.stringify(payload))
    .digest('hex');

  // Send webhook to Optio
  const response = await fetch('https://optio-dev-backend.onrender.com/spark/webhook/submission', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Spark-Signature': signature
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}
```

### Test Command (Send Sample Webhook)

```bash
node -e "
const crypto = require('crypto');
const https = require('https');

const payload = JSON.stringify({
  spark_user_id: 'test_student_001',
  spark_assignment_id: 'test_assignment_001',
  spark_course_id: 'test_course_001',
  submission_text: 'This is a test submission from Spark.',
  submission_files: [],
  submitted_at: new Date().toISOString(),
  grade: 100
});

const signature = crypto
  .createHmac('sha256', '616bf3413b37e8a213c8252b12ecc923fed22a577ce6a9ff1c12a2178077aad5')
  .update(payload)
  .digest('hex');

console.log('Payload:', payload);
console.log('Signature:', signature);
console.log('\nSending test webhook...');

const req = https.request({
  hostname: 'optio-dev-backend.onrender.com',
  path: '/spark/webhook/submission',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Spark-Signature': signature,
    'Content-Length': payload.length
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => console.error('Error:', e));
req.write(payload);
req.end();
"
```

---

## 6. File URL Requirements

**CRITICAL:** File URLs in webhook payloads must be:

1. **Publicly accessible** - No authentication required
2. **Valid for 24+ hours** - Give Optio time to download
3. **Return actual file content** - Not an HTML login page
4. **Include correct Content-Type** - Match the file type

### Example File URL Generation

```javascript
function generateTemporaryUrl(file, expirySeconds) {
  // Example using AWS S3 signed URLs
  return s3.getSignedUrl('getObject', {
    Bucket: 'spark-submissions',
    Key: file.key,
    Expires: expirySeconds  // 86400 seconds = 24 hours
  });
}
```

---

## 7. Response Codes

Optio webhook endpoint will respond with:

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success - Submission processed | Continue |
| 400 | Bad Request - Invalid payload | Fix payload format, do not retry |
| 401 | Unauthorized - Invalid signature | Check signature calculation |
| 404 | Not Found - User/assignment not found | Verify IDs match |
| 500 | Server Error | Retry with exponential backoff |

### Retry Logic Example

```javascript
async function sendWithRetry(payload, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await sendSubmissionToOptio(payload);

      if (response.ok) {
        return response;  // Success!
      }

      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`Client error: ${response.status}`);
      }

      // Server error (5xx) - wait and retry
      const delay = Math.pow(2, attempt) * 1000;  // 2s, 4s, 8s
      console.log(`Attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));

    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;  // Give up after max attempts
      }
    }
  }
}
```

---

## 8. Testing Checklist

Before going live, verify:

### SSO Testing
- [ ] Generate JWT token with correct claims
- [ ] Token signature validates with OPTIO_SHARED_SECRET
- [ ] Token expires in 10 minutes (not before, not after)
- [ ] Redirect to `https://optio-dev-frontend.onrender.com/spark/sso?token={jwt}`
- [ ] User is created/updated in Optio
- [ ] User lands on Optio dashboard after login
- [ ] User can navigate their portfolio

### Webhook Testing
- [ ] Webhook triggers when student submits assignment
- [ ] Payload includes all required fields
- [ ] HMAC-SHA256 signature calculated correctly
- [ ] Signature included in `X-Spark-Signature` header
- [ ] File URLs are publicly accessible
- [ ] Files download successfully (test with curl/browser)
- [ ] Optio returns 200 status
- [ ] Evidence appears in Optio portfolio within 5 minutes
- [ ] Retry logic works for 5xx errors

### Edge Cases
- [ ] Test with submission that has no files (empty array)
- [ ] Test with large files (up to 50MB)
- [ ] Test with special characters in filenames
- [ ] Test with very long submission text (10,000+ characters)
- [ ] Test signature validation with tampered payload (should fail)

---

## 9. Security Best Practices

1. **Never commit secrets to version control**
   - Store in environment variables
   - Use `.env` files that are gitignored
   - Rotate secrets if accidentally exposed

2. **Always use HTTPS**
   - Never send credentials over plain HTTP
   - Validate SSL certificates

3. **Validate webhook signatures**
   - Always check `X-Spark-Signature` on incoming webhooks
   - Reject requests with invalid signatures

4. **Monitor for abuse**
   - Rate limit webhook calls if needed
   - Log all webhook attempts
   - Alert on repeated failures

---

## 10. Support & Next Steps

### Contact Information
- **Primary Contact:** Tanner (Optio Product Team)
- **Technical Support:** See `spark.md` integration guide in repo

### Development Timeline

**Phase 1: SSO Implementation (Week 1)**
- Build JWT generation function
- Add "View Optio Portfolio" button to Spark UI
- Test SSO flow with dev environment

**Phase 2: Webhook Implementation (Week 2)**
- Implement webhook on assignment submission
- Generate temporary file URLs
- Test evidence submission to Optio

**Phase 3: Course API (Week 3)**
- Build `/api/courses` and `/api/courses/:id/assignments` endpoints
- Provide API key to Optio
- Test course sync in Optio admin panel

### Ready to Test?

1. **Start with SSO:** Run the test command in Section 4 to generate a token
2. **Test in Browser:** Paste the SSO URL into your browser
3. **Verify Creation:** Check that test account appears in Optio dev dashboard
4. **Send Test Webhook:** Run the test command in Section 5
5. **Check Evidence:** Log into Optio and verify submission appears

### Questions?

Refer to the comprehensive `spark.md` integration guide for detailed explanations, or reach out with any questions about the integration process.

---

**Document Generated:** 2025-11-05
**Environment:** Development
**Status:** Ready for Integration Testing
