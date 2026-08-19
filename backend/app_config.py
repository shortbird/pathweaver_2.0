"""Application configuration management"""

import os
from dotenv import load_dotenv
from typing import Optional

# NOTE: Cannot import logger here due to circular dependency
# Config is loaded before logging is initialized
# Use print() for startup warnings - logging happens after config is loaded

# Import centralized constants (relative imports for production compatibility)
from config.constants import (
    MAX_FILE_SIZE,
    MAX_CONTENT_LENGTH,
    MIN_PASSWORD_LENGTH,
    MAX_PASSWORD_LENGTH,
    PASSWORD_REQUIREMENTS,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    DEFAULT_QUEST_XP,
    MAX_QUEST_XP,
    MIN_QUEST_TITLE_LENGTH,
    MAX_QUEST_TITLE_LENGTH,
    MIN_QUEST_DESCRIPTION_LENGTH,
    MAX_QUEST_DESCRIPTION_LENGTH,
    SESSION_TIMEOUT,
    ACCESS_TOKEN_EXPIRY,
    REFRESH_TOKEN_EXPIRY,
    MIN_SECRET_KEY_LENGTH,
    ALLOWED_EXTENSIONS,
)

# Load from current directory's .env file (backend/.env)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

class Config:
    """Base configuration class"""
    
    # Application Settings (define first as it's needed for validation)
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    
    # Flask Configuration
    import secrets
    SECRET_KEY = os.getenv('FLASK_SECRET_KEY') or os.getenv('SECRET_KEY')
    
    # Validate secret key security
    if not SECRET_KEY or SECRET_KEY in ['dev-secret-key', 'your-secret-key', 'dev-secret-key-change-in-production']:
        raise ValueError(
            "FLASK_SECRET_KEY environment variable is required. "
            "Generate a secure key with: python -c 'import secrets; print(secrets.token_hex(32))'"
        )

    # Ensure minimum length for security (from centralized constants)
    if len(SECRET_KEY) < MIN_SECRET_KEY_LENGTH:
        if FLASK_ENV == 'production':
            raise ValueError(f"FLASK_SECRET_KEY must be at least {MIN_SECRET_KEY_LENGTH} characters in production (current: {len(SECRET_KEY)})")
        else:
            # NOTE: print() used here due to circular dependency - logger not available yet
            print(f"[WARNING] FLASK_SECRET_KEY should be at least {MIN_SECRET_KEY_LENGTH} characters for production use (current: {len(SECRET_KEY)})")

    # Check for sufficient entropy (not just repeated characters)
    # Always validate entropy, just warn in dev
    unique_chars = len(set(SECRET_KEY))
    if unique_chars < 16:  # At least 16 different characters
        if FLASK_ENV == 'production':
            raise ValueError(f"FLASK_SECRET_KEY has insufficient entropy ({unique_chars} unique characters, need at least 16)")
        else:
            # NOTE: print() used here due to circular dependency - logger not available yet
            print(f"[WARNING] FLASK_SECRET_KEY has insufficient entropy ({unique_chars} unique characters, need at least 16) - dev only")
    DEBUG = FLASK_ENV == 'development'
    TESTING = False
    
    # API Configuration
    API_VERSION = 'v1'
    API_PREFIX = '/api'
    APP_VERSION = os.getenv('APP_VERSION', 'unknown')
    
    # Security Settings - imported from centralized constants
    MAX_CONTENT_LENGTH = MAX_CONTENT_LENGTH  # From backend.config.constants
    SESSION_COOKIE_SECURE = FLASK_ENV == 'production'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    # CORS Configuration - SINGLE SOURCE OF TRUTH
    CORS_CONFIG = {
        'origins': [
            origin.strip()
            for origin in os.getenv('ALLOWED_ORIGINS', '').split(',')
            if origin.strip()
        ] or [
            'https://optio-dev-frontend-r3v8.onrender.com',
            'https://optio-dev-v2-frontend-x1dk.onrender.com',
            'https://optio-prod-frontend-ch7c.onrender.com',
            'https://www.optioeducation.com',
            'https://optioeducation.com',
            'https://sis.optioeducation.com',  # SIS console (shares api.optioeducation.com)
        ],
        'dev_origins': [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://localhost:5000',
            'http://localhost:8081',  # Expo mobile dev server
        ],
        'methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
        'allow_headers': ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With', 'Cache-Control'],
        'supports_credentials': True,
        'max_age': 3600,
    }

    # Build final ALLOWED_ORIGINS list
    ALLOWED_ORIGINS = CORS_CONFIG['origins'].copy()
    if DEBUG:
        ALLOWED_ORIGINS.extend(CORS_CONFIG['dev_origins'])

    # Legacy FRONTEND_URL (for backward compatibility)
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')

    # LTI-only frontend base. Defaults to FRONTEND_URL so this is a no-op
    # until the v2-as-LTI-host cutover (docs/LTI_FRONTEND_REDESIGN.md §8):
    # at cutover, set LTI_FRONTEND_URL=<v2 host> in prod env to move ONLY
    # the LTI iframe to frontend-v2, leaving the rest of the app on v1.
    # Used by the LTI launch/token redirects; the AGS evidence URL repoint
    # is a separate, coordinated cutover step (see runbook).
    LTI_FRONTEND_URL = os.getenv('LTI_FRONTEND_URL') or FRONTEND_URL
    
    # Supabase Configuration
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_ANON_KEY = (
        os.getenv('SUPABASE_ANON_KEY') or
        os.getenv('SUPABASE_KEY')  # Legacy fallback
    )
    SUPABASE_SERVICE_ROLE_KEY = (
        os.getenv('SUPABASE_SERVICE_ROLE_KEY') or
        os.getenv('SUPABASE_SERVICE_KEY')  # Legacy fallback
    )

    # How long a signed Storage URL stays valid, in seconds.
    #
    # Student evidence, child avatars, family photos and parent identity
    # documents live in PRIVATE buckets and are only ever handed out as
    # short-lived signed URLs (utils/storage_urls.py). The TTL is the window in
    # which a leaked URL still works, so keep it short; it also has to be long
    # enough that a page someone opened and left sitting still renders its
    # images. One hour is the same default the SIS secure-document store uses.
    STORAGE_SIGNED_URL_TTL = int(os.getenv('STORAGE_SIGNED_URL_TTL', '3600'))

    # Database Configuration - CONFIGURABLE
    SUPABASE_POOL_SIZE = int(os.getenv('DB_POOL_SIZE', '10'))
    SUPABASE_POOL_TIMEOUT = int(os.getenv('DB_POOL_TIMEOUT', '30'))
    SUPABASE_MAX_OVERFLOW = int(os.getenv('DB_POOL_OVERFLOW', '5'))
    SUPABASE_CONN_LIFETIME = int(os.getenv('DB_CONN_LIFETIME', '3600'))

    # PostgREST's per-response row cap (Supabase Settings -> API -> "Max rows").
    # MUST match the project setting: it is the number the truncation canary
    # watches for, and the page size paged reads are allowed to request. A read
    # that comes back with exactly this many rows was almost certainly cut off —
    # PostgREST gives no other signal. See utils/db_fetch.py.
    POSTGREST_MAX_ROWS = int(os.getenv('POSTGREST_MAX_ROWS', '1000'))

    # Account deletion executor (services/account_deletion_service.py).
    # Accounts erased per sweep run. Bounded well under POSTGREST_MAX_ROWS so
    # the due-accounts query can never be silently truncated; a backlog simply
    # drains over successive runs.
    ACCOUNT_DELETION_SWEEP_BATCH = int(os.getenv('ACCOUNT_DELETION_SWEEP_BATCH', '50'))

    # Data retention for AI tutor conversation history
    # (services/data_retention_service.py).
    #
    # DISABLED BY DEFAULT AND MUST STAY THAT WAY: turning this on deletes real
    # customer data on a timer, so it is an explicit per-environment decision,
    # never a deploy side effect. With it off the sweep still reports how many
    # conversations would be purged — check that number before enabling.
    #
    # Scope is AI tutor chat only. Evidence, task completions, XP, transcripts
    # and enrollment history are education records a school may be required to
    # retain; nothing here touches them.
    TUTOR_RETENTION_ENABLED = os.getenv('TUTOR_RETENTION_ENABLED', 'false').lower() == 'true'
    TUTOR_RETENTION_MONTHS = int(os.getenv('TUTOR_RETENTION_MONTHS', '12'))
    TUTOR_RETENTION_BATCH = int(os.getenv('TUTOR_RETENTION_BATCH', '200'))

    # Service Layer Configuration - CONFIGURABLE
    SERVICE_RETRY_ATTEMPTS = int(os.getenv('SERVICE_RETRY_ATTEMPTS', '3'))
    SERVICE_RETRY_DELAY = float(os.getenv('SERVICE_RETRY_DELAY', '0.5'))
    SERVICE_MAX_RETRY_DELAY = float(os.getenv('SERVICE_MAX_RETRY_DELAY', '5.0'))
    
    # Validate Supabase configuration (only in production)
    if FLASK_ENV == 'production':
        if not SUPABASE_URL:
            raise ValueError("SUPABASE_URL is required. Set it in your environment variables.")
        if not SUPABASE_ANON_KEY:
            raise ValueError("SUPABASE_ANON_KEY is required. Set it in your environment variables.")
        # SUPABASE_SERVICE_ROLE_KEY is NOT checked here on purpose. There used to
        # be an `if not ...: pass` branch, which read like a deliberately skipped
        # check. Config.validate() already requires the key in every environment
        # and raises RuntimeError when it is missing, so a second check here would
        # be dead code with a misleading shape. See validate() below.
    
    # Google Gemini Configuration
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')
    # ---------------------------------------------------------------
    # THE model setting. Change this one line (or set GEMINI_MODEL in the
    # environment) to move every Gemini call in the platform to a new model.
    # Everything else in the codebase derives from it -- do NOT hardcode a
    # model name anywhere else. tests/unit/test_single_model_source.py fails
    # the build if a stray 'gemini-*' literal reappears.
    # ---------------------------------------------------------------
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-3.7-flash')

    # Ordered fallback models tried when the primary model returns a transient
    # error (e.g. 503 "high demand"). Comma-separated; tried left to right.
    # These exist purely for outage resilience -- normal traffic uses
    # GEMINI_MODEL above.
    GEMINI_FALLBACK_MODELS = [
        m.strip() for m in os.getenv(
            'GEMINI_FALLBACK_MODELS', 'gemini-3.6-flash,gemini-3.5-flash'
        ).split(',') if m.strip()
    ]

    # The curriculum pipeline (structure detection / philosophy alignment /
    # content generation) follows GEMINI_MODEL by default. It ran on
    # gemini-2.5-pro until 2026-08-13; set GEMINI_CURRICULUM_MODEL to pin it
    # back to a heavier reasoning model without moving the rest of the app.
    GEMINI_CURRICULUM_MODEL = os.getenv('GEMINI_CURRICULUM_MODEL', GEMINI_MODEL)

    # Pricing per 1M tokens, keyed by model -> (input, output), used for the
    # cost figures in logs and the admin AI dashboard. Add an entry when you
    # change GEMINI_MODEL; unknown models fall back to GEMINI_PRICING_DEFAULT
    # and log a warning rather than silently costing $0.
    GEMINI_PRICING = {
        'gemini-2.5-flash-lite': (0.075, 0.30),
        'gemini-2.5-flash': (0.30, 2.50),
        'gemini-2.5-pro': (1.25, 10.00),
    }
    # UNVERIFIED for the 3.x family -- confirm against
    # https://ai.google.dev/gemini-api/docs/pricing and add explicit entries
    # above. Until then 3.x models bill at these placeholder rates.
    GEMINI_PRICING_DEFAULT = (0.075, 0.30)
    GOOGLE_API_KEY = GEMINI_API_KEY  # Backward-compat alias

    # Pexels Image API
    PEXELS_API_KEY = os.getenv('PEXELS_API_KEY')

    # Brevo API key: marketing sync (services/brevo_service.py) AND all
    # transactional email (services/email_service.py). Standard API key, NOT
    # the MCP token. Unset = sync silently skips and email sends fail-log.
    BREVO_API_KEY = os.getenv('BREVO_API_KEY')

    # Email sender identity (delivery goes through the Brevo API)
    SENDER_EMAIL = os.getenv('SENDER_EMAIL', 'support@optioeducation.com')
    SENDER_NAME = os.getenv('SENDER_NAME', 'Optio Support')
    ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'tanner@optioeducation.com')
    SUPPORT_EMAIL = os.getenv('SUPPORT_EMAIL', 'support@optioeducation.com')
    SUPPORT_COPY_EMAIL = os.getenv('SUPPORT_COPY_EMAIL', 'tanner@optioeducation.com')
    # Blind monitoring copy ([COPY] of every transactional email to
    # SUPPORT_COPY_EMAIL). OFF by default since Aug 2026: on a K-12 platform
    # that switch pointed the full body of tuition invoices, credit awards, and
    # anything else naming a student at one personal inbox, which concentrates
    # children's education records somewhere they don't belong. Turn it on
    # deliberately and briefly (SUPPORT_COPY_EMAILS=true) when debugging mail
    # delivery, then turn it back off. Even when on, email_service refuses to
    # copy messages carrying attachments or flagged as student records.
    SUPPORT_COPY_EMAILS_ENABLED = os.getenv('SUPPORT_COPY_EMAILS', 'false').lower() == 'true'

    # JWT / Session Tokens (M5)
    # JWT_SECRET_KEY is the dedicated signing key for app-issued access/refresh
    # tokens. We keep a fallback chain to SECRET_KEY for legacy deployments
    # where only FLASK_SECRET_KEY was set — but new deploys should set both.
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY') or SECRET_KEY
    # Previous JWT key — set during a key rotation so already-issued tokens
    # validate during the cutover window. Optional in steady state.
    JWT_PREVIOUS_SECRET_KEY = os.getenv('FLASK_SECRET_KEY_OLD')
    # Token version baked into JWT claims so a global invalidation can be done
    # by bumping this string.
    TOKEN_VERSION = os.getenv('TOKEN_VERSION', 'v1')
    # Session lifetime for app-issued access tokens (in hours).
    # Sliding: refreshing a token re-stamps `iat`, so an active user's clock
    # restarts on every refresh. The cap only bites when a user is gone for
    # this long without opening the app. Bumped from 24h -> 30d so users
    # (especially iOS, where Safari ITP is harsher on long-tail returners)
    # don't get bounced through full Google/2FA SSO when they come back.
    SESSION_TIMEOUT_HOURS = int(os.getenv('SESSION_TIMEOUT_HOURS', '720'))
    # Refresh-token cookie lifetime (days). Drives both the JWT `exp` and the
    # Set-Cookie `Max-Age`. Must be <= SESSION_TIMEOUT_HOURS / 24 or the
    # session-timeout check will reject the cookie before it expires.
    REFRESH_TOKEN_EXPIRY_DAYS = int(os.getenv('REFRESH_TOKEN_EXPIRY_DAYS', '30'))
    # Optional override for absolute backend URL (used when constructing
    # callback links from a worker context with no request).
    BACKEND_URL = os.getenv('BACKEND_URL', '')

    # Cron Authentication
    CRON_SECRET = os.getenv('CRON_SECRET')

    # Canvas LTI 1.3 Tool keys.
    # CANVAS_LTI_PRIVATE_KEY_PEM: PEM-encoded RSA private key used to sign
    #   id_tokens for Deep Linking responses and to authenticate AGS service
    #   token requests (client_credentials grant). Generate with:
    #     openssl genrsa -out private.pem 2048
    #     openssl rsa -in private.pem -pubout -out public.pem
    # CANVAS_LTI_PUBLIC_KID: a stable identifier (any string) for the public
    #   key entry in our JWKS — Canvas caches our JWKS by kid.
    # Both unset → /.well-known/jwks.json returns an empty key set and the
    # tool refuses to perform AGS / Deep Linking operations.
    CANVAS_LTI_PRIVATE_KEY_PEM = os.getenv('CANVAS_LTI_PRIVATE_KEY_PEM')
    CANVAS_LTI_PUBLIC_KID = os.getenv('CANVAS_LTI_PUBLIC_KID')

    # Sentry error tracking (backend project: shortbird/optio-backend).
    # Unset → Sentry is a no-op (local dev). SENTRY_ENVIRONMENT distinguishes
    # the prod and dev Render services in the same Sentry project.
    SENTRY_DSN = os.getenv('SENTRY_DSN')
    SENTRY_ENVIRONMENT = os.getenv('SENTRY_ENVIRONMENT')

    # File upload paths (M5) — UPLOAD_FOLDER below is the global default;
    # this is the evidence-specific subfolder used by routes/evidence_documents.
    EVIDENCE_UPLOAD_FOLDER = os.getenv('EVIDENCE_UPLOAD_FOLDER', 'uploads/evidence')

    # Virus scan toggle (M5). Off by default — flip on only when ClamAV is
    # available on the host (production containers in Render include it).
    ENABLE_VIRUS_SCAN = os.getenv('ENABLE_VIRUS_SCAN', 'false').lower() == 'true'

    # Stripe Configuration
    STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')

    # Rate Limiting - CONFIGURABLE
    # RATE_LIMIT_ENABLED is the emergency kill switch, honoured by the
    # @rate_limit decorator. Leaving it false logs a warning on every request it
    # waves through — it is for getting through an incident, not a setting.
    RATE_LIMIT_ENABLED = os.getenv('RATE_LIMIT_ENABLED', 'true').lower() == 'true'
    RATE_LIMIT_STORAGE_URL = os.getenv('REDIS_URL')  # Optional Redis for rate limiting
    RATE_LIMIT_LOGIN_ATTEMPTS = int(os.getenv('RATE_LIMIT_LOGIN_ATTEMPTS', '5'))
    RATE_LIMIT_LOGIN_WINDOW = int(os.getenv('RATE_LIMIT_LOGIN_WINDOW', '900'))  # 15 minutes
    RATE_LIMIT_LOCKOUT_DURATION = int(os.getenv('RATE_LIMIT_LOCKOUT_DURATION', '3600'))  # 1 hour
    # Number of TRUSTED reverse proxies that append to X-Forwarded-For between
    # the app and the public internet. The real client IP is read this many hops
    # from the RIGHT of XFF — values our own infrastructure appended, which a
    # client cannot spoof (the leftmost entries ARE client-controlled). Default 1
    # = the rightmost entry (never spoofable; if the true hop count is higher this
    # over-aggregates onto a proxy IP, which throttles too broadly but is never a
    # bypass). Set to match the deployment (e.g. 2 behind a CDN + platform LB) to
    # key limits on the true client IP. See middleware/rate_limiter.get_real_ip.
    TRUSTED_PROXY_HOPS = int(os.getenv('TRUSTED_PROXY_HOPS', '1'))
    
    # Caching
    CACHE_TYPE = os.getenv('CACHE_TYPE', 'simple')
    CACHE_DEFAULT_TIMEOUT = int(os.getenv('CACHE_DEFAULT_TIMEOUT', '300'))
    
    # File Upload Settings - CONFIGURABLE
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
    # ALLOWED_EXTENSIONS imported from config.constants
    # MAX_FILE_SIZE imported from config.constants (10MB)
    MAX_UPLOAD_SIZE = int(os.getenv('MAX_UPLOAD_SIZE', str(10 * 1024 * 1024)))  # 10MB default
    ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.mp4', '.mov', '.heic', '.heif', '.webp', '.gif']

    # Quest Settings - imported from centralized constants
    # MIN_QUEST_TITLE_LENGTH, MAX_QUEST_TITLE_LENGTH imported from config.constants
    # MIN_QUEST_DESCRIPTION_LENGTH, MAX_QUEST_DESCRIPTION_LENGTH imported from config.constants
    # DEFAULT_QUEST_XP, MAX_QUEST_XP imported from config.constants

    # User Settings - Strong password policy - imported from centralized constants
    # MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH imported from config.constants
    PASSWORD_REQUIRE_UPPERCASE = PASSWORD_REQUIREMENTS['require_uppercase']
    PASSWORD_REQUIRE_LOWERCASE = PASSWORD_REQUIREMENTS['require_lowercase']
    PASSWORD_REQUIRE_NUMBER = PASSWORD_REQUIREMENTS['require_digit']
    PASSWORD_REQUIRE_SPECIAL = PASSWORD_REQUIREMENTS['require_special']

    # Pagination - imported from centralized constants
    DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE  # From backend.config.constants
    MAX_PAGE_SIZE = MAX_PAGE_SIZE  # From backend.config.constants

    # API Configuration - CONFIGURABLE
    API_TIMEOUT = int(os.getenv('API_TIMEOUT', '30'))
    # E2: Gemini call timeout (seconds). Default 60s — aggressive enough to
    # free workers, generous enough for long-context prompts. Override per-env.
    AI_REQUEST_TIMEOUT = int(os.getenv('AI_REQUEST_TIMEOUT', '60'))
    # Per-ATTEMPT timeout for BaseAIService, which retries. Distinct from
    # AI_REQUEST_TIMEOUT above: base_ai_service budgets 2 x 45s + <=8s backoff
    # = 98s to stay under the 120s gunicorn worker timeout, so it cannot inherit
    # the 60s single-shot default (2 x 60 + 8 = 128s would SIGKILL the worker).
    # Both honour AI_REQUEST_TIMEOUT when it is set, which is how they were
    # already wired -- base_ai_service just read the env var directly. Set
    # AI_ATTEMPT_TIMEOUT to tune the retrying path on its own.
    AI_ATTEMPT_TIMEOUT = int(
        os.getenv('AI_ATTEMPT_TIMEOUT', os.getenv('AI_REQUEST_TIMEOUT', '45'))
    )
    AI_MAX_RETRIES = int(os.getenv('AI_MAX_RETRIES', '2'))
    # How much of an uploaded document the quest drafter reads.
    #
    # iCreate, 2026-08-18: "It told me my document was too long so it only used
    # the first part of it, lol" — their teacher handbook. This was three
    # separate 20,000-character literals (the upload route, the staff drafter,
    # the personalization prompt) that had to agree and were not written down
    # as agreeing. One number now, and a bigger one: Gemini's context is far
    # larger than 20k characters, and the old value was cautious rather than
    # measured. Raise it here, not at a call site.
    AI_SOURCE_MATERIAL_MAX_CHARS = int(os.getenv('AI_SOURCE_MATERIAL_MAX_CHARS', '120000'))
    PEXELS_API_TIMEOUT = int(os.getenv('PEXELS_API_TIMEOUT', '5'))
    LTI_JWKS_TIMEOUT = int(os.getenv('LTI_JWKS_TIMEOUT', '5'))

    # Memory watchdog (middleware/memory_monitor.py)
    MEMORY_WATCHDOG_ENABLED = os.getenv('MEMORY_WATCHDOG_ENABLED', 'true').lower() == 'true'
    MEMORY_WATCHDOG_INTERVAL = int(os.getenv('MEMORY_WATCHDOG_INTERVAL', '15'))
    MEMORY_WATCHDOG_THRESHOLD = float(os.getenv('MEMORY_WATCHDOG_THRESHOLD', '0.85'))
    MEMORY_WATCHDOG_COOLDOWN = int(os.getenv('MEMORY_WATCHDOG_COOLDOWN', '300'))
    MEMORY_LIMIT_MB = int(os.getenv('MEMORY_LIMIT_MB', '512'))

    # Logging - CONFIGURABLE
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'WARNING')
    LOG_FORMAT = os.getenv('LOG_FORMAT', 'json')  # 'json' or 'text'

    # Platform Superadmin - SINGLE platform-wide admin
    SUPERADMIN_EMAIL = os.getenv('SUPERADMIN_EMAIL')
    if not SUPERADMIN_EMAIL and FLASK_ENV == 'production':
        raise ValueError("SUPERADMIN_EMAIL must be set in production")

    # D6 — PostHog backend error tracking.
    # POSTHOG_API_KEY is the *project* key (phc_...), NOT the personal API key.
    # When unset the error handler silently no-ops — safe default for dev.
    POSTHOG_API_KEY = os.getenv('POSTHOG_API_KEY')
    POSTHOG_HOST = os.getenv('POSTHOG_HOST', 'https://us.i.posthog.com')

    # Web Push Notifications (VAPID)
    VAPID_PUBLIC_KEY = os.getenv('VAPID_PUBLIC_KEY')
    VAPID_PRIVATE_KEY = os.getenv('VAPID_PRIVATE_KEY')
    VAPID_MAILTO = os.getenv('VAPID_MAILTO', 'mailto:support@optioeducation.com')

    # Expo Push (mobile). Optional bearer token — REQUIRED only if the Expo
    # project has "Enhanced Security for Push Notifications" enabled, in which
    # case sends without it are rejected (and every push silently fails).
    EXPO_ACCESS_TOKEN = os.getenv('EXPO_ACCESS_TOKEN')


    @classmethod
    def validate(cls) -> None:
        """Validate required configuration on startup"""
        required_vars = [
            ('SUPABASE_URL', cls.SUPABASE_URL),
            ('SUPABASE_ANON_KEY', cls.SUPABASE_ANON_KEY),
            ('SUPABASE_SERVICE_KEY', cls.SUPABASE_SERVICE_ROLE_KEY),
        ]

        missing_vars = [name for name, value in required_vars if not value]

        if missing_vars:
            raise RuntimeError(
                f"Missing required environment variables: {', '.join(missing_vars)}\n"
                f"Set these in your .env file or environment"
            )

        # Production-specific validations
        if cls.FLASK_ENV == 'production':
            if cls.SECRET_KEY == 'dev-secret-key-CHANGE-IN-PRODUCTION':
                raise RuntimeError("FLASK_SECRET_KEY must be set in production")

            # Use centralized constant
            if len(cls.SECRET_KEY) < MIN_SECRET_KEY_LENGTH:
                raise RuntimeError(f"FLASK_SECRET_KEY must be at least {MIN_SECRET_KEY_LENGTH} characters (current: {len(cls.SECRET_KEY)})")

            # Check for sufficient entropy
            unique_chars = len(set(cls.SECRET_KEY))
            if unique_chars < 16:
                raise RuntimeError(f"FLASK_SECRET_KEY has insufficient entropy ({unique_chars} unique characters, need at least 16)")

    @classmethod
    def validate_config(cls) -> None:
        """Alias for validate() - backward compatibility"""
        return cls.validate()
    
    @classmethod
    def get_database_url(cls) -> Optional[str]:
        """Get database URL for direct database connections if needed"""
        return os.getenv('DATABASE_URL')
    
    @classmethod
    def is_production(cls) -> bool:
        """Check if running in production environment"""
        return cls.FLASK_ENV == 'production'
    
    @classmethod
    def is_development(cls) -> bool:
        """Check if running in development environment"""
        return cls.FLASK_ENV == 'development'

    @classmethod
    def is_pytest_run(cls) -> bool:
        """True while a pytest test is executing.

        Distinct from TESTING, which only flips when FLASK_ENV=testing and so is
        False during an ordinary `pytest tests/` run. Callers use this to refuse
        side effects that would otherwise reach whatever database the developer's
        .env points at -- in practice, production.

        Evaluated per call rather than at import: pytest sets PYTEST_CURRENT_TEST
        when each test starts, which is after this module is imported. Lives here
        because routes/services/middleware may not read os.environ directly
        (tests/unit/test_no_raw_env_in_routes.py).
        """
        return bool(os.getenv('PYTEST_CURRENT_TEST'))

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False
    
class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
    SESSION_COOKIE_SECURE = True
    
class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    
# Configuration mapping
config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig
}

# Get configuration based on environment
def get_config():
    """Get configuration object based on environment"""
    env = os.getenv('FLASK_ENV', 'development')
    return config_map.get(env, DevelopmentConfig)