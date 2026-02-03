# Security Testing Guide - Week 1 Verification

**Environment**: https://optio-dev-frontend.onrender.com (Frontend)
**API**: https://optio-dev-backend.onrender.com (Backend)
**Date**: January 2025

## Overview

This guide provides manual security testing procedures to verify Week 1 security implementations. All tests should be performed against the development environment.

---

## 1. Security Headers Testing

### Test CSP (Content Security Policy)

**Method**: Browser DevTools Network Tab

1. Open https://optio-dev-frontend.onrender.com
2. Open DevTools (F12) → Network tab
3. Refresh the page
4. Click on the main document request
5. Check Response Headers for:
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' ...
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   X-XSS-Protection: 1; mode=block
   Referrer-Policy: strict-origin-when-cross-origin
   Permissions-Policy: geolocation=(), microphone=(), camera=()
   ```

**Expected Result**: All security headers present
**Status**: ⬜ Pass ⬜ Fail

---

## 2. CORS Policy Testing

### Test CORS Restrictions

**Method**: Browser Console

1. Open https://example.com (different origin)
2. Open DevTools Console
3. Run:
   ```javascript
   fetch('https://optio-dev-backend.onrender.com/api/health', {
     credentials: 'include'
   })
   .then(r => r.json())
   .then(console.log)
   .catch(console.error)
   ```

**Expected Result**: CORS error (blocked by browser)
**Status**: ⬜ Pass ⬜ Fail

### Test CORS Allowed Origin

**Method**: From Optio Frontend

1. Open https://optio-dev-frontend.onrender.com
2. Open DevTools Console
3. Run:
   ```javascript
   fetch('https://optio-dev-backend.onrender.com/api/health', {
     credentials: 'include'
   })
   .then(r => r.json())
   .then(console.log)
   ```

**Expected Result**: Success (allowed origin)
**Status**: ⬜ Pass ⬜ Fail

---

## 3. Password Policy Testing

### Test Weak Password Rejection

**Method**: Registration Form

1. Go to https://optio-dev-frontend.onrender.com/register
2. Try registering with weak passwords:
   - `password123` (too simple)
   - `short1!` (too short, <12 chars)
   - `alllowercase123!` (no uppercase)
   - `ALLUPPERCASE123!` (no lowercase)
   - `NoNumbers!` (no digits)
   - `NoSpecial123` (no special chars)

**Expected Result**: All rejected with clear error messages
**Status**: ⬜ Pass ⬜ Fail

### Test Strong Password Acceptance

**Method**: Registration Form

1. Try password: `SecurePassword123!@#`
2. Should meet all requirements:
   - ✅ 12+ characters
   - ✅ Uppercase letter
   - ✅ Lowercase letter
   - ✅ Number
   - ✅ Special character

**Expected Result**: Password accepted
**Status**: ⬜ Pass ⬜ Fail

---

## 4. Rate Limiting Testing

### Test Login Rate Limiting

**Method**: Manual Login Attempts

1. Go to https://optio-dev-frontend.onrender.com/login
2. Attempt login with wrong password 5 times rapidly
3. Wait 1 minute
4. Attempt 6th login

**Expected Result**:
- Attempts 1-5: "Invalid credentials" error
- After 5 attempts: "Too many login attempts. Please try again later."
- Rate limit should reset after waiting period

**Status**: ⬜ Pass ⬜ Fail

---

## 5. SQL Injection Testing

### Test UUID Parameter Injection

**Method**: Browser Address Bar

1. Log in to get authenticated
2. Try malicious UUID in URL:
   ```
   https://optio-dev-frontend.onrender.com/users/'; DROP TABLE users; --
   https://optio-dev-frontend.onrender.com/users/1' OR '1'='1
   ```

**Expected Result**: 400 Bad Request or 404 Not Found (not executed)
**Status**: ⬜ Pass ⬜ Fail

### Test Input Field Injection

**Method**: Quest Submission Form

1. Start a quest
2. In evidence text field, enter:
   ```sql
   '; DELETE FROM quest_task_completions WHERE '1'='1'; --
   ```

**Expected Result**: Text stored safely, no SQL execution
**Status**: ⬜ Pass ⬜ Fail

---

## 6. XSS (Cross-Site Scripting) Testing

### Test Script Tag Injection

**Method**: Profile Bio Field

1. Go to profile settings
2. In bio field, enter:
   ```html
   <script>alert('XSS')</script>
   <img src=x onerror="alert('XSS')">
   ```
3. Save and view profile

**Expected Result**: Tags stripped or escaped, no alert popup
**Status**: ⬜ Pass ⬜ Fail

### Test JavaScript URL Injection

**Method**: Evidence Submission

1. Submit quest evidence with text:
   ```html
   <a href="javascript:alert('XSS')">Click me</a>
   ```
2. View the evidence

**Expected Result**: javascript: URL blocked or sanitized
**Status**: ⬜ Pass ⬜ Fail

---

## 7. File Upload Security Testing

### Test Path Traversal Attack

**Method**: File Upload

1. Create a file named: `../../etc/passwd.txt`
2. Try uploading it as evidence
3. Check server response

**Expected Result**: Filename sanitized or rejected
**Status**: ⬜ Pass ⬜ Fail

### Test File Extension Spoofing

**Method**: Malicious File Upload

1. Create a text file with content: `This is an executable`
2. Save as `malware.exe`
3. Rename to `malware.jpg` (keep .exe content)
4. Try uploading

**Expected Result**: Rejected (magic bytes don't match extension)
**Status**: ⬜ Pass ⬜ Fail

### Test Oversized File

**Method**: Large File Upload

1. Create a file larger than 10MB (e.g., 15MB)
2. Try uploading as evidence

**Expected Result**: Rejected with "File exceeds maximum size of 10MB"
**Status**: ⬜ Pass ⬜ Fail

### Test Invalid File Type

**Method**: Prohibited File Upload

1. Try uploading:
   - `.exe` file
   - `.sh` script
   - `.bat` batch file
   - `.dll` library

**Expected Result**: All rejected with "File type not allowed"
**Status**: ⬜ Pass ⬜ Fail

---

## 8. Authentication Security Testing

### Test JWT Token Expiration

**Method**: Browser DevTools + Wait

1. Log in to the application
2. Wait 1 hour (or check token expiry in DevTools → Application → Cookies)
3. Try accessing a protected endpoint

**Expected Result**: Token expires, requires re-authentication
**Status**: ⬜ Pass ⬜ Fail

### Test CSRF Protection

**Method**: Manual HTTP Request

1. Log in normally
2. Get your session cookie from DevTools
3. Try making a POST request from external site or curl without CSRF token:
   ```bash
   curl -X POST https://optio-dev-backend.onrender.com/api/quests/12345/start \
     -H "Cookie: your-session-cookie" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

**Expected Result**: 403 Forbidden (CSRF token missing)
**Status**: ⬜ Pass ⬜ Fail

---

## 9. Authorization Testing

### Test Unauthorized Access to Admin Routes

**Method**: Non-Admin User

1. Log in as regular student user
2. Try accessing admin routes:
   - `/admin/users`
   - `/admin/quests`
   - API: `GET /api/admin/users`

**Expected Result**: 403 Forbidden or redirect to dashboard
**Status**: ⬜ Pass ⬜ Fail

### Test Access to Other Users' Data

**Method**: URL Manipulation

1. Log in as User A
2. Note your user ID in URL
3. Change URL to different user ID (User B)
4. Try accessing:
   - User B's profile edit page
   - User B's dashboard
   - User B's completed quests

**Expected Result**: 403 Forbidden or own data only
**Status**: ⬜ Pass ⬜ Fail

---

## 10. Database Security (RLS) Testing

### Test Row-Level Security

**Method**: API Direct Access

1. Log in as User A
2. Open DevTools → Network
3. Try API requests for other users:
   ```
   GET /api/users/{other-user-id}/profile
   GET /api/users/{other-user-id}/completed-quests
   PUT /api/users/{other-user-id}/profile
   ```

**Expected Result**: Either 403 Forbidden or only own data returned
**Status**: ⬜ Pass ⬜ Fail

---

## Security Testing Summary

### Test Results

**Total Tests**: 18
**Passed**: ___
**Failed**: ___
**Not Tested**: ___

### Critical Findings

Document any critical security issues found:

```
1.

2.

3.

```

### Recommendations

```
1.

2.

3.

```

---

## OWASP Top 10 Coverage (2021)

✅ **A01:2021 - Broken Access Control**
- RLS enforcement on database
- Authorization checks on all routes
- CSRF protection

✅ **A02:2021 - Cryptographic Failures**
- Password hashing with bcrypt
- JWT tokens for session management
- HTTPS enforcement

✅ **A03:2021 - Injection**
- SQL injection prevention via Supabase parameterized queries
- UUID validation
- Input sanitization with bleach

✅ **A04:2021 - Insecure Design**
- Security headers (CSP, X-Frame-Options, etc.)
- Rate limiting on authentication
- File upload restrictions

✅ **A05:2021 - Security Misconfiguration**
- CORS policy enforcement
- Secure cookie settings
- Environment-specific configurations

✅ **A06:2021 - Vulnerable and Outdated Components**
- Dependencies up to date in requirements.txt
- bleach==6.2.0 (latest stable)
- python-magic==0.4.27

✅ **A07:2021 - Identification and Authentication Failures**
- Strong password policy (12+ chars, complexity)
- Rate limiting on login attempts
- JWT token expiration

✅ **A08:2021 - Software and Data Integrity Failures**
- CSRF token validation
- Content-type validation
- Magic byte file validation

✅ **A09:2021 - Security Logging and Monitoring Failures**
- Error logging in place
- Rate limit tracking
- Authentication event logging

✅ **A10:2021 - Server-Side Request Forgery (SSRF)**
- No external URL fetch from user input
- File uploads to isolated storage
- No user-controlled redirects

---

## Next Steps

After completing all tests:

1. ✅ Document all findings in improvement plan
2. ✅ Fix any critical issues immediately
3. ✅ Create tickets for non-critical issues
4. ✅ Update security checklist for future PRs
5. ✅ Deploy to production once all critical tests pass

**Tested By**: ___________
**Date**: ___________
**Sign-off**: ___________
