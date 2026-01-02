# V1 Production Release - Remaining Items

**Date:** January 2, 2026
**Status:** In Progress

---

## Completed Items

- [x] XSS Vulnerability - Added DOMPurify sanitization to all 9 `dangerouslySetInnerHTML` uses
- [x] Source Maps - Disabled in production builds (`vite.config.js`)
- [x] Frontend build verified - 0 vulnerabilities

---

## CRITICAL Priority (Must Fix Before Launch)

### 1. FERPA VIOLATION - Public by Default
**File:** `legal/PRIVACY_POLICY.md` lines 94-100

Educational records (portfolios, diplomas, quest completions) are public by default. FERPA requires educational records to be private unless explicit consent is given.

**Action Required:**
- [ ] Change default visibility to PRIVATE for all educational content
- [ ] Add explicit opt-in consent flow for public sharing
- [ ] Require parental consent for minors' public content
- [ ] Update Privacy Policy to reflect change
- [ ] Update database defaults and RLS policies

**Files to modify:**
- `legal/PRIVACY_POLICY.md`
- Database migration for default visibility
- `backend/routes/portfolio.py`
- `backend/routes/diploma.py`

---

### 2. COPPA - Verifiable Parental Consent
**Files:** `backend/routes/parental_consent.py`, `backend/routes/dependents.py`

Current email-based consent is NOT "verifiable" under FTC rules. COPPA requires:
- Credit card verification, OR
- Government ID verification, OR
- Signed consent form with ID

**Action Required:**
- [ ] Implement at least ONE verifiable consent method:
  - Option A: Stripe card verification ($0.50 auth + void)
  - Option B: ID verification service (Veriff, IDology)
  - Option C: Manual admin review of uploaded documents (partially built)
- [ ] Block dependent account access until verified consent
- [ ] Add consent status tracking in database

**Files to modify:**
- `backend/routes/parental_consent.py`
- `backend/routes/dependents.py`
- `backend/migrations/` - new migration for consent tracking

---

### 3. Rate Limiting in Production
**File:** `backend/.env:36`

Rate limiting is disabled (`DISABLE_RATE_LIMIT=true`) for local development.

**Action Required:**
- [ ] Verify `DISABLE_RATE_LIMIT=false` or unset in Render production environment
- [ ] Verify Redis is configured for production rate limiting
- [ ] Add pre-deploy check to ensure rate limiting is enabled

**Where to configure:**
- Render Dashboard > Environment Variables
- Ensure `DISABLE_RATE_LIMIT` is NOT set or set to `false`

---

## HIGH Priority (Should Fix Before Launch)

### 4. Missing Authorization on Admin Routes
**Files:** `backend/routes/admin/*.py`

Not all admin endpoints verified to have `@require_admin` decorator.

**Action Required:**
- [ ] Run audit: `grep -r "def " backend/routes/admin/*.py | grep -v "@require_admin"`
- [ ] Add `@require_admin` or `@require_role` to any unprotected endpoints
- [ ] Ensure superadmin is always included in role checks

---

### 5. No Explicit IDOR Prevention
**Files:** Throughout `backend/routes/`

Relying solely on RLS policies for authorization.

**Action Required:**
- [ ] Add explicit ownership checks in critical endpoints
- [ ] Example: `if user_id != requested_user_id: abort(403)`
- [ ] Priority endpoints: user profiles, quest data, evidence submissions

---

### 6. Third-Party Services Without COPPA Consent
**Files:** `backend/routes/ai_tutor.py`, analytics integration

Google Gemini API receives children's messages without documented consent.

**Action Required:**
- [ ] Add per-service consent checkboxes at registration/parent consent
- [ ] Block AI tutor for dependents without third-party consent
- [ ] Document consent in privacy policy
- [ ] Consider: disable Google Analytics for minors

---

### 7. Masquerade Debug Logging
**File:** `backend/routes/admin/masquerade.py:51`

```python
logger.info(f"[Masquerade] admin_id={admin_id}, admin_role={admin_role}...")
```

**Action Required:**
- [ ] Mask sensitive IDs in logs (show only first 8 chars)
- [ ] Example: `admin_id[:8]...`

---

### 8. Error Handler Stack Traces
**File:** `backend/middleware/error_handler.py:200-204`

In non-production environments, full tracebacks returned to client.

**Action Required:**
- [ ] Verify `ENV=production` is set in Render
- [ ] Consider adding explicit check for production before exposing debug info

---

### 9. Missing UUID Validation
**Files:** Routes with UUID parameters

**Action Required:**
- [ ] Add `@validate_uuid_param()` decorator to all UUID path params
- [ ] Priority: admin routes, user data routes

---

### 10. HTML Content Sanitization on Storage
**Files:** `backend/routes/announcements.py`, curriculum endpoints

**Action Required:**
- [ ] Verify `sanitize_html()` is called before storing any HTML
- [ ] Audit all endpoints accepting HTML content

---

### 11. CORS Fallback Configuration
**File:** `backend/app_config.py:85-109`

If `ALLOWED_ORIGINS` not set, falls back to hardcoded list.

**Action Required:**
- [ ] Verify production ALWAYS sets `ALLOWED_ORIGINS` explicitly in Render
- [ ] Remove dev URLs from fallback list for production

---

### 12. Incomplete Features (TODOs)
**Files:**
- `backend/services/advisor_service.py:400` - advisor_badges table
- `backend/services/tutor_conversation_service.py:434,455` - XP integration, parent notifications
- `backend/services/announcement_service.py:282` - notification sending
- `backend/services/safety_service.py:413` - database storage for admin review

**Action Required:**
- [ ] Complete implementations OR
- [ ] Disable incomplete features for V1

---

### 13. Child-Friendly Privacy Policy
**Required by:** COPPA

**Action Required:**
- [ ] Create simplified privacy explanation for ages 5-12
- [ ] Add to `legal/PRIVACY_POLICY_CHILDREN.md`
- [ ] Include: what data is collected, who sees it, how to ask questions

---

### 14. Data Export Feature
**Required by:** COPPA, GDPR

Privacy Policy mentions "Download All My Data" feature but not implemented.

**Action Required:**
- [ ] Build `GET /api/users/export-my-data` endpoint
- [ ] Include: profile data, quest progress, evidence, badges
- [ ] Format: JSON or ZIP file

---

## MEDIUM Priority (Fix Before Scaling)

### 15. Refresh Token Rotation
**File:** `backend/utils/session_manager.py:30-33`

Refresh tokens valid for 7 days without rotation.

**Action Required:**
- [ ] Implement refresh token rotation (issue new token on each use)

---

### 16. localStorage Encryption Key
**File:** `frontend/src/services/secureTokenStore.js:49-60`

Encryption key stored in localStorage (XSS accessible).

**Action Required:**
- [ ] Document as known limitation OR
- [ ] Move to IndexedDB with proper access controls

---

### 17. Dependent Account Deletion Audit
**File:** `backend/routes/dependents.py:206-234`

No additional verification or audit when parent deletes child account.

**Action Required:**
- [ ] Add audit logging for dependent deletion
- [ ] Consider confirmation step

---

### 18. Parent-Student Linking
**File:** `backend/routes/admin/parent_connections.py`

Currently admin-only. Parents can't link to existing student accounts.

**Action Required:**
- [ ] Consider self-service parent verification flow
- [ ] Lower priority for V1

---

### 19. Missing CSP Headers
**Action Required:**
- [ ] Add Content-Security-Policy headers to backend
- [ ] Configure in `backend/middleware/security.py`

---

### 20. Console.error Standardization
**Files:** 30+ frontend files

**Action Required:**
- [ ] Replace `console.error` with centralized logger utility
- [ ] Lower priority - functional but inconsistent

---

### 21. Unbounded Queries
**Files:** Repository layer, 30+ endpoints

**Action Required:**
- [ ] Audit all list endpoints
- [ ] Enforce pagination defaults and maximums
- [ ] Lower priority unless performance issues observed

---

### 22. Test Scripts in Codebase
**Files:**
- `backend/scripts/create_test_account.py`
- `backend/scripts/reset_test_user_data.py`

**Action Required:**
- [ ] Ensure cannot run in production environment
- [ ] Add environment check at script start

---

### 23. Debug Statements in Services
**Files:**
- `backend/services/quest_optimization.py:254,263,266,289,298,301`
- `backend/services/ai_quest_review_service.py:58,63,93-94`

**Action Required:**
- [ ] Remove verbose debug statements OR
- [ ] Guard with environment checks

---

### 24. Commented-Out Code
150+ Python files, 30+ JS files contain commented code.

**Action Required:**
- [ ] Clean up before production release
- [ ] Lower priority - cosmetic

---

## Verification Commands

```bash
# Check for missing auth decorators
grep -r "def " backend/routes/admin/*.py | grep -v "@require_admin"

# Find remaining dangerouslySetInnerHTML (should be 0 unsafe)
grep -r "dangerouslySetInnerHTML" frontend/src/ | grep -v "sanitize"

# Count TODOs
grep -r "TODO\|FIXME" backend/ --include="*.py" | wc -l

# Run npm audit
cd frontend && npm audit

# Run Python security check
pip install safety && safety check
```

---

## Production Environment Checklist

Before deploying to production, verify in Render:

- [ ] `FLASK_ENV=production`
- [ ] `DISABLE_RATE_LIMIT` is unset or `false`
- [ ] `ALLOWED_ORIGINS` is set to production domains only
- [ ] `SECRET_KEY` is strong (64+ chars, high entropy)
- [ ] Redis is configured for rate limiting
- [ ] All API keys are production keys (not test/dev)

---

## Summary

| Priority | Count | Status |
|----------|-------|--------|
| CRITICAL | 3 | Pending |
| HIGH | 11 | Pending |
| MEDIUM | 10 | Pending |

**Estimated remaining work:** 30-40 hours
