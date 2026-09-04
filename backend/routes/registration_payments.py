"""Registration funnel: the money steps.

Split out of routes/registration_funnel.py on 2026-09-03 (QB-04), which was
2,149 lines and carried the last standing exemption from the 1,400-line route
cap.

Checkout, the Stripe redirect back, and the two fee-recording endpoints. Optio
never processes these payments itself: the money moves on the ORGANISATION's
Stripe account, using a key read per-request from organization_secrets, and the
funnel only records what happened.

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
from utils.logger import get_logger
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
)
from services.registration_funnel_service import (
    _abs_url,
    finish_fee_step as _finish_fee_step,
    org_funnel_config as _org_config,
)

logger = get_logger(__name__)


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
    import stripe

    reg_id = reg['id']
    fee_cents = int(reg.get('fee_cents') or 0)
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

    candidates = []
    for sid in [reg.get('stripe_session_id')] + list(reversed(reg.get('stripe_session_ids') or [])):
        if sid and sid not in candidates:
            candidates.append(sid)

    errors = 0
    for sid in candidates:
        try:
            session = stripe.checkout.Session.retrieve(sid, api_key=secret)
        except Exception as e:  # noqa: BLE001
            logger.error(f'registration confirm-payment: retrieve failed for {sid[:20]}: {e}')
            errors += 1
            continue
        if session.get('payment_status') != 'paid':
            continue
        # A session id we stored for THIS registration is ours by construction —
        # accept it when paid unless its metadata explicitly names a DIFFERENT
        # registration (defensive; shouldn't happen for our own sessions).
        meta_reg = (session.get('metadata') or {}).get('registration_id')
        if not meta_reg or meta_reg == reg_id:
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
        params = {'limit': 100, 'api_key': secret}
        if created_gte:
            params['created'] = {'gte': created_gte}
        listing = stripe.checkout.Session.list(**params)
        for _page in range(3):
            for session in listing.get('data') or []:
                if session.get('payment_status') != 'paid':
                    continue
                meta_reg = (session.get('metadata') or {}).get('registration_id')
                if meta_reg == reg_id or (not meta_reg and _email_amount_match(session)):
                    return session, errors
            if not listing.get('has_more'):
                break
            last = (listing.get('data') or [])[-1]
            params['starting_after'] = last['id']
            listing = stripe.checkout.Session.list(**params)
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
        _org_config(admin, reg['organization_id'])
        secret = _org_stripe_key(reg['organization_id'])
        # A stale tab could still show the card button after the school staged a
        # prepaid credit — never charge a family that already paid.
        reg = _apply_prepaid_directive(admin, reg)
        fee_cents = int(reg.get('fee_cents') or 0)
        if not secret:
            return jsonify({'error': 'Card payment is not set up for this school'}), 400
        if fee_cents <= 0:
            return jsonify({'error': 'No registration fee is due'}), 400

        return_url = (body.get('return_url') or '').strip()
        if not return_url.startswith('http'):
            return jsonify({'error': 'Invalid return URL'}), 400

        org = admin.table('organizations').select('name').eq('id', reg['organization_id']).single().execute().data
        org_name = (org or {}).get('name') or 'your school'
        parent = _parent_row(admin, reg['parent_user_id'])

        try:
            import stripe
            sep = '&' if '?' in return_url else '?'
            session = stripe.checkout.Session.create(
                api_key=secret,  # the school's key — funds go to their account
                mode='payment',
                line_items=[{
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {'name': f'{org_name} registration fee'},
                        'unit_amount': fee_cents,
                    },
                    'quantity': 1,
                }],
                customer_email=parent.get('email') or None,
                metadata={'registration_id': reg['id']},
                success_url=f'{return_url}{sep}payment=return',
                cancel_url=f'{return_url}{sep}payment=canceled',
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
            import stripe
            sep = '&' if '?' in return_url else '?'
            session = stripe.checkout.Session.create(
                api_key=secret,
                mode='payment',
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
        if int(session.get('amount_total') or 0) != int(reg.get('fee_cents') or 0):
            logger.warning(f'registration confirm-payment: amount mismatch for {reg_id}: '
                           f'{session.get("amount_total")} != {reg.get("fee_cents")}')
            return jsonify({'error': 'Payment amount mismatch — please contact the school.'}), 400

        result = _finish_fee_step(admin, reg, cfg, extra_fields={
            'fee_paid_at': datetime.utcnow().isoformat(),
            'stripe_payment_ref': str(session.get('payment_intent') or session.get('id')),
            # Paid = nothing deferred anymore, so a later waitlist release
            # never reopens a settled registration.
            'fee_deferred': False,
        })
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
        _org_config(admin, reg['organization_id'])
        completed = reg.get('status') in ('schedule', 'appointment', 'completed')
        reg = _apply_prepaid_directive(admin, reg)
        fee_cents = int(reg.get('fee_cents') or 0)
        fee_deferred = bool(reg.get('fee_deferred'))
        stripe_enabled = _org_stripe_enabled(reg['organization_id'])
        # Mirrors the /fee 402 gate exactly.
        requires_card = stripe_enabled and fee_cents > 0 and not fee_deferred and not completed
        return jsonify({
            'success': True,
            'status': reg.get('status'),
            'fee_cents': fee_cents,
            'fee_deferred': fee_deferred,
            'stripe_enabled': stripe_enabled,
            'requires_card': requires_card,
            'already_completed': completed,
        }), 200

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
        fee_cents = int(reg.get('fee_cents') or 0)  # computed per-family at the family step
        # Fee-deferred families (every kid on the enrollment waitlist) finish without
        # paying — the fee comes due when the school releases their first student.
        if _org_stripe_enabled(reg['organization_id']) and fee_cents > 0 and not reg.get('fee_deferred'):
            # Return the authoritative fee so a client whose local feeCents went stale
            # (e.g. the fee was recomputed after a prepaid directive was removed, or a
            # tab loaded a $0 "finish" view before the fee was set) can self-correct
            # to the pay-by-card UI instead of dead-ending on this toast.
            return jsonify({'error': 'Please pay the registration fee by card to finish.',
                            'requires_card': True, 'fee_cents': fee_cents}), 402

        result = _finish_fee_step(admin, reg, cfg, extra_fields={'fee_cents': fee_cents})
        return jsonify(result), 200
