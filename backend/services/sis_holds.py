"""
One family hold.

A family can be stopped from picking classes by a registration hold on its
household. Seven modules wrote the flag with their own idea of when it
clears, and the unpaid-fee hold was recognised by comparing the hold's
free-text reason to a sentence in three places, so an admin who edited the
reason on the Families page made the hold un-clearable
(docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, G1-G4/B9; M2 in
docs/sis/CONSOLIDATION_PLAN.md).

The household is the only hold store once a household exists:
`households.registration_hold` (the flag), `registration_hold_code` (which
kind, HOLD_CODES) and `registration_hold_reason` (what the family reads). A
directive (`sis_family_directives`, staged by parent email before the family
has registered) is a pre-household staging area and is applied ONCE, when
the funnel attaches the household (`apply_directives`); `applied_at` says
when. Nothing reconciles the two afterwards.

`registration_tier` was a fourth thing: three writers and no reader
anywhere. Its writers are gone; the columns stay for the day the tables go.
"""

from typing import Any, Dict, Optional

from utils.logger import get_logger
from utils.timestamps import now_iso as _now

logger = get_logger(__name__)

UNPAID_FEE = 'unpaid_fee'
MANUAL = 'manual'
ENROLLMENT_WAITLIST = 'enrollment_waitlist'
HOLD_CODES = (UNPAID_FEE, MANUAL, ENROLLMENT_WAITLIST)

# What the family reads when the hold is the unpaid registration fee. Copy,
# not a key: the code is the key.
FEE_HOLD_REASON = 'Registration fee due — finish it from your registration page.'

FAMILY_HELD_MESSAGE = ("Your family's registration is on hold — please contact the school "
                       'to resolve it before signing up for classes.')
WAITLISTED_MESSAGE = ('This student is on the enrollment waitlist — the school will let '
                      'you know when they can choose classes.')

# admin client justified: holds are a school decision about a family; the
#   routes that reach here are role-gated and the household is org-checked
from utils.admin_client import admin_client as _admin


# ── The columns ───────────────────────────────────────────────────────────────

def hold_fields(held: bool, code: Optional[str] = None, reason: Optional[str] = None) -> Dict[str, Any]:
    """PURE. The household columns for a hold state, for a write that carries
    other fields too (the Families page PATCH, the funnel's household row).
    A hold with no code is a manual one; clearing wipes code and reason."""
    if not held:
        return {'registration_hold': False, 'registration_hold_code': None,
                'registration_hold_reason': None}
    code = code if code in HOLD_CODES else MANUAL
    return {'registration_hold': True, 'registration_hold_code': code,
            'registration_hold_reason': (reason or '').strip() or (FEE_HOLD_REASON if code == UNPAID_FEE else None)}


def hold_payload(household: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """PURE. The hold as every payload carries it (roster, family record, the
    parent's builder, the funnel's state): the flag, the code and the text."""
    hh = household or {}
    return {
        'registration_hold': bool(hh.get('registration_hold')),
        'registration_hold_code': hh.get('registration_hold_code') if hh.get('registration_hold') else None,
        'registration_hold_reason': hh.get('registration_hold_reason') if hh.get('registration_hold') else None,
    }


def is_held_for(household: Optional[Dict[str, Any]], code: str) -> bool:
    """PURE. Whether the household's hold is of this kind. A held row written
    before the code column existed is judged by its reason text, once."""
    hh = household or {}
    if not hh.get('registration_hold'):
        return False
    stored = hh.get('registration_hold_code')
    if stored:
        return stored == code
    return code == UNPAID_FEE and hh.get('registration_hold_reason') == FEE_HOLD_REASON


# ── Writes ────────────────────────────────────────────────────────────────────

def set_hold(household_id: str, code: str, reason: Optional[str] = None) -> Dict[str, Any]:
    """Put a household on hold of one kind. Returns the columns written."""
    fields = {**hold_fields(True, code, reason), 'updated_at': _now()}
    _admin().table('households').update(fields).eq('id', household_id).execute()
    logger.info(f'[holds] {household_id[:8]} held: {fields["registration_hold_code"]}')
    return fields


def clear_hold(household_id: str) -> Dict[str, Any]:
    """Lift whatever hold the household carries."""
    fields = {**hold_fields(False), 'updated_at': _now()}
    _admin().table('households').update(fields).eq('id', household_id).execute()
    logger.info(f'[holds] {household_id[:8]} cleared')
    return fields


def clear_hold_if(household: Dict[str, Any], code: str) -> bool:
    """Lift the household's hold only if it is of this kind -- a school-set
    hold for another reason stays. `household` is the row (id + hold columns).
    Returns whether anything was cleared."""
    if not is_held_for(household, code):
        return False
    clear_hold(household['id'])
    return True


def clear_hold_for_guardian(org_id: str, guardian_user_id: str, code: str) -> int:
    """Lift holds of one kind on every household in the org this guardian is
    the primary contact of (the funnel's fee step knows the parent, not the
    household). Returns how many were cleared."""
    rows = (_admin().table('households')
            .select('id, registration_hold, registration_hold_code, registration_hold_reason')
            .eq('organization_id', org_id).eq('primary_contact_user_id', guardian_user_id)
            .eq('registration_hold', True).execute()).data or []
    cleared = 0
    for hh in rows:
        if clear_hold_if(hh, code):
            cleared += 1
    return cleared


# ── Directives: staged before the household exists, applied once ─────────────

def stage_directive(org_id: str, email: str, *, registration_hold: bool = False,
                    hold_reason: Optional[str] = None, fee_prepaid: bool = False,
                    notes: Optional[str] = None,
                    no_charge: Optional[bool] = None) -> Dict[str, Any]:
    """Upsert the pre-household directive for a parent email: what the funnel
    applies when this family registers. One row per (org, email). `no_charge`
    None leaves a stored value alone: the prepaid import and the waive-fee
    route do not know about it and must not switch a free family back on."""
    row = {
        'organization_id': org_id,
        'email': (email or '').strip().lower(),
        'registration_hold': bool(registration_hold),
        'hold_reason': (hold_reason or '').strip() or None,
        'fee_prepaid': bool(fee_prepaid),
        'notes': (notes or '').strip() or None,
        'updated_at': _now(),
    }
    if no_charge is not None:
        row['no_charge'] = bool(no_charge)
    out = (_admin().table('sis_family_directives')
           .upsert(row, on_conflict='organization_id,email').execute()).data
    return out[0] if out else row


def apply_directives(household_id: str, directive: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Apply a staged directive to the household the funnel just attached, once:
    the hold lands on the household (code `manual`, the staged reason), the
    directive is marked applied and pointed at its household. Idempotent: a
    directive already applied is left alone (a re-registration must not put a
    cleared hold back). Returns the hold columns to merge into the row."""
    if not directive:
        return hold_fields(False)
    if directive.get('applied_at'):
        return {}
    fields = hold_fields(bool(directive.get('registration_hold')), MANUAL, directive.get('hold_reason'))
    _admin().table('households').update({**fields, 'updated_at': _now()}).eq('id', household_id).execute()
    _admin().table('sis_family_directives').update({
        'matched_household_id': household_id, 'applied_at': _now(), 'updated_at': _now(),
    }).eq('id', directive['id']).execute()
    logger.info(f'[holds] directive {directive["id"][:8]} applied to household {household_id[:8]}')
    return fields


# ── The gate ──────────────────────────────────────────────────────────────────

def student_household(org_id: str, student_user_id: str) -> Optional[Dict[str, Any]]:
    """The student's household in this org (hold columns), or None."""
    memberships = (_admin().table('household_members').select('household_id')
                   .eq('user_id', student_user_id).execute()).data or []
    hh_ids = [m['household_id'] for m in memberships if m.get('household_id')]
    if not hh_ids:
        return None
    rows = (_admin().table('households')
            .select('id, organization_id, registration_hold, registration_hold_code, registration_hold_reason')
            .in_('id', hh_ids).eq('organization_id', org_id).limit(1).execute()).data or []
    return rows[0] if rows else None


def family_gate(org_id: str, student_user_id: str) -> Optional[Dict[str, Any]]:
    """The error blocking this family from class signup, or None if clear.

    A registration hold (unresolved fee or question from the school) blocks
    all self-service adds, and a student on the enrollment age-group waitlist
    cannot pick classes until the school releases them. Access to
    registration itself is controlled by who has the registration link;
    there are no date-staggered tiers. Families with no household are not
    gated: staff-created edge cases must not lock parents out.
    """
    household = student_household(org_id, student_user_id)
    if household and household.get('registration_hold'):
        return {'error': FAMILY_HELD_MESSAGE, **hold_payload(household)}
    from services import sis_enrollment_waitlist_service as enrollment_waitlist
    entry = enrollment_waitlist.waiting_entry(org_id, student_user_id)
    if entry:
        return {'error': WAITLISTED_MESSAGE, 'enrollment_waitlisted': True}
    return None
