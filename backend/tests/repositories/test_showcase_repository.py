"""Unit tests for ShowcaseRepository.

Focuses on critical-path behavior:
  - Consent CRUD
  - Revoke cascade (consent -> posts -> queue)
  - Queue eligibility (consent + non-confidential)
  - Status auto-creation on first read
  - Post recording side-effects
"""

import uuid
import pytest
from unittest.mock import Mock, patch
from datetime import datetime, timezone

from repositories.showcase_repository import ShowcaseRepository, QUEUE_STATUSES
from repositories.base_repository import NotFoundError


def _patch_client(repo: ShowcaseRepository) -> Mock:
    """Replace the repository's client with a Mock and return it."""
    mock = Mock()
    repo._client = mock
    return mock


def _result(data=None, count=None):
    """Build a postgrest-style result mock."""
    r = Mock()
    r.data = data if data is not None else []
    r.count = count
    return r


@pytest.mark.unit
def test_get_consent_returns_row_when_present():
    repo = ShowcaseRepository()
    client = _patch_client(repo)
    user_id = str(uuid.uuid4())
    expected = {'user_id': user_id, 'consent_active': True}
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = _result([expected])

    out = repo.get_consent(user_id)
    assert out == expected


@pytest.mark.unit
def test_get_consent_returns_none_when_missing():
    repo = ShowcaseRepository()
    client = _patch_client(repo)
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = _result([])

    out = repo.get_consent(str(uuid.uuid4()))
    assert out is None


@pytest.mark.unit
def test_upsert_consent_inserts_when_no_existing_row():
    repo = ShowcaseRepository()
    client = _patch_client(repo)
    user_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())

    # First .execute() (get_consent) returns empty; second (insert) returns the row
    client.table.return_value.select.return_value.eq.return_value.execute.side_effect = [_result([])]
    new_row = {'user_id': user_id, 'consent_active': True, 'consent_work': True}
    client.table.return_value.insert.return_value.execute.return_value = _result([new_row])

    out = repo.upsert_consent(user_id, {'consent_active': True, 'consent_work': True}, admin_id)

    assert out == new_row
    insert_call = client.table.return_value.insert.call_args[0][0]
    assert insert_call['user_id'] == user_id
    assert insert_call['recorded_by'] == admin_id
    assert 'recorded_at' in insert_call


@pytest.mark.unit
def test_upsert_consent_clears_revoked_fields_on_restore():
    repo = ShowcaseRepository()
    client = _patch_client(repo)
    user_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())

    existing = {'user_id': user_id, 'consent_active': False, 'revoked_at': '2026-01-01T00:00:00Z',
                'revoked_by': 'someone', 'revoked_reason': 'parent revoked'}
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = _result([existing])
    updated = {**existing, 'consent_active': True, 'revoked_at': None}
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = _result([updated])

    repo.upsert_consent(user_id, {'consent_active': True}, admin_id)

    update_payload = client.table.return_value.update.call_args[0][0]
    assert update_payload['revoked_at'] is None
    assert update_payload['revoked_reason'] is None
    assert update_payload['revoked_by'] is None


@pytest.mark.unit
def test_revoke_consent_cascades_posts_and_queue():
    repo = ShowcaseRepository()
    client = _patch_client(repo)
    user_id = str(uuid.uuid4())
    admin_id = str(uuid.uuid4())

    existing = {'user_id': user_id, 'consent_active': True}
    # First select() (get_consent) returns existing
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = _result([existing])

    # Three update() chains: consent, posts (eq.eq.execute), queue (eq.neq.execute)
    consent_update = client.table.return_value.update.return_value.eq.return_value.execute
    consent_update.return_value = _result([{**existing, 'consent_active': False, 'revoked_at': 'now'}])

    posts_update = client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute
    posts_update.return_value = _result([{'id': 'p1'}, {'id': 'p2'}])

    queue_update = client.table.return_value.update.return_value.eq.return_value.neq.return_value.execute
    queue_update.return_value = _result([{'id': 'q1'}])

    out = repo.revoke_consent(user_id, admin_id, reason='parent request', source='admin')

    assert out['posts_flagged_for_takedown'] == 2
    assert out['queue_items_dismissed'] == 1
    assert out['consent']['consent_active'] is False


@pytest.mark.unit
def test_revoke_consent_raises_when_no_existing():
    repo = ShowcaseRepository()
    client = _patch_client(repo)
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = _result([])

    with pytest.raises(NotFoundError):
        repo.revoke_consent(str(uuid.uuid4()), str(uuid.uuid4()), reason=None)


@pytest.mark.unit
def test_update_status_rejects_invalid_status():
    repo = ShowcaseRepository()
    _patch_client(repo)

    with pytest.raises(ValueError):
        repo.update_status(str(uuid.uuid4()), {'status': 'not-a-real-status'}, str(uuid.uuid4()))


@pytest.mark.unit
def test_update_status_updates_existing_row():
    repo = ShowcaseRepository()
    client = _patch_client(repo)
    evidence_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    existing = {'id': 'st1', 'evidence_id': evidence_id, 'user_id': user_id, 'status': 'new'}
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = _result([existing])

    updated = {**existing, 'status': 'saved'}
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = _result([updated])

    out = repo.update_status(evidence_id, {'status': 'saved'}, user_id)
    assert out['status'] == 'saved'


@pytest.mark.unit
def test_update_status_creates_row_when_missing():
    repo = ShowcaseRepository()
    client = _patch_client(repo)
    evidence_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    actor = str(uuid.uuid4())

    # Sequence:
    # 1) select status row -> empty
    # 2) select completion -> returns user_id
    # 3) insert -> returns new row
    select_chain = client.table.return_value.select.return_value.eq.return_value.execute
    select_chain.side_effect = [_result([]), _result([{'user_id': user_id}])]

    inserted = {'id': 'new-status', 'evidence_id': evidence_id, 'user_id': user_id, 'status': 'saved'}
    client.table.return_value.insert.return_value.execute.return_value = _result([inserted])

    out = repo.update_status(evidence_id, {'status': 'saved'}, actor)
    assert out['id'] == 'new-status'
    assert out['user_id'] == user_id


@pytest.mark.unit
def test_record_post_rejects_invalid_platform():
    repo = ShowcaseRepository()
    _patch_client(repo)

    with pytest.raises(ValueError):
        repo.record_post(str(uuid.uuid4()), 'myspace', 'https://...', 'cap', str(uuid.uuid4()))


@pytest.mark.unit
def test_record_post_inserts_row_and_marks_status_posted():
    repo = ShowcaseRepository()
    client = _patch_client(repo)
    evidence_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    actor = str(uuid.uuid4())

    status_row = {'id': 'st1', 'evidence_id': evidence_id, 'user_id': user_id, 'status': 'posted'}
    # update_status path: select existing -> update -> return status_row
    client.table.return_value.select.return_value.eq.return_value.execute.return_value = _result([status_row])
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = _result([status_row])
    inserted_post = {'id': 'p1', 'evidence_status_id': 'st1', 'platform': 'instagram',
                     'post_url': 'https://ig.com/p/x', 'user_id': user_id}
    client.table.return_value.insert.return_value.execute.return_value = _result([inserted_post])

    out = repo.record_post(evidence_id, 'instagram', 'https://ig.com/p/x', 'cap', actor)

    assert out['platform'] == 'instagram'
    insert_payload = client.table.return_value.insert.call_args[0][0]
    assert insert_payload['evidence_status_id'] == 'st1'
    assert insert_payload['posted_by'] == actor


@pytest.mark.unit
def test_update_post_marks_takedown_complete():
    repo = ShowcaseRepository()
    client = _patch_client(repo)
    actor = str(uuid.uuid4())

    updated = {'id': 'p1', 'take_down_required': False, 'take_down_at': 'now'}
    client.table.return_value.update.return_value.eq.return_value.execute.return_value = _result([updated])

    out = repo.update_post('p1', {'marked_taken_down': True}, actor)

    assert out['take_down_required'] is False
    payload = client.table.return_value.update.call_args[0][0]
    assert payload['take_down_required'] is False
    assert payload['taken_down_by'] == actor
    assert 'take_down_at' in payload
