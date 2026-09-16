"""Known-CSAM hash matching for image uploads.

This is the one check on the platform that is not a judgement call. A hash
matcher compares an image against the NCMEC hash lists of material that has
already been identified; a match is not "looks inappropriate", it is "is a
known image". The Gemini screens elsewhere in this codebase cannot do this
and must not be mistaken for it: a classifier judges what a picture looks
like, and known material is often nothing a classifier would flag.

Providers are behind one function so the platform can move between them
without touching a call site:

  off       No match runs. The default until a key exists, because a
            provider that is configured but not applied for answers every
            call with a 401, and that must be visible, not silent.
  photodna  Microsoft PhotoDNA Cloud Service. Free for qualifying platforms;
            the key comes from an application, not a signup form.

What a caller does with a match belongs to upload_safety_service (quarantine,
preserve, tell the superadmins, refuse the upload with a neutral sentence).
This module only answers the question.

Failure is reported, never raised, and never a match: an outage at the
provider must not refuse every photo of a science project, and it must not
be read as "clean" either. `MatchResult.error` is set and the caller logs it;
the tracker counts it.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

PROVIDER_OFF = 'off'
PROVIDER_PHOTODNA = 'photodna'
PROVIDERS = (PROVIDER_OFF, PROVIDER_PHOTODNA)

#: Seconds per call. The call sits inside an upload request.
MATCH_TIMEOUT = 10


@dataclass
class MatchResult:
    matched: bool
    provider: str
    #: True when no provider ran (off, or an unusable image).
    skipped: bool = False
    error: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)


def provider() -> str:
    name = (Config.CSAM_MATCH_PROVIDER or PROVIDER_OFF).lower()
    return name if name in PROVIDERS else PROVIDER_OFF


def enabled() -> bool:
    return provider() != PROVIDER_OFF


def match(blob: bytes, mime: str) -> MatchResult:
    """Is this image known CSAM? Never raises."""
    name = provider()
    if name == PROVIDER_OFF:
        return MatchResult(False, name, skipped=True)
    if not blob or not (mime or '').startswith('image/'):
        return MatchResult(False, name, skipped=True)
    try:
        if name == PROVIDER_PHOTODNA:
            return _photodna(blob, mime)
    except Exception as e:  # noqa: BLE001 -- reported, never raised
        logger.error('[csam-match] %s call failed: %s', name, e)
        return MatchResult(False, name, error=str(e)[:200])
    return MatchResult(False, name, skipped=True)


def _photodna(blob: bytes, mime: str) -> MatchResult:
    """PhotoDNA Cloud Service, Match v1.0: the image bytes in the body, the
    subscription key in a header, a JSON answer with IsMatch."""
    import requests

    key = Config.PHOTODNA_API_KEY
    if not key:
        return MatchResult(False, PROVIDER_PHOTODNA, error='PHOTODNA_API_KEY is not set')
    resp = requests.post(
        Config.PHOTODNA_ENDPOINT,
        params={'enhance': 'false'},
        headers={'Ocp-Apim-Subscription-Key': key, 'Content-Type': mime},
        data=blob,
        timeout=MATCH_TIMEOUT,
    )
    if resp.status_code != 200:
        return MatchResult(False, PROVIDER_PHOTODNA,
                           error=f'HTTP {resp.status_code}: {resp.text[:120]}')
    body = resp.json() if resp.content else {}
    status = (body.get('Status') or {})
    code = status.get('Code')
    # 3000 is PhotoDNA's "OK"; anything else is the service declining the
    # image (too small, unreadable), which is a skip, not a verdict.
    if code not in (None, 3000):
        return MatchResult(False, PROVIDER_PHOTODNA, skipped=True,
                           details={'status': status})
    matched = bool(body.get('IsMatch'))
    details = {'tracking_id': body.get('TrackingId'),
               'match_details': body.get('MatchDetails') if matched else None}
    return MatchResult(matched, PROVIDER_PHOTODNA, details=details)
