# Environment Keys Reference

All API keys and secrets are accessed via the `Config` class in `app_config.py`. Never use `os.getenv()` directly for keys in service code.

## Key Inventory

### Required Keys

| Key | Purpose | Config Attribute | Provider |
|-----|---------|-----------------|----------|
| `FLASK_SECRET_KEY` | Session signing, CSRF tokens | `Config.SECRET_KEY` | Self-generated (`secrets.token_hex(32)`) |
| `SUPABASE_URL` | Supabase project URL | `Config.SUPABASE_URL` | Supabase Dashboard > Settings > API |
| `SUPABASE_ANON_KEY` | Supabase public/anon key | `Config.SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (bypasses RLS) | `Config.SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API |
| `GEMINI_API_KEY` | Google Gemini AI API | `Config.GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `SUPERADMIN_EMAIL` | Platform superadmin identity | `Config.SUPERADMIN_EMAIL` | N/A (reference value) |

### Optional Keys

| Key | Purpose | Config Attribute | Provider |
|-----|---------|-----------------|----------|
| `PEXELS_API_KEY` | Image search for quests | `Config.PEXELS_API_KEY` | [Pexels API](https://www.pexels.com/api/) |
| `BREVO_API_KEY` | Brevo: transactional email delivery + marketing sync (standard key, NOT the MCP token) | `Config.BREVO_API_KEY` | Brevo → SMTP & API → API Keys |
| `STRIPE_SECRET_KEY` | Payment processing | `Config.STRIPE_SECRET_KEY` | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | `Config.STRIPE_WEBHOOK_SECRET` | [Stripe Webhooks](https://dashboard.stripe.com/webhooks) |
| `CRON_SECRET` | Cron job authentication | `Config.CRON_SECRET` | Self-generated (`secrets.token_hex(16)`) |
| `VAPID_PUBLIC_KEY` | Web push notifications | `Config.VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Web push notifications | `Config.VAPID_PRIVATE_KEY` | Generated with public key |
| `JWT_SECRET_KEY` | App-issued access/refresh JWT signing (M5) | `Config.JWT_SECRET_KEY` | Self-generated (`secrets.token_hex(32)`); falls back to `FLASK_SECRET_KEY` |
| `FLASK_SECRET_KEY_OLD` | Previous JWT key during a key rotation cutover (M5) | `Config.JWT_PREVIOUS_SECRET_KEY` | Set to the prior `JWT_SECRET_KEY` value |
| `TOKEN_VERSION` | Token version baked into JWT claims; bump to invalidate all tokens (M5) | `Config.TOKEN_VERSION` | Default `v1` |
| `SESSION_TIMEOUT_HOURS` | Absolute session lifetime (M5) | `Config.SESSION_TIMEOUT_HOURS` | Default `24` |
| `BACKEND_URL` | Absolute backend URL for worker contexts (M5) | `Config.BACKEND_URL` | Default empty (uses `request.host_url`) |
| `SPARK_SSO_SECRET` | Spark LMS JWT SSO secret (M5) | `Config.SPARK_SSO_SECRET` | Provided by Spark integration |
| `SPARK_WEBHOOK_SECRET` | Spark LMS webhook HMAC secret (M5) | `Config.SPARK_WEBHOOK_SECRET` | Provided by Spark integration |
| `EVIDENCE_UPLOAD_FOLDER` | Storage path for evidence document uploads (M5) | `Config.EVIDENCE_UPLOAD_FOLDER` | Default `uploads/evidence` |
| `ENABLE_VIRUS_SCAN` | Toggle ClamAV virus scanning on uploads (M5) | `Config.ENABLE_VIRUS_SCAN` | Default `false`; set `true` only when ClamAV is on the host |
| `SENTRY_DSN` | Backend error tracking (Sentry project `optio-llc/optio-backend`) | `Config.SENTRY_DSN` | Sentry > Project Settings > Client Keys; unset = Sentry disabled (local dev) |
| `SENTRY_ENVIRONMENT` | Sentry environment tag (`production` / `development`) | `Config.SENTRY_ENVIRONMENT` | Set per Render service; falls back to `FLASK_ENV` |

### Email Configuration

Delivery goes through the Brevo transactional API (`BREVO_API_KEY` above);
the `SMTP_*` keys were removed when SendGrid was dropped (2026-07-15).

| Key | Default | Config Attribute |
|-----|---------|-----------------|
| `SENDER_EMAIL` | `support@optioeducation.com` | `Config.SENDER_EMAIL` |
| `SENDER_NAME` | `Optio Support` | `Config.SENDER_NAME` |
| `ADMIN_EMAIL` | `tanner@optioeducation.com` | `Config.ADMIN_EMAIL` |
| `SUPPORT_EMAIL` | `support@optioeducation.com` | `Config.SUPPORT_EMAIL` |
| `SUPPORT_COPY_EMAIL` | `tanner@optioeducation.com` | `Config.SUPPORT_COPY_EMAIL` |

## Usage Pattern

```python
# CORRECT - use Config class
from app_config import Config

api_key = Config.GEMINI_API_KEY
model = Config.GEMINI_MODEL
frontend = Config.FRONTEND_URL

# WRONG - never do this in service code
api_key = os.getenv('GEMINI_API_KEY')
```

## Key Rotation

Use the key rotation utility:

```bash
cd backend
python scripts/key_rotation.py --list      # See all keys
python scripts/key_rotation.py --check     # Validate config
python scripts/key_rotation.py --rotate GEMINI_API_KEY  # Rotation guide
```

## Render Service IDs

When rotating keys, update these Render services:

| Service | ID | Keys |
|---------|-----|------|
| Dev Backend | `srv-d2tnvlvfte5s73ae8npg` | All backend keys |
| Dev Frontend | `srv-d2tnvrffte5s73ae8s4g` | SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY |
| Prod Backend | `srv-d2to00vfte5s73ae9310` | All backend keys |
| Prod Frontend | `srv-d2to04vfte5s73ae97ag` | SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY |
