#!/usr/bin/env python3
"""
Key Rotation Utility
====================

Manages API keys and secrets for the Optio platform.
Lists all keys, validates configuration, and provides rotation guidance.

Usage:
    python scripts/key_rotation.py --list           # Show all keys and their status
    python scripts/key_rotation.py --check          # Validate all required keys are set
    python scripts/key_rotation.py --rotate <KEY>   # Get rotation instructions for a key
"""

import argparse
import os
import sys
import secrets

# Ensure backend/ is on the path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, '.env'))


# =============================================================================
# Key Registry
# =============================================================================

RENDER_SERVICES = {
    'dev_backend': 'srv-d2tnvlvfte5s73ae8npg',
    'dev_frontend': 'srv-d2tnvrffte5s73ae8s4g',
    'prod_backend': 'srv-d2to00vfte5s73ae9310',
    'prod_frontend': 'srv-d2to04vfte5s73ae97ag',
}

KEY_REGISTRY = {
    # --- Self-generated keys (can be auto-rotated) ---
    'FLASK_SECRET_KEY': {
        'category': 'self_generated',
        'required': True,
        'description': 'Flask session signing key',
        'generator': lambda: secrets.token_hex(32),
        'render_services': ['dev_backend', 'prod_backend'],
        'rotation_warning': 'Rotating this key invalidates ALL active user sessions. '
                           'Users will need to log in again.',
    },
    'CRON_SECRET': {
        'category': 'self_generated',
        'required': False,
        'description': 'Shared secret for authenticating cron job requests',
        'generator': lambda: secrets.token_hex(16),
        'render_services': ['dev_backend', 'prod_backend'],
        'rotation_warning': 'Update the cron job service with the new secret too.',
    },

    # --- Provider keys (manual rotation at provider) ---
    'GEMINI_API_KEY': {
        'category': 'provider',
        'required': True,
        'description': 'Google Gemini AI API key',
        'provider_url': 'https://aistudio.google.com/app/apikey',
        'render_services': ['dev_backend', 'prod_backend'],
        'rotation_warning': None,
    },
    'SUPABASE_ANON_KEY': {
        'category': 'provider',
        'required': True,
        'description': 'Supabase anonymous/public key',
        'provider_url': 'https://supabase.com/dashboard/project/vvfgxcykxjybtvpfzwyx/settings/api',
        'render_services': ['dev_backend', 'dev_frontend', 'prod_backend', 'prod_frontend'],
        'rotation_warning': 'Both backend AND frontend services need this key updated.',
    },
    'SUPABASE_SERVICE_ROLE_KEY': {
        'category': 'provider',
        'required': True,
        'description': 'Supabase service role key (bypasses RLS)',
        'provider_url': 'https://supabase.com/dashboard/project/vvfgxcykxjybtvpfzwyx/settings/api',
        'render_services': ['dev_backend', 'prod_backend'],
        'rotation_warning': 'NEVER expose this key in frontend code.',
    },
    'STRIPE_SECRET_KEY': {
        'category': 'provider',
        'required': False,
        'description': 'Stripe API secret key',
        'provider_url': 'https://dashboard.stripe.com/apikeys',
        'render_services': ['dev_backend', 'prod_backend'],
        'rotation_warning': None,
    },
    'STRIPE_WEBHOOK_SECRET': {
        'category': 'provider',
        'required': False,
        'description': 'Stripe webhook endpoint secret',
        'provider_url': 'https://dashboard.stripe.com/webhooks',
        'render_services': ['dev_backend', 'prod_backend'],
        'rotation_warning': 'Must match the webhook endpoint configured in Stripe.',
    },
    'SMTP_PASS': {
        'category': 'provider',
        'required': False,
        'description': 'SendGrid SMTP API key',
        'provider_url': 'https://app.sendgrid.com/settings/api_keys',
        'render_services': ['dev_backend', 'prod_backend'],
        'rotation_warning': None,
    },
    'PEXELS_API_KEY': {
        'category': 'provider',
        'required': False,
        'description': 'Pexels image search API key',
        'provider_url': 'https://www.pexels.com/api/',
        'render_services': ['dev_backend', 'prod_backend'],
        'rotation_warning': None,
    },

    # --- VAPID keys (self-generated but paired) ---
    'VAPID_PUBLIC_KEY': {
        'category': 'self_generated',
        'required': False,
        'description': 'VAPID public key for web push notifications',
        'generator': None,  # Must be generated as a pair
        'render_services': ['dev_backend', 'dev_frontend', 'prod_backend', 'prod_frontend'],
        'rotation_warning': 'VAPID keys must be rotated as a pair (public + private). '
                           'Existing push subscriptions will break.',
    },
    'VAPID_PRIVATE_KEY': {
        'category': 'self_generated',
        'required': False,
        'description': 'VAPID private key for web push notifications',
        'generator': None,  # Must be generated as a pair
        'render_services': ['dev_backend', 'prod_backend'],
        'rotation_warning': 'VAPID keys must be rotated as a pair (public + private). '
                           'Existing push subscriptions will break.',
    },

    # --- Reference values (not rotatable) ---
    'SUPABASE_URL': {
        'category': 'reference',
        'required': True,
        'description': 'Supabase project URL',
        'render_services': ['dev_backend', 'dev_frontend', 'prod_backend', 'prod_frontend'],
        'rotation_warning': 'This is a project URL, not a secret. Cannot be rotated.',
    },
    'SUPERADMIN_EMAIL': {
        'category': 'reference',
        'required': True,
        'description': 'Platform superadmin email address',
        'render_services': ['dev_backend', 'prod_backend'],
        'rotation_warning': 'Update the users table too if changing this.',
    },
}


def get_key_value(key_name):
    """Get the current value of a key from environment."""
    return os.getenv(key_name)


def mask_value(value):
    """Mask a secret value for display."""
    if not value:
        return '(not set)'
    if len(value) <= 8:
        return '*' * len(value)
    return value[:4] + '*' * (len(value) - 8) + value[-4:]


def cmd_list():
    """List all keys with their status."""
    print('\n' + '=' * 80)
    print('  Optio Platform - API Key Inventory')
    print('=' * 80)

    categories = {
        'self_generated': 'Self-Generated (can auto-rotate)',
        'provider': 'Provider Keys (manual rotation)',
        'reference': 'Reference Values (not rotatable)',
    }

    for cat_key, cat_label in categories.items():
        keys_in_cat = {k: v for k, v in KEY_REGISTRY.items() if v['category'] == cat_key}
        if not keys_in_cat:
            continue

        print(f'\n  {cat_label}')
        print('  ' + '-' * 70)
        print(f'  {"Key":<30} {"Status":<12} {"Value":<30}')
        print('  ' + '-' * 70)

        for key_name, info in keys_in_cat.items():
            value = get_key_value(key_name)
            if value:
                status = 'SET'
            elif info['required']:
                status = 'MISSING!'
            else:
                status = 'not set'

            masked = mask_value(value)
            req_marker = ' *' if info['required'] else ''
            print(f'  {key_name + req_marker:<30} {status:<12} {masked:<30}')

    print('\n  * = required')
    print('=' * 80 + '\n')


def cmd_check():
    """Validate all required keys are set."""
    print('\nValidating configuration...\n')

    missing = []
    warnings = []
    ok_count = 0

    for key_name, info in KEY_REGISTRY.items():
        value = get_key_value(key_name)

        if info['required'] and not value:
            missing.append(key_name)
            print(f'  FAIL  {key_name} - {info["description"]}')
        elif not value:
            warnings.append(key_name)
            print(f'  WARN  {key_name} - not set (optional)')
        else:
            ok_count += 1
            print(f'  OK    {key_name}')

    print(f'\nResults: {ok_count} OK, {len(warnings)} warnings, {len(missing)} failures')

    if missing:
        print(f'\nMissing required keys: {", ".join(missing)}')
        print('Set these in backend/.env or Render dashboard.')
        return 1

    print('\nAll required keys are configured.')
    return 0


def cmd_rotate(key_name):
    """Provide rotation instructions for a specific key."""
    key_name = key_name.upper()

    if key_name not in KEY_REGISTRY:
        print(f'\nUnknown key: {key_name}')
        print(f'Available keys: {", ".join(sorted(KEY_REGISTRY.keys()))}')
        return 1

    info = KEY_REGISTRY[key_name]
    print(f'\n{"=" * 60}')
    print(f'  Rotation Guide: {key_name}')
    print(f'{"=" * 60}')
    print(f'\n  Description: {info["description"]}')
    print(f'  Category: {info["category"]}')

    if info.get('rotation_warning'):
        print(f'\n  WARNING: {info["rotation_warning"]}')

    # Generate new value for self-generated keys
    if info['category'] == 'self_generated' and info.get('generator'):
        new_value = info['generator']()
        print(f'\n  New value (generated): {new_value}')
    elif info['category'] == 'provider':
        url = info.get('provider_url', 'N/A')
        print(f'\n  Generate new key at: {url}')
    elif info['category'] == 'reference':
        print(f'\n  This is a reference value and cannot be rotated.')
        return 0

    # Show where to update
    print(f'\n  Update locations:')
    print(f'    1. backend/.env (local development)')

    if info.get('render_services'):
        print(f'    2. Render dashboard:')
        for svc in info['render_services']:
            svc_id = RENDER_SERVICES.get(svc, 'unknown')
            print(f'       - {svc}: https://dashboard.render.com/web/{svc_id}/env')

    print(f'\n{"=" * 60}\n')
    return 0


def main():
    parser = argparse.ArgumentParser(
        description='Optio Platform - API Key Management',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  python scripts/key_rotation.py --list
  python scripts/key_rotation.py --check
  python scripts/key_rotation.py --rotate FLASK_SECRET_KEY
  python scripts/key_rotation.py --rotate GEMINI_API_KEY
        '''
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--list', action='store_true', help='List all keys and status')
    group.add_argument('--check', action='store_true', help='Validate required keys')
    group.add_argument('--rotate', metavar='KEY', help='Get rotation instructions for KEY')

    args = parser.parse_args()

    if args.list:
        cmd_list()
        return 0
    elif args.check:
        return cmd_check()
    elif args.rotate:
        return cmd_rotate(args.rotate)


if __name__ == '__main__':
    sys.exit(main() or 0)
