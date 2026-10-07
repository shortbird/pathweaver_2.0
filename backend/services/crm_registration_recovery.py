"""
CRM recovery funnels: parents who began a school's registration and stopped.

The registration funnel (routes/registration_funnel.py) creates the parent's
account on its first step, so these leads are account holders from the start.
That is why a recovery funnel is its own funnel_type: the sweep's "has an
account, so converted" safety net would otherwise exit every one of them
before the first email. What ends a recovery membership is the registration
itself reaching 'completed', checked right before each send.

Entry is a pass inside the funnel sweep, not a hook on a registration route:
the funnel has four doors (create account, password sign-in, OAuth attach,
and the logged-in resume) and a stall is defined by time passing, which no
route sees. A registration enters once it has sat untouched for STALL_HOURS,
and only while its funnel is active; activating the funnel picks up every
open registration from the last MAX_AGE_DAYS.
"""
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, Optional

from repositories.registration_repository import RegistrationRepository
from utils.logger import get_logger

logger = get_logger(__name__)

# Recovery funnel key -> the slug of the org whose registrations feed it.
RECOVERY_FUNNEL_ORGS = {
    'academy_registration_recovery': 'optio-academy',
}

# Every registrations.status before 'completed'. 'schedule' and 'appointment'
# are legacy steps that /my-registration settles as completed, so a family
# sitting on one has nothing left to finish.
OPEN_STATUSES = ('verify', 'family', 'details', 'paperwork', 'fee')

STALL_HOURS = 3
MAX_AGE_DAYS = 30

# Onboarding funnel key -> the slug of the org whose COMPLETED registrations
# feed it: the family's welcome to that school, in place of the generic
# new-account welcome (crm_funnel_engine.OWN_WELCOME_ORGS stops that one).
# A completion older than WELCOME_MAX_AGE_DAYS is past welcoming, so
# activating the funnel does not mail families who started months ago.
WELCOME_FUNNEL_ORGS = {
    'academy_parent_welcome': 'optio-academy',
}
WELCOME_MAX_AGE_DAYS = 14


def _repo(db) -> RegistrationRepository:
    return RegistrationRepository(client=db)


def _org_id(db, slug: str) -> Optional[str]:
    return _repo(db).org_id_for_slug(slug)


def enroll_stalled(db, funnels: Iterable[Dict[str, Any]], now: datetime) -> int:
    """Enter every stalled registration's parent into its active recovery
    funnel. Returns how many entered."""
    from services.crm_service import enter_recovery

    entered = 0
    for funnel in funnels:
        if funnel.get('funnel_type') != 'recovery':
            continue
        slug = RECOVERY_FUNNEL_ORGS.get(funnel['key'])
        org_id = _org_id(db, slug) if slug else None
        if not org_id:
            continue
        parents = _repo(db).stalled_parents(
            org_id, list(OPEN_STATUSES),
            idle_before=(now - timedelta(hours=STALL_HOURS)).isoformat(),
            touched_after=(now - timedelta(days=MAX_AGE_DAYS)).isoformat())
        for parent in parents:
            if not parent.get('email'):
                continue
            if enter_recovery(db, parent['email'], funnel,
                              first_name=parent.get('first_name'),
                              last_name=parent.get('last_name')):
                entered += 1
    return entered


def enroll_completed(db, funnels: Iterable[Dict[str, Any]], now: datetime) -> int:
    """Enter every parent whose registration completed in the last
    WELCOME_MAX_AGE_DAYS into their org's active welcome funnel. Same pass
    shape as enroll_stalled, for the same reason: completion has several
    doors (the funnel's last step, staff marking it done, the legacy
    schedule/appointment settle), and the sweep sees all of them. Returns
    how many entered."""
    from services.crm_service import enter_registration_welcome

    entered = 0
    for funnel in funnels:
        slug = WELCOME_FUNNEL_ORGS.get(funnel['key'])
        org_id = _org_id(db, slug) if slug else None
        if not org_id:
            continue
        # stalled_parents is "parents with a registration in these statuses,
        # last touched inside the window"; with idle_before=now it is simply
        # every completion in the window.
        parents = _repo(db).stalled_parents(
            org_id, ['completed'], idle_before=now.isoformat(),
            touched_after=(now - timedelta(days=WELCOME_MAX_AGE_DAYS)).isoformat())
        for parent in parents:
            if not parent.get('email'):
                continue
            if enter_registration_welcome(db, parent['email'], funnel,
                                          first_name=parent.get('first_name'),
                                          last_name=parent.get('last_name')):
                entered += 1
    return entered


def registration_open(db, email: str, funnel_key: str) -> Optional[bool]:
    """Whether this lead's registration still needs finishing. None when the
    lookup failed (the sweep retries next run rather than exiting a family
    on a transient error)."""
    slug = RECOVERY_FUNNEL_ORGS.get(funnel_key)
    if not slug:
        return False
    try:
        org_id = _org_id(db, slug)
        status = _repo(db).latest_status_for_email(org_id, email) if org_id else None
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM recovery: registration lookup failed: {e}')
        return None
    return status in OPEN_STATUSES
