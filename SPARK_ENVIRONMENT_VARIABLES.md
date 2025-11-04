# Spark Integration - Environment Variables

**Date:** January 2025
**Purpose:** Configuration for Spark LMS integration

---

## Required Environment Variables

### Spark SSO Authentication

**`SPARK_SSO_SECRET`** (Required)
- **Description:** Shared secret for validating Spark JWT tokens
- **Format:** 64-character hexadecimal string (256-bit)
- **Security:** CRITICAL - Never commit to version control
- **Generate:** `openssl rand -hex 32`
- **Used in:** `backend/routes/spark_integration.py` (JWT validation)
- **Example:** `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`

**`SPARK_WEBHOOK_SECRET`** (Required)
- **Description:** Shared secret for validating webhook signatures
- **Format:** 64-character hexadecimal string (256-bit)
- **Security:** CRITICAL - Never commit to version control
- **Generate:** `openssl rand -hex 32`
- **Used in:** `backend/routes/spark_integration.py` (HMAC signature validation)
- **Example:** `f2e1d0c9b8a7z6y5x4w3v2u1t0s9r8q7p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1`

### Spark API Integration (Optional - For Automated Course Sync)

**`SPARK_API_URL`** (Optional)
- **Description:** Base URL for Spark API
- **Format:** HTTPS URL without trailing slash
- **Required for:** Automated course/assignment sync
- **Used in:** `backend/routes/spark_integration.py` (course sync endpoint)
- **Example:** `https://api.spark-lms.com` or `https://spark-api.yourdomain.com`

**`SPARK_API_KEY`** (Optional)
- **Description:** API key for authenticating to Spark API
- **Format:** Bearer token or API key string
- **Required for:** Automated course/assignment sync
- **Security:** CRITICAL - Never commit to version control
- **Used in:** `backend/routes/spark_integration.py` (API requests)
- **Example:** `(provided by Spark team)`

**`SPARK_STORAGE_DOMAINS`** (Optional)
- **Description:** Comma-separated list of allowed Spark file storage domains
- **Format:** Domain names separated by commas (no protocols)
- **Required for:** File downloads from Spark (SSRF protection)
- **Default:** `spark-storage.com,spark-cdn.com`
- **Used in:** `backend/routes/spark_integration.py` (file URL validation)
- **Example:** `spark-storage.com,spark-cdn.com,spark-assets.s3.amazonaws.com`

---

## Setting Environment Variables

### Development Environment (.env file)

Create or update `.env` in the backend root:

```bash
# Spark LMS Integration (Development)
SPARK_SSO_SECRET=your_generated_sso_secret_here
SPARK_WEBHOOK_SECRET=your_generated_webhook_secret_here
SPARK_API_URL=https://api-dev.spark-lms.com
SPARK_API_KEY=your_dev_api_key_here
SPARK_STORAGE_DOMAINS=spark-storage-dev.com,spark-cdn-dev.com
```

### Production Environment (Render)

**⚠️ CRITICAL: Use Render's environment variable interface - NEVER commit secrets to Git**

1. Navigate to Render Dashboard: https://dashboard.render.com
2. Select service: `optio-prod-backend`
3. Go to "Environment" tab
4. Click "Add Environment Variable"
5. Add each variable:

| Variable Name | Value | Notes |
|---------------|-------|-------|
| `SPARK_SSO_SECRET` | (64 chars) | Copy from 1Password/shared secure store |
| `SPARK_WEBHOOK_SECRET` | (64 chars) | Copy from 1Password/shared secure store |
| `SPARK_API_URL` | `https://api.spark-lms.com` | Production Spark API URL |
| `SPARK_API_KEY` | (from Spark team) | Production API key |
| `SPARK_STORAGE_DOMAINS` | `spark-storage.com,spark-cdn.com` | Production domains |

6. Click "Save Changes"
7. **Render will automatically redeploy**

### Development Environment (Render)

Repeat the same process for `optio-dev-backend` service with development values.

---

## Generating Shared Secrets

### Method 1: OpenSSL (Recommended)

```bash
# Generate SSO secret
openssl rand -hex 32

# Generate Webhook secret
openssl rand -hex 32
```

### Method 2: Python

```python
import secrets
print(secrets.token_hex(32))  # Run twice for two secrets
```

### Method 3: Node.js

```javascript
const crypto = require('crypto');
console.log(crypto.randomBytes(32).toString('hex'));  // Run twice
```

---

## Sharing Secrets with Spark Team

**NEVER share secrets via:**
- ❌ Email
- ❌ Slack
- ❌ SMS
- ❌ GitHub issues
- ❌ Documentation files

**ALWAYS share secrets via:**
- ✅ 1Password shared vault
- ✅ LastPass secure note
- ✅ Bitwarden organization vault
- ✅ In-person/video call (for initial setup only)

**Recommended workflow:**
1. Generate secrets using OpenSSL
2. Store in 1Password/LastPass
3. Share vault access with Spark team lead
4. Both teams retrieve secrets independently from shared vault
5. Each team configures their own environment variables

---

## Verification

### Check Environment Variables Are Set

```bash
# SSH into Render service or run locally
python -c "import os; print('SPARK_SSO_SECRET:', 'SET' if os.getenv('SPARK_SSO_SECRET') else 'NOT SET')"
python -c "import os; print('SPARK_WEBHOOK_SECRET:', 'SET' if os.getenv('SPARK_WEBHOOK_SECRET') else 'NOT SET')"
```

### Test SSO Endpoint

```bash
# Generate test JWT at jwt.io with your secret
curl "https://optio-dev-backend.onrender.com/spark/sso?token=YOUR_TEST_JWT"
```

Expected response: Redirect to dashboard (302) or error message (400/401)

### Test Webhook Endpoint

```bash
# Test with valid signature
curl -X POST https://optio-dev-backend.onrender.com/spark/webhook/submission \
  -H "Content-Type: application/json" \
  -H "X-Spark-Signature: test_signature" \
  -d '{"spark_user_id":"test","spark_assignment_id":"test","submission_text":"test","submitted_at":"2025-01-15T12:00:00Z"}'
```

Expected response: `{"error": "Invalid signature"}` (401) - confirms endpoint is working

---

## Security Best Practices

### 1. Secret Rotation

**Rotate secrets every:**
- 90 days (routine)
- Immediately if compromised
- When team members with access leave

**Rotation process:**
1. Generate new secret
2. Update Optio environment variables (Render)
3. Notify Spark team of new secret
4. Spark team updates their configuration
5. Test integration end-to-end
6. Old secret remains valid for 24 hours (grace period)
7. Remove old secret

### 2. Access Control

**Who needs access:**
- Optio backend maintainers
- Spark backend maintainers
- DevOps leads (both teams)

**Who should NOT have access:**
- Frontend developers
- QA testers
- Product managers
- Marketing team

### 3. Monitoring

**Set up alerts for:**
- Failed SSO attempts (> 5 per minute)
- Failed webhook signatures (> 10 per minute)
- Unusual API usage patterns
- Secret rotation reminders (quarterly)

### 4. Audit Logging

**Log (but don't store secrets):**
- ✅ SSO attempts (user_id, timestamp, success/fail)
- ✅ Webhook deliveries (assignment_id, timestamp, success/fail)
- ❌ JWT tokens (contains secrets)
- ❌ HMAC signatures (contains secrets)

---

## Troubleshooting

### Problem: "SPARK_SSO_SECRET not configured"

**Cause:** Environment variable not set in Render

**Solution:**
1. Go to Render dashboard
2. Check Environment tab
3. Verify `SPARK_SSO_SECRET` exists and has value
4. If missing, add it and redeploy
5. If present, check for typos

### Problem: "Invalid signature" for webhooks

**Cause:** Mismatch between Spark and Optio webhook secrets

**Solution:**
1. Verify both teams are using same `SPARK_WEBHOOK_SECRET`
2. Check for extra whitespace in secret
3. Confirm HMAC algorithm is SHA256 (not SHA1 or MD5)
4. Test signature generation independently

### Problem: SSO redirects but login fails

**Cause:** JWT claims missing or incorrect format

**Solution:**
1. Decode JWT at jwt.io
2. Verify required claims: sub, email, exp, iat
3. Check expiration hasn't passed
4. Confirm signature algorithm is HS256
5. Test with freshly generated token

### Problem: File downloads fail with "Invalid file URL domain"

**Cause:** Spark file URL domain not in `SPARK_STORAGE_DOMAINS`

**Solution:**
1. Check actual domain in error logs
2. Add domain to `SPARK_STORAGE_DOMAINS` (comma-separated)
3. Redeploy backend
4. Verify with test webhook

---

## Environment Variable Checklist

Before going live, confirm:

- [ ] `SPARK_SSO_SECRET` set in Render (production)
- [ ] `SPARK_WEBHOOK_SECRET` set in Render (production)
- [ ] `SPARK_API_URL` set (if using automated sync)
- [ ] `SPARK_API_KEY` set (if using automated sync)
- [ ] `SPARK_STORAGE_DOMAINS` set to production domains
- [ ] Secrets stored in secure vault (1Password/LastPass)
- [ ] Secrets NOT in Git history
- [ ] Spark team has access to same secrets
- [ ] Test SSO works end-to-end
- [ ] Test webhook works end-to-end
- [ ] Monitoring alerts configured
- [ ] Secret rotation schedule created

---

## Related Documentation

- [SPARK_INTEGRATION_PLAN.md](SPARK_INTEGRATION_PLAN.md) - Full integration architecture
- [SPARK_PLAN_REVIEW_AND_CORRECTIONS.md](SPARK_PLAN_REVIEW_AND_CORRECTIONS.md) - Implementation review
- [backend/migrations/006_create_lms_integration_tables.sql](backend/migrations/006_create_lms_integration_tables.sql) - Database schema
- [backend/routes/spark_integration.py](backend/routes/spark_integration.py) - Implementation code

---

**Last Updated:** January 2025
**Maintained By:** Optio DevOps Team
**Questions:** Contact dev@optioeducation.com
