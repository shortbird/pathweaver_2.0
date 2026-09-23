"""Registration funnel: the money steps.

Split out of routes/registration_funnel.py on 2026-09-03 (QB-04), which was
2,149 lines and carried the last standing exemption from the 1,400-line route
cap.

Checkout, the Stripe redirect back, and the two fee-recording endpoints. Optio
never processes these payments itself: the money moves on the ORGANISATION's
Stripe account, using a key read per-request from organization_secrets, and the
funnel only records what happened.

Two kinds of money go through the same Checkout (services/registration_pricing):
the one-time registration fee (reg.fee_cents) and, for orgs with a monthly
plan, the family's monthly total (reg.monthly_cents) as a Stripe subscription.
A session carrying anything monthly is created in subscription mode, with the
one-time fee -- if there is one -- riding on the first invoice. Verification is
the same either way: Stripe says the session is paid, and its amount_total is
the fee plus the first month. The subscription id is kept on the registration
so staff can find it on the school's Stripe dashboard; Optio does not manage
the subscription after that.

THE ROUTES STAY ON THE SAME BLUEPRINT, attached through `register_routes(bp)`
rather than a blueprint of their own. This is not a style choice. Every funnel
endpoint is CSRF-exempt by ENDPOINT NAME in
middleware/csrf_protection.CSRF_EXEMPT_ENDPOINTS, because a parent mid-funnel
usually IS carrying auth cookies -- the wizard signs them in partway through. A
second blueprint would rename `registration.create_checkout` to
`registration_payments.create_checkout`, the name would fall out of the exempt
set, and every payment step would 403 for exactly the parents furthest along.
That is the 2026-07-21 iCreate outage, which is why two tests now check the
exempt set against the live URL map.
"""

from datetime import datetime

from flask import request, jsonify

from middleware.rate_limiter import rate_limit
from utils.auth.decorators import require_role
from utils.logger import get_logger
from utils.sis_roles import ADMIN_ROLES
from services import sis_service
# One Stripe Checkout factory and one session reader for the whole platform
# (M6): the funnel's sessions carry the same metadata convention as the SIS's.
from services import sis_billing_service as billing
from services.registration_funnel_support import (
    _admin,
    _valid_email,
    _load_registration,
    _load_registration_invite,
    _authz,
    _org_stripe_key,
    _org_stripe_enabled,
    _parent_row,
    _apply_prepaid_directive,
    _family_config,
)
from services.registration_funnel_service import (
    _abs_url,
    finish_fee_step as _finish_fee_step,
    org_funnel_config as _org_config,
)
from services.registration_pricing import (
    monthly_plan,
    apply_add_on_selection,
    monthly_total_cents,
    stripe_line_items,
    quote as price_quote,
)

logger = get_logger(__name__)


def _amount_due_cents(reg):
    """What a Checkout for this registration charges today: the one-time fee
    plus the first month of the monthly plan (either may be zero). A deferred
    fee (legacy all-waitlisted family) is not due until the school releases a
    student, which flips fee_deferred back off."""
    fee = 0 if reg.get('fee_deferred') else int(reg.get('fee_cents') or 0)
    return fee + int(reg.get('monthly_cents') or 0)


def _apply_add_ons(admin, reg, cfg, selection):
    """Persist the family's per-student add-on choices and re-price the month.

    Called by every payment-step endpoint that takes a body, so the amount
    Stripe is asked for, the amount /confirm-payment checks, and the amount the
    record-only path stores all come from the same stored selection. A body
    without `add_ons` leaves the stored choice alone (apply_add_on_selection).
    Returns the (possibly updated) registration row."""
    plan = monthly_plan(cfg)
    # No plan (never had one, or the org switched it off mid-funnel): nothing
    # monthly is due, whatever the family step priced back then.
    kids = apply_add_on_selection(plan, reg.get('kids') or [], selection if plan else None)
    monthly_cents = monthly_total_cents(plan, kids) if plan else 0
    if kids == (reg.get('kids') or []) and monthly_cents == int(reg.get('monthly_cents') or 0):
        return reg
    admin.table('registrations').update({
        'kids': kids, 'monthly_cents': monthly_cents,
        'updated_at': datetime.utcnow().isoformat(),
    }).eq('id', reg['id']).execute()
    return {**reg, 'kids': kids, 'monthly_cents': monthly_cents}


def _quote_for(reg, cfg, selection=None, num_students=None):
    """The registration's quote (registration_pricing.quote) from its stored
    fee and kids, with an unsaved add-on selection applied on top when the
    family is still deciding. Nothing is written."""
    plan = monthly_plan(cfg)
    kids = apply_add_on_selection(plan, reg.get('kids') or [], selection if plan else None)
    return price_quote(cfg, kids, num_students=num_students,
                       fee_cents=reg.get('fee_cents'), fee_deferred=bool(reg.get('fee_deferred')))


def _quote_body_kids(body):
    """A hypothetical kids list from a quote request body: [{user_id|id|_key,
    first_name|name, add_ons: [keys]}]. Names are display-only here; the
    keys are validated against the plan by apply_add_on_selection."""
    out = []
    for k in body.get('kids') or []:
        if not isinstance(k, dict):
            continue
        add_ons = k.get('add_ons') if isinstance(k.get('add_ons'), list) else []
        out.append({'user_id': k.get('user_id') or k.get('id') or k.get('_key'),
                    'first_name': str(k.get('first_name') or '')[:80],
                    'preferred_name': str(k.get('preferred_name') or '')[:80],
                    'name': str(k.get('name') or '')[:120],
                    'add_ons': [a for a in add_ons if isinstance(a, str)]})
    return out


def _hypothetical_quote(cfg, body):
    """quote() for a config and a request body that may name a student count
    (the family step, before the kids are saved) and/or sample kids with
    add-on choices (the payment step's live total, the setup preview)."""
    plan = monthly_plan(cfg)
    kids = _quote_body_kids(body)
    kids = apply_add_on_selection(plan, kids, {k['user_id']: k['add_ons'] for k in kids} if plan else None)
    n = body.get('num_students')
    try:
        n = int(n) if n is not None else None
    except (TypeError, ValueError):
        n = None
    return price_quote(cfg, kids, num_students=n)


def _paid_recorded_session(reg, secret):
    """The first PAID session among the ids WE recorded for this registration
    (stripe_session_id + the stripe_session_ids history), newest first. Ours by
    construction, so a paid one counts even if it predates registration_id
    metadata. Returns (paid_session_or_None, retrieve_errors_count).

    Shared by /confirm-payment (as the first pass before the account sweep)
    and /checkout, which must refuse to open ANOTHER session once one of these
    is paid -- see create_checkout."""
    reg_id = reg['id']
    candidates = []
    for sid in [reg.get('stripe_session_id')] + list(reversed(reg.get('stripe_session_ids') or [])):
        if sid and sid not in candidates:
            candidates.append(sid)

    def ours_and_paid(session):
        # A session id we stored for THIS registration is ours by construction --
        # accept it when paid unless its metadata explicitly names a DIFFERENT
        # registration (defensive; shouldn't happen for our own sessions).
        if not billing.is_paid(session):
            return False
        meta_reg = (session.get('metadata') or {}).get('registration_id')
        return not meta_reg or meta_reg == reg_id

    errors: list = []
    session = billing.first_session(secret, candidates, ours_and_paid, newest_first=False, errors=errors)
    for e in errors:
        logger.error(f'registration payment: retrieve failed: {e}')
    return session, len(errors)


def _find_paid_session(reg, secret, parent_email=None):
    """Find a PAID Stripe Checkout Session belonging to this registration.

    A parent can create several sessions (Pay clicked twice, two tabs) and pay
    any ONE of them, while stripe_session_id only remembers the LAST click — so
    verification must consider every candidate, not just the latest:
      1. every session id WE recorded for this registration (stripe_session_id +
         the stripe_session_ids history) — ours by construction, so a paid one
         counts even if it predates registration_id metadata;
      2. fallback: list the school's recent Checkout Sessions and match either
         metadata.registration_id, or — for pre-metadata sessions carrying no
         registration_id — the family's email + the exact fee amount.

    Both branches must tolerate sessions created BEFORE 2026-07-22, which carry
    no registration_id metadata and were never added to stripe_session_ids: a
    later checkout overwrote stripe_session_id, so the paid session is otherwise
    unreachable and the family is stranded at the fee step even though Stripe has
    their money (MaKenzie Candland, paid 2026-07-12).
    Returns (paid_session_or_None, retrieve_errors_count).
    """
    reg_id = reg['id']
    fee_cents = _amount_due_cents(reg)
    parent_email = (parent_email.strip().lower()
                    if isinstance(parent_email, str) and _valid_email(parent_email) else None)

    def _email_amount_match(session):
        """Pre-metadata rescue: a metadata-less paid session is this family's when
        the Checkout customer email and the exact fee amount both match."""
        if not (parent_email and fee_cents):
            return False
        sess_email = ((session.get('customer_details') or {}).get('email')
                      or session.get('customer_email') or '')
        return (str(sess_email).strip().lower() == parent_email
                and int(session.get('amount_total') or 0) == fee_cents)

    session, errors = _paid_recorded_session(reg, secret)
    if session is not None:
        return session, errors

    # Fallback sweep: any paid session for this registration among the school's
    # recent sessions, capped pages. The lookback starts a little BEFORE this
    # registration row so a payment made just before the row was (re-)created is
    # still found.
    try:
        created_gte = int(datetime.fromisoformat(
            str(reg.get('created_at')).replace('Z', '+00:00').replace(' ', 'T')).timestamp()) - 45 * 86400
    except (ValueError, TypeError):
        created_gte = None
    try:
        params = {'limit': 100}
        if created_gte:
            params['created'] = {'gte': created_gte}
        listing = billing.list_sessions(secret, **params)
        for _page in range(3):
            for session in listing.get('data') or []:
                if not billing.is_paid(session):
                    continue
                meta_reg = (session.get('metadata') or {}).get('registration_id')
                if meta_reg == reg_id or (not meta_reg and _email_amount_match(session)):
                    return session, errors
            if not listing.get('has_more'):
                break
            last = (listing.get('data') or [])[-1]
            params['starting_after'] = last['id']
            listing = billing.list_sessions(secret, **params)
    except Exception as e:  # noqa: BLE001
        logger.error(f'registration confirm-payment: session list fallback failed: {e}')
        errors += 1
    return None, errors


def register_routes(bp):
    """Attach the payment steps to the `registration` blueprint."""
    @bp.route('/registrations/<reg_id>/checkout', methods=['POST'])
    @rate_limit(max_requests=20, window_seconds=300)
    def create_checkout(reg_id):
        """Create a Stripe Checkout Session for the registration fee on the SCHOOL'S
        own Stripe account (organization_secrets.stripe_secret_key). Returns the hosted payment URL."""
        body = request.get_json(silent=True) or {}
        reg = _load_registration(reg_id)
        if not _authz(reg, body.get('access_token')):
            return jsonify({'error': 'Not authorized'}), 403
        if reg.get('status') == 'completed':
            return jsonify({'error': 'This registration is already completed'}), 400

        admin = _admin()
        cfg = _org_config(admin, reg['organization_id'])
        secret = _org_stripe_key(reg['organization_id'])
        # A stale tab could still show the card button after the school staged a
        # prepaid credit — never charge a family that already paid.
        reg = _apply_prepaid_directive(admin, reg)
        cfg, _no_charge = _family_config(admin, reg, cfg)
        # The add-ons ticked on the payment step (teacher support, ...) price
        # the month; they are stored BEFORE the session is created so the
        # amount Stripe charges and the amount /confirm-payment expects agree.
        reg = _apply_add_ons(admin, reg, cfg, body.get('add_ons'))
        fee_cents = 0 if reg.get('fee_deferred') else int(reg.get('fee_cents') or 0)
        monthly_cents = int(reg.get('monthly_cents') or 0)
        if not secret:
            return jsonify({'error': 'Card payment is not set up for this school'}), 400
        if fee_cents <= 0 and monthly_cents <= 0:
            return jsonify({'error': 'No registration fee is due'}), 400

        return_url = (body.get('return_url') or '').strip()
        if not return_url.startswith('http'):
            return jsonify({'error': 'Invalid return URL'}), 400

        # Never open a second Checkout once one of ours is paid. The client is
        # supposed to verify on the way back from Stripe, but a parent who
        # lands on the fee step again for ANY reason sees the same Pay button
        # and Stripe happily takes the money again: Sadie Davis paid the $125
        # fee three times in ninety seconds on 2026-09-10 (the return handler
        # was dead on /enroll/resume), Jacob Zonts twice on 2026-08-28. 409 +
        # already_paid tells the client to run /confirm-payment instead. A
        # retrieve failure does not block the checkout -- there is no evidence
        # of a payment, and refusing would strand an unpaid family.
        paid, _errors = _paid_recorded_session(reg, secret)
        if paid is not None:
            logger.warning(f'registration checkout: refused a new session for {reg_id}, '
                           f'{str(paid.get("id"))[:20]} is already paid')
            return jsonify({'error': 'This registration fee has already been paid.',
                            'already_paid': True}), 409

        org = admin.table('organizations').select('name').eq('id', reg['organization_id']).single().execute().data
        org_name = (org or {}).get('name') or 'your school'
        parent = _parent_row(admin, reg['parent_user_id'])

        # Monthly plan -> a subscription; the one-time fee (if any) is a
        # one-off line on the same session and lands on the first invoice.
        # Fee only -> the plain one-time payment this always was.
        line_items = stripe_line_items(monthly_plan(cfg), reg.get('kids') or [], org_name)
        if fee_cents > 0:
            line_items.append({
                'price_data': {
                    'currency': 'usd',
                    'product_data': {'name': f'{org_name} registration fee'},
                    'unit_amount': fee_cents,
                },
                'quantity': 1,
            })
        subscription = monthly_cents > 0
        session_kwargs = {}
        if subscription:
            session_kwargs['subscription_data'] = {
                'metadata': {'registration_id': reg['id'], 'organization_id': reg['organization_id']},
            }

        try:
            sep = '&' if '?' in return_url else '?'
            session = billing.start_checkout(
                secret,  # the school's key -- funds go to their account
                kind='registration', org_id=reg['organization_id'], ref_id=reg['id'],
                mode='subscription' if subscription else 'payment',
                line_items=line_items,
                customer_email=parent.get('email') or None,
                metadata={'registration_id': reg['id']},
                success_url=f'{return_url}{sep}payment=return',
                cancel_url=f'{return_url}{sep}payment=canceled',
                **session_kwargs,
            )
        except Exception as e:  # noqa: BLE001
            logger.error(f'registration checkout: session creation failed for {reg_id}: {e}')
            return jsonify({'error': 'Could not start the payment. Please try again or contact the school.'}), 502

        # Keep a HISTORY of every session, not just the latest: a parent who clicks
        # Pay twice (double-tab, impatient re-click) can pay the FIRST session while
        # the second overwrites stripe_session_id — verification then checks the
        # unpaid one forever and a real payment looks missing (Keely Pogue,
        # 2026-07-22). confirm_payment walks this list.
        history = list(reg.get('stripe_session_ids') or [])
        history.append(session.id)
        updates = {
            'stripe_session_id': session.id,
            'stripe_session_ids': history[-10:],
            'updated_at': datetime.utcnow().isoformat(),
        }
        # The family acknowledged the hold-your-place / fully-refundable terms for a
        # fee that includes waitlisted kids (frontend gates the pay button on it).
        if body.get('waitlist_ack') and not reg.get('waitlist_refund_ack_at'):
            updates['waitlist_refund_ack_at'] = datetime.utcnow().isoformat()
        admin.table('registrations').update(updates).eq('id', reg_id).execute()

        return jsonify({'success': True, 'checkout_url': session.url}), 200

    @bp.route('/preview-checkout', methods=['POST'])
    @rate_limit(max_requests=10, window_seconds=300)
    def preview_checkout():
        """Staff walkthrough (?preview=1) of the card-payment step: a real Stripe
        Checkout session on the school's account so the preview shows exactly what
        families see. Stripe doesn't allow $0 in payment mode, so it's created for
        the 50-cent minimum and clearly labeled — nothing is charged unless someone
        actually pays it. Gated by the public invitation code, same as /config;
        no registration exists and nothing is recorded."""
        body = request.get_json(silent=True) or {}
        data, err = _load_registration_invite((body.get('code') or '').strip())
        if err:
            return err
        org = data['organization']
        secret = _org_stripe_key(org.get('id'))
        if not secret:
            return jsonify({'error': 'Card payment is not set up for this school'}), 400
        return_url = (body.get('return_url') or '').strip()
        if not return_url.startswith('http'):
            return jsonify({'error': 'Invalid return URL'}), 400

        try:
            sep = '&' if '?' in return_url else '?'
            session = billing.start_checkout(
                secret, kind='registration_preview', org_id=org.get('id'), ref_id=None,
                line_items=[{
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {'name': f'{org.get("name") or "your school"} registration fee (PREVIEW — do not pay)'},
                        'unit_amount': 50,
                    },
                    'quantity': 1,
                }],
                metadata={'preview': 'true', 'organization_id': org['id']},
                success_url=f'{return_url}{sep}payment=preview-return',
                cancel_url=f'{return_url}{sep}payment=preview-canceled',
            )
        except Exception as e:  # noqa: BLE001
            logger.error(f'registration preview-checkout: session creation failed: {e}')
            return jsonify({'error': 'Could not start the preview payment'}), 502
        return jsonify({'success': True, 'checkout_url': session.url}), 200

    @bp.route('/registrations/<reg_id>/confirm-payment', methods=['POST'])
    @rate_limit(max_requests=30, window_seconds=300)
    def confirm_payment(reg_id):
        """Server-side payment verification (the passback): find a Checkout Session
        for this registration that Stripe says is PAID for the right amount. Never
        trusts the browser. Completes the funnel."""
        body = request.get_json(silent=True) or {}
        reg = _load_registration(reg_id)
        if not _authz(reg, body.get('access_token')):
            return jsonify({'error': 'Not authorized'}), 403

        admin = _admin()
        cfg = _org_config(admin, reg['organization_id'])
        if reg.get('status') in ('schedule', 'appointment', 'completed'):
            # Fee already settled — idempotent re-verify (e.g. a Stripe return-page reload).
            return jsonify({'success': True, 'status': reg['status'], 'already': True, 'paid': True,
                            'scheduling_url': _abs_url(cfg.get('scheduling_url')),
                            'scheduling_emailed': bool(reg.get('scheduling_emailed_at'))}), 200
        secret = _org_stripe_key(reg['organization_id'])
        if not secret or not (reg.get('stripe_session_id') or reg.get('stripe_session_ids')):
            return jsonify({'error': 'No payment to verify for this registration'}), 400

        # Parent email lets the sweep rescue pre-metadata paid sessions by email +
        # amount when no registration_id is on the session.
        parent_email = (_parent_row(admin, reg['parent_user_id']) or {}).get('email')
        session, errors = _find_paid_session(reg, secret, parent_email=parent_email)
        if session is None:
            if errors:
                return jsonify({'error': 'Could not verify the payment. Please try again.'}), 502
            return jsonify({'success': False, 'paid': False,
                            'error': "We haven't received your payment yet. Complete the payment and try again."}), 402
        expected = _amount_due_cents(reg)
        if int(session.get('amount_total') or 0) != expected:
            logger.warning(f'registration confirm-payment: amount mismatch for {reg_id}: '
                           f'{session.get("amount_total")} != {expected}')
            return jsonify({'error': 'Payment amount mismatch — please contact the school.'}), 400

        extra = {
            'fee_paid_at': datetime.utcnow().isoformat(),
            'stripe_payment_ref': str(session.get('payment_intent') or session.get('subscription')
                                      or session.get('id')),
            # Paid = nothing deferred anymore, so a later waitlist release
            # never reopens a settled registration.
            'fee_deferred': False,
        }
        # A subscription-mode session: remember the subscription and the
        # Customer Stripe created for it, so staff can find the family's plan
        # on the school's Stripe dashboard from the SIS family view.
        if session.get('subscription'):
            extra['stripe_subscription_id'] = str(session.get('subscription'))
        if session.get('customer'):
            extra['stripe_customer_id'] = str(session.get('customer'))
        result = _finish_fee_step(admin, reg, cfg, extra_fields=extra)
        logger.info(f'registration: registration {reg_id} payment verified ({session.get("payment_intent")})')
        return jsonify({**result, 'paid': True}), 200

    @bp.route('/registrations/<reg_id>/fee-status', methods=['POST'])
    @rate_limit(max_requests=60, window_seconds=300)
    def fee_status(reg_id):
        """Authoritative fee state for the fee step. The client renders pay-vs-finish
        from THIS, not from a feeCents it cached earlier in the funnel — otherwise a
        fee recomputed mid-flight (a prepaid credit removed, a back-edited family step)
        strands the parent on a stale "$0, finish" view that /fee then refuses forever
        (erin4collins, 2026-07-28). Read-only apart from the same idempotent
        prepaid-directive zeroing /fee and /checkout apply, so `requires_card` here is
        exactly what those endpoints will enforce. POST keeps the access token out of
        URLs/logs, matching the other reg-scoped routes."""
        body = request.get_json(silent=True) or {}
        reg = _load_registration(reg_id)
        if not _authz(reg, body.get('access_token')):
            return jsonify({'error': 'Not authorized'}), 403

        admin = _admin()
        cfg = _org_config(admin, reg['organization_id'])
        completed = reg.get('status') in ('schedule', 'appointment', 'completed')
        reg = _apply_prepaid_directive(admin, reg)
        # A no-charge family has no plan: the step offers no add-ons and says
        # nothing is due.
        cfg, no_charge = _family_config(admin, reg, cfg)
        # Re-price the month from the stored kids and choices (a config change
        # since the family step -- a new add-on price -- lands here, before
        # anyone pays).
        reg = _apply_add_ons(admin, reg, cfg, None)
        fee_cents = int(reg.get('fee_cents') or 0)
        monthly_cents = int(reg.get('monthly_cents') or 0)
        fee_deferred = bool(reg.get('fee_deferred'))
        stripe_enabled = _org_stripe_enabled(reg['organization_id'])
        # Mirrors the /fee 402 gate exactly.
        requires_card = (stripe_enabled and (fee_cents > 0 or monthly_cents > 0)
                         and not fee_deferred and not completed)
        return jsonify({
            'success': True,
            'status': reg.get('status'),
            'fee_cents': fee_cents,
            'monthly_cents': monthly_cents,
            # The students and their current add-on choices, so a resumed tab
            # shows what was ticked rather than an empty plan.
            'kids': [{'user_id': k.get('user_id'), 'first_name': k.get('first_name'),
                      'name': k.get('name'), 'preferred_name': k.get('preferred_name'),
                      'add_ons': k.get('add_ons') or []}
                     for k in (reg.get('kids') or [])],
            'fee_deferred': fee_deferred,
            'stripe_enabled': stripe_enabled,
            'requires_card': requires_card,
            'no_charge': no_charge,
            'already_completed': completed,
            # The lines the step draws (registration_pricing.quote): the browser
            # renders these and prices nothing itself.
            'quote': _quote_for(reg, cfg),
        }), 200

    @bp.route('/registrations/<reg_id>/quote', methods=['POST'])
    @rate_limit(max_requests=120, window_seconds=300)
    def registration_quote(reg_id):
        """The one quote for a registration, with an unsaved add-on selection
        (`add_ons`: {kid_user_id: [keys]}) or a student count (`num_students`,
        the family step's running estimate before the kids are saved) applied
        on top. Read-only: /checkout and /fee store the selection when the
        family commits. POST keeps the access token out of URLs."""
        body = request.get_json(silent=True) or {}
        reg = _load_registration(reg_id)
        if not _authz(reg, body.get('access_token')):
            return jsonify({'error': 'Not authorized'}), 403
        admin = _admin()
        cfg, _no_charge = _family_config(admin, reg, _org_config(admin, reg['organization_id']))
        n = body.get('num_students')
        try:
            n = int(n) if n is not None else None
        except (TypeError, ValueError):
            n = None
        fee_cents = None if n is not None else reg.get('fee_cents')
        plan = monthly_plan(cfg)
        kids = apply_add_on_selection(plan, reg.get('kids') or [], body.get('add_ons') if plan else None)
        return jsonify({'success': True, 'quote': price_quote(
            cfg, kids, num_students=n, fee_cents=fee_cents,
            fee_deferred=bool(reg.get('fee_deferred')))}), 200

    @bp.route('/quote', methods=['POST'])
    @rate_limit(max_requests=120, window_seconds=300)
    def public_quote():
        """What a family of `num_students` would pay under an org's saved
        funnel config, before any registration exists: the ?preview=1
        walkthrough and the family step's first estimate. Gated by the public
        invitation code, same as /config; discloses the config's own prices."""
        body = request.get_json(silent=True) or {}
        data, err = _load_registration_invite((body.get('code') or '').strip())
        if err:
            return err
        return jsonify({'success': True, 'quote': _hypothetical_quote(data['config'], body)}), 200

    @bp.route('/quote-preview', methods=['POST'])
    @require_role(*ADMIN_ROLES)
    def quote_preview(user_id):
        """The setup editor's fee preview: a quote from an UNSAVED registration
        config (`config`: the draft registration block) for `num_students` and
        optional sample kids with add-on choices, so the tab shows what a new
        registrant would see before the admin saves. Front-office tier, like
        the setup tab itself; the draft is priced, never stored."""
        _org_id, err = sis_service.org_or_error(user_id)
        if err:
            return err
        body = request.get_json(silent=True) or {}
        cfg = body.get('config')
        if not isinstance(cfg, dict):
            return jsonify({'success': False, 'error': 'Send the draft registration config'}), 400
        return jsonify({'success': True, 'quote': _hypothetical_quote(cfg, body)}), 200

    @bp.route('/registrations/<reg_id>/fee', methods=['POST'])
    @rate_limit(max_requests=30, window_seconds=300)
    def record_fee(reg_id):
        """Finish the fee step WITHOUT card verification — only allowed when the org
        has no Stripe key configured (external/offline payment) or no fee is due.
        With Stripe configured, /confirm-payment is the only way through."""
        body = request.get_json(silent=True) or {}
        reg = _load_registration(reg_id)
        if not _authz(reg, body.get('access_token')):
            return jsonify({'error': 'Not authorized'}), 403

        admin = _admin()
        cfg = _org_config(admin, reg['organization_id'])
        if reg.get('status') in ('schedule', 'appointment', 'completed'):
            return jsonify({'success': True, 'status': reg['status'], 'already': True,
                            'scheduling_url': _abs_url(cfg.get('scheduling_url')),
                            'scheduling_emailed': bool(reg.get('scheduling_emailed_at'))}), 200
        reg = _apply_prepaid_directive(admin, reg)
        cfg, _no_charge = _family_config(admin, reg, cfg)
        # Record-only orgs (external payment link, or the school collects it)
        # still keep the family's add-on choices, so staff know who asked for
        # a teacher when they set the payment up by hand.
        reg = _apply_add_ons(admin, reg, cfg, body.get('add_ons'))
        fee_cents = int(reg.get('fee_cents') or 0)  # computed per-family at the family step
        monthly_cents = int(reg.get('monthly_cents') or 0)
        # Fee-deferred families (every kid on the enrollment waitlist) finish without
        # paying — the fee comes due when the school releases their first student.
        if (_org_stripe_enabled(reg['organization_id']) and (fee_cents > 0 or monthly_cents > 0)
                and not reg.get('fee_deferred')):
            # Return the authoritative fee so a client whose local feeCents went stale
            # (e.g. the fee was recomputed after a prepaid directive was removed, or a
            # tab loaded a $0 "finish" view before the fee was set) can self-correct
            # to the pay-by-card UI instead of dead-ending on this toast.
            return jsonify({'error': 'Please pay by card to finish.' if monthly_cents > 0
                            else 'Please pay the registration fee by card to finish.',
                            'requires_card': True, 'fee_cents': fee_cents,
                            'monthly_cents': monthly_cents}), 402

        result = _finish_fee_step(admin, reg, cfg, extra_fields={'fee_cents': fee_cents})
        return jsonify(result), 200
