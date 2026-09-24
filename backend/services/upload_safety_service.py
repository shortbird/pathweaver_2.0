"""The gate every user-uploaded image passes on its way into storage.

Two checks, in this order, and they are different in kind:

  1. Known-CSAM hash match (csam_match_service). Not a judgement. On a match
     the bytes go to the quarantine bucket, an incident row is written, the
     superadmins are told by email and in-app, and the upload is refused
     with a sentence that says nothing about why. Nobody on the platform
     sees the image again, the parent included: docs/CHILD_SAFETY_REPORTING.md
     is what happens next, and it happens outside this code.

  2. The image classifier (peer_text_screen_service.UPLOAD_PROMPT), for a
     STUDENT's upload. A judgement: nudity, gore, weapons, contact details
     in a screenshot. A flagged image is kept under held/ in the private
     bucket so the child's parent can see what was held, a hold is recorded
     (surface 'upload'), and the upload is refused with the same sentence a
     held message gets. Adults' uploads are not classified: a teacher's photo
     of the class is the teacher's business, and the hash match still ran.

     One exception to the hold: schoolwork (task evidence, a learning
     moment) that breaks ONLY the contact-details rule is refused with a
     sentence that says what to cover, and nothing is recorded. A child's
     name and number on a choir folder label is a privacy slip, not a safety
     event, and the parent was told about it once per retry. Evidence still
     reaches friends' feeds and a public portfolio, so it is still refused.
     An avatar, a feed post or a community post keeps the hold: there the
     number is how someone reaches the child.

     The same student sending the same bytes again inside a day gets the
     first hold's answer without a model call or a second hold. On
     2026-09-21 one photo was held fourteen times and each hold told the
     parent.

Fail-open, both. A provider outage must not refuse every photo of a science
project, so an error is logged and counted (the tracker shows failed calls)
and the upload proceeds. This is the trade the message screen made and for
the same reason; the difference is that an upload has no sweep, because the
object is already referenced by the time a sweep would find it. Turn the
classifier off with UPLOAD_IMAGE_SCREEN_ENABLED when it misfires.

Call sites are the handful of paths where a user's own picture lands in
storage: task evidence and feed media (media_upload_service), a chat
attachment (routes/direct_messages), an avatar (routes/users/profile,
user_photo_service, routes/dependents), a family photo
(utils/image_utils.store_image_upload). Staff content (quest images, course
covers, documents) is not gated here.
"""

import hashlib
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app_config import Config
from services import csam_match_service
from utils.logger import get_logger

logger = get_logger(__name__)

#: What the uploader reads on a hash match. Deliberately says nothing: telling
#: someone their upload matched a CSAM list tells them what the list is.
NEUTRAL_REFUSAL = 'This file could not be uploaded.'
#: What a student reads when the classifier holds a picture.
HELD_REFUSAL = 'That image was held by our safety check.'
#: What a student reads when the only problem is contact details. Unlike the
#: hold above it says what is wrong: the student can fix it, and a refusal
#: that gives no reason was retried fourteen times in an hour (2026-09-21).
CONTACT_REFUSAL = ('That image shows a phone number, address or username. '
                   'Cover or crop it and try again.')

KIND_CLEAR = 'clear'
KIND_SKIPPED = 'skipped'
KIND_CSAM = 'csam'
KIND_HELD = 'held'
KIND_CONTACT = 'contact'

#: Purposes whose uploads a student makes and other people see. Only these
#: go to the classifier; a chat attachment is classified at send time with
#: its text (peer_text_screen_service), so it is hash-matched here only.
CLASSIFIED_PURPOSES = frozenset({
    'evidence', 'learning_event', 'feed', 'avatar', 'portfolio', 'community',
    'bug_report', 'family_photo',
})

#: Schoolwork, where contact details alone are refused without a hold.
SOFT_CONTACT_PURPOSES = frozenset({'evidence', 'learning_event'})

#: How far back the same image from the same student reuses its hold. The
#: message screen's window (peer_text_screen_service.HOLD_DEDUPE_HOURS).
UPLOAD_DEDUPE_HOURS = 24

HELD_PREFIX = 'held'
HELD_BUCKET = 'user-uploads'


@dataclass
class UploadVerdict:
    allowed: bool
    kind: str
    message: Optional[str] = None
    hold_id: Optional[str] = None
    incident_id: Optional[str] = None
    reasons: List[str] = field(default_factory=list)


def check_image(blob: bytes, mime: Optional[str], *, user_id: Optional[str],
                purpose: str, filename: Optional[str] = None,
                classify: bool = True) -> UploadVerdict:
    """Run both checks on an image about to be stored. Never raises.

    `classify=False` skips the classifier whatever the purpose (a chat
    attachment, which is classified with its message). The hash match
    always runs when a provider is configured.
    """
    mime = (mime or '').lower()
    if not blob or not mime.startswith('image/'):
        return UploadVerdict(True, KIND_SKIPPED)

    matched = csam_match_service.match(blob, mime)
    if matched.error:
        logger.error('[upload-safety] hash match unavailable (%s); upload proceeds: %s',
                     matched.provider, matched.error)
    if matched.matched:
        incident_id = _quarantine(blob, mime, user_id=user_id, purpose=purpose,
                                  filename=filename, provider=matched.provider,
                                  details=matched.details)
        return UploadVerdict(False, KIND_CSAM, NEUTRAL_REFUSAL, incident_id=incident_id)

    if not classify or purpose not in CLASSIFIED_PURPOSES:
        return UploadVerdict(True, KIND_CLEAR)
    if not Config.UPLOAD_IMAGE_SCREEN_ENABLED or not user_id or not _is_student(user_id):
        return UploadVerdict(True, KIND_CLEAR)

    from services.peer_text_screen_service import UploadScreenService, load_image_bytes
    part = load_image_bytes(blob, filename or 'upload', mime)
    if part is None:
        logger.warning('[upload-safety] could not open %s for the classifier; upload proceeds', filename)
        return UploadVerdict(True, KIND_CLEAR)

    # After the open, so the bytes are known to be an image.
    sha256 = hashlib.sha256(blob).hexdigest()
    earlier = _earlier_hold(user_id, sha256)
    if earlier:
        logger.info('[upload-safety] same image held again for %s; hold %s stands, parents not re-told',
                    str(user_id)[:8], earlier)
        return UploadVerdict(False, KIND_HELD, HELD_REFUSAL, hold_id=earlier)
    svc = UploadScreenService()
    result = svc.judge(f'{_purpose_label(purpose)}: {filename or "image"}', [part],
                       prompt=svc.UPLOAD_PROMPT)
    if result.failed:
        logger.warning('[upload-safety] classifier unavailable; upload proceeds (%s)', purpose)
        return UploadVerdict(True, KIND_CLEAR)
    if not result.flagged:
        return UploadVerdict(True, KIND_CLEAR)

    # A flag with no kinds is a hold: the model did not say which rule, so
    # nothing here can call it only contact details.
    contact_only = set(result.kinds) == {svc.KIND_CONTACT_DETAILS}
    if contact_only and purpose in SOFT_CONTACT_PURPOSES:
        logger.info('[upload-safety] contact details on %s refused without a hold', purpose)
        return UploadVerdict(False, KIND_CONTACT, CONTACT_REFUSAL, reasons=result.reasons)

    hold_id = _hold(part['data'], user_id=user_id, purpose=purpose, filename=filename,
                    reasons=result.reasons, model=result.model, sha256=sha256)
    return UploadVerdict(False, KIND_HELD, CONTACT_REFUSAL if contact_only else HELD_REFUSAL,
                         hold_id=hold_id, reasons=result.reasons)


def error_code(verdict: UploadVerdict) -> str:
    """The error_code an upload route sends with a refusal. A client shows a
    SAFETY_* refusal's sentence on its own: it already says what happened and
    what to do, and a second "nothing was saved" toast under the cover-or-crop
    sentence read as two separate failures (2026-09-23)."""
    return {KIND_HELD: 'SAFETY_HELD', KIND_CONTACT: 'SAFETY_CONTACT'}.get(verdict.kind, 'REJECTED')


def _earlier_hold(user_id: str, sha256: str) -> Optional[str]:
    """The hold this student's identical image already has, or None.
    Best-effort: a failed lookup classifies the image again."""
    from datetime import timedelta
    from repositories.peer_text_screen_repository import PeerTextScreenRepository
    from utils.timestamps import utcnow
    try:
        since = (utcnow() - timedelta(hours=UPLOAD_DEDUPE_HOURS)).isoformat()
        return PeerTextScreenRepository().upload_hold_for_image(
            author_id=user_id, sha256=sha256, since_iso=since)
    except Exception as e:  # noqa: BLE001
        logger.warning('[upload-safety] earlier-hold lookup failed, classifying: %s', e)
        return None


# --- a hash match ---------------------------------------------------------------

def _quarantine(blob: bytes, mime: str, *, user_id: Optional[str], purpose: str,
                filename: Optional[str], provider: str,
                details: Dict[str, Any]) -> Optional[str]:
    """Preserve the bytes where nobody browses, record the incident, and tell
    the superadmins. Each step is best-effort and independent: a failure to
    email must not lose the record, and a failure to record must not lose
    the bytes."""
    from repositories.csam_incident_repository import CsamIncidentRepository

    sha256 = hashlib.sha256(blob).hexdigest()
    path = f'{uuid.uuid4().hex}'
    stored = None
    try:
        from database import get_supabase_admin_client
        # admin client justified: the quarantine bucket is service_role only
        # by design; no user may ever read or sign what is in it.
        admin = get_supabase_admin_client()
        _ensure_private_bucket(admin, Config.CSAM_QUARANTINE_BUCKET)
        admin.storage.from_(Config.CSAM_QUARANTINE_BUCKET).upload(
            path, blob, {'content-type': mime})
        stored = path
    except Exception as e:  # noqa: BLE001
        logger.error('[upload-safety] could not quarantine a matched upload: %s', e)

    incident_id = None
    try:
        incident_id = CsamIncidentRepository().record(
            user_id=user_id, purpose=purpose, filename=filename, mime=mime,
            byte_size=len(blob), sha256=sha256, provider=provider,
            details=details, storage_path=stored)
    except Exception as e:  # noqa: BLE001
        logger.error('[upload-safety] could not record a CSAM incident: %s', e)

    logger.critical('[upload-safety] CSAM hash match: incident=%s user=%s purpose=%s provider=%s',
                    incident_id, str(user_id or '')[:8], purpose, provider)
    _alert_superadmins(incident_id, user_id=user_id, purpose=purpose, provider=provider)
    return incident_id


def _alert_superadmins(incident_id: Optional[str], *, user_id: Optional[str],
                       purpose: str, provider: str) -> None:
    """Every superadmin, three ways: Sentry (pages), email, and in-app. The
    message names the incident id and nothing about the image."""
    try:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            scope.set_level('fatal')
            scope.set_tag('csam_incident', incident_id or 'unrecorded')
            sentry_sdk.capture_message(
                f'CSAM hash match on upload (incident {incident_id}); see docs/CHILD_SAFETY_REPORTING.md')
    except Exception as e:  # noqa: BLE001
        logger.warning('[upload-safety] Sentry alert failed: %s', e)

    try:
        from repositories.user_repository import UserRepository
        from services.email_service import email_service
        from services.notification_service import NotificationService
        admins = UserRepository().find_by_role('superadmin')
        body = (f'A hash match against the known-CSAM lists ({provider}) refused an upload. '
                f'Incident {incident_id or "(not recorded)"}. The file is quarantined. '
                f'Follow docs/CHILD_SAFETY_REPORTING.md now: this is a reportable event.')
        notify = NotificationService()
        for admin in admins:
            if admin.get('id'):
                try:
                    notify.create_notification(
                        user_id=admin['id'], notification_type='system_alert',
                        title='CSAM hash match: action required', message=body,
                        link='/admin/moderation?tab=holds',
                        metadata={'incident_id': incident_id, 'purpose': purpose})
                except Exception as e:  # noqa: BLE001
                    logger.warning('[upload-safety] in-app alert to %s failed: %s', admin['id'][:8], e)
            if admin.get('email'):
                try:
                    email_service.send_templated_email(
                        to_email=admin['email'],
                        subject='CSAM hash match on Optio: action required',
                        template_name='csam_incident',
                        context={
                            'admin_name': admin.get('first_name') or admin.get('display_name') or 'there',
                            'incident_id': incident_id or '(not recorded)',
                            'purpose': purpose,
                            'provider': provider,
                            'runbook_url': f'{Config.FRONTEND_URL}/admin/moderation?tab=holds',
                        })
                except Exception as e:  # noqa: BLE001
                    logger.warning('[upload-safety] email alert to %s failed: %s', admin['email'], e)
    except Exception as e:  # noqa: BLE001
        logger.error('[upload-safety] could not alert the superadmins: %s', e)


def _ensure_private_bucket(admin, name: str) -> None:
    try:
        admin.storage.get_bucket(name)
    except Exception:  # noqa: BLE001 -- absent; create it private
        admin.storage.create_bucket(name, options={'public': False})


# --- a classifier hold ----------------------------------------------------------

def _hold(jpeg: bytes, *, user_id: str, purpose: str, filename: Optional[str],
          reasons: List[str], model: Optional[str],
          sha256: Optional[str] = None) -> Optional[str]:
    """Keep the picture under held/ so the parent can see it, then record
    the hold the way a held message is recorded (parents told once)."""
    from services import peer_text_screen_service as screen_svc
    from utils.storage_urls import public_object_url

    attachments: List[Dict[str, Any]] = []
    try:
        from database import get_supabase_admin_client
        path = f'{HELD_PREFIX}/{user_id}/{uuid.uuid4().hex}.jpg'
        # admin client justified: the object is written under held/ on the
        # uploader's behalf; only the parent view and the moderator read it,
        # both through signed URLs the server issues.
        get_supabase_admin_client().storage.from_(HELD_BUCKET).upload(
            path, jpeg, {'content-type': 'image/jpeg'})
        attachments = [{'url': public_object_url(HELD_BUCKET, path), 'type': 'image',
                        'name': filename or 'image.jpg', 'size': len(jpeg)}]
        if sha256:
            # The ORIGINAL upload's hash, not the re-encoded JPEG's: the
            # next upload is compared before it is re-encoded.
            attachments[0]['sha256'] = sha256
    except Exception as e:  # noqa: BLE001
        logger.warning('[upload-safety] could not keep a held image for the parent: %s', e)

    return screen_svc.record_hold(
        author_id=user_id, surface=screen_svc.SURFACE_UPLOAD,
        text=f'{_purpose_label(purpose)}: {filename or "image"}',
        result=screen_svc.ScreenResult(screen_svc.VERDICT_FLAGGED, reasons, model),
        attachments=attachments)


def _purpose_label(purpose: str) -> str:
    return {
        'evidence': 'Task evidence', 'learning_event': 'Learning moment', 'feed': 'Feed post',
        'avatar': 'Profile photo', 'portfolio': 'Portfolio', 'community': 'Community post',
        'bug_report': 'Bug report screenshot', 'family_photo': 'Family photo',
        'message_attachment': 'Chat attachment',
    }.get(purpose, purpose.replace('_', ' ').capitalize())


def _is_student(user_id: str) -> bool:
    try:
        from repositories.peer_policy_repository import PeerPolicyRepository
        from utils.roles import get_effective_role
        row = PeerPolicyRepository().user_row(user_id, 'id, role, org_role')
        return bool(row) and get_effective_role(row or {}) == 'student'
    except Exception as e:  # noqa: BLE001
        logger.warning('[upload-safety] role check failed (classifying): %s', e)
        return True


def read_bytes(file_obj) -> bytes:
    """The whole file from a werkzeug FileStorage or a file handle, with the
    position put back, so the caller's own read is unaffected."""
    try:
        pos = file_obj.tell()
    except Exception:  # noqa: BLE001
        pos = None
    try:
        file_obj.seek(0)
        data = file_obj.read()
    finally:
        try:
            file_obj.seek(pos or 0)
        except Exception as e:  # noqa: BLE001
            logger.debug('[upload-safety] could not restore the file position: %s', e)
    return data if isinstance(data, bytes) else bytes(data or b'')
