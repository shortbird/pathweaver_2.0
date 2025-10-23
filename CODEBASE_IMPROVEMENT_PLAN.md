# Optio Platform - Codebase Improvement Plan

**Last Updated**: 2025-01-22
**Status**: Phase 1 - Critical Security Fixes (IN PROGRESS - Week 1.1 Complete)
**Estimated Total Effort**: 4 weeks (80 hours)

---

## 📋 HOW TO USE THIS DOCUMENT

1. **Mark completed tasks** by changing `[ ]` to `[x]`
2. **Update status** in each phase header when starting/completing
3. **Add notes** in the "Implementation Notes" sections
4. **Track blockers** in the "Blockers/Issues" sections
5. **Update "Last Updated" date** at top of file when making changes
6. **Condense phases when complete** by summarizing what was done and removing details to save on context space.

---

Use MCP for Supabase and Render as needed.

## 🎯 OVERALL PROGRESS TRACKER

- [ ] **WEEK 1**: Critical Security Fixes (3/15 tasks - Password Policy ✅)
- [ ] **WEEK 2**: Configuration Consolidation (0/10 tasks)
- [ ] **WEEK 3**: Phase 2 Cleanup & Performance (0/12 tasks)
- [ ] **SPRINT 2**: Architectural Improvements (0/8 tasks)
- [ ] **SPRINT 3**: Performance Optimization (0/10 tasks)

**Total Progress**: 0/55 tasks completed (0%)

---

# WEEK 1: CRITICAL SECURITY FIXES

**Priority**: 🚨 CRITICAL
**Status**: NOT STARTED
**Estimated Effort**: 12-16 hours
**Target Completion**: End of Week 1

## Task List

### 1.1 Password Policy Enforcement (2 hours)

- [x] **1.1.1** Update `backend/config.py` line 170
  - Change `MIN_PASSWORD_LENGTH = 6` to `MIN_PASSWORD_LENGTH = 12`
  - Add comment: `# Enforces strong passwords (3.2×10²¹ combinations vs 2 trillion)`

- [x] **1.1.2** Update `backend/routes/auth.py` registration endpoint (around line 104)
  - Add validation BEFORE Supabase call:
    ```python
    # Validate password strength
    is_valid, error_message = validate_password(password)
    if not is_valid:
        raise ValidationError(error_message)
    ```
  - NOTE: Already implemented via `validate_registration_data()` at line 94

- [ ] **1.1.3** Configure Supabase project settings
  - Login to Supabase dashboard
  - Go to Authentication → Policies
  - Set minimum password length to 12 characters
  - Document change in deployment notes
  - NOTE: Must be done manually via Supabase dashboard

- [ ] **1.1.4** Test password validation
  - Attempt registration with 6-char password (should fail)
  - Attempt registration with 11-char password (should fail)
  - Attempt registration with 12-char password (should succeed)
  - Test with weak 12-char password (e.g., "aaaaaaaaaaaa") - should fail complexity check

- [x] **1.1.5** Update frontend validation (optional but recommended)
  - File: `frontend/src/pages/RegisterPage.jsx`
  - Add client-side validation matching backend rules
  - Show password strength meter

**Implementation Notes**:
```
Date completed: 2025-01-22
Backend changes: ✅ Complete
- Updated MIN_PASSWORD_LENGTH from 6 to 12 in config.py
- Confirmed validation already implemented in validate_registration_data()
- Backend already enforces: uppercase, lowercase, number, special char, weak pattern detection

Frontend changes: ✅ Complete
- Added enhanced password validation in RegisterPage.jsx
- Implemented real-time password strength meter (5-bar indicator)
- Shows missing requirements as user types
- Color-coded: red (weak), yellow (medium), green (strong)

Pending manual tasks:
- [ ] Supabase dashboard password policy configuration (requires dashboard access)
- [ ] End-to-end testing on dev environment

Deployed to dev: Pending push to develop branch
Deployed to prod: Not yet
Issues encountered: None
```

**Blockers/Issues**:
```


```

---

### 1.2 Fix Content Security Policy (3 hours)

- [ ] **1.2.1** Create nonce generation function
  - File: `backend/middleware/security.py`
  - Add to imports: `from flask import g`
  - Add before_request hook:
    ```python
    @app.before_request
    def generate_csp_nonce():
        g.csp_nonce = secrets.token_urlsafe(16)
    ```

- [ ] **1.2.2** Update CSP policy (line 76-100 in security.py)
  - Replace current policy with:
    ```python
    csp_nonce = getattr(g, 'csp_nonce', '')
    csp_policy = (
        f"default-src 'self'; "
        f"script-src 'self' 'nonce-{csp_nonce}' https://js.stripe.com; "
        f"style-src 'self' 'nonce-{csp_nonce}' https://fonts.googleapis.com; "
        f"font-src 'self' https://fonts.gstatic.com; "
        f"img-src 'self' data: https:; "
        f"connect-src 'self' https://api.stripe.com; "
        f"frame-src https://js.stripe.com https://hooks.stripe.com; "
        f"object-src 'none'; "
        f"base-uri 'self'; "
        f"form-action 'self'; "
    )
    ```

- [ ] **1.2.3** Add additional security headers
  - Add to security.py after CSP:
    ```python
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    response.headers['X-Permitted-Cross-Domain-Policies'] = 'none'
    ```

- [ ] **1.2.4** Add HSTS header (production only)
  - Add conditional HSTS:
    ```python
    if os.getenv('FLASK_ENV') == 'production':
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload'
    ```

- [ ] **1.2.5** Update frontend to use nonces (if needed)
  - Check if Vite requires nonce injection
  - Update `frontend/index.html` if necessary
  - Test that inline scripts still work

- [ ] **1.2.6** Test CSP in browser
  - Open browser console
  - Verify no CSP violations
  - Test all pages: diploma, quests, admin
  - Test Stripe integration still works

**Implementation Notes**:
```
Date completed: ___________
CSP violations found:


CSP policy final version:


```

**Blockers/Issues**:
```


```

---

### 1.3 Strengthen Rate Limiting (2 hours)

- [ ] **1.3.1** Update rate limiting configuration
  - File: `backend/middleware/rate_limiter.py` lines 76-83
  - Change production limits:
    ```python
    if os.getenv('FLASK_ENV') == 'development':
        max_req = 10  # Reduced from 50
        window = 300  # 5 minutes
    else:
        max_req = 3  # Reduced from 5
        window = 900  # 15 minutes (increased from 1 minute)
    ```

- [ ] **1.3.2** Add account lockout mechanism
  - Create new database table for tracking login attempts:
    ```sql
    CREATE TABLE login_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        attempt_count INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_login_attempts_email ON login_attempts(email);
    ```

- [ ] **1.3.3** Implement lockout logic in auth.py
  - File: `backend/routes/auth.py`
  - Add function before login endpoint:
    ```python
    def check_and_update_login_attempts(email: str, success: bool):
        supabase = get_supabase_admin_client()

        # Check if account is locked
        result = supabase.table('login_attempts').select('*').eq('email', email).execute()

        if result.data:
            attempt = result.data[0]
            if attempt['locked_until'] and datetime.fromisoformat(attempt['locked_until']) > datetime.now():
                raise AuthenticationError('Account locked due to too many failed attempts. Try again later.')

        if success:
            # Clear attempts on successful login
            supabase.table('login_attempts').delete().eq('email', email).execute()
        else:
            # Increment attempt count
            if result.data:
                new_count = attempt['attempt_count'] + 1
                locked_until = None
                if new_count >= 5:
                    locked_until = (datetime.now() + timedelta(hours=1)).isoformat()

                supabase.table('login_attempts').update({
                    'attempt_count': new_count,
                    'locked_until': locked_until
                }).eq('email', email).execute()
            else:
                supabase.table('login_attempts').insert({
                    'email': email,
                    'attempt_count': 1
                }).execute()
    ```

- [ ] **1.3.4** Integrate lockout into login endpoint
  - Call `check_and_update_login_attempts(email, False)` before password check
  - Call `check_and_update_login_attempts(email, True)` after successful login

- [ ] **1.3.5** Add exponential backoff (optional enhancement)
  - Modify lockout duration based on attempt count
  - 5 attempts = 1 hour, 10 attempts = 6 hours, 15+ = 24 hours

- [ ] **1.3.6** Test rate limiting
  - Test 3 failed login attempts within 15 minutes
  - Verify account locks after 5 attempts
  - Test successful login clears attempt count
  - Test lockout expiration after 1 hour

**Implementation Notes**:
```
Date completed: ___________
Database migration executed: ___________
Lockout duration chosen: ___________


```

**Blockers/Issues**:
```


```

---

### 1.4 Database Client Usage Audit (3 hours)

- [ ] **1.4.1** Create database policy enforcement module
  - Create file: `backend/utils/database_policy.py`
  - Add policy class:
    ```python
    """
    Database Client Selection Policy

    RULE 1: Use get_user_client() for ALL user-specific operations
    RULE 2: Use get_supabase_admin_client() ONLY for:
        - User registration (creating new auth users)
        - Admin dashboard operations (explicitly admin-scoped)
        - System maintenance tasks (migrations, cleanup)
    RULE 3: NEVER use admin client in user-facing endpoints
    """

    from backend.database import get_supabase_admin_client, get_user_client

    class DatabasePolicy:
        @staticmethod
        def get_safe_client(user_id=None):
            """
            Auto-select correct client based on context.
            Raises ValueError if admin client needed without explicit justification.
            """
            if user_id:
                return get_user_client(user_id)
            raise ValueError("Admin client usage must be explicit. Use get_supabase_admin_client() with comment justifying usage.")
    ```

- [ ] **1.4.2** Audit all admin client usage
  - Run search: `grep -r "get_supabase_admin_client" backend/routes/`
  - Expected ~234 instances across 40 files
  - For each instance, ask:
    - Is this user-specific data? → Should use `get_user_client()`
    - Is this admin-only operation? → OK to use admin client with comment
    - Is this system operation? → OK to use admin client with comment

- [ ] **1.4.3** High-risk files to review first
  - `backend/routes/quests.py` - Quest fetching should use user client
  - `backend/routes/community.py` - Friendship data should use user client
  - `backend/routes/portfolio.py` - Portfolio data should use user client
  - `backend/routes/evidence_documents.py` - Evidence uploads should use user client
  - `backend/routes/tasks.py` - Task completions should use user client

- [ ] **1.4.4** Document legitimate admin client usage
  - Create file: `docs/ADMIN_CLIENT_USAGE.md`
  - List all files using admin client with justification
  - Format:
    ```markdown
    ## Legitimate Admin Client Usage

    ### backend/routes/auth.py
    - **Line 120**: User registration - creates auth user (LEGITIMATE)
    - **Line 450**: Password reset - requires service role (LEGITIMATE)

    ### backend/routes/admin_core.py
    - **Line 50**: Admin user listing - admin-scoped operation (LEGITIMATE)
    ```

- [ ] **1.4.5** Replace inappropriate admin client usage
  - For each user-scoped operation found:
    - Replace `get_supabase_admin_client()` with `get_user_client(user_id)`
    - Ensure `user_id` is available from auth decorator
    - Test that RLS policies work correctly

- [ ] **1.4.6** Add linting rule (optional)
  - Create pre-commit hook to flag new admin client usage
  - Require justification comment for admin client

**Implementation Notes**:
```
Date completed: ___________
Files audited: _____ / 40
Inappropriate usage found: _____
Fixes applied: _____

High-risk findings:


```

**Blockers/Issues**:
```


```

---

### 1.5 CORS Configuration Consolidation (1 hour)

- [ ] **1.5.1** Create single source of truth in config.py
  - File: `backend/config.py`
  - Replace lines 49-58 with:
    ```python
    # CORS Configuration - SINGLE SOURCE OF TRUTH
    CORS_CONFIG = {
        'origins': [
            origin.strip()
            for origin in os.getenv('ALLOWED_ORIGINS', '').split(',')
            if origin.strip()
        ] or [
            'https://optio-dev-frontend.onrender.com',
            'https://optio-prod-frontend.onrender.com',
            'https://www.optioeducation.com',
            'https://optioeducation.com',
        ],
        'dev_origins': [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:5000',
        ],
        'methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
        'allow_headers': ['Content-Type', 'Authorization', 'X-CSRF-Token'],
        'supports_credentials': True,
        'max_age': 3600,
    }

    # Build final ALLOWED_ORIGINS list
    ALLOWED_ORIGINS = CORS_CONFIG['origins'].copy()
    if DEBUG:
        ALLOWED_ORIGINS.extend(CORS_CONFIG['dev_origins'])
    ```

- [ ] **1.5.2** Update cors_config.py to read from config.py
  - File: `backend/cors_config.py`
  - Replace lines 14-64 with:
    ```python
    from backend.config import CORS_CONFIG, ALLOWED_ORIGINS

    def get_cors_config():
        """Returns CORS configuration from single source."""
        return {
            'origins': ALLOWED_ORIGINS,
            'methods': CORS_CONFIG['methods'],
            'allow_headers': CORS_CONFIG['allow_headers'],
            'supports_credentials': CORS_CONFIG['supports_credentials'],
            'max_age': CORS_CONFIG['max_age'],
        }
    ```

- [ ] **1.5.3** Remove duplicate CORS logic from app.py
  - File: `backend/app.py`
  - Delete lines 327-336 (manual CORS header addition)
  - Keep only Flask-CORS configuration

- [ ] **1.5.4** Update Render environment variables
  - Add `ALLOWED_ORIGINS` environment variable to both dev and prod:
    - Dev: `https://optio-dev-frontend.onrender.com,http://localhost:5173`
    - Prod: `https://www.optioeducation.com,https://optioeducation.com`

- [ ] **1.5.5** Test CORS from all environments
  - Test dev frontend → dev backend
  - Test prod frontend → prod backend
  - Test localhost:5173 → dev backend
  - Verify credentials are included in all requests

**Implementation Notes**:
```
Date completed: ___________
Environment variables updated: ___________
CORS test results:
- Dev to dev: ___________
- Prod to prod: ___________
- Localhost to dev: ___________


```

**Blockers/Issues**:
```


```

---

### 1.6 SQL Injection Prevention (1 hour)

- [ ] **1.6.1** Add UUID validation utility
  - File: `backend/utils/validation.py`
  - Add function:
    ```python
    import re

    UUID_REGEX = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.IGNORECASE)

    def validate_uuid(uuid_string: str) -> tuple[bool, Optional[str]]:
        """Validate UUID v4 format."""
        if not uuid_string:
            return False, "UUID cannot be empty"

        if not UUID_REGEX.match(uuid_string):
            return False, "Invalid UUID format"

        return True, None
    ```

- [ ] **1.6.2** Add validation decorator
  - File: `backend/utils/auth/decorators.py`
  - Add decorator:
    ```python
    def validate_uuid_param(param_name: str):
        """Decorator to validate UUID route parameters."""
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                param_value = kwargs.get(param_name)
                if param_value:
                    is_valid, error = validate_uuid(param_value)
                    if not is_valid:
                        raise ValidationError(f"Invalid {param_name}: {error}")
                return f(*args, **kwargs)
            return decorated_function
        return decorator
    ```

- [ ] **1.6.3** Apply validation to all UUID route parameters
  - Search for route definitions with UUID parameters:
    - `@bp.route('/<user_id>')`
    - `@bp.route('/quests/<quest_id>')`
    - `@bp.route('/tasks/<task_id>')`
  - Add `@validate_uuid_param('user_id')` decorator

- [ ] **1.6.4** Review string interpolation in queries
  - Search: `grep -r "f\".*{.*}\"" backend/routes/`
  - Look for f-strings used in database queries
  - Replace with Supabase's `.eq()`, `.in_()` methods

- [ ] **1.6.5** Add input sanitization for text fields
  - Review evidence_text, quest descriptions, user bios
  - Ensure HTML is stripped or escaped before storage
  - Use `bleach` library for HTML sanitization

**Implementation Notes**:
```
Date completed: ___________
UUID validations added: ___________
String interpolations fixed: ___________


```

**Blockers/Issues**:
```


```

---

### 1.7 File Upload Security (2 hours)

- [ ] **1.7.1** Make python-magic required
  - File: `requirements.txt` (ROOT, not backend/requirements.txt)
  - Add: `python-magic==0.4.27`
  - Add: `python-magic-bin==0.4.14` (for Windows compatibility)

- [ ] **1.7.2** Update file upload validation
  - File: `backend/routes/uploads.py`
  - Remove optional import (lines 10-14)
  - Replace with required import:
    ```python
    import magic

    def validate_file_type(file_content: bytes, filename: str) -> tuple[bool, Optional[str]]:
        """Validate file type using magic bytes."""
        mime = magic.from_buffer(file_content, mime=True)

        ALLOWED_MIME_TYPES = {
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'video/mp4', 'video/quicktime',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }

        if mime not in ALLOWED_MIME_TYPES:
            return False, f"File type {mime} not allowed"

        return True, None
    ```

- [ ] **1.7.3** Fix path traversal vulnerability
  - File: `backend/routes/uploads.py` lines 68-84
  - Replace sanitize_filename with:
    ```python
    from werkzeug.utils import secure_filename
    import os

    def sanitize_filename(filename: str, upload_folder: str) -> str:
        """Sanitize filename and prevent path traversal."""
        # Use werkzeug's secure implementation
        safe = secure_filename(filename)

        if not safe or '..' in safe or '/' in safe or '\\' in safe:
            raise ValidationError("Invalid filename")

        # Ensure file stays in upload directory
        full_path = os.path.abspath(os.path.join(upload_folder, safe))
        upload_dir = os.path.abspath(upload_folder)

        if not full_path.startswith(upload_dir):
            raise ValidationError("Path traversal detected")

        return safe
    ```

- [ ] **1.7.4** Add file size validation
  - Verify `MAX_FILE_SIZE` and `MAX_CONTENT_LENGTH` are enforced
  - Add explicit check in upload handler:
    ```python
    if len(file_content) > MAX_FILE_SIZE:
        raise ValidationError(f"File too large. Maximum size: {MAX_FILE_SIZE / (1024*1024)}MB")
    ```

- [ ] **1.7.5** Add virus scanning (optional but recommended)
  - Research ClamAV integration or VirusTotal API
  - Document decision in implementation notes
  - If implemented, add to upload flow

- [ ] **1.7.6** Test file upload security
  - Test malicious filename: `../../etc/passwd`
  - Test file extension mismatch: `malware.exe` renamed to `image.jpg`
  - Test oversized file
  - Test invalid file type (e.g., .exe)
  - Verify magic byte validation catches spoofed extensions

**Implementation Notes**:
```
Date completed: ___________
python-magic installed: ___________
Virus scanning decision: ___________

Test results:
- Path traversal blocked: ___________
- Extension spoofing blocked: ___________
- Size limits enforced: ___________


```

**Blockers/Issues**:
```


```

---

### 1.8 Security Testing & Verification (2 hours)

- [ ] **1.8.1** Create security test suite
  - Create file: `backend/tests/security/test_security_headers.py`
  - Add tests for all security headers
  - Add tests for CORS policy
  - Add tests for CSP policy

- [ ] **1.8.2** Test authentication security
  - Test password policy enforcement
  - Test rate limiting (verify lockout after 5 attempts)
  - Test JWT token expiration
  - Test CSRF protection

- [ ] **1.8.3** Test input validation
  - Test UUID validation on all endpoints
  - Test SQL injection attempts (should be blocked)
  - Test XSS attempts (should be escaped)
  - Test path traversal in file uploads

- [ ] **1.8.4** Run OWASP ZAP scan (optional)
  - Install OWASP ZAP
  - Run automated scan against dev environment
  - Review and triage findings
  - Document results

- [ ] **1.8.5** Manual penetration testing
  - Test admin client RLS bypass (verify fixed)
  - Test authentication bypass attempts
  - Test privilege escalation attempts
  - Document findings

- [ ] **1.8.6** Create security checklist for future PRs
  - Create file: `docs/SECURITY_CHECKLIST.md`
  - List all security requirements
  - Add to PR template

**Implementation Notes**:
```
Date completed: ___________
Tests passing: _____ / _____
OWASP ZAP findings: ___________

Critical vulnerabilities remaining: ___________


```

**Blockers/Issues**:
```


```

---

## Week 1 Summary

**Total Tasks**: 15 major tasks, 55+ subtasks
**Completed**: [ ] Yes [ ] No
**Deployment Status**:
- [ ] Deployed to dev
- [ ] Tested in dev
- [ ] Deployed to prod

**Week 1 Retrospective**:
```
What went well:


What was challenging:


What to improve next week:


```

---

# WEEK 2: CONFIGURATION CONSOLIDATION

**Priority**: ⚠️ HIGH
**Status**: NOT STARTED
**Estimated Effort**: 10-12 hours
**Target Completion**: End of Week 2

## Task List

### 2.1 Create Centralized Constants (3 hours)

- [ ] **2.1.1** Create backend constants module
  - Create file: `backend/config/constants.py`
  - Add structure:
    ```python
    """
    Centralized Constants - Single Source of Truth

    All magic numbers, thresholds, and configuration values go here.
    """

    # XP Progression Thresholds
    XP_THRESHOLDS = {
        'explorer': 0,
        'builder': 250,
        'creator': 750,
        'scholar': 1500,
        'sage': 3000,
    }

    # File Upload Limits
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024  # 50MB
    ALLOWED_FILE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.pdf', '.mp4', '.doc', '.docx'}

    # Rate Limiting
    RATE_LIMITS = {
        'default': {'requests': 60, 'window': 60},
        'auth': {'requests': 3, 'window': 900},  # 3 per 15 minutes
        'upload': {'requests': 10, 'window': 300},  # 10 per 5 minutes
    }

    # Cache Timeouts (seconds)
    CACHE_TIMES = {
        'user_profile': 5 * 60,  # 5 minutes
        'quest_list': 2 * 60,  # 2 minutes
        'badge_list': 10 * 60,  # 10 minutes
        'activity_feed': 60,  # 1 minute
    }
    ```

- [ ] **2.1.2** Create pillars configuration module
  - Create file: `backend/config/pillars.py`
  - Add complete pillar definitions:
    ```python
    """
    Pillar Definitions - Single Source of Truth

    All pillar names, colors, icons, and metadata defined here.
    Import this module instead of hardcoding pillar data.
    """

    PILLARS = {
        'stem': {
            'display_name': 'STEM',
            'description': 'Science, Technology, Engineering, and Mathematics',
            'color': '#2469D1',
            'gradient': 'from-[#2469D1] to-[#1B4FA3]',
            'icon': 'BeakerIcon',
            'subcategories': ['Science', 'Technology', 'Engineering', 'Mathematics'],
        },
        'wellness': {
            'display_name': 'Wellness',
            'description': 'Physical and mental health, mindfulness, and self-care',
            'color': '#FF9028',
            'gradient': 'from-[#FF9028] to-[#E67A1A]',
            'icon': 'HeartIcon',
            'subcategories': ['Physical Health', 'Mental Health', 'Mindfulness', 'Nutrition'],
        },
        'communication': {
            'display_name': 'Communication',
            'description': 'Writing, speaking, listening, and interpersonal skills',
            'color': '#3DA24A',
            'gradient': 'from-[#3DA24A] to-[#2E8A3A]',
            'icon': 'ChatBubbleLeftRightIcon',
            'subcategories': ['Writing', 'Speaking', 'Listening', 'Collaboration'],
        },
        'civics': {
            'display_name': 'Civics',
            'description': 'Community engagement, leadership, and civic responsibility',
            'color': '#E65C5C',
            'gradient': 'from-[#E65C5C] to-[#D43F3F]',
            'icon': 'UserGroupIcon',
            'subcategories': ['Community', 'Leadership', 'Civic Action', 'Democracy'],
        },
        'art': {
            'display_name': 'Art',
            'description': 'Creative expression through visual arts, music, and performance',
            'color': '#AF56E5',
            'gradient': 'from-[#AF56E5] to-[#9945D1]',
            'icon': 'PaintBrushIcon',
            'subcategories': ['Visual Arts', 'Music', 'Performance', 'Design'],
        },
    }

    # Helper functions
    def get_pillar_color(pillar: str) -> str:
        """Get color for pillar, with fallback."""
        return PILLARS.get(pillar, PILLARS['art'])['color']

    def get_pillar_display_name(pillar: str) -> str:
        """Get display name for pillar."""
        return PILLARS.get(pillar, PILLARS['art'])['display_name']

    def get_all_pillar_keys() -> list[str]:
        """Get list of all pillar keys."""
        return list(PILLARS.keys())
    ```

- [ ] **2.1.3** Create XP progression module
  - Create file: `backend/config/xp_progression.py`
  - Add XP thresholds and mastery levels:
    ```python
    """
    XP Progression System - Single Source of Truth
    """

    # Mastery levels by XP amount
    MASTERY_LEVELS = {
        0: {'level': 1, 'name': 'Novice'},
        500: {'level': 2, 'name': 'Learner'},
        1500: {'level': 3, 'name': 'Practitioner'},
        3500: {'level': 4, 'name': 'Specialist'},
        7000: {'level': 5, 'name': 'Expert'},
        12500: {'level': 6, 'name': 'Master'},
        20000: {'level': 7, 'name': 'Virtuoso'},
        30000: {'level': 8, 'name': 'Legend'},
        45000: {'level': 9, 'name': 'Sage'},
        65000: {'level': 10, 'name': 'Grandmaster'},
    }

    # Default XP values
    DEFAULT_TASK_XP = 50
    DEFAULT_QUEST_XP = 100
    MAX_QUEST_XP = 1000

    # Bonus XP (marked for Phase 2 removal)
    COMPLETION_BONUS_MULTIPLIER = 0.5  # 50% bonus
    COLLABORATION_BONUS_MULTIPLIER = 2.0  # 2x bonus (DEPRECATED)
    BADGE_BONUS_XP = 500  # (DEPRECATED)

    def get_mastery_level(xp: int) -> dict:
        """Get mastery level for XP amount."""
        for threshold in sorted(MASTERY_LEVELS.keys(), reverse=True):
            if xp >= threshold:
                return MASTERY_LEVELS[threshold]
        return MASTERY_LEVELS[0]
    ```

- [ ] **2.1.4** Create rate limits configuration
  - Create file: `backend/config/rate_limits.py`
  - Move all rate limiting constants here
  - Export for use in middleware

- [ ] **2.1.5** Update all files to import from centralized constants
  - Search for hardcoded XP values and replace
  - Search for hardcoded pillar references and replace
  - Search for hardcoded rate limits and replace
  - Search for hardcoded file size limits and replace

**Implementation Notes**:
```
Date completed: ___________
Files updated to use new constants: _____

Remaining hardcoded values found: _____


```

**Blockers/Issues**:
```


```

---

### 2.2 Pillar API Endpoint (2 hours)

- [ ] **2.2.1** Create pillars API route
  - Create file: `backend/routes/config.py`
  - Add endpoint:
    ```python
    from flask import Blueprint, jsonify
    from backend.config.pillars import PILLARS

    bp = Blueprint('config', __name__)

    @bp.route('/pillars', methods=['GET'])
    def get_pillars():
        """Public endpoint for pillar configuration."""
        return jsonify({
            'pillars': PILLARS,
            'pillar_keys': list(PILLARS.keys()),
        }), 200
    ```

- [ ] **2.2.2** Register config blueprint
  - File: `backend/app.py`
  - Add: `app.register_blueprint(config.bp, url_prefix='/api/config')`

- [ ] **2.2.3** Create frontend pillar constants
  - Create file: `frontend/src/config/pillars.js`
  - Fetch pillars from API on app load
  - Cache in localStorage with TTL
  - Provide fallback static definitions

- [ ] **2.2.4** Update frontend components to use pillar API
  - Replace all imports of `pillarMappings.js`
  - Use centralized pillar configuration
  - Test all pillar-related UI elements

- [ ] **2.2.5** Delete duplicate pillar files
  - Delete: `frontend/src/utils/pillarMappings.js`
  - Delete: `backend/utils/pillar_mapping.py` (if unused)
  - Keep only: `backend/config/pillars.py` and `backend/utils/pillar_utils.py` (if it has business logic beyond constants)

**Implementation Notes**:
```
Date completed: ___________
API endpoint tested: ___________
Frontend components updated: _____

Pillar-related files deleted: _____


```

**Blockers/Issues**:
```


```

---

### 2.3 Fix Font Loading (30 minutes)

- [ ] **2.3.1** Add Poppins to frontend HTML
  - File: `frontend/index.html`
  - Add to `<head>` section (around line 20):
    ```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    ```

- [ ] **2.3.2** Verify Tailwind font configuration
  - File: `frontend/tailwind.config.js`
  - Confirm lines 9-13 have correct font families
  - Ensure Poppins weights match: 500 (Medium), 600 (Semi-Bold), 700 (Bold)

- [ ] **2.3.3** Create typography configuration
  - Create file: `frontend/src/config/typography.js`
  - Document font usage:
    ```javascript
    /**
     * Typography Configuration
     *
     * FONTS:
     * - Poppins: Headings and UI elements
     *   - Bold (700): Main headings
     *   - Semi-Bold (600): Subheadings
     *   - Medium (500): Body text, labels
     *
     * - Inter: Body text and secondary UI
     *   - Regular (400): Paragraph text
     *   - Medium (500): Emphasis
     *   - Semi-Bold (600): Strong emphasis
     *   - Bold (700): Very strong emphasis
     */

    export const TYPOGRAPHY = {
        fonts: {
            heading: 'Poppins',
            body: 'Inter',
        },
        weights: {
            poppins: {
                medium: 500,
                semibold: 600,
                bold: 700,
            },
            inter: {
                regular: 400,
                medium: 500,
                semibold: 600,
                bold: 700,
            },
        },
    };
    ```

- [ ] **2.3.4** Test font loading in browser
  - Open browser dev tools → Network tab
  - Verify Poppins fonts load
  - Check computed styles on headings
  - Verify fallback fonts aren't used

**Implementation Notes**:
```
Date completed: ___________
Fonts loading correctly: ___________
Font weights verified: ___________


```

**Blockers/Issues**:
```


```

---

### 2.4 Environment Variable Documentation (2 hours)

- [ ] **2.4.1** Create comprehensive env var documentation
  - Create file: `docs/ENVIRONMENT_VARIABLES.md`
  - Document all environment variables:
    ```markdown
    # Environment Variables Reference

    ## Required Variables (All Environments)

    ### Database
    - `SUPABASE_URL` - Your Supabase project URL
    - `SUPABASE_ANON_KEY` - Supabase anonymous key for client-side operations
    - `SUPABASE_SERVICE_KEY` - Supabase service role key for admin operations (KEEP SECRET)

    ### Flask Configuration
    - `FLASK_SECRET_KEY` - Must be exactly 64 characters (32 hex bytes) for JWT signing
    - `FLASK_ENV` - Set to "production" or "development"

    ### CORS Configuration
    - `FRONTEND_URL` - Primary frontend URL for CORS
    - `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins

    ## Optional Variables

    ### AI Features
    - `GEMINI_API_KEY` - Google Gemini API key for AI tutor (required for tutor features)
    - `GEMINI_MODEL` - Model name (default: "gemini-2.5-flash-lite")

    ### Image Generation
    - `PEXELS_API_KEY` - Pexels API key for quest/badge images

    ### LMS Integration
    - `CANVAS_CLIENT_ID` - Canvas LMS OAuth client ID
    - `CANVAS_PLATFORM_URL` - Your institution's Canvas URL
    - `GOOGLE_CLIENT_ID` - Google Classroom OAuth client ID
    - `GOOGLE_CLIENT_SECRET` - Google Classroom OAuth client secret
    - `SCHOOLOGY_CLIENT_ID` - Schoology OAuth client ID
    - `SCHOOLOGY_CLIENT_SECRET` - Schoology OAuth client secret
    - `MOODLE_URL` - Your Moodle instance URL
    - `MOODLE_CLIENT_ID` - Moodle LTI client ID

    ### Feature Flags
    - `ENABLE_LMS_SYNC` - Enable LMS roster sync (default: true)
    - `ENABLE_GRADE_PASSBACK` - Enable grade passback to LMS (default: true)

    ### Logging
    - `LOG_LEVEL` - Logging level: DEBUG, INFO, WARNING, ERROR (default: INFO in dev, WARNING in prod)

    ## Environment-Specific Values

    ### Development Environment
    ```
    FRONTEND_URL=https://optio-dev-frontend.onrender.com
    ALLOWED_ORIGINS=https://optio-dev-frontend.onrender.com,http://localhost:5173
    FLASK_ENV=development
    ```

    ### Production Environment
    ```
    FRONTEND_URL=https://www.optioeducation.com
    ALLOWED_ORIGINS=https://www.optioeducation.com,https://optioeducation.com
    FLASK_ENV=production
    ```
    ```

- [ ] **2.4.2** Update .env.example file
  - File: `.env.example`
  - Add all variables with example values
  - Add comments explaining each variable
  - Include validation requirements (e.g., "must be 64 chars")

- [ ] **2.4.3** Add environment variable validation
  - File: `backend/config.py`
  - Add validation function:
    ```python
    def validate_environment():
        """Validate required environment variables."""
        required = [
            'SUPABASE_URL',
            'SUPABASE_ANON_KEY',
            'SUPABASE_SERVICE_KEY',
            'FLASK_SECRET_KEY',
        ]

        missing = [var for var in required if not os.getenv(var)]
        if missing:
            raise EnvironmentError(f"Missing required environment variables: {', '.join(missing)}")

        # Validate FLASK_SECRET_KEY length
        secret_key = os.getenv('FLASK_SECRET_KEY')
        if len(secret_key) != 64:
            raise EnvironmentError("FLASK_SECRET_KEY must be exactly 64 characters")
    ```

- [ ] **2.4.4** Call validation on app startup
  - File: `backend/app.py`
  - Add at top of file: `validate_environment()`

**Implementation Notes**:
```
Date completed: ___________
Environment variables documented: _____
Validation added: ___________
.env.example updated: ___________


```

**Blockers/Issues**:
```


```

---

### 2.5 Brand Color Enforcement (2 hours)

- [ ] **2.5.1** Audit Tailwind color configuration
  - File: `frontend/tailwind.config.js`
  - Ensure all brand colors are defined (lines 14-51)
  - Verify purple and pink values are consistent

- [ ] **2.5.2** Create ESLint rule to ban inline hex colors
  - File: `frontend/.eslintrc.cjs` (or create if doesn't exist)
  - Add rule:
    ```javascript
    module.exports = {
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'Literal[value=/#[0-9A-Fa-f]{6}/]',
            message: 'Do not use inline hex colors. Use Tailwind classes instead.',
          },
        ],
      },
    };
    ```

- [ ] **2.5.3** Search for inline hex colors in components
  - Run: `grep -r "#[0-9A-Fa-f]\{6\}" frontend/src/`
  - List all files with inline colors
  - Prioritize high-usage components

- [ ] **2.5.4** Replace inline hex colors with Tailwind classes
  - For each file found:
    - Replace `#6D469B` with `text-purple-primary` or `bg-purple-primary`
    - Replace `#EF597B` with `text-pink-primary` or `bg-pink-primary`
    - Replace pillar colors with pillar-specific classes

- [ ] **2.5.5** Document color usage guidelines
  - Create file: `frontend/src/config/colors.md`
  - Document all brand colors
  - Provide usage examples
  - Reference COLOR_REFERENCE.md

**Implementation Notes**:
```
Date completed: ___________
Inline hex colors found: _____
Files updated: _____

ESLint rule enforcing: ___________


```

**Blockers/Issues**:
```


```

---

## Week 2 Summary

**Total Tasks**: 10 major tasks, 30+ subtasks
**Completed**: [ ] Yes [ ] No
**Deployment Status**:
- [ ] Deployed to dev
- [ ] Tested in dev
- [ ] Deployed to prod

**Week 2 Retrospective**:
```
Configuration improvements impact:


Single source of truth violations remaining:


Next week priorities:


```

---

# WEEK 3: PHASE 2 CLEANUP & PERFORMANCE

**Priority**: ⚠️ HIGH
**Status**: NOT STARTED
**Estimated Effort**: 12-14 hours
**Target Completion**: End of Week 3

## Task List

### 3.1 Complete Phase 2 Refactoring (3 hours)

- [ ] **3.1.1** Delete deprecated backend routes
  - Delete file: `backend/routes/collaborations.py`
  - Delete file: `backend/routes/ratings.py`
  - Check if `backend/routes/tiers.py` is still used (if not, delete)

- [ ] **3.1.2** Remove collaboration references from app.py
  - File: `backend/app.py`
  - Remove blueprint registration for collaborations
  - Remove blueprint registration for ratings
  - Remove blueprint registration for tiers (if deleted)

- [ ] **3.1.3** Delete @require_paid_tier decorator
  - File: `backend/utils/auth/decorators.py`
  - Delete the entire `@require_paid_tier` function
  - Search for usages: `grep -r "@require_paid_tier" backend/`
  - Remove decorator from all routes

- [ ] **3.1.4** Remove tier configuration
  - File: `backend/config.py`
  - Delete TIER_FEATURES dictionary (lines 105-145)
  - Keep subscription tier table if it's database-driven

- [ ] **3.1.5** Delete frontend tier utilities
  - Delete file: `frontend/src/utils/tierMapping.js`
  - Search for imports: `grep -r "tierMapping" frontend/src/`
  - Remove all imports and usages

- [ ] **3.1.6** Remove "Team-up invitations" UI
  - File: `frontend/src/pages/ConnectionsPage.jsx`
  - Remove team-up invitations tab if it exists
  - Update InvitationsTab to only show connection requests
  - Update CLAUDE.md documentation

**Implementation Notes**:
```
Date completed: ___________
Files deleted: _____
Lines of code removed: ~_____

Features deprecated:
- Collaborations: ___________
- Ratings: ___________
- Team-up invitations: ___________


```

**Blockers/Issues**:
```


```

---

### 3.2 Fix Token Refresh Race Condition (2 hours)

- [ ] **3.2.1** Implement token refresh mutex
  - File: `frontend/src/services/api.js`
  - Replace lines 63-112 with:
    ```javascript
    let refreshPromise = null;

    api.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config;

            if (error.response?.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;

                try {
                    // Only one refresh at a time
                    if (!refreshPromise) {
                        refreshPromise = (async () => {
                            try {
                                const csrfToken = localStorage.getItem('csrf_token') ||
                                                document.cookie.split('; ')
                                                    .find(row => row.startsWith('csrf_token='))
                                                    ?.split('=')[1];

                                const response = await api.post('/api/auth/refresh', {}, {
                                    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
                                });

                                const newAccessToken = response.data.access_token;
                                localStorage.setItem('access_token', newAccessToken);

                                return newAccessToken;
                            } finally {
                                refreshPromise = null;
                            }
                        })();
                    }

                    const newAccessToken = await refreshPromise;
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

                    return api(originalRequest);
                } catch (refreshError) {
                    // Refresh failed, redirect to login
                    localStorage.removeItem('access_token');
                    window.location.href = '/login';
                    return Promise.reject(refreshError);
                }
            }

            return Promise.reject(error);
        }
    );
    ```

- [ ] **3.2.2** Add token refresh logging
  - Add console logging for debugging (remove in production)
  - Track refresh count per session
  - Alert if refresh fails repeatedly

- [ ] **3.2.3** Test concurrent 401 errors
  - Open browser with network throttling
  - Make multiple API calls simultaneously
  - Verify only one refresh request is made
  - Verify all requests retry after refresh

**Implementation Notes**:
```
Date completed: ___________
Race condition fixed: ___________

Test results:
- Single refresh call: ___________
- Concurrent requests handled: ___________


```

**Blockers/Issues**:
```


```

---

### 3.3 Fix Memory Leaks in DiplomaPage (2 hours)

- [ ] **3.3.1** Memoize event handlers
  - File: `frontend/src/pages/DiplomaPage.jsx`
  - Wrap handleVisibilityChange in useCallback (lines 161-189):
    ```javascript
    const handleVisibilityChange = useCallback(() => {
        if (document.visibilityState === 'visible' && user && !slug && !userId && hasAccess) {
            fetchAchievements();
            fetchSubjectXP();
        }
    }, [user, slug, userId, hasAccess, fetchAchievements, fetchSubjectXP]);

    const handleFocus = useCallback(() => {
        if (user && !slug && !userId && hasAccess) {
            fetchAchievements();
            fetchSubjectXP();
        }
    }, [user, slug, userId, hasAccess, fetchAchievements, fetchSubjectXP]);
    ```

- [ ] **3.3.2** Memoize expensive computations
  - Wrap getAllCreditProgress in useMemo:
    ```javascript
    const creditProgress = useMemo(() =>
        getAllCreditProgress(subjectXP),
        [subjectXP]
    );

    const totalCreditsEarned = useMemo(() =>
        calculateTotalCredits(subjectXP),
        [subjectXP]
    );

    const meetsRequirements = useMemo(() =>
        meetsGraduationRequirements(subjectXP),
        [subjectXP]
    );
    ```

- [ ] **3.3.3** Optimize useEffect dependencies
  - Review all useEffect hooks
  - Remove unnecessary dependencies
  - Use functional updates for state setters

- [ ] **3.3.4** Test memory usage
  - Open Chrome DevTools → Performance tab
  - Record heap snapshot before navigation
  - Navigate to diploma page
  - Navigate away
  - Take another heap snapshot
  - Verify event listeners are cleaned up

**Implementation Notes**:
```
Date completed: ___________
Memory leaks fixed: _____

Performance improvements:
- Heap size before: _____ MB
- Heap size after: _____ MB
- Event listeners cleaned up: ___________


```

**Blockers/Issues**:
```


```

---

### 3.4 Optimize QuestBadgeHub Performance (2 hours)

- [ ] **3.4.1** Add search debouncing
  - File: `frontend/src/pages/QuestBadgeHub.jsx`
  - Create custom debounce hook:
    ```javascript
    import { useState, useEffect } from 'react';

    function useDebounce(value, delay = 300) {
        const [debouncedValue, setDebouncedValue] = useState(value);

        useEffect(() => {
            const timer = setTimeout(() => {
                setDebouncedValue(value);
            }, delay);

            return () => clearTimeout(timer);
        }, [value, delay]);

        return debouncedValue;
    }

    // In component
    const [searchInput, setSearchInput] = useState('');
    const debouncedSearch = useDebounce(searchInput, 300);

    // Use debouncedSearch for API calls
    ```

- [ ] **3.4.2** Prevent excessive re-renders on filter change
  - Review useEffect on lines 98-116
  - Only reset if filter actually changed
  - Use previous value comparison

- [ ] **3.4.3** Memoize quest/badge cards
  - File: `frontend/src/components/hub/QuestCard.jsx`
  - Wrap component in React.memo:
    ```javascript
    export default memo(QuestCard, (prevProps, nextProps) => {
        return prevProps.quest.id === nextProps.quest.id &&
               prevProps.quest.is_active === nextProps.quest.is_active;
    });
    ```

- [ ] **3.4.4** Add React Query optimizations
  - File: `frontend/src/hooks/useQuests.js` (or similar)
  - Add caching configuration:
    ```javascript
    useQuery({
        queryKey: ['quests', filters],
        queryFn: fetchQuests,
        staleTime: 2 * 60 * 1000,  // 2 minutes
        cacheTime: 10 * 60 * 1000,  // 10 minutes
        refetchOnWindowFocus: false,
    })
    ```

**Implementation Notes**:
```
Date completed: ___________
Debounce delay chosen: _____ ms

Performance improvements:
- Re-renders reduced by: ~_____%
- API calls reduced by: ~_____%


```

**Blockers/Issues**:
```


```

---

### 3.5 Implement Code Splitting (3 hours)

- [ ] **3.5.1** Set up lazy loading for routes
  - File: `frontend/src/App.jsx` (or main router file)
  - Add lazy imports:
    ```javascript
    import { lazy, Suspense } from 'react';

    const DiplomaPage = lazy(() => import('./pages/DiplomaPage'));
    const ParentDashboardPage = lazy(() => import('./pages/ParentDashboardPage'));
    const AdminPage = lazy(() => import('./pages/AdminPage'));
    const QuestBadgeHub = lazy(() => import('./pages/QuestBadgeHub'));
    const ConnectionsPage = lazy(() => import('./pages/ConnectionsPage'));
    ```

- [ ] **3.5.2** Add loading fallback component
  - Create file: `frontend/src/components/ui/LoadingFallback.jsx`
  - Add spinner or skeleton loader:
    ```javascript
    export default function LoadingFallback() {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-primary"></div>
            </div>
        );
    }
    ```

- [ ] **3.5.3** Wrap routes in Suspense
  - File: `frontend/src/App.jsx`
  - Add Suspense wrapper:
    ```javascript
    <Suspense fallback={<LoadingFallback />}>
        <Routes>
            <Route path="/diploma/:userId?" element={<DiplomaPage />} />
            <Route path="/parent/dashboard/:studentId?" element={<ParentDashboardPage />} />
            <Route path="/admin" element={<AdminPage />} />
            {/* ... other routes */}
        </Routes>
    </Suspense>
    ```

- [ ] **3.5.4** Analyze bundle size before/after
  - Run: `npm run build`
  - Check bundle sizes in `frontend/dist/assets/`
  - Document size reductions

- [ ] **3.5.5** Test code splitting in production build
  - Deploy to dev environment
  - Test all routes load correctly
  - Verify lazy loading in Network tab
  - Check for loading flashes

**Implementation Notes**:
```
Date completed: ___________

Bundle size results:
- Before: _____ KB
- After: _____ KB
- Reduction: _____%

Largest chunks:
1. _______________ (_____ KB)
2. _______________ (_____ KB)
3. _______________ (_____ KB)


```

**Blockers/Issues**:
```


```

---

### 3.6 Add Image Lazy Loading (1 hour)

- [ ] **3.6.1** Add lazy loading to quest images
  - File: `frontend/src/components/hub/QuestCard.jsx`
  - Update img tags:
    ```javascript
    <img
        src={quest.image_url}
        alt={quest.title}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
    />
    ```

- [ ] **3.6.2** Add lazy loading to badge images
  - File: `frontend/src/components/hub/BadgeCarouselCard.jsx`
  - Add loading="lazy" to all img tags

- [ ] **3.6.3** Add lazy loading to diploma page images
  - File: `frontend/src/pages/DiplomaPage.jsx`
  - Add to avatar images
  - Add to quest evidence images

- [ ] **3.6.4** Add lazy loading to connection cards
  - File: `frontend/src/components/connections/ConnectionCard.jsx`
  - Add to avatar images

- [ ] **3.6.5** Test lazy loading performance
  - Open Network tab
  - Scroll through quest list
  - Verify images load as they enter viewport
  - Measure page load time improvement

**Implementation Notes**:
```
Date completed: ___________

Images updated: _____
Page load time improvement: _____%


```

**Blockers/Issues**:
```


```

---

## Week 3 Summary

**Total Tasks**: 12 major tasks, 40+ subtasks
**Completed**: [ ] Yes [ ] No
**Deployment Status**:
- [ ] Deployed to dev
- [ ] Tested in dev
- [ ] Deployed to prod

**Week 3 Retrospective**:
```
Phase 2 cleanup impact:


Performance improvements measured:


User-facing improvements:


```

---

# SPRINT 2: ARCHITECTURAL IMPROVEMENTS

**Priority**: 💡 MEDIUM
**Status**: NOT STARTED
**Estimated Effort**: 16-20 hours
**Target Completion**: 2 weeks from start

## Task List

### 4.1 Create Repository Layer (8 hours)

- [ ] **4.1.1** Create base repository class
  - Create file: `backend/repositories/base_repository.py`
  - Implement base class with common methods

- [ ] **4.1.2** Create quest repository
  - Create file: `backend/repositories/quest_repository.py`
  - Migrate quest database logic from routes

- [ ] **4.1.3** Create user repository
  - Create file: `backend/repositories/user_repository.py`
  - Migrate user database logic from routes

- [ ] **4.1.4** Create badge repository
  - Create file: `backend/repositories/badge_repository.py`
  - Migrate badge database logic from routes

- [ ] **4.1.5** Update routes to use repositories
  - Refactor routes to call repository methods
  - Remove direct database calls from routes

- [ ] **4.1.6** Test repository layer
  - Write unit tests for repositories
  - Test RLS enforcement
  - Test error handling

**Implementation Notes**:
```
Date completed: ___________
Repositories created: _____
Routes refactored: _____


```

---

### 4.2 Standardize Authentication (4 hours)

- [ ] **4.2.1** Choose authentication method
  - Decision: [ ] httpOnly cookies only [ ] Authorization header only [ ] Hybrid
  - Document decision rationale

- [ ] **4.2.2** Implement chosen method consistently
  - Update all auth decorators
  - Update frontend API client
  - Remove unused auth code

- [ ] **4.2.3** Add Content Security Policy enhancements
  - If choosing header auth, strengthen CSP
  - Test XSS protection

**Implementation Notes**:
```
Date completed: ___________
Auth method chosen: ___________
Rationale:


```

---

### 4.3 API Versioning (2 hours)

- [ ] **4.3.1** Standardize on path-based versioning
  - Create `/api/v3/` blueprint structure
  - Migrate all endpoints to v3

- [ ] **4.3.2** Update frontend to use v3 endpoints
  - Update all API calls
  - Test backward compatibility

**Implementation Notes**:
```
Date completed: ___________
API version: v___


```

---

### 4.4 Service Layer Standards (4 hours)

- [ ] **4.4.1** Create base service class
  - Create file: `backend/services/base_service.py`
  - Implement retry logic, logging, error handling

- [ ] **4.4.2** Update all 28 services to inherit base
  - Refactor services one by one
  - Ensure consistent patterns

**Implementation Notes**:
```
Date completed: ___________
Services updated: _____ / 28


```

---

## Sprint 2 Summary

**Total Tasks**: 8 major tasks, 20+ subtasks
**Completed**: [ ] Yes [ ] No

---

# SPRINT 3: PERFORMANCE OPTIMIZATION

**Priority**: 💡 MEDIUM
**Status**: NOT STARTED
**Estimated Effort**: 12-16 hours
**Target Completion**: 2 weeks from start

## Task List

### 5.1 Centralized Error Handling (3 hours)

- [ ] **5.1.1** Create error handling utility
  - Create file: `frontend/src/utils/errorHandler.js`

- [ ] **5.1.2** Update all components to use centralized error handler

**Implementation Notes**:
```
Date completed: ___________


```

---

### 5.2 Bundle Size Optimization (4 hours)

- [ ] **5.2.1** Optimize icon imports (tree-shaking)
- [ ] **5.2.2** Analyze and reduce bundle size
- [ ] **5.2.3** Add bundle analyzer to build process

**Implementation Notes**:
```
Date completed: ___________
Bundle size reduced by: _____%


```

---

### 5.3 Add PropTypes or TypeScript (5 hours)

- [ ] **5.3.1** Add PropTypes to all components
  - OR
- [ ] **5.3.2** Begin TypeScript migration

**Implementation Notes**:
```
Date completed: ___________
Type safety approach: ___________


```

---

## Sprint 3 Summary

**Total Tasks**: 10 major tasks
**Completed**: [ ] Yes [ ] No

---

# FINAL CHECKLIST

## Pre-Deployment

- [ ] All tests passing
- [ ] Security audit complete
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] CLAUDE.md synchronized with codebase

## Deployment

- [ ] Deploy to dev environment
- [ ] Test all features in dev
- [ ] Monitor error logs for 24 hours
- [ ] Deploy to production
- [ ] Monitor production metrics

## Post-Deployment

- [ ] User acceptance testing
- [ ] Performance monitoring
- [ ] Error rate monitoring
- [ ] Update this plan with lessons learned

---

**Plan completed**: ___________
**Overall success**: [ ] Yes [ ] Partial [ ] No
**Lessons learned**:
```



```
