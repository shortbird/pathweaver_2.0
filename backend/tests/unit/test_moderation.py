"""Unit tests for content moderation routes (report / block)."""

import json
from unittest.mock import MagicMock, patch


def _mock_supabase():
    supabase = MagicMock()
    table = MagicMock()
    supabase.table.return_value = table
    # select existing report chain
    table.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
    # insert
    table.insert.return_value.execute.return_value = MagicMock(data=[{'id': 'rep-1'}])
    # upsert
    table.upsert.return_value.execute.return_value = MagicMock(data=[{'id': 'blk-1'}])
    # delete
    table.delete.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    return supabase


def _valid_payload(**overrides):
    base = {
        'target_type': 'learning_event',
        'target_id': '00000000-0000-0000-0000-000000000001',
        'reason': 'inappropriate',
    }
    base.update(overrides)
    return base


def test_report_content_success(client, mock_verify_token):
    supabase = _mock_supabase()
    with patch('routes.moderation.get_supabase_admin_client', return_value=supabase):
        resp = client.post(
            '/api/moderation/report',
            headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
            data=json.dumps(_valid_payload()),
        )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body['success'] is True
    assert body['report_id'] == 'rep-1'


def test_report_rejects_invalid_target_type(client, mock_verify_token):
    resp = client.post(
        '/api/moderation/report',
        headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
        data=json.dumps(_valid_payload(target_type='blog_post')),
    )
    assert resp.status_code == 400


def test_report_rejects_invalid_reason(client, mock_verify_token):
    resp = client.post(
        '/api/moderation/report',
        headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
        data=json.dumps(_valid_payload(reason='bad_vibes')),
    )
    assert resp.status_code == 400


def test_report_is_idempotent_when_duplicate(client, mock_verify_token):
    supabase = MagicMock()
    table = MagicMock()
    supabase.table.return_value = table
    # Existing report found
    table.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=[{'id': 'existing-rep'}]
    )
    with patch('routes.moderation.get_supabase_admin_client', return_value=supabase):
        resp = client.post(
            '/api/moderation/report',
            headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
            data=json.dumps(_valid_payload()),
        )
    assert resp.status_code == 200
    assert resp.get_json()['report_id'] == 'existing-rep'


def test_block_user_success(client, mock_verify_token):
    supabase = _mock_supabase()
    with patch('routes.moderation.get_supabase_admin_client', return_value=supabase):
        resp = client.post(
            '/api/moderation/block',
            headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
            data=json.dumps({'blocked_id': '00000000-0000-0000-0000-000000000002'}),
        )
    assert resp.status_code == 201


def test_block_rejects_self_block(client, mock_verify_token):
    resp = client.post(
        '/api/moderation/block',
        headers={'Authorization': 'Bearer t', 'Content-Type': 'application/json'},
        data=json.dumps({'blocked_id': 'test-user-123'}),
    )
    assert resp.status_code == 400


def test_unblock_user_success(client, mock_verify_token):
    supabase = _mock_supabase()
    with patch('routes.moderation.get_supabase_admin_client', return_value=supabase):
        resp = client.delete(
            '/api/moderation/block/00000000-0000-0000-0000-000000000002',
            headers={'Authorization': 'Bearer t'},
        )
    assert resp.status_code == 200


def test_moderation_endpoints_require_auth(client):
    resp = client.post(
        '/api/moderation/report',
        headers={'Content-Type': 'application/json'},
        data=json.dumps(_valid_payload()),
    )
    assert resp.status_code in (401, 403)
