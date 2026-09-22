"""POST /api/users/avatar answers a held picture with the gate's sentence.

The safety gate refuses with ValidationError, and the route's catch-all
turned that into "Failed to upload avatar" (500) plus an error log that
paged Sentry: the student never read why and kept trying (2026-09-21, a
Horizon student). The type and size checks above the try block already
reach the client as a 400 with their sentence; the gate's refusal now
does too, through the app's ValidationError handler.
"""

from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

from middleware.error_handler import ValidationError
from routes.users import profile
from services import upload_safety_service as gate

STUDENT = '4e038b63-02ed-4b53-87a2-000000000001'
PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


@pytest.fixture
def app():
    return Flask(__name__)


def _post(app, verdict, storage=None):
    client = MagicMock()
    if storage is not None:
        client.storage.from_.return_value.upload.side_effect = storage
    data = {'avatar': (BytesIO(PNG), 'me.png', 'image/png')}
    with app.test_request_context('/api/users/avatar', method='POST', data=data,
                                  content_type='multipart/form-data'), \
            patch.object(profile, 'get_supabase_admin_client', return_value=client), \
            patch.object(profile, 'UserRepository', return_value=MagicMock()), \
            patch.object(profile, 'sign_stored_url', side_effect=lambda url, bucket=None: f'signed:{url}'), \
            patch.object(gate, 'check_image', return_value=verdict) as check:
        response = _innermost(profile.upload_avatar)(STUDENT)
    return response, check


def test_a_held_picture_is_the_gates_sentence_not_a_500(app):
    held = gate.UploadVerdict(False, gate.KIND_HELD, gate.HELD_REFUSAL, hold_id='h-1')
    with pytest.raises(ValidationError) as refused:
        _post(app, held)
    assert refused.value.message == gate.HELD_REFUSAL
    assert refused.value.status_code == 400


def test_a_hash_match_is_refused_the_same_way(app):
    matched = gate.UploadVerdict(False, gate.KIND_CSAM, gate.NEUTRAL_REFUSAL, incident_id='i-1')
    with pytest.raises(ValidationError) as refused:
        _post(app, matched)
    assert refused.value.message == gate.NEUTRAL_REFUSAL


def test_a_clear_picture_is_stored_and_the_gate_saw_it_as_an_avatar(app):
    response, check = _post(app, gate.UploadVerdict(True, gate.KIND_CLEAR))
    body, status = response
    assert status == 200
    assert body.get_json()['avatar_url'].startswith('signed:')
    assert check.call_args.kwargs['user_id'] == STUDENT
    assert check.call_args.kwargs['purpose'] == 'avatar'


def test_a_storage_failure_is_still_the_generic_500(app):
    response, _ = _post(app, gate.UploadVerdict(True, gate.KIND_CLEAR), storage=RuntimeError('bucket gone'))
    body, status = response
    assert status == 500
    assert body.get_json() == {'error': 'Failed to upload avatar'}
