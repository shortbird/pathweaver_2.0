"""
Phone verification by SMS code.

The service half of the phone-verification hold (utils/phone_verification_hold
decides WHO is held; this module runs the flow that lifts it): normalize the
number, text it a 6-digit code, check the code, and stamp
users.phone_verified_at -- the one write that opens the platform back up.

OTP mechanics copied from the registration funnel (routes/icreate_registration
.py), which has run this exact loop in production since July: 6 digits from
`secrets`, sha256 at rest, 10-minute TTL, a per-code attempt cap so 6 digits
cannot be brute-forced, compare_digest. One difference: codes live in their own
table (phone_verification_codes) keyed by user, not columns on a registration
row, and each hash gets a per-row salt so equal codes never share a hash.

Rate limiting is layered: the route has a per-user @rate_limit, and this module
enforces a resend cooldown + hourly send cap from the codes table itself --
the DB-backed half survives worker restarts and multiple workers, and it is
what keeps one account from burning SMS credits.
"""

import hashlib
import re
import secrets
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple

from app_config import Config
from database import get_supabase_admin_client
from services import sms_service
from utils import phone_verification_hold
from utils.logger import get_logger

logger = get_logger(__name__)

CODE_TTL_MINUTES = 10
MAX_ATTEMPTS = 5          # per code; a fresh code restarts the count
RESEND_COOLDOWN_SECONDS = 60
MAX_SENDS_PER_HOUR = 5

# Rows sent through Twilio Verify carry this marker instead of a hash: Twilio
# generated the code and Twilio checks it, so there is nothing to hash. The
# row still exists — it is what remembers the phone being verified, applies
# our rate limits, and lets in-flight codes survive a provider flip (verify
# routes on the ROW's marker, not on the current Config).
TWILIO_MARKER = 'twilio_verify'


def _admin():
    # admin client justified: verification writes the caller's own users row
    # and a backend-only codes table (RLS deny-all).
    return get_supabase_admin_client()


from utils.timestamps import utcnow as _now  # noqa: E402


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(str(value).replace('Z', '+00:00'))


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """E.164 or None. Bare 10-digit numbers are read as US (the orgs that
    require verification are US schools); anything already carrying + or a
    leading 1 passes through on its digits."""
    if not raw:
        return None
    raw = raw.strip()
    digits = re.sub(r'\D', '', raw)
    if raw.startswith('+'):
        return f'+{digits}' if 8 <= len(digits) <= 15 else None
    if len(digits) == 10:
        return f'+1{digits}'
    if len(digits) == 11 and digits.startswith('1'):
        return f'+{digits}'
    return None


def mask_phone(phone: Optional[str]) -> Optional[str]:
    return f'••• ••• {phone[-4:]}' if phone and len(phone) >= 4 else None


def _hash_code(salt: str, code: str) -> str:
    return hashlib.sha256(f'{salt}:{code}'.encode()).hexdigest()


def status(user_id: str) -> Dict[str, Any]:
    """What the verification screen renders from, and what the router gates on.

    `required: false` is the answer for everybody who is not held (verified,
    not an adult, org doesn't require it) -- one condition for the client to
    check. `prefill` is the best phone we already hold for this person:
    their own users row, else their household's number from registration --
    parents typed one into the funnel, but it was stored on the household.
    """
    rows = (_admin().table('users')
            .select('organization_id, role, org_role, org_roles, '
                    'phone_number, phone_verified_at')
            .eq('id', user_id).limit(1).execute()).data or []
    if not rows:
        return {'required': False, 'verified': False}
    user = rows[0]
    verified = bool(user.get('phone_verified_at'))
    required = phone_verification_hold.requires_verification(user)

    prefill = user.get('phone_number')
    if required and not prefill:
        try:
            hh = (_admin().table('households')
                  .select('phone')
                  .eq('primary_contact_user_id', user_id)
                  .not_.is_('phone', 'null')
                  .limit(1).execute()).data or []
            if hh:
                prefill = hh[0].get('phone')
        except Exception as e:
            logger.warning(f'Phone verification: household prefill failed: {e}')

    return {
        'required': required,
        'verified': verified,
        'phone': mask_phone(user.get('phone_number')),
        'prefill': normalize_phone(prefill) or (prefill or None),
    }


def _recent_sends(user_id: str, since: datetime) -> list:
    return ((_admin().table('phone_verification_codes')
             .select('id, created_at')
             .eq('user_id', user_id)
             .gte('created_at', since.isoformat())
             .order('created_at', desc=True)
             .execute()).data or [])


def send_code(user_id: str, raw_phone: str) -> Tuple[Dict[str, Any], int]:
    """Text a fresh code to `raw_phone`. Returns (payload, http_status)."""
    phone = normalize_phone(raw_phone)
    if not phone:
        return {'success': False,
                'error': 'Enter a valid phone number, like 801-555-0123.'}, 400

    hour_ago = _now() - timedelta(hours=1)
    recent = _recent_sends(user_id, hour_ago)
    if recent:
        last = _parse_ts(recent[0]['created_at'])
        wait = RESEND_COOLDOWN_SECONDS - (_now() - last).total_seconds()
        if wait > 0:
            return {'success': False, 'retry_after': int(wait) + 1,
                    'error': 'A code was just sent. Wait a minute before '
                             'requesting another.'}, 429
    if len(recent) >= MAX_SENDS_PER_HOUR:
        return {'success': False,
                'error': 'Too many codes requested. Try again in an hour, or '
                         'contact your school\'s office.'}, 429

    use_twilio = Config.SMS_PROVIDER == 'twilio_verify'
    if use_twilio:
        code, fields = None, {'code_hash': TWILIO_MARKER, 'salt': ''}
    else:
        code = f'{secrets.randbelow(1000000):06d}'
        salt = secrets.token_hex(16)
        fields = {'code_hash': _hash_code(salt, code), 'salt': salt}
    inserted = (_admin().table('phone_verification_codes').insert({
        'user_id': user_id,
        'phone': phone,
        'expires_at': (_now() + timedelta(minutes=CODE_TTL_MINUTES)).isoformat(),
        **fields,
    }).execute()).data or []

    if use_twilio:
        sent = sms_service.start_twilio_verification(phone)
    else:
        sent = sms_service.send_sms(
            phone, f'Your Optio verification code is {code}. '
                   f'It expires in {CODE_TTL_MINUTES} minutes.')
    if not sent:
        # The un-sent code must not stand: it can't be typed back, and leaving
        # it would eat the rate limit during a provider outage.
        if inserted:
            (_admin().table('phone_verification_codes')
             .delete().eq('id', inserted[0]['id']).execute())
        return {'success': False,
                'error': 'We couldn\'t send a text right now. Try again in a '
                         'few minutes.'}, 502

    payload: Dict[str, Any] = {'success': True, 'sent': True,
                               'phone': mask_phone(phone)}
    if code and Config.DEBUG and Config.SMS_PROVIDER == 'console':
        # Local dev only: the code went to the server log, not a phone.
        payload['dev_code'] = code
    return payload, 200


def _wrong_guess(row: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    (_admin().table('phone_verification_codes')
     .update({'attempts': row['attempts'] + 1})
     .eq('id', row['id']).execute())
    left = MAX_ATTEMPTS - row['attempts'] - 1
    return {'success': False,
            'error': 'Incorrect code.' if left
            else 'Incorrect code. Request a new one.'}, 400


def verify_code(user_id: str, raw_code: str) -> Tuple[Dict[str, Any], int]:
    """Check the caller's code; on success stamp the user verified and lift
    the hold. Returns (payload, http_status)."""
    code = (raw_code or '').strip()
    if not re.fullmatch(r'\d{6}', code):
        return {'success': False, 'error': 'Enter the 6-digit code.'}, 400

    rows = ((_admin().table('phone_verification_codes')
             .select('id, phone, code_hash, salt, attempts, expires_at, '
                     'consumed_at')
             .eq('user_id', user_id)
             .is_('consumed_at', 'null')
             .order('created_at', desc=True)
             .limit(1).execute()).data or [])
    if not rows:
        return {'success': False,
                'error': 'No active code. Request a new one.'}, 400
    row = rows[0]

    if _parse_ts(row['expires_at']) < _now():
        return {'success': False,
                'error': 'That code expired. Request a new one.'}, 400
    if row['attempts'] >= MAX_ATTEMPTS:
        return {'success': False,
                'error': 'Too many incorrect tries. Request a new code.'}, 400

    if row['code_hash'] == TWILIO_MARKER:
        # Twilio holds the code; ask it. Our attempt counter still runs so the
        # local cap means the same thing on every provider.
        result = sms_service.check_twilio_verification(row['phone'], code)
        if result == 'error':
            return {'success': False,
                    'error': 'We couldn\'t check the code right now. '
                             'Try again in a moment.'}, 502
        if result == 'expired':
            return {'success': False,
                    'error': 'That code expired. Request a new one.'}, 400
        if result != 'approved':
            return _wrong_guess(row)
    elif not secrets.compare_digest(_hash_code(row['salt'], code),
                                    row['code_hash']):
        return _wrong_guess(row)

    (_admin().table('phone_verification_codes')
     .update({'consumed_at': _now().isoformat()})
     .eq('id', row['id']).execute())
    (_admin().table('users')
     .update({'phone_number': row['phone'],
              'phone_verified_at': _now().isoformat()})
     .eq('id', user_id).execute())
    # The middleware never caches a held answer, so this next request is
    # already free -- clearing is for the same-process status endpoint.
    phone_verification_hold.clear_cache(user_id)
    logger.info(f'Phone verified for user {user_id}')
    return {'success': True, 'verified': True,
            'phone': mask_phone(row['phone'])}, 200
