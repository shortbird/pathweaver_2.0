# ADR-004: Safari/iOS Cookie Compatibility

**Date**: December 19, 2025
**Status**: Accepted
**Related**: ADR-003 (httpOnly Cookie Authentication)
**Platform Impact**: Safari desktop, iOS Safari, iOS Chrome

---

## Context

After implementing httpOnly cookie authentication (ADR-003), we discovered that Safari and iOS browsers block third-party cookies by default due to Intelligent Tracking Prevention (ITP).

### The Problem

**Safari ITP blocks cookies in cross-origin contexts**:

1. **Frontend domain**: `optio-dev-frontend.onrender.com`
2. **Backend domain**: `optio-dev-backend.onrender.com`
3. **Cross-origin**: Different subdomains = third-party cookies
4. **Safari ITP**: Blocks third-party cookies automatically

**Impact**:
- Safari users cannot log in (cookies not set)
- iOS users (majority mobile traffic) completely blocked
- Affects ~40% of potential user base

**Initial symptoms**:
```javascript
// Login request succeeds
POST /api/auth/login → 200 OK

// But cookies not set in Safari
document.cookie → "" (empty)

// Next request fails
GET /api/tasks → 401 Unauthorized
```

---

## Decision

We implement a **dual-authentication strategy** with automatic Safari detection and fallback:

### Strategy 1: Cookie-First (Default)

**Desktop Chrome/Firefox/Edge** - Use httpOnly cookies

```python
# Backend sets cookies normally
response.set_cookie('access_token', token, httponly=True, secure=True, samesite='Lax')
```

### Strategy 2: Header-Based Fallback (Safari/iOS)

**Safari/iOS browsers** - Use Authorization header with localStorage

```python
# Backend returns tokens in response for Safari
if is_safari_or_ios(request):
    return jsonify({
        'success': True,
        'access_token': access_token,  # Safari fallback
        'refresh_token': refresh_token
    })
```

```javascript
// Frontend detects Safari and stores tokens
if (isSafari() || isIOS()) {
    localStorage.setItem('access_token', response.data.access_token)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
}
```

**Tradeoff**: Safari users have reduced XSS protection but functional authentication.

---

## Rule 1: Automatic Browser Detection

**Backend MUST detect Safari/iOS browsers and adjust auth strategy.**

```python
# backend/utils/browser_detection.py
def is_safari_or_ios(request) -> bool:
    """
    Detect Safari desktop or iOS browsers (Safari, Chrome, Firefox on iOS).
    iOS browsers all use WebKit and block third-party cookies.
    """
    user_agent = request.headers.get('User-Agent', '').lower()

    # iOS detection (iPhone, iPad, iPod)
    if any(device in user_agent for device in ['iphone', 'ipad', 'ipod']):
        return True

    # Safari desktop detection (excludes Chrome, Edge)
    if 'safari' in user_agent and 'chrome' not in user_agent and 'edg' not in user_agent:
        return True

    return False
```

**Why**: Avoids manual user configuration. Works automatically.

---

## Rule 2: Cookie + Token Dual Response

**Login/refresh endpoints return BOTH cookies AND tokens in response.**

```python
# backend/routes/auth.py
from utils.browser_detection import is_safari_or_ios

@app.route('/api/auth/login', methods=['POST'])
def login():
    # Authenticate user
    access_token = create_access_token(user_id)
    refresh_token = create_refresh_token(user_id)

    # ALWAYS set cookies (for Chrome/Firefox/Edge)
    response = make_response(jsonify({
        'success': True,
        # Tokens in body for Safari fallback
        'access_token': access_token if is_safari_or_ios(request) else None,
        'refresh_token': refresh_token if is_safari_or_ios(request) else None
    }))

    # Set cookies (may be blocked by Safari)
    response.set_cookie('access_token', access_token, httponly=True, ...)
    response.set_cookie('refresh_token', refresh_token, httponly=True, ...)

    return response
```

**Why**:
- Chrome/Firefox users get secure httpOnly cookies
- Safari/iOS users get tokens as fallback
- No separate endpoints needed

---

## Rule 3: Frontend Detects and Adapts

**Frontend MUST detect Safari/iOS and use appropriate auth method.**

```javascript
// frontend/src/utils/browserDetection.js
export function isSafari() {
    const ua = navigator.userAgent.toLowerCase()
    return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('edgios')
}

export function isIOS() {
    return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())
}

export function needsTokenFallback() {
    return isSafari() || isIOS()
}
```

```javascript
// frontend/src/contexts/AuthContext.jsx
import { needsTokenFallback } from '../utils/browserDetection'

async function login(email, password) {
    const response = await api.post('/api/auth/login', { email, password })

    if (needsTokenFallback()) {
        // Safari/iOS: Store tokens in localStorage
        localStorage.setItem('access_token', response.data.access_token)
        localStorage.setItem('refresh_token', response.data.refresh_token)

        // Add Authorization header for future requests
        api.defaults.headers.common['Authorization'] =
            `Bearer ${response.data.access_token}`
    }
    // Chrome/Firefox: Cookies set automatically, no action needed

    return response.data
}
```

**Why**: Graceful degradation. Works on all browsers without user intervention.

---

## Rule 4: Enhanced Logging for Debugging

**Backend MUST log auth method and Safari detection.**

```python
# backend/services/session_manager.py
from utils.logger import get_logger
from utils.browser_detection import is_safari_or_ios

logger = get_logger(__name__)

def create_session(request, user_id):
    is_safari = is_safari_or_ios(request)

    logger.info(
        f"[SessionManager] Creating session: user_id={user_id[:8]}, "
        f"is_safari={is_safari}, "
        f"user_agent={request.headers.get('User-Agent', 'unknown')[:50]}"
    )

    # ... set cookies ...

    if is_safari:
        logger.warning(
            f"[SessionManager] Safari/iOS detected - tokens also in response body"
        )
```

**Why**: Helps debug Safari-specific issues in production logs.

---

## Rule 5: Debug Endpoint for Diagnostics

**Provide /api/auth/cookie-debug endpoint for Safari troubleshooting.**

```python
@app.route('/api/auth/cookie-debug', methods=['GET'])
def cookie_debug():
    """
    Debug endpoint to diagnose cookie/token issues.
    Returns comprehensive diagnostics WITHOUT exposing token values.
    """
    cookies = request.cookies
    headers = dict(request.headers)
    user_agent = request.headers.get('User-Agent', 'unknown')

    # Detect browser
    is_safari = is_safari_or_ios(request)
    browser_info = {
        'is_safari': is_safari,
        'is_ios': any(d in user_agent.lower() for d in ['iphone', 'ipad', 'ipod']),
        'user_agent': user_agent
    }

    # Check tokens (metadata only, not values)
    access_token = cookies.get('access_token')
    auth_header = headers.get('Authorization', '')

    token_info = {
        'has_cookie': bool(access_token),
        'has_auth_header': bool(auth_header),
        'cookie_count': len(cookies),
        'auth_method': 'cookie' if access_token else ('header' if auth_header else 'none')
    }

    # Generate recommendations
    recommendations = []
    if is_safari and access_token:
        recommendations.append('Safari using cookies (unexpected - ITP may not be blocking)')
    elif is_safari and not access_token and not auth_header:
        recommendations.append('Safari without auth - cookies blocked by ITP, tokens not stored')
    elif not is_safari and not access_token:
        recommendations.append('Non-Safari browser without cookies - check CORS/domain settings')

    return jsonify({
        'browser': browser_info,
        'tokens': token_info,
        'recommendations': recommendations,
        'summary': f"Auth method: {token_info['auth_method']}, Browser: {'Safari/iOS' if is_safari else 'Other'}"
    })
```

**Why**: Helps users and support staff diagnose auth issues without exposing secrets.

---

## Implementation Details

### Backend Session Manager

```python
# backend/services/session_manager.py
class SessionManager:
    """Manages user sessions with Safari/iOS compatibility"""

    def __init__(self):
        self.logger = get_logger(__name__)

    def create_session(self, request, user_id: str):
        """Create session with cookies + token fallback"""
        access_token = create_access_token(user_id)
        refresh_token = create_refresh_token(user_id)

        # Detect Safari/iOS
        is_safari = is_safari_or_ios(request)

        # Build response
        response_data = {'success': True}
        if is_safari:
            response_data['access_token'] = access_token
            response_data['refresh_token'] = refresh_token

        response = make_response(jsonify(response_data))

        # Set cookies (all browsers)
        response.set_cookie(
            'access_token',
            access_token,
            httponly=True,
            secure=True,
            samesite='Lax',
            max_age=3600,
            domain=self._get_cookie_domain(request)
        )

        response.set_cookie(
            'refresh_token',
            refresh_token,
            httponly=True,
            secure=True,
            samesite='Lax',
            max_age=2592000,
            domain=self._get_cookie_domain(request)
        )

        # Logging
        self.logger.info(
            f"[SessionManager] Session created: user_id={user_id[:8]}, "
            f"auth_method={'header' if is_safari else 'cookie'}, "
            f"is_safari={is_safari}"
        )

        return response

    def _get_cookie_domain(self, request):
        """Get appropriate cookie domain for cross-origin"""
        # Production: .optioeducation.com (allows subdomains)
        # Development: localhost
        return os.getenv('COOKIE_DOMAIN', 'localhost')
```

### Frontend Authorization Interceptor

```javascript
// frontend/src/services/api.js
import axios from 'axios'
import { needsTokenFallback } from '../utils/browserDetection'

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true  // Send cookies
})

// Add Authorization header for Safari/iOS
api.interceptors.request.use(config => {
    if (needsTokenFallback()) {
        const token = localStorage.getItem('access_token')
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }
    }
    // Chrome/Firefox: cookies sent automatically
    return config
})

// Handle token refresh on 401
api.interceptors.response.use(
    response => response,
    async error => {
        if (error.response?.status === 401 && needsTokenFallback()) {
            // Safari: Try refresh token
            const refreshToken = localStorage.getItem('refresh_token')
            if (refreshToken) {
                try {
                    const response = await api.post('/api/auth/refresh', {
                        refresh_token: refreshToken
                    })

                    // Store new tokens
                    localStorage.setItem('access_token', response.data.access_token)
                    localStorage.setItem('refresh_token', response.data.refresh_token)

                    // Retry original request
                    error.config.headers.Authorization = `Bearer ${response.data.access_token}`
                    return api.request(error.config)
                } catch (refreshError) {
                    // Refresh failed - logout
                    localStorage.clear()
                    window.location.href = '/login'
                }
            }
        }
        return Promise.reject(error)
    }
)
```

---

## Security Tradeoffs

### Cookie-Based Auth (Chrome/Firefox) ✅

**Pros**:
- httpOnly protection (XSS-proof)
- Automatic expiration
- CSRF protection (SameSite)
- No localStorage exposure

**Cons**:
- None (ideal security)

### Header-Based Auth (Safari/iOS) ⚠️

**Pros**:
- Works on Safari/iOS
- Better than no auth

**Cons**:
- localStorage vulnerable to XSS
- Manual token refresh
- No httpOnly protection

**Mitigation**:
1. Content Security Policy (CSP) to prevent XSS
2. Input sanitization on all user content
3. Regular security audits
4. User education (Safari users accept tradeoff for functionality)

---

## Alternative Solutions Considered

### 1. Same-Origin Deployment ❌

**Idea**: Deploy frontend and backend on same domain to avoid third-party cookies

**Example**:
- Frontend: `www.optioeducation.com`
- Backend: `www.optioeducation.com/api`

**Rejected because**:
- Requires Render infrastructure changes
- Complicates deployment
- Breaks existing deployment pipeline
- Dual-auth strategy is simpler

### 2. Safari-Only Subdomain ❌

**Idea**: Create `safari.optioeducation.com` with same-origin backend

**Rejected because**:
- User confusion (why different URL?)
- Maintenance overhead (two deployments)
- Doesn't solve iOS Chrome issue

### 3. Partitioned Cookies (CHIPS) 🔄

**Idea**: Use `Partitioned` attribute for third-party cookies

```python
response.set_cookie('access_token', token, partitioned=True, ...)
```

**Status**: Experimental
- Only supported in Chrome 114+
- Not supported in Safari yet
- May revisit in future

---

## Testing Safari/iOS Compatibility

### Manual Testing

1. **Safari Desktop**:
   - Open Safari
   - Clear cookies (Safari → Preferences → Privacy → Manage Website Data)
   - Visit `https://optio-dev-frontend.onrender.com`
   - Login
   - Check: localStorage has tokens
   - Check: Authenticated requests work

2. **iOS Safari**:
   - Open Safari on iPhone/iPad
   - Clear cookies (Settings → Safari → Clear History)
   - Visit dev site
   - Login
   - Navigate to different pages
   - Verify no 401 errors

3. **iOS Chrome**:
   - Open Chrome on iPhone/iPad
   - Clear data
   - Login
   - Verify functionality

### Debug Checklist

If Safari login fails:

1. Check `/api/auth/cookie-debug` endpoint
2. Verify `access_token` in response body (Safari should have it)
3. Check browser console for localStorage tokens
4. Check Network tab for Authorization headers
5. Check backend logs for Safari detection

---

## Consequences

### Positive

1. **Universal compatibility** - Works on all browsers (Chrome, Firefox, Safari, iOS)
2. **Automatic detection** - No user configuration needed
3. **Graceful degradation** - Safari users get reduced security but functional auth
4. **Clear logging** - Easy to debug Safari-specific issues
5. **Debug endpoint** - Diagnostic tool for troubleshooting

### Negative

1. **Dual auth strategy** - More complex code maintenance
2. **Safari XSS risk** - localStorage vulnerable (mitigated by CSP)
3. **Platform fragmentation** - Different security guarantees per browser
4. **Testing overhead** - Must test on Safari/iOS separately

### Neutral

1. **Temporary solution** - Can migrate to CHIPS when Safari supports it
2. **Documentation** - Requires ADR and user communication
3. **Security tradeoff** - Explicit choice for functionality vs. perfect security

---

## Future Migration Path

### When Safari Supports CHIPS

Once Safari implements Partitioned cookies (est. 2026):

```python
# Enable partitioned cookies for all browsers
response.set_cookie(
    'access_token',
    access_token,
    httponly=True,
    secure=True,
    samesite='None',  # Required for partitioned
    partitioned=True  # New attribute
)
```

**Migration plan**:
1. Detect CHIPS support in browser
2. Set `Partitioned` attribute if supported
3. Fallback to current dual-auth strategy
4. Monitor Safari adoption
5. Remove localStorage fallback when >95% Safari users have CHIPS

---

## Related ADRs

- [ADR-001: Repository Pattern Migration](001-repository-pattern-migration.md)
- [ADR-002: Database Client Usage](002-database-client-usage.md)
- [ADR-003: httpOnly Cookie Authentication](003-httponly-cookie-authentication.md)

---

## References

- Safari ITP: https://webkit.org/blog/7675/intelligent-tracking-prevention/
- CHIPS Spec: https://developer.chrome.com/docs/privacy-sandbox/chips/
- MDN Cookies: https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies
- Original implementation: `backend/services/session_manager.py`, `frontend/src/utils/browserDetection.js`

---

**Last Updated**: December 19, 2025
**Author**: Development Team
**Status**: Accepted and Enforced
**Browser Support**: Chrome ✅ | Firefox ✅ | Safari ✅ | iOS ✅
