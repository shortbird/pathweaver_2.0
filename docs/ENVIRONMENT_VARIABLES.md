# Environment Variables Reference

**Last Updated**: 2025-01-22
**Status**: Comprehensive documentation for all environment variables

This document provides a complete reference for all environment variables used in the Optio platform across backend and frontend services.

---

## Required Variables (All Environments)

### Database (Supabase)

- **`SUPABASE_URL`** - Your Supabase project URL
  - Example: `https://vvfgxcykxjybtvpfzwyx.supabase.co`
  - Required for: Backend database connection
  - Where to find: Supabase Dashboard → Project Settings → API

- **`SUPABASE_ANON_KEY`** - Supabase anonymous key for client-side operations
  - Required for: Frontend client operations (RLS-protected)
  - Where to find: Supabase Dashboard → Project Settings → API
  - Security: Safe to expose in frontend (RLS enforced)

- **`SUPABASE_SERVICE_KEY`** - Supabase service role key for admin operations
  - **⚠️ KEEP SECRET** - Bypasses Row Level Security
  - Required for: Backend admin operations only
  - Where to find: Supabase Dashboard → Project Settings → API → service_role key
  - Security: Never expose in frontend or commit to repository

### Flask Configuration

- **`FLASK_SECRET_KEY`** - Secret key for JWT signing and session management
  - **⚠️ CRITICAL**: Must be exactly 64 characters (32 hex bytes) in production
  - Example: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`
  - Required for: JWT token signing, session security
  - Generate with: `python -c "import secrets; print(secrets.token_hex(32))"`
  - Security: Must be unique per environment, never reuse

- **`FLASK_ENV`** - Flask environment mode
  - Values: `production` | `development`
  - Production: `production` (enables security features, disables debug mode)
  - Development: `development` (enables debug mode, relaxed CORS)
  - Default: `development`

### CORS Configuration

- **`FRONTEND_URL`** - Primary frontend URL for CORS
  - Development: `https://optio-dev-frontend.onrender.com`
  - Production: `https://www.optioeducation.com`
  - Required for: CORS configuration, legacy support

- **`ALLOWED_ORIGINS`** - Comma-separated list of allowed CORS origins
  - Development: `https://optio-dev-frontend.onrender.com,http://localhost:5173`
  - Production: `https://www.optioeducation.com,https://optioeducation.com`
  - Required for: CORS policy enforcement
  - Note: localhost origins automatically added in development mode

### Frontend Configuration

- **`VITE_API_URL`** - Backend API endpoint (without /api suffix)
  - Development: `https://optio-dev-backend.onrender.com`
  - Production: `https://optio-prod-backend.onrender.com`
  - **⚠️ Important**: Do NOT include `/api` suffix (added automatically by frontend)
  - Required for: All API requests from frontend

---

## Optional Variables

### AI Features (Gemini API)

- **`GEMINI_API_KEY`** - Google Gemini API key for AI tutor features
  - Required for: AI tutor functionality
  - Where to get: Google AI Studio (https://makersuite.google.com/app/apikey)
  - Features disabled if missing: AI tutor chat, quest suggestions

- **`GEMINI_MODEL`** - Gemini model to use
  - Default: `gemini-2.5-flash-lite`
  - Options: `gemini-2.5-flash-lite`, `gemini-pro`, etc.
  - Note: Always use `gemini-2.5-flash-lite` per project guidelines

### Image Generation

- **`PEXELS_API_KEY`** - Pexels API key for quest and badge images
  - Required for: Auto-generating quest/badge images
  - Where to get: https://www.pexels.com/api/
  - Features disabled if missing: Image auto-generation (manual upload required)

### LMS Integration (Canvas, Google Classroom, Schoology, Moodle)

#### Canvas LMS
- **`CANVAS_CLIENT_ID`** - Canvas Developer Key ID
  - Required for: Canvas LTI 1.3 integration
  - Where to get: Canvas Admin → Developer Keys
  - Documentation: `docs/LMS_INTEGRATION.md`

- **`CANVAS_PLATFORM_URL`** - Your institution's Canvas URL
  - Example: `https://canvas.instructure.com`
  - Required for: Canvas API calls

#### Google Classroom
- **`GOOGLE_CLIENT_ID`** - Google Cloud OAuth client ID
  - Required for: Google Classroom OAuth integration
  - Where to get: Google Cloud Console → APIs & Services → Credentials

- **`GOOGLE_CLIENT_SECRET`** - Google Cloud OAuth client secret
  - Required for: Google Classroom token exchange
  - **⚠️ KEEP SECRET** - Never expose in frontend

#### Schoology
- **`SCHOOLOGY_CLIENT_ID`** - Schoology OAuth client ID
  - Required for: Schoology OAuth integration
  - Where to get: Schoology Developer Portal

- **`SCHOOLOGY_CLIENT_SECRET`** - Schoology OAuth client secret
  - Required for: Schoology token exchange
  - **⚠️ KEEP SECRET** - Never expose in frontend

#### Moodle
- **`MOODLE_URL`** - Your Moodle instance URL
  - Example: `https://moodle.yourinstitution.edu`
  - Required for: Moodle LTI 1.3 integration

- **`MOODLE_CLIENT_ID`** - Moodle LTI client ID
  - Required for: Moodle authentication
  - Where to get: Moodle Admin → External Tools

### Feature Flags

- **`ENABLE_LMS_SYNC`** - Enable LMS roster synchronization
  - Values: `true` | `false`
  - Default: `true`
  - Controls: OneRoster CSV import, roster sync features

- **`ENABLE_GRADE_PASSBACK`** - Enable grade passback to LMS
  - Values: `true` | `false`
  - Default: `true`
  - Controls: Automatic grade sync from Optio to LMS gradebooks

### Logging & Monitoring

- **`LOG_LEVEL`** - Logging level for application logs
  - Values: `DEBUG` | `INFO` | `WARNING` | `ERROR` | `CRITICAL`
  - Development default: `INFO`
  - Production default: `WARNING`
  - Use: Debugging and monitoring

---

## Environment-Specific Configuration Examples

### Development Environment

```bash
# Database
SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Flask
FLASK_SECRET_KEY=dev-secret-key-64-characters-long-xxxxxxxxxxxxxxxxxxxxxxxxx
FLASK_ENV=development

# CORS
FRONTEND_URL=https://optio-dev-frontend.onrender.com
ALLOWED_ORIGINS=https://optio-dev-frontend.onrender.com,http://localhost:5173

# Frontend (Vite)
VITE_API_URL=https://optio-dev-backend.onrender.com

# Optional - AI Features
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash-lite
PEXELS_API_KEY=your_pexels_api_key_here

# Optional - Feature Flags
ENABLE_LMS_SYNC=true
ENABLE_GRADE_PASSBACK=true
LOG_LEVEL=INFO
```

### Production Environment

```bash
# Database
SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Flask
FLASK_SECRET_KEY=prod-secret-key-64-characters-long-CHANGE-THIS-xxxxxxxxxx
FLASK_ENV=production

# CORS
FRONTEND_URL=https://www.optioeducation.com
ALLOWED_ORIGINS=https://www.optioeducation.com,https://optioeducation.com

# Frontend (Vite)
VITE_API_URL=https://optio-prod-backend.onrender.com

# Optional - AI Features
GEMINI_API_KEY=your_production_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-lite
PEXELS_API_KEY=your_production_pexels_api_key

# Optional - LMS Integration (if using)
CANVAS_CLIENT_ID=your_canvas_client_id
CANVAS_PLATFORM_URL=https://canvas.yourinstitution.edu
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_secret
SCHOOLOGY_CLIENT_ID=your_schoology_client_id
SCHOOLOGY_CLIENT_SECRET=your_schoology_secret
MOODLE_URL=https://moodle.yourinstitution.edu
MOODLE_CLIENT_ID=your_moodle_client_id

# Optional - Feature Flags
ENABLE_LMS_SYNC=true
ENABLE_GRADE_PASSBACK=true
LOG_LEVEL=WARNING
```

---

## Security Best Practices

### Secret Management
1. **Never commit secrets** to version control
2. **Use environment variables** for all sensitive data
3. **Rotate secrets regularly** (especially FLASK_SECRET_KEY)
4. **Use different secrets** per environment (dev, prod)

### Production Requirements
1. **FLASK_SECRET_KEY** must be:
   - Exactly 64 characters (32 hex bytes)
   - Cryptographically random
   - Unique to production environment
   - Never reused from development

2. **SUPABASE_SERVICE_KEY** must be:
   - Only on backend servers
   - Never exposed in frontend code
   - Never logged or transmitted

3. **OAuth Secrets** must be:
   - Stored securely on backend only
   - Rotated if compromised
   - Used only for token exchange

### CORS Security
1. **ALLOWED_ORIGINS** should list ONLY trusted domains
2. **Never use** `*` (wildcard) in production
3. **Always include** protocol (https://) in origins
4. **Remove localhost** origins from production

---

## Troubleshooting

### Common Issues

**Issue: "FLASK_SECRET_KEY must be set to a secure value in production"**
- Solution: Generate a 64-character secret key using `python -c "import secrets; print(secrets.token_hex(32))"`

**Issue: "CORS policy: No 'Access-Control-Allow-Origin' header"**
- Solution: Check `ALLOWED_ORIGINS` includes the requesting domain
- Verify `VITE_API_URL` does NOT include `/api` suffix

**Issue: "Invalid or expired refresh token"**
- Solution: Check `FLASK_SECRET_KEY` is identical across all backend instances
- Verify key is 64 characters

**Issue: LMS integration not working**
- Solution: Verify all required LMS env vars are set
- Check `ENABLE_LMS_SYNC=true` is set
- Review `docs/LMS_INTEGRATION.md` for platform-specific setup

### Environment Variable Validation

The application validates critical environment variables on startup:
- Missing required variables trigger errors
- Insecure production values trigger warnings
- Invalid formats are caught early

Check application logs on startup for validation messages.

---

## Reference Links

- **Supabase Dashboard**: https://supabase.com/dashboard/project/vvfgxcykxjybtvpfzwyx
- **Render Dashboard**: https://dashboard.render.com
- **Google AI Studio**: https://makersuite.google.com/app/apikey
- **Pexels API**: https://www.pexels.com/api/
- **LMS Integration Guide**: `docs/LMS_INTEGRATION.md`

---

**Last Updated**: 2025-01-22
**Maintained By**: Development Team
**Questions**: Review codebase or contact maintainers
