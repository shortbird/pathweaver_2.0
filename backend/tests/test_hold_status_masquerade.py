"""
The two hold status endpoints agree with the API gate about masquerade.

middleware/api_hold_gate.py lets a masquerade through every hold: an admin
must not sign a family's paperwork for them and cannot type a code texted to
somebody else's phone. But the clients do not render the hold screen from the
gate's 403 alone -- they ask /api/phone-verification/status and
/api/sis/parent/required-documents on authentication. When those two said
"held" for the target while the gate said "pass", the mobile app raised a
full-screen verification flow over a masquerade with no way to complete it
(Lynette Evans, iCreate, 2026-09-18; the web router had exempted masquerade on
its own side since 2026-08-22, which is why only mobile showed it).
"""

from unittest.mock import patch

import pytest
from flask import Flask


def _call(view, *args):
    """Call a @require_auth view body directly, as the other route tests do."""
    fn = view.__wrapped__ if hasattr(view, '__wrapped__') else view
    return fn(*args)


@pytest.mark.unit
class TestPhoneVerificationStatus:

    def test_a_masquerade_is_never_held(self):
        import routes.phone_verification as pv
        app = Flask(__name__)
        with app.test_request_context('/api/phone-verification/status'), \
             patch.object(pv.session_manager, 'is_masquerading', return_value=True), \
             patch.object(pv.phone_verification, 'status') as status:
            body = _call(pv.verification_status, 'held-parent').get_json()
        assert body['required'] is False
        assert body['masquerading'] is True
        # The target's real answer is not even asked for: nothing the admin
        # could do with it.
        status.assert_not_called()

    def test_everybody_else_gets_the_real_answer(self):
        import routes.phone_verification as pv
        app = Flask(__name__)
        with app.test_request_context('/api/phone-verification/status'), \
             patch.object(pv.session_manager, 'is_masquerading', return_value=False), \
             patch.object(pv.phone_verification, 'status',
                          return_value={'required': True, 'verified': False}):
            body = _call(pv.verification_status, 'held-parent').get_json()
        assert body['required'] is True
        assert 'masquerading' not in body


@pytest.mark.unit
class TestRequiredDocumentsStatus:

    def test_a_masquerade_is_never_held(self):
        import routes.sis.parent as parent_routes
        app = Flask(__name__)
        with app.test_request_context('/api/sis/parent/required-documents'), \
             patch.object(parent_routes.session_manager, 'is_masquerading', return_value=True), \
             patch.object(parent_routes.sis_access_gate, 'status') as status:
            body = _call(parent_routes.my_required_documents, 'held-parent').get_json()
        assert body['blocked'] is False
        assert body['assignments'] == []
        assert body['masquerading'] is True
        status.assert_not_called()

    def test_everybody_else_gets_the_real_answer(self):
        import routes.sis.parent as parent_routes
        app = Flask(__name__)
        with app.test_request_context('/api/sis/parent/required-documents'), \
             patch.object(parent_routes.session_manager, 'is_masquerading', return_value=False), \
             patch.object(parent_routes.sis_access_gate, 'status',
                          return_value={'blocked': True, 'assignments': [{'id': 'a1'}]}):
            body = _call(parent_routes.my_required_documents, 'held-parent').get_json()
        assert body['blocked'] is True
        assert 'masquerading' not in body
