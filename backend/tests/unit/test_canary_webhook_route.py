"""POST /api/webhooks/canary -- a canarytoken alert opens an urgent ticket.

Properties the endpoint must hold:

  1. It is CLOSED while unconfigured and to a wrong key. canarytokens.org
     cannot sign, so the URL secret is the whole gate.
  2. The test alert canarytokens.org sends on save files nothing.
  3. An alert and an exposure each open one urgent ticket, titled by the
     memo, that never emails a reporter. A repeat on an open ticket is a
     note; a repeat after close is a fresh ticket.
"""

from unittest.mock import patch

SECRET = 'canary-secret'

# The "generic" webhook body from thinkst/canarytokens (TokenAlertDetails).
ALERT = {
    'channel': 'AWS API Key Token',
    'token_type': 'aws_keys',
    'src_ip': '203.0.113.9',
    'token': 'abc123tok',
    'time': '2026-09-23 18:02:11 (UTC)',
    'memo': 'Optio Render prod backend env',
    'manage_url': 'https://canarytokens.org/nest/manage/x/abc123tok',
    'additional_data': {'useragent': 'aws-cli/2.15', 'aws_key_log_data': {}},
    'public_domain': 'canarytokens.org',
}

# TokenExposedDetails: the key was found published somewhere public.
EXPOSED = {
    'token_type': 'aws_keys',
    'token': 'abc123tok',
    'memo': 'Optio Render prod backend env',
    'key_id': 'AKIAEXAMPLE',
    'public_location': 'https://github.com/someone/repo/blob/main/.env',
    'exposed_time': '2026-09-23 18:05:00 (UTC)',
    'manage_url': 'https://canarytokens.org/nest/manage/x/abc123tok',
}

# What canarytokens.org sends when a webhook URL is saved.
TEST_ALERT = dict(ALERT, token='a+test+token', memo='Congrats! The newly saved webhook works')


def _post(client, payload=ALERT, key=SECRET):
    url = '/api/webhooks/canary' + (f'?key={key}' if key is not None else '')
    return client.post(url, json=payload)


def _repo_patch():
    return patch('routes.canary_webhook.BugReportRepository')


def _email_patch():
    return patch('services.email_service.email_service.send_bug_report_admin_email')


def _config(secret=SECRET):
    return patch('app_config.Config.CANARY_WEBHOOK_SECRET', secret)


# ── 1. closed unless keyed ────────────────────────────────────────────────

def test_unconfigured_endpoint_refuses_everything(client):
    with _config(None), _repo_patch() as repo:
        resp = _post(client)
    assert resp.status_code == 403
    repo.assert_not_called()


def test_wrong_or_missing_key_is_refused(client):
    with _config(), _repo_patch() as repo:
        assert _post(client, key='nope').status_code == 403
        assert _post(client, key=None).status_code == 403
    repo.assert_not_called()


# ── 2. the save-time test alert ───────────────────────────────────────────

def test_test_alert_is_acknowledged_without_a_ticket(client):
    with _config(), _repo_patch() as repo, _email_patch() as mail:
        resp = _post(client, TEST_ALERT)
    assert resp.status_code == 200
    repo.assert_not_called()
    mail.assert_not_called()


# ── 3. tickets ────────────────────────────────────────────────────────────

def test_alert_opens_an_urgent_ticket(client):
    with _config(), _repo_patch() as repo, _email_patch() as mail:
        repo.return_value.find_latest_by_canary_token.return_value = None
        repo.return_value.create.return_value = {'id': 't-1'}
        resp = _post(client)
    assert resp.status_code == 201
    row = repo.return_value.create.call_args.args[0]
    assert row['source'] == 'canary'
    assert row['priority'] == 'urgent'
    assert row['notify_reporter'] is False
    assert row['user_email'] is None
    assert row['title'] == 'Canarytoken fired: Optio Render prod backend env'
    assert '203.0.113.9' in row['message']
    assert row['extra']['canary_token'] == 'abc123tok'
    assert row['extra']['canary']['kind'] == 'alert'
    mail.assert_called_once()
    assert mail.call_args.args[0]['source'] == 'canary'


def test_exposure_opens_a_ticket_that_says_published(client):
    with _config(), _repo_patch() as repo, _email_patch():
        repo.return_value.find_latest_by_canary_token.return_value = None
        repo.return_value.create.return_value = {'id': 't-2'}
        resp = _post(client, EXPOSED)
    assert resp.status_code == 201
    row = repo.return_value.create.call_args.args[0]
    assert row['title'].startswith('Canarytoken published:')
    assert 'github.com/someone' in row['message']
    assert row['extra']['canary']['kind'] == 'exposed'


def test_repeat_on_open_ticket_is_a_note(client):
    with _config(), _repo_patch() as repo, _email_patch() as mail:
        repo.return_value.find_latest_by_canary_token.return_value = {'id': 't-1', 'status': 'triaged'}
        resp = _post(client)
    assert resp.status_code == 200
    repo.return_value.create.assert_not_called()
    note = repo.return_value.append_triage_note.call_args.args[1]
    assert '203.0.113.9' in note
    mail.assert_not_called()


def test_repeat_after_close_is_a_fresh_ticket(client):
    with _config(), _repo_patch() as repo, _email_patch():
        repo.return_value.find_latest_by_canary_token.return_value = {
            'id': 't-old', 'status': 'resolved', 'resolved_at': '2026-09-01'}
        repo.return_value.create.return_value = {'id': 't-3'}
        resp = _post(client)
    assert resp.status_code == 201
    assert 't-old' in repo.return_value.create.call_args.args[0]['triage_notes']


def test_payload_without_a_token_is_rejected(client):
    with _config(), _repo_patch() as repo:
        resp = _post(client, {'memo': 'x'})
    assert resp.status_code == 400
    repo.return_value.create.assert_not_called()


def test_long_fields_are_capped(client):
    with _config(), _repo_patch() as repo, _email_patch():
        repo.return_value.find_latest_by_canary_token.return_value = None
        repo.return_value.create.return_value = {'id': 't-4'}
        _post(client, dict(ALERT, src_ip='x' * 5000))
    row = repo.return_value.create.call_args.args[0]
    assert len(row['extra']['canary']['src_ip']) == 500


def test_canary_tickets_never_mail_a_reporter():
    from services.ticket_finalize_service import why_not_notify
    assert why_not_notify({'source': 'canary', 'user_email': 'a@b.c', 'resolution': 'done'}) == 'canary'
