# Security Fix Implementation Plan

## Overview
This document outlines a phased approach to fix critical and high priority security issues identified in the OptioQuest platform security audit. Each phase can be tested independently before proceeding to the next.

## Security Fix Implementation Plan

### **PHASE 1: Critical Authentication & Secret Key Issues**
**Priority: CRITICAL | Duration: 1-2 hours | Test immediately**

#### 1.1 Remove Test Mode Authentication Bypass
- **File**: `backend/routes/auth.py`
- **Fix**: Remove or secure the TEST_MODE bypass logic
- **Implementation**:
  ```python
  # Remove any TEST_MODE environment variable checks
  # Remove hardcoded test credentials
  # Ensure all auth goes through proper validation
  ```

#### 1.2 Strengthen Flask Secret Key
- **File**: `backend/config.py`
- **Fix**: Generate cryptographically secure secret key
- **Implementation**:
  ```python
  import secrets
  SECRET_KEY = os.getenv('FLASK_SECRET_KEY')
  if not SECRET_KEY or SECRET_KEY == 'your-secret-key':
      raise ValueError("FLASK_SECRET_KEY must be set to a secure value")
  if len(SECRET_KEY) < 32:
      raise ValueError("FLASK_SECRET_KEY must be at least 32 characters")
  ```
- **Action Required**: Generate new key: `python -c "import secrets; print(secrets.token_hex(32))"`
- **Update**: `.env` file with new secure key

**Testing Phase 1**:
- Verify login/logout works normally
- Confirm test credentials no longer work
- Check existing sessions are invalidated
- Test JWT token generation/validation

---

### **PHASE 2: Database Security & Admin Client**
**Priority: CRITICAL | Duration: 2-3 hours | Test after Phase 1**

#### 2.1 Replace Admin Client Usage
- **Files**: `backend/database.py`, all route files
- **Fix**: Use user-scoped client for regular operations
- **Implementation**:
  ```python
  # In database.py
  def get_user_client(token):
      """Get Supabase client with user's token"""
      return create_client(
          os.getenv('SUPABASE_URL'),
          token  # Use user's JWT token
      )
  
  # Keep admin_client only for specific admin operations
  ```

#### 2.2 Implement Proper RLS Checks
- **Fix**: Ensure Row Level Security is enforced
- **Implementation**:
  - Review Supabase RLS policies
  - Use admin client only for:
    - User registration
    - Admin dashboard operations
    - System maintenance
  - All user operations use their JWT token

**Testing Phase 2**:
- Test user can only access their own data
- Verify admin operations still work
- Check quest completion with user token
- Ensure no privilege escalation

---

### **PHASE 3: SQL Injection Prevention**
**Priority: HIGH | Duration: 1-2 hours | Test after Phase 2**

#### 3.1 Fix Quest Search Queries
- **File**: `backend/routes/quests.py`
- **Fix**: Use parameterized queries
- **Implementation**:
  ```python
  # Instead of string formatting
  # BAD: f"title.ilike('%{search}%')"
  
  # Use Supabase filters properly
  query = supabase.table('quests').select('*')
  if search:
      query = query.ilike('title', f'%{search}%')
  ```

#### 3.2 Add Input Validation Layer
- **File**: `backend/utils/validation/sanitizers.py`
- **Implementation**:
  ```python
  def sanitize_search_input(search_term):
      # Remove SQL special characters
      # Limit length
      # Validate against whitelist pattern
      return cleaned_search
  ```

**Testing Phase 3**:
- Test search with SQL injection attempts
- Verify normal search still works
- Check special characters are handled safely

---

### **PHASE 4: CSRF Protection**
**Priority: HIGH | Duration: 2-3 hours | Test after Phase 3**

#### 4.1 Implement CSRF Tokens
- **File**: `backend/app.py`
- **Fix**: Add Flask-WTF CSRF protection
- **Implementation**:
  ```python
  from flask_wtf.csrf import CSRFProtect
  
  csrf = CSRFProtect()
  csrf.init_app(app)
  
  # Configure for API usage
  app.config['WTF_CSRF_TIME_LIMIT'] = None
  app.config['WTF_CSRF_HEADERS'] = ['X-CSRF-Token']
  ```

#### 4.2 Update Frontend API Calls
- **File**: `frontend/src/services/api.js`
- **Implementation**:
  ```javascript
  // Add CSRF token to headers
  const csrfToken = await getCsrfToken();
  headers['X-CSRF-Token'] = csrfToken;
  ```

**Testing Phase 4**:
- Test all POST/PUT/DELETE operations
- Verify CSRF token validation
- Check error handling for missing tokens

---

### **PHASE 5: Token Security**
**Priority: HIGH | Duration: 1 hour | Test after Phase 4**

#### 5.1 Reduce Token Expiration
- **File**: `backend/utils/auth/jwt_handler.py`
- **Fix**: Reduce from 24h to 1-2 hours
- **Implementation**:
  ```python
  ACCESS_TOKEN_EXPIRE = timedelta(hours=1)
  REFRESH_TOKEN_EXPIRE = timedelta(days=7)
  ```

#### 5.2 Implement Token Refresh
- **File**: `backend/routes/auth.py`
- **Add endpoint**: `/api/auth/refresh`
- **Frontend**: Auto-refresh before expiration

**Testing Phase 5**:
- Test token expiration
- Verify refresh mechanism
- Check user experience isn't disrupted

---

### **PHASE 6: CORS Hardening**
**Priority: HIGH | Duration: 30 min | Test after Phase 5**

#### 6.1 Restrict CORS Origins
- **File**: `backend/cors_config.py`
- **Fix**: Remove wildcard, specify exact origins
- **Implementation**:
  ```python
  CORS_ORIGINS = [
      'http://localhost:5173',  # Dev frontend
      'https://optioed.org',    # Production
      # Remove any wildcards
  ]
  ```

**Testing Phase 6**:
- Test from allowed origins
- Verify blocked from other origins
- Check preflight requests work

---

## Testing Checklist After Each Phase

### Phase 1 Tests:
- [ ] Login with valid credentials works
- [ ] Login with test/bypass credentials fails
- [ ] Existing sessions invalidated after secret key change
- [ ] New sessions work properly

### Phase 2 Tests:
- [ ] Users can only see their own quests
- [ ] Users cannot access other users' data
- [ ] Admin functions still work for admins
- [ ] Quest completion works correctly

### Phase 3 Tests:
- [ ] Search with `'; DROP TABLE--` doesn't break
- [ ] Normal search queries work
- [ ] Special characters handled safely

### Phase 4 Tests:
- [ ] Form submissions include CSRF token
- [ ] Requests without token are rejected
- [ ] Token validation works correctly

### Phase 5 Tests:
- [ ] Tokens expire after 1 hour
- [ ] Refresh token works
- [ ] User stays logged in with refresh

### Phase 6 Tests:
- [ ] Requests from localhost:5173 work
- [ ] Requests from other origins blocked
- [ ] Production domain works when deployed

## Implementation Order & Timeline

1. **Day 1**: Complete Phases 1-2 (Critical issues)
   - Test thoroughly
   - Deploy to staging if available

2. **Day 2**: Complete Phases 3-4 (High priority)
   - Test each phase
   - Monitor for issues

3. **Day 3**: Complete Phases 5-6 (Security hardening)
   - Final testing
   - Prepare for production

## Post-Implementation Actions

1. **Rotate all secrets**:
   - Generate new JWT secrets
   - Update all API keys
   - Change database passwords

2. **Security audit**:
   - Run automated security scanner
   - Review logs for suspicious activity
   - Test all auth flows

3. **Documentation**:
   - Update CLAUDE.md with security practices
   - Document CSRF token usage
   - Add security testing guide

## Security Issues Summary

### Critical Issues Found:
1. **Authentication bypass** in test mode allowing system compromise
2. **Weak Flask secret key** enabling token forgery
3. **Admin client overuse** bypassing database security policies

### High Priority Issues Found:
- SQL injection risks in quest search
- Missing CSRF protection
- Excessive token expiration times (24 hours)
- Overly permissive CORS configuration

### Medium/Low Priority Issues (To address after critical fixes):
- Rate limiting gaps
- Verbose error messages
- Missing security headers
- Dependency updates needed

## Notes

- This phased approach allows testing after each critical fix while maintaining system stability
- Start with Phase 1 immediately as it addresses the most critical vulnerabilities
- Each phase builds on the previous one - do not skip phases
- Keep backups before making changes
- Test in development environment first
- Consider using a staging environment for final validation before production deployment

---

*Document Created: 2025-08-29*
*Security Audit Date: 2025-08-29*
*Platform: OptioQuest (PathWeaver 2.0)*