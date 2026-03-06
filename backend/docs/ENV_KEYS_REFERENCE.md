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
| `SMTP_PASS` | SendGrid email delivery | `Config.SMTP_PASS` | [SendGrid API Keys](https://app.sendgrid.com/settings/api_keys) |
| `STRIPE_SECRET_KEY` | Payment processing | `Config.STRIPE_SECRET_KEY` | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | `Config.STRIPE_WEBHOOK_SECRET` | [Stripe Webhooks](https://dashboard.stripe.com/webhooks) |
| `CRON_SECRET` | Cron job authentication | `Config.CRON_SECRET` | Self-generated (`secrets.token_hex(16)`) |
| `VAPID_PUBLIC_KEY` | Web push notifications | `Config.VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Web push notifications | `Config.VAPID_PRIVATE_KEY` | Generated with public key |

### Email Configuration

| Key | Default | Config Attribute |
|-----|---------|-----------------|
| `SMTP_HOST` | `smtp.sendgrid.net` | `Config.SMTP_HOST` |
| `SMTP_PORT` | `587` | `Config.SMTP_PORT` |
| `SMTP_USER` | `apikey` | `Config.SMTP_USER` |
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
