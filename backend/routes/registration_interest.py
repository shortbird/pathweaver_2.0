"""Registration funnel: "Join the waitlist", the door for families who are not
ready to register or pay.

    POST /api/registration/interest-list   the family's form -> one interest-list entry

Public and pre-session: the school's own registration link (the invitation
code in the body) is the only thing that names the school, and the school must
have turned the list on (feature_flags.registration.interest_list.enabled).
The rest lives in services/sis_interest_list_service.py; read its docstring for
how this list differs from the enrollment and class waitlists.

Abuse controls, because this writes a row and sends two emails per call to an
address the caller chose:
  - the IP rate limit below (the same shape as /api/contact),
  - a honeypot field (`website`) that people never see and form-filling bots
    fill in; a filled one answers success and writes nothing, so the bot learns
    nothing,
  - one live row per email per school: a second submission refreshes the first
    and sends no second office alert.

THE ROUTE STAYS ON THE `registration` BLUEPRINT, attached through
`register_routes(bp)` like routes/registration_entry.py, because the CSRF
exemption list is keyed on endpoint names (`registration.join_interest_list`).
A parent who is already signed in to Optio carries session cookies here, and
without the exemption their join would 403.
"""

from flask import request, jsonify

from middleware.rate_limiter import rate_limit
from services import sis_interest_list_service as interest_list
from services.registration_funnel_support import _load_registration_invite
from utils.logger import get_logger

logger = get_logger(__name__)

HONEYPOT_FIELD = 'website'


def register_routes(bp):
    """Attach the interest-list join to the `registration` blueprint."""
    @bp.route('/interest-list', methods=['POST'])
    @rate_limit(max_requests=5, window_seconds=3600)  # 5/hour per IP: public, and each call emails the address given
    def join_interest_list():
        body = request.get_json(silent=True) or {}
        data, err = _load_registration_invite(body.get('code') or '')
        if err:
            return err
        if str(body.get(HONEYPOT_FIELD) or '').strip():
            logger.info('interest list: honeypot filled, nothing written')
            return jsonify({'success': True}), 201
        try:
            interest_list.join(data['organization'], body)
        except interest_list.InterestListError as e:
            return jsonify({'success': False, 'error': e.message}), e.status
        return jsonify({'success': True}), 201
