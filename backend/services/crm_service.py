"""
In-house CRM: lead intake and conversion sync (docs/CRM_REPLACEMENT_PLAN.md).

The drop-in replacement for brevo_service's call-site surface: module-level
functions, fire-and-forget (failures logged and swallowed so a CRM hiccup can
never break a signup or contact-form request), same return-value contract —
the name of the funnel whose automated sequence now follows, or None when
nothing automated does. Callers hand that to the email service so the [COPY]
banner can say whether the lead still needs a personal reply.

Funnels and their entry rules live in DB tables (crm_funnels.entry_types maps
contact_submissions.contact_type values to funnels), so routing changes are an
admin-console edit, not a deploy. Sending happens later, in
crm_funnel_engine's cron sweep — entering a funnel here only positions the
lead.
"""
from datetime import date, datetime, timezone
from typing import Any, Dict, Optional

from postgrest.exceptions import APIError

from utils.logger import get_logger

logger = get_logger(__name__)

# Exit reasons per conversion event; also what the admin timeline renders.
CONVERSION_EXIT_REASONS = {
    'account_signup': 'converted_signup',
    'class_start': 'converted_class_start',
    'video_chat_scheduled': 'converted_video_chat',
    'import': 'import_converted',
    'manual': 'manual',
}


def _db():
    from database import get_supabase_admin_client
    # admin client justified: CRM tables are service-role only (RLS, no
    # policies) and these hooks run in unauthenticated/service contexts
    # (contact form, cron, OAuth callback).
    return get_supabase_admin_client()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _record_event(db, lead_id: str, event_type: str, detail: Optional[Dict[str, Any]] = None):
    try:
        db.table('crm_events').insert({
            'lead_id': lead_id, 'event_type': event_type, 'detail': detail or {},
        }).execute()
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM event write failed ({event_type}): {e}')


def is_suppressed(email: str) -> bool:
    try:
        rows = (_db().table('crm_suppressions').select('id')
                .eq('email', email.lower()).limit(1).execute()).data
        return bool(rows)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM suppression lookup failed: {e}')
        return True  # fail closed for marketing sends


def _split_name(name: Optional[str]):
    """(first, last) from a free-text name; the free-class modal submits the
    placeholder 'Free Class Lead', which is not a name."""
    if not name or not name.strip() or name.strip().lower() == 'free class lead':
        return None, None
    parts = name.strip().split(None, 1)
    return parts[0], (parts[1] if len(parts) > 1 else None)


def _upsert_lead(db, email: str, *, lead_type: Optional[str] = None,
                 lead_source: Optional[str] = None, first_name: Optional[str] = None,
                 last_name: Optional[str] = None, phone: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Create or refresh a crm_leads row; returns the row. Never downgrades:
    an existing converted/unsubscribed/suppressed lead keeps its status, and
    provenance fields (lead_type/source) are only set when currently empty so
    ex-lead history survives later submissions."""
    email = email.lower().strip()
    existing = (db.table('crm_leads').select('*')
                .eq('email', email).limit(1).execute()).data
    if existing:
        lead = existing[0]
        updates = {}
        if first_name and not lead.get('first_name'):
            updates['first_name'] = first_name
        if last_name and not lead.get('last_name'):
            updates['last_name'] = last_name
        if phone and not lead.get('phone'):
            updates['phone'] = phone
        if lead_type and not lead.get('lead_type'):
            updates['lead_type'] = lead_type
        if lead_source and not lead.get('lead_source'):
            updates['lead_source'] = lead_source
        if updates:
            updates['updated_at'] = _now_iso()
            lead = (db.table('crm_leads').update(updates)
                    .eq('id', lead['id']).execute()).data[0]
        return lead
    row = {
        'email': email, 'first_name': first_name, 'last_name': last_name,
        'phone': phone, 'lead_type': lead_type, 'lead_source': lead_source,
    }
    try:
        return (db.table('crm_leads').insert(row).execute()).data[0]
    except APIError:
        # Raced another writer on the unique email; read theirs.
        rows = (db.table('crm_leads').select('*')
                .eq('email', email).limit(1).execute()).data
        return rows[0] if rows else None


def _funnel_for_contact_type(db, contact_type: str) -> Optional[Dict[str, Any]]:
    rows = (db.table('crm_funnels').select('*')
            .contains('entry_types', [contact_type])
            .neq('status', 'archived').limit(1).execute()).data
    return rows[0] if rows else None


def _funnel_by_key(db, key: str) -> Optional[Dict[str, Any]]:
    rows = (db.table('crm_funnels').select('*')
            .eq('key', key).neq('status', 'archived').limit(1).execute()).data
    return rows[0] if rows else None


def _enter_funnel(db, lead: Dict[str, Any], funnel: Dict[str, Any],
                  source: str) -> Optional[str]:
    """Put a lead into a funnel, honoring the entry gates. Returns the funnel
    name when the lead entered AND the funnel is live (an automated sequence
    genuinely follows), else None.

    Gates, in order:
      - suppressed / not-active lead -> never
      - any ACTIVE membership -> first funnel wins (one funnel per lead;
        the partial unique index backstops races)
      - any PRIOR membership in THIS funnel -> no repeats of a sequence
    A lead whose old membership completed/exited may enter a DIFFERENT funnel
    from a new form; that is the whole re-entry rule.
    """
    if lead.get('status') != 'active':
        return None
    if is_suppressed(lead['email']):
        return None
    memberships = (db.table('crm_funnel_memberships').select('id, funnel_id, status')
                   .eq('lead_id', lead['id']).execute()).data or []
    if any(m['status'] == 'active' for m in memberships):
        logger.info('CRM lead already in a funnel; skipping entry (one funnel per lead)')
        return None
    if any(m['funnel_id'] == funnel['id'] for m in memberships):
        logger.info('CRM lead already ran this funnel; skipping re-entry')
        return None
    try:
        db.table('crm_funnel_memberships').insert({
            'lead_id': lead['id'], 'funnel_id': funnel['id'],
        }).execute()
    except APIError as e:
        # 23505 = lost the one-active-membership race; treat as "already in one".
        logger.info(f'CRM funnel entry skipped (concurrent membership): {e}')
        return None
    _record_event(db, lead['id'], 'entered_funnel',
                  {'funnel_key': funnel['key'], 'funnel_name': funnel['name'],
                   'source': source})
    logger.info(f"CRM lead entered funnel {funnel['key']}")
    return funnel['name'] if funnel.get('status') == 'active' else None


def sync_lead(email, contact_type, name=None, phone=None):
    """Record a marketing-form lead and route it into the funnel whose
    entry_types claims this contact_type (sales/academy/philosophy map to no
    funnel by design — B2B stays personal follow-up).

    Returns the funnel name when an automated sequence now follows, or None
    (no funnel for the type, entry skipped, funnel paused, or a failure)."""
    try:
        db = _db()
        first, last = _split_name(name)
        lead = _upsert_lead(
            db, email, lead_type=contact_type,
            lead_source='classes_lp' if contact_type == 'claim_free_class' else 'contact_form',
            first_name=first, last_name=last, phone=phone,
        )
        if not lead:
            return None
        _record_event(db, lead['id'], 'form_submitted', {'contact_type': contact_type})
        funnel = _funnel_for_contact_type(db, contact_type)
        if not funnel:
            return None
        return _enter_funnel(db, lead, funnel, source='contact_form')
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM lead sync error: {e}')
        return None


def sync_poe_parent(parent_email, first_name=None, last_name=None):
    """Record a POE signup's parent as a lead. Marketing records parents only;
    student emails must never be synced (all POE signups are minors). No
    funnel today (parity with Brevo's POE Parents list), so returns None."""
    try:
        db = _db()
        lead = _upsert_lead(db, parent_email, lead_type='poe_parent',
                            lead_source='poe_signup',
                            first_name=first_name, last_name=last_name)
        if lead:
            _record_event(db, lead['id'], 'form_submitted', {'contact_type': 'poe_parent'})
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM POE parent sync error: {e}')
    return None


def sync_new_account(email, first_name=None, last_name=None, role=None):
    """An eligible self-signup converted: exit any nurture, then start the
    New Account Welcome onboarding funnel.

    Callers gate eligibility exactly as they did for Brevo (see
    routes/auth/registration.py): student/parent effective role, not under-13.
    Ineligible registrants go through mark_converted instead.

    Returns the onboarding funnel's name when its sequence now follows."""
    try:
        db = _db()
        first, last = (first_name, last_name)
        lead = _upsert_lead(db, email, first_name=first, last_name=last)
        if not lead:
            return None
        _mark_converted_row(db, lead, 'account_signup')
        funnel = _funnel_by_key(db, 'new_account_welcome')
        if not funnel:
            return None
        # Conversion exited the nurture slot, so the onboarding funnel can
        # take it — but _enter_funnel refuses non-active leads, so enter
        # explicitly here with the converted status allowed.
        return _enter_onboarding(db, lead, funnel, source='account_signup')
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM new-account sync error: {e}')
        return None


def _enter_onboarding(db, lead, funnel, source) -> Optional[str]:
    """Funnel entry for already-converted leads (onboarding sequences exist
    BECAUSE of conversion). Same gates as _enter_funnel minus the
    active-status requirement; suppression still wins."""
    if lead.get('status') in ('unsubscribed', 'suppressed'):
        return None
    if is_suppressed(lead['email']):
        return None
    memberships = (db.table('crm_funnel_memberships').select('id, funnel_id, status')
                   .eq('lead_id', lead['id']).execute()).data or []
    if any(m['status'] == 'active' for m in memberships):
        return None
    if any(m['funnel_id'] == funnel['id'] for m in memberships):
        return None
    try:
        db.table('crm_funnel_memberships').insert({
            'lead_id': lead['id'], 'funnel_id': funnel['id'],
        }).execute()
    except APIError:
        return None
    _record_event(db, lead['id'], 'entered_funnel',
                  {'funnel_key': funnel['key'], 'funnel_name': funnel['name'],
                   'source': source})
    return funnel['name'] if funnel.get('status') == 'active' else None


def _is_under_13(email):
    """True when this address belongs to an account we know to be under 13.

    Reads the same two markers the registration paths write:
    `requires_parental_consent` (set at signup when the DOB is under 13) and
    `date_of_birth` itself, so an account created before the flag existed, or
    by a path that only stored the DOB, is still caught.

    Fails CLOSED — an unknown address or a failed lookup returns True. A
    marketing sync is not worth a coin flip: the cost of being wrong the safe
    way is a missed onboarding sequence, and the cost of being wrong the other
    way is a ten-year-old's name and email sitting in a marketing database.
    """
    try:
        from database import get_supabase_admin_client
        # admin client justified: marketing-sync age gate resolves the
        # RECIPIENT's own user row by email; runs in service context.
        db = get_supabase_admin_client()
        rows = (db.table('users')
                .select('requires_parental_consent, date_of_birth')
                .ilike('email', email).limit(1).execute()).data or []
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM age gate: user lookup failed, skipping sync: {e}')
        return True

    if not rows:
        logger.warning('CRM age gate: no account for this address, skipping sync')
        return True

    row = rows[0] or {}
    if row.get('requires_parental_consent'):
        return True

    dob = row.get('date_of_birth')
    if dob:
        try:
            born = date.fromisoformat(str(dob)[:10])
        except ValueError:
            logger.warning('CRM age gate: unparseable date_of_birth, skipping sync')
            return True
        return (date.today() - born).days / 365.25 < 13
    # No DOB on file at all: nothing says this is a child, and blocking every
    # DOB-less account would silence onboarding for most org rosters.
    return False


def sync_course_student(email, first_name=None, last_name=None):
    """A brand-new org-registered course student: converted, then the Course
    Student Onboarding funnel (they never chose Optio, so the sequence teaches
    how it works).

    Under-13 students are skipped entirely: an org admin's enrollment is not
    verifiable parental consent (COPPA), matching the self-signup gates. They
    still get the transactional welcome/invite email, which is the one that
    matters."""
    try:
        if _is_under_13(email):
            logger.info('CRM course-student sync skipped: under-13 or unverifiable age')
            return None
        db = _db()
        lead = _upsert_lead(db, email, first_name=first_name, last_name=last_name)
        if not lead:
            return None
        _mark_converted_row(db, lead, 'account_signup')
        funnel = _funnel_by_key(db, 'course_student_onboarding')
        if not funnel:
            return None
        return _enter_onboarding(db, lead, funnel, source='course_registration')
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM course-student sync error: {e}')
        return None


def _mark_converted_row(db, lead: Dict[str, Any], event: str):
    """Converted-state transition for a lead row we already hold: set status
    (unsubscribed/suppressed stay as they are — conversion doesn't re-open a
    mailbox), stamp the event, and exit any active NURTURE membership.
    Onboarding memberships are untouched: they exist because of conversion."""
    if lead.get('status') == 'active':
        db.table('crm_leads').update({
            'status': 'converted',
            'converted_at': _now_iso(),
            'conversion_event': event,
            'updated_at': _now_iso(),
        }).eq('id', lead['id']).execute()
    memberships = (db.table('crm_funnel_memberships')
                   .select('id, funnel_id, crm_funnels(funnel_type, key)')
                   .eq('lead_id', lead['id']).eq('status', 'active')
                   .execute()).data or []
    for m in memberships:
        funnel = m.get('crm_funnels') or {}
        if funnel.get('funnel_type') == 'onboarding':
            continue
        db.table('crm_funnel_memberships').update({
            'status': 'exited',
            'exit_reason': CONVERSION_EXIT_REASONS.get(event, 'manual'),
            'exited_at': _now_iso(),
        }).eq('id', m['id']).execute()
    _record_event(db, lead['id'], 'converted', {'event': event})
    logger.info(f'CRM lead converted ({event})')


def mark_converted(email, event: str = 'account_signup'):
    """Flag a lead as converted and pull it out of any nurture sequence. A
    missing lead row just means this person was never a marketing lead, which
    is the common case — nothing to do (parity with Brevo's 404 path)."""
    try:
        db = _db()
        rows = (db.table('crm_leads').select('*')
                .eq('email', email.lower().strip()).limit(1).execute()).data
        if not rows:
            return
        _mark_converted_row(db, rows[0], event)
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM conversion sync error: {e}')


def record_class_start(user_id):
    """Conversion hook for 'started a class' (self-serve free class creation
    or any course enrollment): resolve the user's email and convert the
    matching lead, if there is one."""
    try:
        db = _db()
        rows = (db.table('users').select('email')
                .eq('id', user_id).limit(1).execute()).data
        email = (rows[0].get('email') if rows else None)
        if not email:
            return
        mark_converted(email, event='class_start')
    except Exception as e:  # noqa: BLE001
        logger.warning(f'CRM class-start hook error: {e}')
