# Spark Integration - Quick Reference Card

**Last Updated:** 2025-11-05

---

## 🚀 Quick Start (3 Commands)

```bash
# 1. Setup test data (run once)
node setup_spark_test_data.js

# 2. Test SSO (copy URL to browser)
node test_spark_sso.js

# 3. Test webhook
node test_spark_webhook.js
```

---

## 🔑 Secrets (from SPARK_CREDENTIALS.md)

```bash
# SSO Secret (for JWT signing)
OPTIO_SHARED_SECRET=3d69457249381391c19f7f7a64ec1d5b9e78adab7583c343d2087a47b4a7cb00

# Webhook Secret (for HMAC signatures)
OPTIO_WEBHOOK_SECRET=616bf3413b37e8a213c8252b12ecc923fed22a577ce6a9ff1c12a2178077aad5
```

---

## 🌐 Endpoints

### Development
```
SSO:     https://optio-dev-backend.onrender.com/spark/sso?token={jwt}
Webhook: https://optio-dev-backend.onrender.com/spark/webhook/submission
```

### Production (when ready)
```
SSO:     https://optio-prod-backend.onrender.com/spark/sso?token={jwt}
Webhook: https://optio-prod-backend.onrender.com/spark/webhook/submission
```

---

## 👤 Test Account

```
Email: spark-test@optioeducation.com
Spark User ID: test_student_001
Optio User ID: 64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8

Portfolio URL:
https://optio-dev-frontend.onrender.com/diploma/64633ccc-d0ac-4ba4-8ff0-6ad2ecfbbae8
```

---

## 📝 JWT Format

```javascript
const jwt = require('jsonwebtoken');

const token = jwt.sign({
  sub: 'spark_user_id',           // Your internal user ID
  email: 'student@example.com',
  given_name: 'First',
  family_name: 'Last',
  role: 'student',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 600  // 10 minutes
}, OPTIO_SHARED_SECRET, { algorithm: 'HS256' });
```

---

## 📤 Webhook Format

```javascript
const crypto = require('crypto');

const payload = JSON.stringify({
  spark_user_id: 'user_123',
  spark_assignment_id: 'assignment_456',
  spark_course_id: 'course_789',
  submission_text: 'Student submission text here...',
  submission_files: [
    {
      url: 'https://spark-storage.com/file.pdf?expires=...',
      type: 'application/pdf',
      filename: 'essay.pdf'
    }
  ],
  submitted_at: new Date().toISOString(),
  grade: 95.5
});

const signature = crypto
  .createHmac('sha256', OPTIO_WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');

fetch('https://optio-dev-backend.onrender.com/spark/webhook/submission', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Spark-Signature': signature
  },
  body: payload
});
```

---

## ✅ Expected Responses

### SSO Success
```
302 Redirect → {FRONTEND_URL}/dashboard?lti=true&access_token=...&refresh_token=...
```

### Webhook Success
```json
{
  "status": "success",
  "completion_id": "uuid-here"
}
```

---

## ❌ Common Errors

| Status | Error | Fix |
|--------|-------|-----|
| 401 | Token expired | Generate fresh token |
| 401 | Invalid signature | Check secret matches |
| 404 | User not found | Run SSO first |
| 404 | Quest not found | Run setup script |
| 500 | Server error | Check logs or contact Tanner |

---

## 📋 Testing Checklist

### SSO Testing
- [ ] Generate JWT token
- [ ] Open SSO URL in browser
- [ ] Verify automatic login
- [ ] Check user profile shows correct name
- [ ] Test expired token (should fail)
- [ ] Test invalid signature (should fail)

### Webhook Testing
- [ ] Run setup script to create test quest
- [ ] Send test webhook
- [ ] Verify 200 response
- [ ] Log into Optio and check dashboard
- [ ] View portfolio to confirm evidence appears
- [ ] Test with file attachments
- [ ] Test duplicate submission (idempotency)

---

## 📚 Full Documentation

- **SPARK_CREDENTIALS.md** - Complete credentials and examples
- **SPARK_TESTING_GUIDE.md** - Step-by-step testing instructions
- **SPARK_TEST_SUMMARY.md** - Current test results and status

---

## 🆘 Need Help?

**Contact:** Tanner (Optio Product Team)
**Status Page:** https://optio-dev-backend.onrender.com/health
