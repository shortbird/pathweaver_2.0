"""
Outbound SMS, behind a provider switch (Config.SMS_PROVIDER) because the
provider is the part most likely to change. SendGrid is email-only, so:

'twilio_verify'
    Twilio's hosted OTP service. Not a raw SMS pipe: Twilio generates the
    code, texts it from its own pre-registered US senders, and checks it --
    which is what makes it deliverable to US phones on day one, with no
    toll-free registration of our own. Used only by the phone-verification
    flow, through start_twilio_verification / check_twilio_verification.

'brevo'
    Raw transactional SMS with our own codes (send_sms). Needs SMS credits on
    the Brevo account AND an approved US toll-free registration (4-6 weeks;
    US delivery is refused until then). The long-term single-vendor option.

'console'
    Logs the message instead of sending. Local dev, and the outage lever.

Every sender returns falsy/level results on failure -- callers must treat a
failed send as "not sent" and say so, never as sent.
"""

import requests

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms'
TWILIO_VERIFY_BASE = 'https://verify.twilio.com/v2/Services'
REQUEST_TIMEOUT = 10


def send_sms(phone: str, message: str) -> bool:
    """Send one SMS. `phone` is E.164 (+18015551234). Returns True only when
    the provider accepted the message."""
    provider = Config.SMS_PROVIDER
    if provider == 'console':
        logger.info(f'[SMS console] to {phone}: {message}')
        return True
    if provider == 'brevo':
        return _send_brevo(phone, message)
    logger.error(f'Unknown SMS_PROVIDER {provider!r}; SMS not sent')
    return False


def _send_brevo(phone: str, message: str) -> bool:
    if not Config.BREVO_API_KEY:
        logger.error('BREVO_API_KEY not set; SMS not sent')
        return False
    try:
        resp = requests.post(
            BREVO_SMS_URL,
            headers={
                'api-key': Config.BREVO_API_KEY,
                'accept': 'application/json',
                'content-type': 'application/json',
            },
            json={
                'type': 'transactional',
                'sender': Config.SMS_SENDER_NAME,
                # Brevo wants the number with country code, no '+'.
                'recipient': phone.lstrip('+'),
                'content': message,
            },
            timeout=REQUEST_TIMEOUT,
        )
    except Exception as e:
        logger.warning(f'Brevo SMS send error: {e}')
        return False
    if resp.status_code >= 400:
        # 402 = no SMS credits on the account. Called out because it is the
        # one failure the dashboard fixes and code cannot.
        logger.warning(f'Brevo SMS send failed ({resp.status_code}): {resp.text[:200]}')
        return False
    return True


# ── Twilio Verify (hosted OTP; used by phone_verification_service) ───────────

def _twilio_ready() -> bool:
    if (Config.TWILIO_ACCOUNT_SID and Config.TWILIO_AUTH_TOKEN
            and Config.TWILIO_VERIFY_SERVICE_SID):
        return True
    logger.error('TWILIO_* keys not fully set; verification not started')
    return False


def start_twilio_verification(phone: str) -> bool:
    """Ask Twilio Verify to generate and text a code to `phone` (E.164).
    Returns True when Twilio accepted the request."""
    if not _twilio_ready():
        return False
    try:
        resp = requests.post(
            f'{TWILIO_VERIFY_BASE}/{Config.TWILIO_VERIFY_SERVICE_SID}/Verifications',
            auth=(Config.TWILIO_ACCOUNT_SID, Config.TWILIO_AUTH_TOKEN),
            data={'To': phone, 'Channel': 'sms'},
            timeout=REQUEST_TIMEOUT,
        )
    except Exception as e:
        logger.warning(f'Twilio Verify start error: {e}')
        return False
    if resp.status_code >= 400:
        logger.warning(f'Twilio Verify start failed ({resp.status_code}): {resp.text[:200]}')
        return False
    return True


def check_twilio_verification(phone: str, code: str) -> str:
    """Check `code` against the verification Twilio holds for `phone`.

    Returns one of:
      'approved'  -- correct code; the caller may trust the phone
      'incorrect' -- wrong code (Twilio counts the attempt too)
      'expired'   -- no verification in flight: expired, already used, or
                     max-checked; the person needs a fresh code
      'error'     -- Twilio unreachable or misconfigured; NOT a wrong code
    """
    if not _twilio_ready():
        return 'error'
    try:
        resp = requests.post(
            f'{TWILIO_VERIFY_BASE}/{Config.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck',
            auth=(Config.TWILIO_ACCOUNT_SID, Config.TWILIO_AUTH_TOKEN),
            data={'To': phone, 'Code': code},
            timeout=REQUEST_TIMEOUT,
        )
    except Exception as e:
        logger.warning(f'Twilio Verify check error: {e}')
        return 'error'
    # 404 = no pending verification for this phone: expired (10 min), already
    # approved, or deleted after too many checks.
    if resp.status_code == 404:
        return 'expired'
    if resp.status_code >= 400:
        logger.warning(f'Twilio Verify check failed ({resp.status_code}): {resp.text[:200]}')
        return 'error'
    try:
        status = resp.json().get('status')
    except ValueError:
        return 'error'
    return 'approved' if status == 'approved' else 'incorrect'
