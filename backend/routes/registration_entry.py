"""Registration funnel: the two doors onto the funnel, and the code that proves you.

Split out of routes/registration_funnel.py on 2026-09-03 (QB-04), which was
2,149 lines and carried the last standing exemption from the 1,400-line route
cap.

    /start        new account -> emails a 6-digit code
    /verify       the code -> issues the funnel access_token
    /resend-code  a fresh code
    /login        existing account, proved by password   (pre-session)
    /attach       existing account, proved by session    (post-OAuth)

/login and /attach are two doors onto one room and BOTH run
_parent_guardrails + _attach_and_resume, so the two can never enforce different
rules. Read the "Identity proof vs. org attachment" section of
routes/registration_funnel.py's docstring before changing either: the funnel
used to verify by password alone, which locked out every account that has no
password -- Google and Apple signups, 118 of 906 at the time.

THE ROUTES STAY ON THE SAME BLUEPRINT, attached through `register_routes(bp)`
rather than a blueprint of their own, because the funnel's CSRF exemption list
is keyed on endpoint names like `registration.start`. See
routes/registration_payments.py for the full version of why that matters.

/attach is the one endpoint here that is deliberately NOT CSRF-exempt: it is
session-authenticated, so it is the one that needs the token.
"""

import re
import secrets
from datetime import datetime

from flask import request, jsonify

from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_auth
from utils.validation import sanitize_input
from utils.logger import get_logger
from services.registration_funnel_support import (
    _admin,
    _valid_email,
    _load_registration,
    _load_registration_invite,
    _parent_row,
)
from services.registration_accounts_service import (
    _email_exists,
    _password_ok,
    _create_org_parent,
    _hash_otp,
    _issue_otp,
    _send_otp_email,
)
from services.registration_identity_service import (
    parent_guardrails as _parent_guardrails,
    attach_and_resume as _attach_and_resume,
    password_failure as _password_failure,
)

logger = get_logger(__name__)

# Max wrong OTP guesses per registration before the code is invalidated and a
# resend is required. Independent of the IP rate limit (which is spoofable), this
# caps the 6-digit guessing space to a few tries per issued code.
MAX_OTP_ATTEMPTS = 5


def register_routes(bp):
    """Attach the entry steps to the `registration` blueprint."""
    @bp.route('/start', methods=['POST'])
    @rate_limit(max_requests=10, window_seconds=300)
    def start():
        """Create the parent's account and email a 6-digit confirmation code. The
        funnel access_token is NOT returned here — only /verify issues it."""
        body = request.get_json(silent=True) or {}
        data, err = _load_registration_invite(body.get('code') or '')
        if err:
            return err
        org = data['organization']
        org_id = org['id']
        admin = _admin()

        email = (body.get('email') or '').strip().lower()
        password = body.get('password') or ''
        first = sanitize_input(body.get('first_name', ''))
        last = sanitize_input(body.get('last_name', ''))

        if not _valid_email(email):
            return jsonify({'error': 'A valid email is required'}), 400
        if len(password) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400
        if not first or not last:
            return jsonify({'error': 'First and last name are required'}), 400

        if _email_exists(admin, email):
            # If THIS funnel created the account but the email was never verified,
            # let the parent pick up where they left off (password must match).
            pending = (
                admin.table('registrations')
                # The embed names the FK constraint explicitly, so this string is
                # coupled to a database object: the constraint was renamed with the
                # table on 2026-08-25 and a stale hint here is a PGRST200 at
                # request time, not an import error. tests/test_registration_fk_hints.py
                # checks every hint in this file against the live schema.
                .select('id, parent_user_id, status, users!registrations_parent_user_id_fkey(email)')
                .eq('organization_id', org_id).eq('status', 'verify')
                .order('created_at', desc=True).limit(20).execute()
            ).data or []
            match = next((p for p in pending if (p.get('users') or {}).get('email') == email), None)
            if match:
                if not _password_ok(email, password):
                    return jsonify({'error': 'This email already started registering. Enter the same password, or use "Sign in" instead.'}), 409
                code = _issue_otp(admin, match['id'])
                sent = _send_otp_email(email, first, org.get('name') or 'your school', code)
                return jsonify({'success': True, 'registration_id': match['id'], 'email': email,
                                'otp_sent': bool(sent),
                                'message': 'We re-sent your confirmation code.'}), 200
            return jsonify({'error': 'An account with this email already exists — use "Sign in with Optio" below.'}), 409

        try:
            parent_id = _create_org_parent(admin, org_id, email, password, first, last)
        except Exception as e:  # noqa: BLE001
            logger.error(f'registration start: parent creation failed: {e}')
            return jsonify({'error': 'Could not create your account. Please try again.'}), 500

        reg = admin.table('registrations').insert({
            'organization_id': org_id,
            'parent_user_id': parent_id,
            'access_token': secrets.token_urlsafe(32),
            'status': 'verify',
        }).execute()
        reg_id = reg.data[0]['id']

        code = _issue_otp(admin, reg_id)
        sent = _send_otp_email(email, first, org.get('name') or 'your school', code)

        logger.info(f'registration start: registration {reg_id} awaiting email verification (otp_sent={bool(sent)})')
        return jsonify({'success': True, 'registration_id': reg_id, 'email': email,
                        'otp_sent': bool(sent)}), 201

    @bp.route('/verify', methods=['POST'])
    @rate_limit(max_requests=15, window_seconds=300)
    def verify_code():
        """Confirm the emailed 6-digit code. On success, marks the auth email
        verified and returns the funnel access_token."""
        body = request.get_json(silent=True) or {}
        reg = _load_registration(body.get('registration_id') or '')
        if not reg or reg.get('status') != 'verify':
            return jsonify({'error': 'Nothing to verify for this registration'}), 400

        code = str(body.get('code') or '').strip()
        if not re.fullmatch(r'\d{6}', code):
            return jsonify({'error': 'Enter the 6-digit code from your email'}), 400
        if not reg.get('otp_hash') or not reg.get('otp_expires_at'):
            return jsonify({'error': 'No code issued — request a new one'}), 400
        expires = datetime.fromisoformat(str(reg['otp_expires_at']).replace('Z', '+00:00'))
        if datetime.utcnow().replace(tzinfo=expires.tzinfo) > expires:
            return jsonify({'error': 'That code has expired — request a new one'}), 400

        admin = _admin()

        # Per-registration brute-force cap (independent of the spoofable IP limit).
        attempts = reg.get('otp_attempts') or 0
        if attempts >= MAX_OTP_ATTEMPTS:
            # Invalidate the code so further guesses are useless until a resend.
            admin.table('registrations').update({
                'otp_hash': None, 'otp_expires_at': None,
                'updated_at': datetime.utcnow().isoformat(),
            }).eq('id', reg['id']).execute()
            return jsonify({'error': 'Too many incorrect attempts — request a new code'}), 429

        if not secrets.compare_digest(_hash_otp(code), str(reg['otp_hash'])):
            # Count the failed guess; invalidate the code once the cap is reached.
            new_attempts = attempts + 1
            updates = {'otp_attempts': new_attempts, 'updated_at': datetime.utcnow().isoformat()}
            if new_attempts >= MAX_OTP_ATTEMPTS:
                updates.update({'otp_hash': None, 'otp_expires_at': None})
            admin.table('registrations').update(updates).eq('id', reg['id']).execute()
            return jsonify({'error': 'Incorrect code'}), 400

        now = datetime.utcnow().isoformat()
        try:
            admin.auth.admin.update_user_by_id(reg['parent_user_id'], {'email_confirm': True})
        except Exception as e:  # noqa: BLE001
            logger.warning(f'registration verify: auth email-confirm failed for {reg["parent_user_id"][:8]}: {e}')
        admin.table('registrations').update({
            'email_verified_at': now, 'otp_hash': None, 'otp_expires_at': None,
            'status': 'family', 'updated_at': now,
        }).eq('id', reg['id']).execute()

        return jsonify({'success': True, 'status': 'family', 'access_token': reg['access_token']}), 200

    @bp.route('/resend-code', methods=['POST'])
    @rate_limit(max_requests=5, window_seconds=300)
    def resend_code():
        """Re-email a fresh confirmation code for a registration still in 'verify'."""
        body = request.get_json(silent=True) or {}
        reg = _load_registration(body.get('registration_id') or '')
        if not reg or reg.get('status') != 'verify':
            return jsonify({'error': 'Nothing to verify for this registration'}), 400
        admin = _admin()
        parent = _parent_row(admin, reg['parent_user_id'])
        org = admin.table('organizations').select('name').eq('id', reg['organization_id']).single().execute().data
        code = _issue_otp(admin, reg['id'])
        sent = _send_otp_email(parent.get('email'), parent.get('first_name'), (org or {}).get('name') or 'your school', code)
        return jsonify({'success': True, 'sent': bool(sent)}), 200

    @bp.route('/login', methods=['POST'])
    @rate_limit(max_requests=10, window_seconds=300)
    def login():
        """Existing Optio account, proven by PASSWORD, attached to the org as a
        parent. No OTP needed — the password proves ownership.

        The session-based twin is /attach; both share the guardrails and the attach
        step so they can never enforce different rules.
        """
        body = request.get_json(silent=True) or {}
        data, err = _load_registration_invite(body.get('code') or '')
        if err:
            return err
        org = data['organization']
        admin = _admin()

        email = (body.get('email') or '').strip().lower()
        password = body.get('password') or ''
        if not _valid_email(email) or not password:
            return jsonify({'error': 'Email and password are required'}), 400

        row = (admin.table('users')
               .select('id, role, org_role, org_roles, organization_id, first_name, last_name, '
                       'is_dependent, managed_by_parent_id, date_of_birth, total_xp')
               .eq('email', email).limit(1).execute()).data
        if not row:
            return jsonify({'error': 'No Optio account with this email — create one instead.'}), 404
        user = row[0]

        refusal = _parent_guardrails(admin, user, org)
        if refusal:
            return refusal

        if not _password_ok(email, password):
            return _password_failure(admin, user, org.get('name') or 'the school')

        return _attach_and_resume(admin, user, org, via='login')

    @bp.route('/attach', methods=['POST'])
    @require_auth
    @rate_limit(max_requests=10, window_seconds=300, per_user=True)
    def attach(user_id):
        """Existing Optio account, proven by SESSION, attached to the org as a
        parent. The password-based twin is /login.

        This is the door for accounts that have no password at all — Google/Apple
        signups and org-imported parents, 13% of accounts when this shipped. The
        OAuth round trip lands on /auth/callback, which establishes the session and
        then calls this with the funnel's invitation code.

        The session IS the identity proof, so there is no email to match: the
        registration link is shareable by design and any authenticated user may
        follow it. Who they are comes from the cookie; whether they may register a
        family here is _parent_guardrails' call, exactly as on /login.
        """
        body = request.get_json(silent=True) or {}
        data, err = _load_registration_invite(body.get('code') or '')
        if err:
            return err
        org = data['organization']
        admin = _admin()

        row = (admin.table('users')
               .select('id, role, org_role, org_roles, organization_id, first_name, last_name, '
                       'is_dependent, managed_by_parent_id, date_of_birth, total_xp')
               .eq('id', user_id).limit(1).execute()).data
        if not row:
            return jsonify({'error': 'Your account could not be loaded. Please sign in again.'}), 404
        user = row[0]

        refusal = _parent_guardrails(admin, user, org)
        if refusal:
            return refusal

        return _attach_and_resume(admin, user, org, via='attach')
