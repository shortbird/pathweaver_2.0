"""
Parent registration funnel — the branded, multi-step enrollment form any org can
turn on.

Built for iCreate in 2026-06 and named after them for far too long; the funnel
is org-neutral and three orgs run it (iCreate, Optio Academy, Gryffin Learning
Center). The client's name came off the table, the blueprint and the HTTP
surface on 2026-08-25 — see 20260825160000_rename_icreate_registrations_to_registrations.sql.

Driven from the org's parent registration link. Other organizations keep the
standard invitation flow (AcceptInvitationPage); this only activates when the
invitation belongs to an org whose feature_flags.registration.enabled is true
(reads still fall back to the legacy feature_flags.icreate_registration key —
see utils/registration_config.py).

Served at /api/registration/*. /api/icreate/* is a DEPRECATED alias, registered
in routes/__init__.py so a browser mid-registration and the
previously-deployed web build keep working across the deploy; remove it once
neither is in play.

Account-first flow: the parent creates their Optio account (or signs into an
existing one) BEFORE seeing the rest of the form.

    GET  /api/registration/config/<invitation_code>    -> branding + questions + paperwork + fee config
    GET  /api/registration/schedule-preview/<invitation_code> -> open classes + time blocks (staff funnel preview)
    POST /api/registration/start                        -> create parent account, email a 6-digit code
    POST /api/registration/verify                       -> confirm the code -> issues the funnel access_token
    POST /api/registration/resend-code                  -> re-email a fresh code
    POST /api/registration/login                        -> existing Optio account (password) -> attach to the org
    POST /api/registration/attach                       -> existing Optio account (live session) -> attach to the org
    POST /api/registration/registrations/<id>/family    -> phone/address + kids -> creates accounts + household
    POST /api/registration/registrations/<id>/photo     -> required photo for the parent / each kid
    POST /api/registration/registrations/<id>/details   -> emergency contacts + org questions
    POST /api/registration/registrations/<id>/paperwork -> acknowledge/e-sign paperwork
    POST /api/registration/registrations/<id>/fee       -> record fee + email scheduling link -> 'completed'
    POST /api/registration/registrations/<id>/schedule-done    -> legacy (pre-2026-07 funnels): schedule built -> 'appointment'
    POST /api/registration/registrations/<id>/appointment-done -> legacy (pre-2026-07 funnels): booked/deferred -> 'completed'

The funnel ends at the fee step: the final page lists the next steps (book the
Customized Learning Plan appointment + build the schedule) with links, and both
remain reachable afterward (booking link email, Schedule Builder header button).

Security model: the funnel endpoints are public/pre-session (CSRF-exempt). The
funnel access_token is only revealed AFTER the email is verified (new accounts)
or identity is proven (existing accounts); every later step requires it. The OTP
is 6 digits, sha256-hashed at rest, 10-minute expiry, sent via our own SendGrid
email (no dependency on Supabase auth email templates). /attach is the one
session-authenticated endpoint here and is deliberately NOT CSRF-exempt.

Identity proof vs. org attachment are separate concerns (2026-08-25). The funnel
used to verify an existing account by password and nothing else, which silently
excluded every account that HAS no password — Google and Apple signups, plus
org-imported parents, 118 of 906 accounts at the time. A parent who had signed
up with Apple hit a closed loop: "Create account" said her email was taken,
"Sign in" said her password was wrong (naming the wrong provider, at that), and
nothing on the page could get her in. So there are two doors onto one room:

    /login   the password proves who you are   (pre-session)
    /attach  the session proves who you are    (post-OAuth, @require_auth)

Both then run _parent_guardrails + _attach_and_resume, so the two can never
enforce different rules, and a third credential type (passkey, magic link, org
SSO) is a new door rather than a fork of the funnel.

Existing-account guardrails on /login: superadmins are refused; accounts already
in a DIFFERENT organization are refused (we never silently move someone between
orgs); the org's student/observer accounts are refused (this is a parent flow).
Platform accounts are attached as org_managed/parent automatically. Same-org
STAFF (org_admin/advisor) may register their own kids: they keep their staff
role as primary and gain 'parent' in org_roles.

Account model (see memory: project_icreate_program):
- Kids under 13 (or 13+ opted "no email") -> COPPA dependents on the parent.
- Kids 13+ with their own email -> org_managed/student + parent_student_links.
- A kid's email matching an EXISTING Optio student account (platform, or already
  in this org e.g. school-imported) -> that account is ATTACHED to the family
  instead of blocked/duplicated: org fields normalized, parent link + household
  membership created, history kept. Accounts in another org, non-student
  accounts, and accounts linked to a different parent still refuse (409).
- Fee is RECORD-ONLY (Optio never processes payments).
"""

from datetime import datetime

from flask import Blueprint, request, jsonify

from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_auth
from utils.validation import sanitize_input
from utils.registration_config import get_registration_config
from services import academy_enrollment_service as academy_enrollment
# Identity proof and org attachment live in their own module — see its docstring
# for why they are separate from the funnel's step handlers. Aliased to the
# private names this file has always used so every call site reads unchanged.
from services.registration_identity_service import (
    calc_age as _calc_age,
    parse_dob as _parse_dob,
)
from utils.logger import get_logger
# QB-04: the funnel's helpers moved to services/ so the route handlers could be
# split across modules without an import cycle. Aliased to the private names
# this file has always used, so every call site -- and every test that patches
# `routes.registration_funnel._admin` -- reads exactly as before.
from services.registration_funnel_support import (
    _admin,
    _valid_email,
    _load_registration_invite,
    _load_registration,
    _authz,
    _org_stripe_enabled,
    _parent_row,
    _family_directive,
    _apply_prepaid_directive,
)
from services.registration_accounts_service import (
    _insert_user_with_retry,  # noqa: F401 -- patched by tests, called via the service
    _create_org_student,
    _existing_account_for_kid,
    _match_existing_dependent,
    _existing_org_student_by_name_dob,
    _attach_existing_student,
    _create_dependent,
)
# One definition of "a phone number", shared with the SMS verification flow.
from services.phone_verification_service import normalize_phone

logger = get_logger(__name__)

bp = Blueprint('registration', __name__, url_prefix='/api/registration')










def _compute_fee_cents(cfg, num_students):
    """Resolve the registration fee for a family of `num_students` kids.

    fee_mode:
      'flat'         -> registration_fee_cents (per family, ignores count)
      'per_student'  -> per_student_fee_cents * num_students
      'lesser'       -> min(per_student_fee_cents * num_students, registration_fee_cents)
                        i.e. per-student pricing with a per-family cap ("whichever is less")
    Falls back gracefully when one amount is unset.
    """
    family = int(cfg.get('registration_fee_cents') or 0)
    per_student = int(cfg.get('per_student_fee_cents') or 0)
    mode = cfg.get('fee_mode') or 'flat'
    n = max(0, int(num_students or 0))

    if mode == 'per_student':
        return per_student * n
    if mode == 'lesser':
        options = [v for v in (family, per_student * n) if v > 0]
        return min(options) if options else 0
    return family


def _paperwork_resource_urls(admin, org_id):
    """{paperwork_key: url} for org resources linked to registration paperwork.

    A linked org_resource is the single source of truth for that document: the
    funnel serves the resource's url, so updating the resource (new guidebook
    version) updates the registration form too."""
    try:
        rows = (admin.table('org_resources').select('paperwork_key, url')
                .eq('organization_id', org_id).execute()).data or []
        return {r['paperwork_key']: r['url'] for r in rows
                if r.get('paperwork_key') and r.get('url')}
    except Exception as e:  # noqa: BLE001
        logger.warning(f'registration: paperwork resource lookup failed for org {org_id}: {e}')
        return {}


def _public_config(org, cfg, paperwork_urls=None):
    """The subset of config safe to expose to the (unauthenticated) registration page."""
    paperwork_urls = paperwork_urls or {}
    sis_settings = (org.get('feature_flags') or {}).get('sis_settings') or {}

    # Registration paperwork (guidebook, contract) lives in the private
    # `org-documents` bucket. The registration page is unauthenticated, so the
    # family gets a link that expires rather than one that never does — signed
    # in one batched call for the whole paperwork list.
    from utils.storage_urls import sign_stored_urls
    _paperwork = [
        {'key': p.get('key'), 'label': p.get('label'),
         'doc_url': paperwork_urls.get(p.get('key')) or p.get('doc_url') or '',
         'body': p.get('body') or ''}
        for p in (cfg.get('paperwork') or [])
        if p.get('key') and p.get('label')
    ]
    _signed_docs = sign_stored_urls([p['doc_url'] for p in _paperwork if p['doc_url']])
    for _p in _paperwork:
        if _p['doc_url']:
            _p['doc_url'] = _signed_docs.get(_p['doc_url']) or ''

    return {
        # Age bands currently on an enrollment waitlist, so the family step can
        # tell parents a kid will be waitlisted the moment their DOB is entered.
        'enrollment_age_gates': [
            {'min_age': g.get('min_age'), 'max_age': g.get('max_age')}
            for g in (sis_settings.get('enrollment_age_gates') or [])
            if isinstance(g, dict) and g.get('mode') == 'waitlist'
        ],
        'first_day_of_school': sis_settings.get('first_day_of_school'),
        # What the completion email + final page point the family at:
        # 'schedule' (default) = Schedule Builder + CLP appointment (iCreate);
        # 'goals' = the family goals page (/family/goals).
        'post_registration_flow': sis_settings.get('post_registration_flow') or 'schedule',
        'organization': {
            'id': org.get('id'),
            'name': org.get('name'),
            'slug': org.get('slug'),
            'branding_config': org.get('branding_config') or {},
        },
        # Whether the details step collects emergency contacts (default yes;
        # an org with no physical campus can turn it off).
        'emergency_contacts': cfg.get('emergency_contacts') is not False,
        # Whether the family step asks for each child's allergies/medications
        # (default yes; irrelevant for a fully online org).
        'health_fields': cfg.get('health_fields') is not False,
        # Credit partner orgs (a sports club, a music studio) enroll their
        # participants in Optio Academy, so the funnel has to ask the one
        # question a transcript needs and no other funnel asks: which school's
        # registrar receives it. Off by default -- an ordinary microschool
        # registration has no transcript to send anywhere.
        'records_destination': cfg.get('records_destination') is True,
        # Whether finishing this funnel enrolls each registered student in
        # Optio Academy. Independent of the question above: a partner could
        # collect the destination without enrolling, or enroll without asking
        # (a family with no school of record yet).
        'academy_enrollment': cfg.get('academy_enrollment') is True,
        'academy_pathway': cfg.get('academy_pathway') or 'partner_credit',
        'fee_mode': cfg.get('fee_mode') or 'flat',
        'registration_fee_cents': int(cfg.get('registration_fee_cents') or 0),
        'per_student_fee_cents': int(cfg.get('per_student_fee_cents') or 0),
        'payment_url': cfg.get('payment_url') or '',
        # Appointment-booking link — parents receive it after the fee anyway
        # (email + final page); exposing it here lets ?preview=1 render the
        # real final step.
        'scheduling_url': _abs_url(cfg.get('scheduling_url')),
        # Whether verified card payment (the org's own Stripe account) is on.
        # The key itself lives in organization_secrets and is never exposed --
        # only this boolean, which discloses configuration, not a credential.
        'stripe_enabled': _org_stripe_enabled(org.get('id')),
        'paperwork': _paperwork,
        'questions': [
            {'key': q.get('key'), 'label': q.get('label'), 'help': q.get('help') or '',
             'type': q.get('type') or 'select', 'options': q.get('options') or [],
             'required': bool(q.get('required')),
             # per_student questions are asked once per registered kid; their
             # answer is an object keyed by kid user_id instead of a single value.
             'per_student': bool(q.get('per_student'))}
            for q in (cfg.get('questions') or [])
            if q.get('key') and q.get('label')
        ],
    }































# Blocks P4: the shared funnel-completion half lives in
# services/registration_funnel_service.py so the SIS waive-fee route stops
# importing route-to-route. The private names remain as aliases for this
# module's own call sites and tests.
from services.registration_funnel_service import (  # noqa: E402
    _abs_url,
    org_funnel_config as _org_config,
)








def _existing_household_for_parent(admin, org_id, parent_id):
    """The parent's existing SIS household in this org, if any: one they already
    guard (school import, staff-created, or a prior registration) or are the
    primary contact of. The family step reuses it instead of inserting a second
    '<Last> Family', so a returning parent — e.g. a teacher registering a kid who
    already has an account — never spawns a duplicate household."""
    try:
        gm = (admin.table('household_members').select('household_id')
              .eq('user_id', parent_id).eq('relationship', 'guardian').execute()).data or []
        hh_ids = [m['household_id'] for m in gm]
        if hh_ids:
            rows = (admin.table('households').select('id, organization_id')
                    .in_('id', hh_ids).execute()).data or []
            for h in rows:
                if h.get('organization_id') == org_id:
                    return h['id']
        rows = (admin.table('households').select('id')
                .eq('organization_id', org_id)
                .eq('primary_contact_user_id', parent_id).limit(1).execute()).data or []
        return rows[0]['id'] if rows else None
    except Exception as e:  # noqa: BLE001
        logger.warning(f'registration: existing-household lookup failed for parent {parent_id[:8]}: {e}')
        return None





@bp.route('/config/<invitation_code>', methods=['GET'])
@rate_limit(max_requests=60, window_seconds=60)
def get_config(invitation_code):
    """Public: branding + questions + paperwork + fee config for the registration page."""
    data, err = _load_registration_invite(invitation_code)
    if err:
        return err
    org = data['organization']
    paperwork_urls = _paperwork_resource_urls(_admin(), org['id'])
    return jsonify({'success': True, **_public_config(org, data['config'], paperwork_urls)}), 200


@bp.route('/schedule-preview/<invitation_code>', methods=['GET'])
@rate_limit(max_requests=60, window_seconds=60)
def schedule_preview(invitation_code):
    """Public: the org's open-class catalog + time blocks so the ?preview=1
    walkthrough can show the Schedule Builder exactly as a parent sees it.
    Exposes nothing a family with the registration link wouldn't get anyway."""
    data, err = _load_registration_invite(invitation_code)
    if err:
        return err
    from services import sis_parent_service
    org = data['organization']
    return jsonify({
        'success': True,
        'organization_name': org.get('name'),
        'scheduling_url': _abs_url(data['config'].get('scheduling_url')),
        **sis_parent_service.schedule_preview(org['id']),
    }), 200


@bp.route('/my-registration', methods=['GET'])
@require_auth
def my_registration(user_id):
    """Authenticated resume: the caller's own incomplete registration
    (plus the org's funnel config), so the register page can pick up where they
    left off after logging back in. Returns {registration: null} when there is
    nothing to resume — including for users who never used this funnel."""
    admin = _admin()
    rows = (
        admin.table('registrations')
        .select('*')
        .eq('parent_user_id', user_id)
        .order('created_at', desc=True)
        .limit(1)
        .execute()
    ).data or []
    reg = rows[0] if rows else None
    # Legacy in-flight rows from when schedule/appointment were funnel steps:
    # the funnel now ends at the fee step, so settle these as completed.
    if reg and reg.get('status') in ('schedule', 'appointment'):
        now = datetime.utcnow().isoformat()
        admin.table('registrations').update({
            'status': 'completed', 'completed_at': now, 'updated_at': now,
        }).eq('id', reg['id']).execute()
        reg['status'] = 'completed'
    if not reg or reg.get('status') == 'completed':
        return jsonify({'success': True, 'registration': None}), 200

    # A prepaid directive staged after the fee was computed zeroes it on resume,
    # so the fee step renders the no-payment finish instead of demanding a card.
    reg = _apply_prepaid_directive(admin, reg)

    # A logged-in session proves account ownership, so a registration still
    # waiting on the email code can skip straight to the family step.
    if reg.get('status') == 'verify':
        now = datetime.utcnow().isoformat()
        try:
            admin.auth.admin.update_user_by_id(user_id, {'email_confirm': True})
        except Exception as e:  # noqa: BLE001
            logger.warning(f'registration resume: auth email-confirm failed for {user_id[:8]}: {e}')
        admin.table('registrations').update({
            'email_verified_at': now, 'otp_hash': None, 'otp_expires_at': None,
            'status': 'family', 'updated_at': now,
        }).eq('id', reg['id']).execute()
        reg['status'] = 'family'

    org = (
        admin.table('organizations')
        .select('id, name, slug, branding_config, feature_flags')
        .eq('id', reg['organization_id']).single().execute()
    ).data or {}
    cfg = get_registration_config(org.get('feature_flags'))

    # Household address/phone (for prefilling the family step on back-edit).
    hh_rows = (admin.table('households')
               .select('phone, address_line1, address_line2, city, state, postal_code')
               .eq('organization_id', reg['organization_id'])
               .eq('primary_contact_user_id', user_id).limit(1).execute()).data or []
    household = hh_rows[0] if hh_rows else None

    # Current photos, so the family step can show what's already uploaded.
    kids = reg.get('kids') or []
    member_ids = [k['user_id'] for k in kids if k.get('user_id')] + [user_id]
    avatar_by_id = {}
    try:
        rows = (admin.table('users').select('id, avatar_url')
                .in_('id', member_ids).execute()).data or []
        avatar_by_id = {r['id']: r.get('avatar_url') for r in rows}
        # Family photos live in a private bucket. Sign the whole set in one
        # batched call rather than once per household member.
        from utils.storage_urls import sign_stored_urls
        signed = sign_stored_urls(avatar_by_id.values())
        avatar_by_id = {
            uid: (signed.get(url) if url else None)
            for uid, url in avatar_by_id.items()
        }
    except Exception as e:  # noqa: BLE001
        logger.warning(f'registration resume: avatar lookup failed: {e}')

    return jsonify({
        'success': True,
        'registration': {
            'registration_id': reg['id'],
            'access_token': reg['access_token'],
            'status': reg['status'],
            'kids': [{**k, 'avatar_url': avatar_by_id.get(k.get('user_id'))} for k in kids],
            'parent_avatar_url': avatar_by_id.get(user_id),
            'fee_cents': reg.get('fee_cents'),
            'fee_deferred': bool(reg.get('fee_deferred')),
            'answers': reg.get('answers') or {},
            'emergency_contacts': reg.get('emergency_contacts') or [],
            'paperwork': reg.get('paperwork') or [],
            # Already-answered records destinations, keyed by student, so
            # back-editing that step shows what the family entered instead of
            # an empty form they have to fill in twice.
            'records_destinations': academy_enrollment.destinations_for_kids(kids, client=admin),
            'household': household,
            'scheduling_url': _abs_url(cfg.get('scheduling_url')),
            'scheduling_emailed': bool(reg.get('scheduling_emailed_at')),
        },
        **_public_config(org, cfg, _paperwork_resource_urls(admin, reg['organization_id'])),
    }), 200












@bp.route('/registrations/<reg_id>/family', methods=['POST'])
@rate_limit(max_requests=20, window_seconds=300)
def submit_family(reg_id):
    """Phone/address + kids: creates the kid accounts, parent-student links, and
    the SIS household. Requires the post-verification access_token."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403
    if reg.get('status') not in ('family', 'details', 'paperwork', 'fee'):
        return jsonify({'error': 'This registration is already completed'}), 400

    admin = _admin()
    org_id = reg['organization_id']
    prior_entries = [k for k in (reg.get('kids') or []) if k.get('user_id')]
    prior_kids = [k['user_id'] for k in prior_entries]
    # Only accounts THIS funnel created may be deleted on back-edit; attached
    # pre-existing accounts are detached, never destroyed.
    prior_created_ids = [k['user_id'] for k in prior_entries if k.get('type') != 'existing']
    prior_existing = [k for k in prior_entries if k.get('type') == 'existing']
    cfg = _org_config(admin, org_id)
    parent_id = reg['parent_user_id']
    parent = _parent_row(admin, parent_id)
    last = parent.get('last_name') or 'New'

    phone = sanitize_input(body.get('phone', ''))
    address = {k: sanitize_input(body.get(k, '')) for k in
               ('address_line1', 'address_line2', 'city', 'state', 'postal_code')}
    if not phone:
        return jsonify({'error': 'A phone number is required'}), 400
    if not address['address_line1'] or not address['city'] or not address['state'] or not address['postal_code']:
        return jsonify({'error': 'Street address, city, state, and ZIP are required'}), 400

    # The number also belongs on the parent's own record: the People page and
    # staff exports read users.phone_number, and writing only households.phone
    # left every funnel-registered parent looking phoneless there (iCreate,
    # 2026-08-28: "Are we still not capturing phone numbers?"). Fill, never
    # clobber — staff may have typed a corrected number by hand.
    #
    # Stored in E.164, matching the SMS verification flow that prefills from
    # this column. Unlike the staff profile, an unparseable number is kept as
    # typed rather than refused: this is a public funnel, and turning a family
    # away at enrollment over phone formatting is worse than a number a human
    # still has to read.
    try:
        if phone and not (parent.get('phone_number') or '').strip():
            stored = normalize_phone(phone) or phone
            if stored != phone:
                logger.info(f'Registration phone normalized for parent {parent_id[:8]}')
            admin.table('users').update({'phone_number': stored}).eq('id', parent_id).execute()
    except Exception as e:  # noqa: BLE001 — registration must not fail over this
        logger.warning(f'Could not copy registration phone to parent {parent_id}: {e}')

    # Validate kids up front so we don't create half the family on bad input.
    raw_kids = body.get('kids') or []
    if not raw_kids:
        return jsonify({'error': 'Add at least one child'}), 400
    kids = []
    for i, k in enumerate(raw_kids):
        kf = sanitize_input(k.get('first_name', ''))
        kl = sanitize_input(k.get('last_name', ''))
        kdob = _parse_dob(k.get('date_of_birth'))
        kemail = (k.get('email') or '').strip().lower()
        as_dependent = bool(k.get('as_dependent'))
        allergies = sanitize_input(k.get('allergies', ''))
        medications = sanitize_input(k.get('medications', ''))
        gender = sanitize_input(k.get('gender', ''))
        if not kf or not kl:
            return jsonify({'error': f'Child #{i + 1} needs a first and last name'}), 400
        if not kdob:
            return jsonify({'error': f'Child #{i + 1} needs a valid date of birth'}), 400
        if not gender:
            return jsonify({'error': f'Please select a gender for {kf}'}), 400
        age = _calc_age(kdob)
        wants_own_account = age >= 13 and not as_dependent

        # A provided email may belong to an existing Optio account. If it's an
        # attachable student account, connect it to this family instead of
        # blocking (or silently duplicating the kid as a dependent).
        existing_user = None
        if kemail and _valid_email(kemail):
            candidate, why = _existing_account_for_kid(admin, org_id, parent_id, kemail)
            # On back-edit, the same teen's prior funnel-created account holds
            # this email — that's not a conflict (it is replaced below).
            if candidate and candidate['id'] in prior_created_ids:
                candidate = None
            if candidate:
                existing_user = candidate
            elif why and wants_own_account:
                if why == 'is_parent':
                    return jsonify({'error': f"That's your own email address. {kf} needs their own "
                                             f'email to have a login — or leave the email blank and '
                                             f'mark {kf} as managed by you (no email needed).'}), 409
                if why == 'other_org':
                    return jsonify({'error': f"{kf}'s Optio account belongs to another school. "
                                             'Please contact the school.'}), 409
                return jsonify({'error': f'{kf} already has an Optio account with this email that '
                                         "we can't connect automatically. Please contact the school."}), 409
        # Re-registration guard: even with no matching email, this kid may
        # already have a pre-existing org account (e.g. a school-imported roster
        # account). Match by name + DOB and attach it instead of creating a
        # duplicate. Scoped to the managed/dependent path — 13+ own-account teens
        # are matched by their email above — and requires an exact DOB match so a
        # different same-name student is never claimed.
        if not existing_user and not wants_own_account:
            nd = _existing_org_student_by_name_dob(admin, org_id, parent_id, kf, kl, kdob)
            if nd and nd['id'] not in prior_created_ids:
                existing_user = nd
        if wants_own_account and not existing_user and not _valid_email(kemail):
            return jsonify({'error': f'{kf} is 13+, so they need a valid email (or mark them as managed by you)'}), 400
        # A photo the browser staged before this kid's account existed (see the
        # 'staged' branch of upload_photo). Only URLs from THIS registration's
        # staged folder are trusted; anything else is dropped.
        photo_url = (k.get('photo_url') or '').strip()
        # The client is handed BOTH a canonical photo_url and its signed twin
        # (display_url); reduce whatever comes back to the canonical pointer so
        # an expiring URL can never land in users.avatar_url.
        if photo_url:
            from utils.storage_urls import parse_object_ref, public_object_url
            _ref = parse_object_ref(photo_url)
            if _ref:
                photo_url = public_object_url(*_ref)
        if photo_url and f'/user-photos/staged/{reg_id}/' not in photo_url:
            photo_url = ''
        kids.append({'first': kf, 'last': kl, 'dob': kdob, 'email': kemail,
                     'own_account': wants_own_account, 'existing_user': existing_user,
                     'preferred_name': sanitize_input(k.get('preferred_name', '')) or None,
                     'gender': gender, 'allergies': allergies, 'medications': medications,
                     'photo_url': photo_url or None})

    # Back-editing: this step ran before, so tear down what it created (kid
    # accounts, links, contacts, household) and rebuild from the new payload.
    # Runs only AFTER validation so bad input never leaves a half-deleted family.
    # Safe mid-funnel: the accounts were created moments ago and have no activity.
    # Photos survive the rebuild: the storage file isn't deleted with the account,
    # so an unchanged kid (same name + DOB) gets their avatar_url carried over.
    prior_avatars = {}
    if prior_kids:
        try:
            rows = (admin.table('users')
                    .select('id, first_name, last_name, date_of_birth, avatar_url')
                    .in_('id', prior_kids).execute()).data or []
            prior_avatars = {
                (r.get('first_name'), r.get('last_name'), str(r.get('date_of_birth') or '')[:10]): r['avatar_url']
                for r in rows if r.get('avatar_url')
            }
        except Exception as e:  # noqa: BLE001
            logger.warning(f'registration family re-edit: avatar carry-over lookup failed: {e}')
    if prior_kids:
        try:
            from services import sis_enrollment_waitlist_service as enrollment_waitlist
            enrollment_waitlist.remove_for_students(org_id, prior_kids)
            admin.table('emergency_contacts').delete().in_('student_user_id', prior_kids).execute()
            admin.table('parent_student_links').delete().in_('student_user_id', prior_kids).execute()
            # Drop only the prior kids' household memberships (so kids removed on a
            # back-edit fall off); the household row itself is preserved and reused
            # below, so a pre-existing / school-imported family is never churned or
            # duplicated. The parent's own guardian membership is untouched.
            admin.table('household_members').delete().in_('user_id', prior_kids).execute()
            if prior_created_ids:
                admin.table('users').delete().in_('id', prior_created_ids).execute()
            for kid_id in prior_created_ids:
                try:
                    admin.auth.admin.delete_user(kid_id)
                except Exception as e:  # noqa: BLE001
                    logger.warning(f'registration family re-edit: auth cleanup failed for {kid_id[:8]}: {e}')
            # Attached pre-existing accounts are never deleted. Accounts that were
            # platform students before this funnel attached them revert to that
            # state; if the kid is still in the new payload they re-attach below.
            for entry in prior_existing:
                if entry.get('was_platform'):
                    admin.table('users').update({
                        'organization_id': None, 'role': 'student',
                        'org_role': None, 'org_roles': None,
                    }).eq('id', entry['user_id']).execute()
        except Exception as e:  # noqa: BLE001
            logger.error(f'registration family re-edit: teardown failed for {reg_id}: {e}')
            return jsonify({'error': 'Could not update your family. Please contact the school.'}), 500

    # A parent who already had an Optio account may already have these kids as
    # COPPA dependents. Reuse those accounts instead of creating duplicates.
    # Fetched AFTER teardown so a back-edit's just-deleted funnel dependents
    # can't match. Scoped to this parent's own dependents — no takeover risk.
    existing_dependents = (
        admin.table('users')
        .select('id, first_name, last_name, date_of_birth, display_name, organization_id')
        .eq('managed_by_parent_id', parent_id).eq('is_dependent', True).execute()
    ).data or []
    existing_dependents = [d for d in existing_dependents if d['id'] not in prior_created_ids]

    created_kids = []
    student_ids = []
    for k in kids:
        try:
            was_platform = False
            if k.get('existing_user'):
                # Connect the kid's existing Optio account instead of creating a
                # duplicate — after this it looks exactly like a funnel-created
                # student (org fields, parent link, household member below).
                was_platform = not k['existing_user'].get('organization_id')
                # On re-edit the lookup ran before teardown (account still looked
                # org-attached from the first pass) — the prior snapshot knows
                # whether they originally came from the platform.
                prior = next((p for p in prior_existing
                              if p['user_id'] == k['existing_user']['id']), None)
                if prior is not None:
                    was_platform = bool(prior.get('was_platform'))
                kid_id = _attach_existing_student(admin, org_id, k['existing_user'],
                                                 k['first'], k['last'], k['dob'])
                student_ids.append(kid_id)
                ktype = 'existing'
            elif k['own_account']:
                kid_id = _create_org_student(admin, org_id, k['email'], k['first'], k['last'], k['dob'])
                student_ids.append(kid_id)
                ktype = 'student'
            else:
                dep = _match_existing_dependent(existing_dependents, k['first'], k['last'], k['dob'])
                if dep:
                    # The parent's pre-existing dependent — attach to the org
                    # (dependents keep role='student'); history stays intact.
                    existing_dependents.remove(dep)  # twins: never match twice
                    was_platform = not dep.get('organization_id')
                    prior = next((p for p in prior_existing if p['user_id'] == dep['id']), None)
                    if prior is not None:
                        was_platform = bool(prior.get('was_platform'))
                    updates = {'organization_id': org_id, 'date_of_birth': str(k['dob'])}
                    if not dep.get('display_name'):
                        updates['display_name'] = f"{k['first']} {k['last']}".strip()
                    admin.table('users').update(updates).eq('id', dep['id']).execute()
                    kid_id = dep['id']
                    ktype = 'existing'
                else:
                    kid_id = _create_dependent(admin, parent_id, org_id, k['first'], k['last'], k['dob'])
                    ktype = 'dependent'
            extras = {f: k[f] for f in ('preferred_name', 'gender', 'allergies', 'medications') if k.get(f)}
            carried = prior_avatars.get((k['first'], k['last'], str(k['dob'])))
            if carried and ktype != 'existing':
                extras['avatar_url'] = carried
            # A photo staged during THIS session beats a carried-over one.
            if k.get('photo_url'):
                extras['avatar_url'] = k['photo_url']
            if extras:
                admin.table('users').update(extras).eq('id', kid_id).execute()
            created_kids.append({
                'user_id': kid_id, 'name': f"{k['first']} {k['last']}".strip(),
                'first_name': k['first'], 'last_name': k['last'],
                'dob': str(k['dob']), 'type': ktype, 'was_platform': was_platform,
                'email': k['email'] if (k['own_account'] or ktype == 'existing') else None,
                'preferred_name': k.get('preferred_name'), 'gender': k.get('gender'),
                'allergies': k.get('allergies'), 'medications': k.get('medications'),
            })
        except Exception as e:  # noqa: BLE001
            logger.error(f"registration family: kid creation failed for {k['first']}: {e}")

    if student_ids:
        try:
            from routes.admin.user_invitations import _create_parent_student_links
            _create_parent_student_links(admin, parent_id, student_ids, org_id)
        except Exception as e:  # noqa: BLE001
            logger.error(f'registration family: parent-student linking failed: {e}')

    # Settings the school staged for this family before they re-registered
    # (legacy-form import): prepaid fee, registration hold, priority tier.
    directive = _family_directive(admin, org_id, parent.get('email'))

    # Group the family into a SIS household so address/phone land where staff
    # already look (Families page). Best-effort: registration succeeds without it.
    household_id = None
    try:
        hh_fields = {
            'organization_id': org_id,
            'name': f'{last} Family',
            'primary_contact_user_id': parent_id,
            'address_line1': address['address_line1'] or None,
            'address_line2': address['address_line2'] or None,
            'city': address['city'] or None,
            'state': address['state'] or None,
            'postal_code': address['postal_code'] or None,
            'phone': phone or None,
            'registration_hold': bool(directive and directive.get('registration_hold')),
            'registration_hold_reason': (directive or {}).get('hold_reason'),
        }
        # UFA Private School: set from the family's answers (an explicit
        # `ufa_private` yes/no question, or a payment option naming "private
        # school"). Only ever turned ON here so it never clobbers a staff toggle.
        if _answers_signal_ufa_private(reg.get('answers') or {}):
            hh_fields['ufa_private'] = True
        # Reuse the parent's existing household instead of inserting a duplicate
        # '<Last> Family' next to a school-imported / prior one.
        household_id = _existing_household_for_parent(admin, org_id, parent_id)
        if household_id:
            # Keep any staff-set family name; fill the rest from this submission.
            admin.table('households').update(
                {k: v for k, v in hh_fields.items() if k not in ('name', 'organization_id')}
            ).eq('id', household_id).execute()
        else:
            household_id = admin.table('households').insert(hh_fields).execute().data[0]['id']
        members = [{'household_id': household_id, 'user_id': parent_id,
                    'relationship': 'guardian', 'is_primary_guardian': True}]
        members += [{'household_id': household_id, 'user_id': ck['user_id'],
                     'relationship': 'student', 'is_primary_guardian': False}
                    for ck in created_kids]
        # Upsert so reusing a household never collides on an existing membership.
        admin.table('household_members').upsert(
            members, on_conflict='household_id,user_id').execute()
        if directive:
            admin.table('sis_family_directives').update({
                'matched_household_id': household_id,
                'updated_at': datetime.utcnow().isoformat(),
            }).eq('id', directive['id']).execute()
    except Exception as e:  # noqa: BLE001
        logger.error(f'registration family: household creation failed: {e}')

    # Enrollment age gates: kids whose age falls in a waitlisted band join the
    # enrollment waitlist — they finish registering but can't select classes
    # until the school releases them.
    try:
        from services import sis_enrollment_waitlist_service as enrollment_waitlist
        gates = enrollment_waitlist.gates_for_org(org_id)
        for ck in created_kids:
            gate = enrollment_waitlist.matching_gate(org_id, ck.get('dob'), gates) if gates else None
            ck['waitlisted'] = bool(gate)
            if gate:
                enrollment_waitlist.add_waiting(
                    org_id, ck['user_id'], guardian_user_id=parent_id,
                    household_id=household_id, gate=gate)
    except Exception as e:  # noqa: BLE001
        logger.error(f'registration family: enrollment-waitlist gating failed for {reg_id}: {e}')
        for ck in created_kids:
            ck.setdefault('waitlisted', False)

    # Fee is per-family, computed from the number of kids registering. Stored so
    # later steps are stable even if an admin edits the config mid-funnel.
    # Families who already paid on the school's legacy form owe nothing.
    # The fee is paid UP FRONT even for waitlisted kids — it holds their place in
    # line and is fully refunded if they aren't accepted (see the reject flow).
    # So we no longer defer to first release; every new registration pays now.
    # (Legacy fee_deferred=True registrations still reopen on release.)
    fee_cents = 0 if (directive and directive.get('fee_prepaid')) \
        else _compute_fee_cents(cfg, len(created_kids))
    fee_deferred = False
    admin.table('registrations').update({
        'kids': created_kids, 'fee_cents': fee_cents, 'fee_deferred': fee_deferred,
        'status': 'details', 'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg_id).execute()

    logger.info(f'registration family: registration {reg_id} has {len(created_kids)} kids, '
                f'fee {fee_cents}c{" (deferred)" if fee_deferred else ""}')
    return jsonify({'success': True, 'status': 'details', 'kids': created_kids,
                    'fee_cents': fee_cents, 'fee_deferred': fee_deferred}), 200


def _clean_answer(q, val):
    """Sanitize one answer value (string, or list of strings for 'multi')."""
    if q.get('type') == 'multi':
        return [sanitize_input(str(v)) for v in (val or []) if str(v).strip()]
    return sanitize_input(str(val or '').strip())


def _answers_signal_ufa_private(answers):
    """True when a family's registration answers indicate they're enrolling as a
    UFA (Utah Fits All) Private School. Recognizes either an explicit yes/no
    question keyed `ufa_private`, or a payment option whose text names a "private
    school" — so the org can surface it either way in their registration config."""
    if not isinstance(answers, dict):
        return False
    v = answers.get('ufa_private')
    if isinstance(v, bool) and v:
        return True
    if isinstance(v, str) and v.strip().lower() in ('yes', 'true', '1', 'private', 'private school'):
        return True
    pi = answers.get('payment_intent')
    vals = pi if isinstance(pi, list) else [pi]
    return any('private school' in str(x).lower() for x in vals if x)


def _validate_answers(questions, raw_answers, reg_kids):
    """Validate + sanitize the org-question answers.

    Family-level questions store a single value (string, or list for 'multi').
    per_student questions expect answers[key] = {kid_user_id: value} and are
    validated per kid: every kid on the registration must answer a required
    one. Only the registration's own kids are kept (junk keys are dropped).
    Returns (answers, None) on success or (None, error_message) on failure.
    """
    answers = {}
    for q in questions:
        if q.get('per_student'):
            raw = raw_answers.get(q['key'])
            raw = raw if isinstance(raw, dict) else {}
            per_kid = {}
            for kid in reg_kids:
                val = _clean_answer(q, raw.get(kid['user_id']))
                if q.get('required') and not val:
                    who = kid.get('first_name') or kid.get('name') or 'each child'
                    return None, f"Please answer for {who}: {q['label']}"
                per_kid[kid['user_id']] = val
            answers[q['key']] = per_kid
        else:
            val = _clean_answer(q, raw_answers.get(q['key']))
            if q.get('required') and not val:
                return None, f"Please answer: {q['label']}"
            answers[q['key']] = val
    return answers, None


@bp.route('/registrations/<reg_id>/details', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def submit_details(reg_id):
    """Save emergency contacts and the org's registration
    questions (special needs, payment intent, media consent, ...)."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    admin = _admin()
    cfg = _org_config(admin, reg['organization_id'])

    # Validate answers against the configured questions.
    questions = [q for q in (cfg.get('questions') or []) if q.get('key') and q.get('label')]
    reg_kids = [k for k in (reg.get('kids') or []) if k.get('user_id')]
    answers, ans_err = _validate_answers(questions, body.get('answers') or {}, reg_kids)
    if ans_err:
        return jsonify({'error': ans_err}), 400

    # Built-in UFA Private School follow-up: shown in the funnel only when the
    # family chose "Utah Fits All" as their payment. It isn't an org-configured
    # question, so preserve it here (validate_answers would otherwise drop it).
    raw_answers = body.get('answers') or {}
    ufa_val = str(raw_answers.get('ufa_private') or '').strip().lower()
    pi = answers.get('payment_intent')
    pi_vals = pi if isinstance(pi, list) else [pi]
    if any('utah fits all' in str(x).lower() for x in pi_vals if x) and ufa_val in ('yes', 'no'):
        answers['ufa_private'] = 'Yes' if ufa_val == 'yes' else 'No'

    # Validate + store emergency contacts (snapshot on the registration, and real
    # emergency_contacts rows per kid so staff see them in the SIS immediately).
    raw_contacts = body.get('emergency_contacts') or []
    contacts = []
    for i, c in enumerate(raw_contacts):
        name = sanitize_input(c.get('name', ''))
        rel = sanitize_input(c.get('relationship', ''))
        cphone = sanitize_input(c.get('phone', ''))
        if not name or not cphone:
            return jsonify({'error': f'Emergency contact #{i + 1} needs a name and phone number'}), 400
        contacts.append({
            'name': name, 'relationship': rel or None, 'phone': cphone,
            'email': sanitize_input(c.get('email', '')) or None,
        })
    # An org can opt out of collecting emergency contacts entirely
    # (registration config `emergency_contacts: false`, e.g. Optio Academy —
    # a virtual program with no campus to contact anyone from).
    if not contacts and cfg.get('emergency_contacts') is not False:
        return jsonify({'error': 'Please add at least one emergency contact'}), 400

    kid_ids = [k.get('user_id') for k in (reg.get('kids') or []) if k.get('user_id')]
    # Re-submittable (back-editing): replace the contacts this funnel created.
    if kid_ids:
        try:
            admin.table('emergency_contacts').delete().in_('student_user_id', kid_ids).execute()
        except Exception as e:  # noqa: BLE001
            logger.warning(f'registration details: contact cleanup failed: {e}')
    for kid_id in kid_ids:
        for pri, c in enumerate(contacts, start=1):
            try:
                admin.table('emergency_contacts').insert({
                    'student_user_id': kid_id,
                    'organization_id': reg['organization_id'],
                    'name': c['name'], 'relationship': c['relationship'],
                    'phone': c['phone'], 'email': c['email'],
                    'priority': pri,
                }).execute()
            except Exception as e:  # noqa: BLE001
                logger.error(f'registration details: contact insert failed for kid {kid_id[:8]}: {e}')

    # Credit partner funnels ask where the transcript goes before paperwork;
    # everyone else goes straight to paperwork as before.
    next_status = 'records' if cfg.get('records_destination') is True else 'paperwork'

    admin.table('registrations').update({
        'answers': answers, 'emergency_contacts': contacts,
        'status': next_status, 'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg_id).execute()

    _sync_household_payment(admin, reg, answers)

    return jsonify({'success': True, 'status': next_status}), 200


def _sync_household_payment(admin, reg, answers):
    """Record on the family what they just told us about paying.

    The household is created a step earlier, before any of this is known, and
    nothing used to come back to fill it in — which is why every iCreate family
    reached the office with a blank funding source while their answer sat in the
    registration row. Only ever fills a BLANK field: a staff decision on the
    Families page outranks a form answer, and re-submitting the step must not
    undo it.
    """
    from services import sis_payment_profile as payment_profile
    try:
        household_id = _existing_household_for_parent(
            admin, reg['organization_id'], reg['parent_user_id'])
        if not household_id:
            return
        row = (admin.table('households')
               .select('funding_source, payment_plan_preference')
               .eq('id', household_id).limit(1).execute()).data
        current = row[0] if row else {}
        fields = {}
        if not current.get('funding_source'):
            derived = payment_profile.derive_funding_source(answers)
            if derived:
                fields['funding_source'] = derived
                # Mirror the legacy boolean the learning-day feature gates on,
                # exactly as the Families-page PATCH does.
                fields['ufa_private'] = (derived == 'ufa_private')
                if derived == 'ufa_private':
                    fields['enrolled_private_school'] = True
        if not current.get('payment_plan_preference'):
            plan = payment_profile.read_answers(answers).get('plan')
            if plan:
                fields['payment_plan_preference'] = plan
        if fields:
            admin.table('households').update(fields).eq('id', household_id).execute()
            logger.info(f'registration details: household {household_id[:8]} payment fields '
                        f'set from registration answers ({", ".join(sorted(fields))})')
    except Exception as e:  # noqa: BLE001 — never fail a registration over this
        logger.warning(f'registration details: household payment sync failed for {reg["id"]}: {e}')


@bp.route('/registrations/<reg_id>/records', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def submit_records_destination(reg_id):
    """Save where each registered student's transcript should be sent.

    Only credit partner funnels reach this step (the org's registration config
    sets records_destination). One answer per kid, because siblings routinely
    attend different schools, and the answer is the thing the Transfer to School
    send has always needed and never had: a named school with a registrar who
    can receive an official transcript.

    Body:
        access_token: the funnel token
        destinations: { <kid user_id>: {
            destination_type: 'school' | 'homeschool' | 'optio_only',
            school_name, school_city, school_state, school_district,
            registrar_name, registrar_email, registrar_phone,
            student_id_at_school, auto_send_consent
        } }

    Re-submittable: back-editing this step updates each student's single row.
    """
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    admin = _admin()
    cfg = _org_config(admin, reg['organization_id'])
    if cfg.get('records_destination') is not True:
        return jsonify({'error': 'This registration does not collect school records information.'}), 400

    reg_kids = [k for k in (reg.get('kids') or []) if k.get('user_id')]
    if not reg_kids:
        return jsonify({'error': 'Please add your children before this step.'}), 400

    destinations = body.get('destinations')
    if not isinstance(destinations, dict):
        return jsonify({'error': 'Please answer for each student.'}), 400

    # Validate EVERY student before writing any of them, so a typo on the second
    # child cannot leave the first one saved and the family staring at an error
    # with no idea which half went through.
    validated = []
    for kid in reg_kids:
        payload = destinations.get(kid['user_id'])
        if not isinstance(payload, dict):
            who = kid.get('first_name') or 'your student'
            return jsonify({'error': f'Please tell us where {who}\'s records should go.'}), 400
        fields, err = academy_enrollment.validate_destination(payload)
        if err:
            who = kid.get('first_name') or 'your student'
            return jsonify({'error': f'{who}: {err}'}), 400
        validated.append((kid, payload))

    for kid, payload in validated:
        _, err = academy_enrollment.set_destination(
            kid['user_id'], payload, updated_by=reg.get('parent_user_id'), client=admin)
        if err:
            who = kid.get('first_name') or 'your student'
            return jsonify({'error': f'{who}: {err}'}), 400

    admin.table('registrations').update({
        'status': 'paperwork', 'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg_id).execute()

    logger.info(f'registration records: registration {reg_id} saved destinations '
                f'for {len(validated)} student(s)')
    return jsonify({'success': True, 'status': 'paperwork'}), 200


@bp.route('/registrations/<reg_id>/paperwork', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def submit_paperwork(reg_id):
    """Save the parent's typed-name acknowledgements for the required paperwork items."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    admin = _admin()
    cfg = _org_config(admin, reg['organization_id'])
    required = [p for p in (cfg.get('paperwork') or []) if p.get('key') and p.get('label')]
    submitted = {a.get('key'): (a.get('signed_name') or '').strip()
                 for a in (body.get('acknowledgements') or [])}

    saved = []
    for item in required:
        name = submitted.get(item['key'], '')
        if not name:
            return jsonify({'error': f"Please sign: {item['label']}"}), 400
        saved.append({
            'key': item['key'], 'label': item['label'],
            'signed_name': sanitize_input(name),
            'acknowledged_at': datetime.utcnow().isoformat(),
        })

    admin.table('registrations').update({
        'paperwork': saved, 'status': 'fee', 'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg_id).execute()

    return jsonify({
        'success': True, 'status': 'fee',
        'fee_cents': int(reg.get('fee_cents') or 0),
        'payment_url': cfg.get('payment_url') or '',
    }), 200












@bp.route('/registrations/<reg_id>/schedule-done', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def schedule_done(reg_id):
    """Legacy (pre-2026-07 funnels): the parent finished (or deferred) building
    the class schedule — advance to the appointment step. New funnels complete
    at the fee step and never call this."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403
    if reg.get('status') == 'completed':
        return jsonify({'success': True, 'status': 'completed', 'already': True}), 200
    if reg.get('status') not in ('schedule', 'appointment'):
        return jsonify({'error': 'The schedule step is not open for this registration'}), 400

    now = datetime.utcnow().isoformat()
    _admin().table('registrations').update({
        'schedule_done_at': reg.get('schedule_done_at') or now,
        'status': 'appointment', 'updated_at': now,
    }).eq('id', reg_id).execute()
    return jsonify({'success': True, 'status': 'appointment'}), 200


@bp.route('/registrations/<reg_id>/appointment-done', methods=['POST'])
@rate_limit(max_requests=30, window_seconds=300)
def appointment_done(reg_id):
    """Legacy (pre-2026-07 funnels): the parent booked their customized learning
    plan appointment (booked=true) or chose to book later — either way the
    funnel is complete. New funnels complete at the fee step and never call this."""
    body = request.get_json(silent=True) or {}
    reg = _load_registration(reg_id)
    if not _authz(reg, body.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403
    if reg.get('status') == 'completed':
        return jsonify({'success': True, 'status': 'completed', 'already': True}), 200
    if reg.get('status') not in ('schedule', 'appointment'):
        return jsonify({'error': 'The appointment step is not open for this registration'}), 400

    now = datetime.utcnow().isoformat()
    _admin().table('registrations').update({
        'appointment_confirmed_at': now if body.get('booked') else None,
        'status': 'completed', 'completed_at': now, 'updated_at': now,
    }).eq('id', reg_id).execute()
    return jsonify({'success': True, 'status': 'completed'}), 200


@bp.route('/registrations/<reg_id>/photo', methods=['POST'])
@rate_limit(max_requests=60, window_seconds=300)
def upload_photo(reg_id):
    """Required photo for a family member (the parent or one of this
    registration's kids). Multipart form: file, target_user_id, access_token."""
    reg = _load_registration(reg_id)
    if not _authz(reg, request.form.get('access_token')):
        return jsonify({'error': 'Not authorized'}), 403

    # 'parent' sentinel: the browser never learns the parent's user id.
    # 'staged' sentinel: a kid who doesn't have an account yet (accounts are
    # created at family submit) — the file is stored under the registration and
    # attached when the family step submits (kids[].photo_url).
    target = (request.form.get('target_user_id') or '').strip()
    staged = target == 'staged'
    if target in ('', 'parent'):
        target = reg['parent_user_id']
    if not staged:
        allowed = {reg['parent_user_id']} | {k.get('user_id') for k in (reg.get('kids') or [])}
        if target not in allowed:
            return jsonify({'error': 'This person is not part of your registration'}), 403

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'):
        return jsonify({'error': 'Please upload a photo (JPG, PNG, WEBP, or HEIC)'}), 400
    file.seek(0, 2)
    size = file.tell()
    if size == 0:
        # iOS Safari can hand the page an empty file when the original photo
        # lives in iCloud and couldn't be fetched (Optimize iPhone Storage).
        return jsonify({'error': "That photo didn't come through — please try "
                                 'selecting it again, or take a new photo with the camera.'}), 400
    if size > 5 * 1024 * 1024:
        return jsonify({'error': 'Photos must be under 5MB'}), 400
    file.seek(0)

    admin = _admin()
    from services.user_photo_service import (
        photo_display_url,
        upload_staged_photo,
        upload_user_photo,
    )
    try:
        if staged:
            photo_url = upload_staged_photo(admin, reg_id, file, ext)
        else:
            avatar_url = upload_user_photo(admin, target, file, ext)
    except Exception as e:  # noqa: BLE001
        who = 'staged' if staged else target[:8]
        logger.error(f'registration photo: upload failed for {who}: {e}')
        return jsonify({'error': 'Could not upload the photo. Please try again.'}), 500
    # `user-photos` is private. `photo_url` stays canonical because the family
    # step posts it straight back to be persisted; `display_url` is what the
    # funnel renders as the just-uploaded preview.
    if staged:
        return jsonify({
            'success': True,
            'staged': True,
            'photo_url': photo_url,
            'display_url': photo_display_url(photo_url),
        }), 200
    return jsonify({
        'success': True,
        'user_id': target,
        'avatar_url': photo_display_url(avatar_url),
    }), 200


# The money steps live in their own module (QB-04). They attach to THIS
# blueprint, not one of their own: the funnel's CSRF exemption list is keyed on
# endpoint names like `registration.create_checkout`, so a second blueprint
# would rename them out of it and 403 every parent who reached the payment step
# with a session -- the 2026-07-21 outage, again.
from routes import registration_entry, registration_payments  # noqa: E402
registration_entry.register_routes(bp)
registration_payments.register_routes(bp)
