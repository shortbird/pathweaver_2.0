"""How a family says it will pay — the answer they gave at registration.

Two different facts have been living under one name.

`households.funding_source` is the STAFF-set field the billing system gates on.
It decides `pay_through_ufa`, which prints the "pay through UFA" note on an
invoice and hides card payment on the family's own billing page. It is set by
hand, one family at a time, from the Families page — and at iCreate it had never
been set for a single one of the 91 families, so every billing surface showed
blank.

The family's own answer already existed: "Form of Payment" is a required
question in the registration funnel, and 98 iCreate families answered it. But it
was written to `registrations.answers` and only ever read back by the
CLP page, so the office — invoicing from the tuition approver, needing to know
who is on Utah Fits All — could not see it anywhere they worked.

This module reads that answer per household for the staff surfaces. It is
DISPLAY ONLY: nothing here decides who may pay by card. The gate stays on
`funding_source`, which staff set deliberately — `derive_funding_source` is the
suggestion offered to them in the UI, and what the funnel records for families
registering from now on.
"""

from typing import Any, Dict, List, Optional

from utils.db_fetch import fetch_all_rows
from utils.logger import get_logger

logger = get_logger(__name__)

# Registration-question keys. `payment_intent` is the org-configured "Form of
# Payment" multi-select; `ufa_private` is the built-in yes/no follow-up shown
# when they pick Utah Fits All; `payment_plan` is the (optional) monthly-vs-full
# question — see PLAN_LABELS.
METHOD_KEY = 'payment_intent'
UFA_PRIVATE_KEY = 'ufa_private'
PLAN_KEY = 'payment_plan'

PLAN_VALUES = ('in_full', 'monthly')
PLAN_LABELS = {'in_full': 'Pays in full', 'monthly': 'Monthly payments'}


# admin client justified: the SIS console acts for the whole school — this
#   reads/writes rows belonging to every family in the org, which no single
#   caller can see under RLS; the route's role+org gate is the authorization
from utils.admin_client import admin_client as _admin


FUNDING_SOURCES = ('ufa', 'ufa_private', 'private_pay', 'other')


def funding_fields(source: Optional[str]) -> Dict[str, Any]:
    """PURE. The household columns one funding source implies.

    `funding_source` is the field; `ufa_private` (the legacy boolean the
    learning-day feature gates on) and `enrolled_private_school` (the school of
    record) are derived from it, never set on their own. Three write paths
    each spelled this mirror by hand (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md,
    B10/N7; M4). A source of ufa_private implies enrolment in the private
    school; any other source leaves that flag alone (a family can attend the
    school and pay privately)."""
    fs = source or None
    if fs is not None and fs not in FUNDING_SOURCES:
        raise ValueError(f'invalid funding_source {source!r}')
    fields: Dict[str, Any] = {'funding_source': fs, 'ufa_private': fs == 'ufa_private'}
    if fs == 'ufa_private':
        fields['enrolled_private_school'] = True
    return fields


def set_funding_source(household_id: str, source: Optional[str], *,
                       extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """The one write of a household's funding source (and its derived
    mirrors), whoever is setting it: the office on the Families page, the
    funnel deriving it from the family's answer, the family on their own
    billing page. Returns the columns written."""
    from repositories.household_repository import HouseholdRepository
    fields = {**(extra or {}), **funding_fields(source)}
    HouseholdRepository(client=_admin()).update(household_id, fields)
    return fields


def _as_list(val) -> List[str]:
    """Registration answers are a list for 'multi' questions, a string otherwise."""
    if val is None or val == '':
        return []
    if isinstance(val, list):
        return [str(v).strip() for v in val if str(v).strip()]
    return [str(val).strip()] if str(val).strip() else []


def _yes_no(val) -> Optional[bool]:
    s = str(val or '').strip().lower()
    if s in ('yes', 'true', '1'):
        return True
    if s in ('no', 'false', '0'):
        return False
    return None


def normalize_plan(val) -> Optional[str]:
    """A payment-plan answer as one of PLAN_VALUES.

    Tolerant of how the question is worded in an org's config ("Monthly
    payments", "I'll pay monthly", "Pay in full") because the funnel stores the
    option text the org typed, not a code.
    """
    s = str(val or '').strip().lower()
    if not s:
        return None
    if s in PLAN_VALUES:
        return s
    if 'month' in s or 'instal' in s or 'install' in s:
        return 'monthly'
    if 'full' in s or 'one-time' in s or 'one time' in s or 'lump' in s:
        return 'in_full'
    return None


def read_answers(answers: Any) -> Dict[str, Any]:
    """The payment facts inside one registration's answers blob."""
    a = answers if isinstance(answers, dict) else {}
    return {
        'methods': _as_list(a.get(METHOD_KEY)),
        'ufa_private': _yes_no(a.get(UFA_PRIVATE_KEY)),
        'plan': normalize_plan(a.get(PLAN_KEY)),
    }


def derive_funding_source(answers: Any) -> Optional[str]:
    """The `funding_source` a family's answers imply, or None when they imply
    nothing definite.

    Deliberately conservative, because this value gates money: a family who
    named Utah Fits All *and* another method is 'other', not 'ufa', so nobody
    loses the ability to pay by card on the strength of a multi-select.
    """
    read = read_answers(answers)
    methods = read['methods']
    if not methods:
        return None
    lowered = [m.lower() for m in methods]
    is_ufa = [('utah fits all' in m or m == 'ufa') for m in lowered]
    if all(is_ufa):
        # The yes/no follow-up is what separates plain UFA from UFA-Private.
        return 'ufa_private' if read['ufa_private'] else 'ufa'
    if all(('self-pay' in m or 'self pay' in m) for m in lowered):
        return 'private_pay'
    if any('private school' in m for m in lowered):
        return 'ufa_private'
    return 'other'


def question_from_config(feature_flags: Any) -> Optional[Dict[str, Any]]:
    """The org's "Form of Payment" registration question, as the family's own
    surfaces need it: label, help, options, and whether more than one option
    may be picked. None when the org never configured one."""
    from utils.registration_config import get_registration_config
    cfg = get_registration_config(feature_flags)
    for q in cfg.get('questions') or []:
        if isinstance(q, dict) and q.get('key') == METHOD_KEY:
            options = [str(o).strip() for o in (q.get('options') or []) if str(o).strip()]
            if not options:
                return None
            return {
                'label': q.get('label') or 'Form of Payment',
                'help': q.get('help') or None,
                'options': options,
                'multi': (q.get('type') == 'multi'),
            }
    return None


def is_ufa_method(method: str) -> bool:
    m = str(method or '').strip().lower()
    return 'utah fits all' in m or m == 'ufa'


def merged_answers(answers: Any, methods: List[str], ufa_private: Optional[bool]) -> Dict[str, Any]:
    """The registration's answers with the payment facts replaced. The UFA
    private-school follow-up is kept only while Utah Fits All is among the
    methods, as the funnel itself does."""
    out = dict(answers) if isinstance(answers, dict) else {}
    out[METHOD_KEY] = list(methods)
    if any(is_ufa_method(m) for m in methods) and ufa_private is not None:
        out[UFA_PRIVATE_KEY] = 'Yes' if ufa_private else 'No'
    else:
        out.pop(UFA_PRIVATE_KEY, None)
    return out


def _guardians_by_household(org_id: str) -> Dict[str, str]:
    """user_id -> household_id for every member of an org's households.

    Both reads span the whole org, so both are paged (a truncated page here
    would silently drop families off the bottom of the list).
    """
    households = fetch_all_rows(lambda: (
        _admin().table('households').select('id').eq('organization_id', org_id)
    ))
    hh_ids = [h['id'] for h in households]
    if not hh_ids:
        return {}
    members = fetch_all_rows(lambda: (
        _admin().table('household_members')
        .select('id, household_id, user_id').in_('household_id', hh_ids)
    ))
    return {m['user_id']: m['household_id'] for m in members if m.get('user_id')}


def profiles_for_org(org_id: str) -> Dict[str, Dict[str, Any]]:
    """household_id -> {'methods': [...], 'ufa_private': bool|None, 'plan': str|None}.

    The family's latest registration that actually answered the payment question
    wins, so a parent who re-registers a second child does not blank out what
    they told the school the first time. Households whose members never
    registered through the funnel are simply absent from the map.
    """
    try:
        by_user = _guardians_by_household(org_id)
        if not by_user:
            return {}
        regs = fetch_all_rows(lambda: (
            _admin().table('registrations')
            .select('id, parent_user_id, answers, created_at')
            .eq('organization_id', org_id)
        ))
    except Exception as e:  # noqa: BLE001 — payment context decorates a page, never blocks it
        logger.warning(f'payment profile: org read failed for {org_id}: {e}')
        return {}

    regs.sort(key=lambda r: r.get('created_at') or '', reverse=True)
    out: Dict[str, Dict[str, Any]] = {}
    for r in regs:  # newest first
        hh_id = by_user.get(r.get('parent_user_id'))
        if not hh_id:
            continue
        read = read_answers(r.get('answers'))
        if not read['methods'] and read['plan'] is None:
            continue
        current = out.get(hh_id)
        if current is None:
            out[hh_id] = read
            continue
        # An older registration fills only the blanks a newer one left.
        if not current['methods'] and read['methods']:
            current['methods'] = read['methods']
            current['ufa_private'] = read['ufa_private']
        if current['plan'] is None:
            current['plan'] = read['plan']
    return out


def profile_for_household(org_id: str, household_id: str) -> Dict[str, Any]:
    """One family's profile — the same shape, empty when they never answered.

    Reads only that household's members rather than the whole org: this runs on
    every click of a student in the tuition approver.
    """
    empty = {'methods': [], 'ufa_private': None, 'plan': None}
    if not household_id:
        return empty
    try:
        members = (_admin().table('household_members').select('user_id')
                   .eq('household_id', household_id).execute()).data or []
        user_ids = [m['user_id'] for m in members if m.get('user_id')]
        if not user_ids:
            return empty
        regs = (_admin().table('registrations')
                .select('parent_user_id, answers, created_at')
                .eq('organization_id', org_id).in_('parent_user_id', user_ids)
                .order('created_at', desc=True).execute()).data or []
    except Exception as e:  # noqa: BLE001 — decoration, never a blocker
        logger.warning(f'payment profile: household read failed for {household_id[:8]}: {e}')
        return empty

    out = dict(empty)
    for r in regs:  # newest first
        read = read_answers(r.get('answers'))
        if not out['methods'] and read['methods']:
            out['methods'] = read['methods']
            out['ufa_private'] = read['ufa_private']
        if out['plan'] is None:
            out['plan'] = read['plan']
    return out


def attach_to_households(org_id: str, households: List[Dict[str, Any]]) -> None:
    """Decorate household dicts in place with what the family answered.

    `stated_payment_methods` is the family's words, verbatim, and is never
    reconciled with the staff-set `funding_source` sitting beside it — when the
    two disagree the office needs to see that they disagree.
    """
    if not households:
        return
    profiles = profiles_for_org(org_id)
    for h in households:
        p = profiles.get(h.get('id')) or {}
        h['stated_payment_methods'] = p.get('methods') or []
        h['stated_ufa_private'] = p.get('ufa_private')
        # A staff-recorded plan outranks the registration answer: it is the
        # later conversation ("they called and asked to switch to monthly").
        h['payment_plan'] = h.get('payment_plan_preference') or p.get('plan')
        h['payment_plan_from_family'] = p.get('plan')
