# Environment Variables Documentation

Complete guide to all configurable environment variables for the Optio Platform backend.

## Table of Contents
- [Flask Configuration](#flask-configuration)
- [Database Configuration](#database-configuration)
- [Service Layer Configuration](#service-layer-configuration)
- [Security Configuration](#security-configuration)
- [Rate Limiting Configuration](#rate-limiting-configuration)
- [File Upload Configuration](#file-upload-configuration)
- [API Configuration](#api-configuration)
- [Gunicorn Configuration](#gunicorn-configuration)
- [Logging Configuration](#logging-configuration)
- [Third-Party APIs](#third-party-apis)
- [Production Examples](#production-examples)

---

## Flask Configuration

### FLASK_ENV
- **Description**: Flask environment mode
- **Default**: `development`
- **Options**: `development`, `production`, `testing`
- **Required**: No
- **Example**: `FLASK_ENV=production`

### FLASK_SECRET_KEY
- **Description**: Secret key for Flask sessions and cookies (used for JWT signing with HS256)
- **Default**: `dev-secret-key-CHANGE-IN-PRODUCTION` (dev only)
- **Required**: YES (production)
- **Minimum Length**: 64 characters (production) - industry standard for HS256 JWT signing
- **Security**: Must have sufficient entropy (at least 16 unique characters)
- **Generation**: Use `python -c "import secrets; print(secrets.token_urlsafe(48))"` to generate a secure key
- **Example**: `FLASK_SECRET_KEY=your-super-secret-key-at-least-64-chars-use-random-generation`

### FRONTEND_URL
- **Description**: Frontend URL for CORS configuration
- **Default**: `http://localhost:5173`
- **Required**: No
- **Example**: `FRONTEND_URL=https://www.optioeducation.com`

### ALLOWED_ORIGINS
- **Description**: Comma-separated list of allowed CORS origins
- **Default**: Automatically set based on environment
- **Required**: No
- **Example**: `ALLOWED_ORIGINS=https://www.optioeducation.com,https://optio-dev-frontend.onrender.com`

---

## Database Configuration

### SUPABASE_URL
- **Description**: Supabase project URL
- **Required**: YES
- **Example**: `SUPABASE_URL=https://your-project.supabase.co`

### SUPABASE_ANON_KEY
- **Description**: Supabase anonymous key for client operations
- **Aliases**: `SUPABASE_KEY`, `VITE_SUPABASE_ANON_KEY`
- **Required**: YES
- **Example**: `SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### SUPABASE_SERVICE_KEY
- **Description**: Supabase service role key for admin operations
- **Aliases**: `SUPABASE_SERVICE_ROLE_KEY`
- **Required**: YES
- **Example**: `SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

### DB_POOL_SIZE
- **Description**: Database connection pool size
- **Default**: `10`
- **Recommended Production**: `20`
- **Example**: `DB_POOL_SIZE=20`

### DB_POOL_TIMEOUT
- **Description**: Database connection pool timeout in seconds
- **Default**: `30`
- **Example**: `DB_POOL_TIMEOUT=30`

### DB_POOL_OVERFLOW
- **Description**: Maximum number of connections beyond pool_size
- **Default**: `5`
- **Example**: `DB_POOL_OVERFLOW=5`

### DB_CONN_LIFETIME
- **Description**: Database connection lifetime in seconds
- **Default**: `3600` (1 hour)
- **Example**: `DB_CONN_LIFETIME=3600`

---

## Service Layer Configuration

### SERVICE_RETRY_ATTEMPTS
- **Description**: Number of retry attempts for service operations
- **Default**: `3`
- **Recommended Production**: `5`
- **Example**: `SERVICE_RETRY_ATTEMPTS=5`

### SERVICE_RETRY_DELAY
- **Description**: Initial delay between retries in seconds (uses exponential backoff)
- **Default**: `0.5`
- **Recommended Production**: `1.0`
- **Example**: `SERVICE_RETRY_DELAY=1.0`

### SERVICE_MAX_RETRY_DELAY
- **Description**: Maximum delay between retries in seconds
- **Default**: `5.0`
- **Example**: `SERVICE_MAX_RETRY_DELAY=5.0`

---

## Security Configuration

### MIN_PASSWORD_LENGTH
- **Description**: Minimum password length
- **Default**: `12`
- **Example**: `MIN_PASSWORD_LENGTH=12`

### PASSWORD_REQUIRE_UPPERCASE
- **Description**: Require uppercase letter in passwords
- **Default**: `true`
- **Options**: `true`, `false`
- **Example**: `PASSWORD_REQUIRE_UPPERCASE=true`

### PASSWORD_REQUIRE_LOWERCASE
- **Description**: Require lowercase letter in passwords
- **Default**: `true`
- **Options**: `true`, `false`
- **Example**: `PASSWORD_REQUIRE_LOWERCASE=true`

### PASSWORD_REQUIRE_DIGIT
- **Description**: Require digit in passwords
- **Default**: `true`
- **Options**: `true`, `false`
- **Example**: `PASSWORD_REQUIRE_DIGIT=true`

### PASSWORD_REQUIRE_SPECIAL
- **Description**: Require special character in passwords
- **Default**: `true`
- **Options**: `true`, `false`
- **Example**: `PASSWORD_REQUIRE_SPECIAL=true`

---

## Rate Limiting Configuration

### RATE_LIMIT_ENABLED
- **Description**: Enable rate limiting
- **Default**: `true`
- **Options**: `true`, `false`
- **Example**: `RATE_LIMIT_ENABLED=true`

### RATE_LIMIT_DEFAULT
- **Description**: Default rate limit for API endpoints
- **Default**: `100 per hour`
- **Example**: `RATE_LIMIT_DEFAULT=200 per hour`

### RATE_LIMIT_LOGIN_ATTEMPTS
- **Description**: Maximum login attempts before lockout
- **Default**: `5`
- **Example**: `RATE_LIMIT_LOGIN_ATTEMPTS=5`

### RATE_LIMIT_LOGIN_WINDOW
- **Description**: Time window for login attempts in seconds
- **Default**: `900` (15 minutes)
- **Example**: `RATE_LIMIT_LOGIN_WINDOW=900`

### RATE_LIMIT_LOCKOUT_DURATION
- **Description**: Account lockout duration in seconds
- **Default**: `3600` (1 hour)
- **Example**: `RATE_LIMIT_LOCKOUT_DURATION=3600`

### REDIS_URL
- **Description**: Redis URL for distributed rate limiting (optional)
- **Default**: None (uses in-memory storage)
- **Example**: `REDIS_URL=redis://localhost:6379/0`

---

## File Upload Configuration

### UPLOAD_FOLDER
- **Description**: Directory for file uploads
- **Default**: `uploads`
- **Example**: `UPLOAD_FOLDER=uploads`

### MAX_UPLOAD_SIZE
- **Description**: Maximum file upload size in bytes
- **Default**: `10485760` (10MB)
- **Example**: `MAX_UPLOAD_SIZE=10485760`

---

## API Configuration

### API_TIMEOUT
- **Description**: Default API request timeout in seconds
- **Default**: `30`
- **Example**: `API_TIMEOUT=30`

### PEXELS_API_TIMEOUT
- **Description**: Pexels API request timeout in seconds
- **Default**: `5`
- **Example**: `PEXELS_API_TIMEOUT=5`

### LTI_JWKS_TIMEOUT
- **Description**: LTI JWKS fetch timeout in seconds
- **Default**: `5`
- **Example**: `LTI_JWKS_TIMEOUT=5`

---

## Gunicorn Configuration

### PORT
- **Description**: Server port
- **Default**: `5001`
- **Example**: `PORT=5001`

### GUNICORN_WORKERS
- **Description**: Number of worker processes
- **Default**: `1`
- **Recommended Production**: `4` (or use auto-scaling)
- **Example**: `GUNICORN_WORKERS=4`

### GUNICORN_AUTO_SCALE
- **Description**: Auto-scale workers based on CPU count (workers = 2 * CPU + 1)
- **Default**: `false`
- **Options**: `true`, `false`
- **Example**: `GUNICORN_AUTO_SCALE=true`

### GUNICORN_WORKER_CLASS
- **Description**: Worker class type
- **Default**: `sync`
- **Options**: `sync`, `gevent`, `eventlet`
- **Example**: `GUNICORN_WORKER_CLASS=sync`

### GUNICORN_WORKER_CONNECTIONS
- **Description**: Maximum concurrent connections per worker
- **Default**: `100`
- **Example**: `GUNICORN_WORKER_CONNECTIONS=100`

### GUNICORN_THREADS
- **Description**: Number of threads per worker
- **Default**: `2`
- **Example**: `GUNICORN_THREADS=2`

### GUNICORN_MAX_REQUESTS
- **Description**: Maximum requests before worker restart (prevents memory leaks)
- **Default**: `1000`
- **Example**: `GUNICORN_MAX_REQUESTS=1000`

### GUNICORN_MAX_REQUESTS_JITTER
- **Description**: Random jitter for max_requests to prevent thundering herd
- **Default**: `50`
- **Example**: `GUNICORN_MAX_REQUESTS_JITTER=50`

### GUNICORN_TIMEOUT
- **Description**: Worker timeout in seconds
- **Default**: `120`
- **Example**: `GUNICORN_TIMEOUT=120`

### GUNICORN_KEEPALIVE
- **Description**: Keep-alive timeout in seconds
- **Default**: `2`
- **Example**: `GUNICORN_KEEPALIVE=2`

### GUNICORN_GRACEFUL_TIMEOUT
- **Description**: Graceful shutdown timeout in seconds
- **Default**: `30`
- **Example**: `GUNICORN_GRACEFUL_TIMEOUT=30`

### GUNICORN_WORKER_TMP_DIR
- **Description**: Directory for worker temporary files
- **Default**: `/dev/shm`
- **Example**: `GUNICORN_WORKER_TMP_DIR=/dev/shm`

### GUNICORN_WORKER_MEMORY_LIMIT
- **Description**: Worker memory limit in bytes
- **Default**: `419430400` (400MB)
- **Recommended Production**: `524288000` (500MB)
- **Example**: `GUNICORN_WORKER_MEMORY_LIMIT=524288000`

### GUNICORN_LOG_LEVEL
- **Description**: Gunicorn log level
- **Default**: `info`
- **Options**: `debug`, `info`, `warning`, `error`, `critical`
- **Example**: `GUNICORN_LOG_LEVEL=info`

### GUNICORN_ACCESS_LOG
- **Description**: Access log file (- for stdout)
- **Default**: `-` (stdout)
- **Example**: `GUNICORN_ACCESS_LOG=-`

### GUNICORN_ERROR_LOG
- **Description**: Error log file (- for stderr)
- **Default**: `-` (stderr)
- **Example**: `GUNICORN_ERROR_LOG=-`

### GUNICORN_PRELOAD_APP
- **Description**: Preload app before worker forking (shares memory)
- **Default**: `true`
- **Options**: `true`, `false`
- **Example**: `GUNICORN_PRELOAD_APP=true`

### GUNICORN_BACKLOG
- **Description**: Maximum pending connections
- **Default**: `128`
- **Example**: `GUNICORN_BACKLOG=128`

### GUNICORN_PROC_NAME
- **Description**: Process name
- **Default**: `optio-backend`
- **Example**: `GUNICORN_PROC_NAME=optio-backend`

### GUNICORN_WORKER_PROCESS_NAME
- **Description**: Worker process name pattern
- **Default**: `optio-worker`
- **Example**: `GUNICORN_WORKER_PROCESS_NAME=optio-worker`

### GUNICORN_LIMIT_REQUEST_LINE
- **Description**: Maximum size of HTTP request line
- **Default**: `4094`
- **Example**: `GUNICORN_LIMIT_REQUEST_LINE=4094`

### GUNICORN_LIMIT_REQUEST_FIELDS
- **Description**: Maximum number of HTTP request header fields
- **Default**: `100`
- **Example**: `GUNICORN_LIMIT_REQUEST_FIELDS=100`

### GUNICORN_LIMIT_REQUEST_FIELD_SIZE
- **Description**: Maximum size of HTTP request header field
- **Default**: `8190`
- **Example**: `GUNICORN_LIMIT_REQUEST_FIELD_SIZE=8190`

---

## Logging Configuration

### LOG_LEVEL
- **Description**: Application log level
- **Default**: `INFO` (development), `WARNING` (production)
- **Options**: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
- **Example**: `LOG_LEVEL=INFO`

### LOG_FORMAT
- **Description**: Log format type
- **Default**: `json`
- **Options**: `json`, `text`
- **Example**: `LOG_FORMAT=json`

---

## Third-Party APIs

### GOOGLE_API_KEY
- **Description**: Google Gemini API key for AI features
- **Aliases**: `GEMINI_API_KEY`
- **Required**: No (required for AI features)
- **Example**: `GOOGLE_API_KEY=AIzaSy...`

### GEMINI_MODEL
- **Description**: Gemini model to use
- **Default**: `gemini-1.5-flash`
- **Example**: `GEMINI_MODEL=gemini-2.5-flash-lite`

### PEXELS_API_KEY
- **Description**: Pexels API key for image generation
- **Required**: No (required for auto-image generation)
- **Example**: `PEXELS_API_KEY=...`

### STRIPE_SECRET_KEY
- **Description**: Stripe API secret key
- **Required**: No (required for subscriptions)
- **Example**: `STRIPE_SECRET_KEY=sk_live_...`

### STRIPE_WEBHOOK_SECRET
- **Description**: Stripe webhook signing secret
- **Required**: No (required for subscription webhooks)
- **Example**: `STRIPE_WEBHOOK_SECRET=whsec_...`

---

## Production Examples

### Development Environment
```bash
FLASK_ENV=development
# Note: Use a properly generated 64-character key even in development
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
FLASK_SECRET_KEY=dev-secret-key-at-least-64-characters-long-use-proper-generation-for-security
FRONTEND_URL=http://localhost:5173
LOG_LEVEL=DEBUG
LOG_FORMAT=text
GUNICORN_WORKERS=1
```

### Production Environment (Render)
```bash
FLASK_ENV=production
# CRITICAL: Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
# Must be at least 64 characters with high entropy
FLASK_SECRET_KEY=your-secure-production-key-at-least-64-chars-use-proper-random-generation
FRONTEND_URL=https://www.optioeducation.com
LOG_LEVEL=INFO
LOG_FORMAT=json

# Database
DB_POOL_SIZE=20

# Service Layer
SERVICE_RETRY_ATTEMPTS=5
SERVICE_RETRY_DELAY=1.0

# Gunicorn
GUNICORN_WORKERS=4
GUNICORN_TIMEOUT=120
GUNICORN_WORKER_MEMORY_LIMIT=524288000
```

### Staging Environment
```bash
FLASK_ENV=production
# CRITICAL: Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
# Must be at least 64 characters with high entropy
FLASK_SECRET_KEY=your-staging-key-at-least-64-chars-use-proper-random-generation
FRONTEND_URL=https://optio-dev-frontend.onrender.com
LOG_LEVEL=DEBUG
LOG_FORMAT=json

# Database
DB_POOL_SIZE=10

# Service Layer
SERVICE_RETRY_ATTEMPTS=3

# Gunicorn
GUNICORN_WORKERS=2
```

---

## Notes

- All boolean environment variables accept `true`/`false` (case-insensitive)
- Integer values must be valid numbers (will raise error on startup if invalid)
- Float values accept decimal notation (e.g., `0.5`, `1.0`)
- Required variables will cause startup failure if missing (in production)
- Default values are used in development if not specified
- Production requires explicit configuration of security-sensitive values
