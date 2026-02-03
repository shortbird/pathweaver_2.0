# Security Checklist for Pull Requests

Use this checklist to ensure all security requirements are met before merging code changes.

---

## 🔐 Authentication & Authorization

- [ ] User authentication required for all protected routes
- [ ] Authorization checks verify user has permission to access resource
- [ ] JWT tokens validated and checked for expiration
- [ ] CSRF tokens required for all state-changing requests (POST, PUT, DELETE)
- [ ] No authentication bypass vulnerabilities
- [ ] Password changes require current password verification

---

## 🛡️ Input Validation & Sanitization

- [ ] All user input validated before processing
- [ ] UUID parameters validated with regex pattern
- [ ] String length limits enforced (prevent DoS)
- [ ] HTML content sanitized using bleach library
- [ ] File uploads validate magic bytes (not just extension)
- [ ] No SQL injection vulnerabilities (use parameterized queries)
- [ ] XSS prevention: user content escaped before display

---

## 📁 File Upload Security

- [ ] File type validated using magic bytes (python-magic)
- [ ] File size limits enforced (10MB max)
- [ ] Filename sanitized with werkzeug secure_filename
- [ ] Path traversal attacks prevented (no ../, ..\, etc.)
- [ ] Allowed file types limited to safe MIME types
- [ ] Files stored in isolated storage (not server filesystem)
- [ ] Content-type headers set correctly

---

## 🔒 Database Security

- [ ] Row-Level Security (RLS) policies enforced
- [ ] Use get_user_client() for user-specific operations
- [ ] Use get_supabase_admin_client() only when necessary
- [ ] No raw SQL queries (use Supabase query builder)
- [ ] Sensitive data encrypted at rest
- [ ] Database credentials not hardcoded
- [ ] No database credentials in logs

---

## 🌐 API Security

- [ ] Rate limiting applied to sensitive endpoints
- [ ] CORS policy allows only whitelisted origins
- [ ] Proper HTTP status codes returned (401, 403, 404, 500)
- [ ] Error messages don't leak sensitive information
- [ ] No stack traces exposed to users
- [ ] API versioning in place for breaking changes
- [ ] All endpoints have authentication/authorization

---

## 🔑 Secrets Management

- [ ] No secrets in code or git history
- [ ] Environment variables used for sensitive config
- [ ] Secrets not logged or exposed in error messages
- [ ] API keys rotated regularly
- [ ] Different secrets for dev/staging/prod environments
- [ ] .env files in .gitignore

---

## 📝 Logging & Monitoring

- [ ] Authentication attempts logged
- [ ] Failed login attempts tracked
- [ ] Rate limit violations logged
- [ ] Security events logged (unauthorized access, etc.)
- [ ] No sensitive data in logs (passwords, tokens, etc.)
- [ ] Log retention policy followed

---

## 🧪 Testing Requirements

- [ ] Security-relevant code has tests
- [ ] Input validation tests added
- [ ] Authentication/authorization tests added
- [ ] SQL injection tests added (if applicable)
- [ ] XSS prevention tests added (if applicable)
- [ ] Manual security testing performed in dev environment

---

## 🚀 Deployment Security

- [ ] HTTPS enforced (no HTTP)
- [ ] Security headers present (CSP, X-Frame-Options, etc.)
- [ ] Secure cookies (httpOnly, secure, sameSite)
- [ ] Environment variables set correctly
- [ ] Dependencies up to date (no known vulnerabilities)
- [ ] Build process doesn't expose secrets
- [ ] Health check endpoint doesn't leak information

---

## 📋 Code Review Checklist

### For Reviewers:

- [ ] Check for hardcoded secrets or credentials
- [ ] Verify authentication on new endpoints
- [ ] Check authorization logic for privilege escalation
- [ ] Review input validation completeness
- [ ] Look for SQL injection vulnerabilities
- [ ] Check for XSS vulnerabilities
- [ ] Verify CSRF protection on state-changing operations
- [ ] Review error handling (no information leakage)
- [ ] Check logging doesn't expose sensitive data
- [ ] Verify RLS policies enforced

---

## 🎯 OWASP Top 10 Quick Check

- [ ] **A01: Broken Access Control** - Authorization checks present
- [ ] **A02: Cryptographic Failures** - Sensitive data encrypted
- [ ] **A03: Injection** - Input validated and sanitized
- [ ] **A04: Insecure Design** - Security considered in design
- [ ] **A05: Security Misconfiguration** - Secure defaults used
- [ ] **A06: Vulnerable Components** - Dependencies up to date
- [ ] **A07: Authentication Failures** - Strong auth mechanisms
- [ ] **A08: Data Integrity Failures** - CSRF protection present
- [ ] **A09: Logging Failures** - Security events logged
- [ ] **A10: SSRF** - No user-controlled external requests

---

## ⚠️ High-Risk Changes

If your PR includes any of these, extra security review required:

- [ ] Changes to authentication/authorization logic
- [ ] New admin endpoints or privileged operations
- [ ] Database schema changes
- [ ] File upload functionality
- [ ] Payment processing
- [ ] User data export/import
- [ ] External API integrations
- [ ] Changes to security headers or CORS
- [ ] Cryptographic operations

---

## 📚 References

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **Security Testing Guide**: `docs/SECURITY_TESTING_GUIDE.md`
- **Improvement Plan**: `CODEBASE_IMPROVEMENT_PLAN.md`
- **Core Philosophy**: `core_philosophy.md`

---

## ✅ Sign-off

**PR Author**: I have reviewed this checklist and addressed all applicable items.

**Security Reviewer**: I have reviewed this PR with security considerations in mind.

**Date**: ___________
