"""POST /api/webhooks/sentry -- a Sentry issue alert opens a ticket.

Three properties the endpoint must hold:

  1. It is CLOSED while unconfigured, and closed to an unsigned or badly
     signed body. A webhook that files tickets on any POST is a spam surface
     with a public URL.
  2. One ticket per open Sentry issue. A repeat alert appends a note to the
     open ticket; an alert after the ticket was closed opens a fresh ticket
     that names the closed one.
  3. Only issue alerts from production file anything. The installation
     handshake, other resources and dev-environment events are acknowledged
     with 200 and dropped.
"""

import hashlib
import hmac
import json
from unittest.mock import patch

SECRET = 'client-secret'

# The shape Sentry's integration platform sends for an issue-alert action
# (Sentry-Hook-Resource: event_alert), trimmed to the fields the route reads.
ALERT = {
    'action': 'triggered',
    'actor': {'id': 'sentry', 'name': 'Sentry', 'type': 'application'},
    'installation': {'uuid': 'inst-1'},
    'data': {
        'triggered_rule': 'Send a notification for high priority issues',
        'event': {
            'event_id': 'e4874d664c3540c1a32eab185f12c5ab',
            'issue_id': '6789',
            'title': "KeyError: 'organization_id'",
            'culprit': 'routes.sis.enrollment in create_enrollment',
            'level': 'error',
            'environment': 'production',
            'release': 'abc1234',
            'platform': 'python',
            'url': 'https://sentry.io/api/0/projects/shortbird/optio-backend/events/e4874d664c3540c1a32eab185f12c5ab/',
            'web_url': 'https://sentry.io/organizations/shortbird/issues/6789/events/e4874d664c3540c1a32eab185f12c5ab/',
            'issue_url': 'https://sentry.io/api/0/organizations/shortbird/issues/6789/',
            'tags': [['environment', 'production'], ['transaction', '/api/sis/enrollments'], ['level', 'error']],
            'user': {'id': 'user-uuid', 'email': 'kellee@horizon.example'},
            'request': {'url': 'https://api.optioeducation.com/api/sis/enrollments', 'method': 'POST'},
        },
    },
}


def _sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _post(client, payload=ALERT, resource='event_alert', secret=SECRET, signature=None):
    body = json.dumps(payload).encode()
    headers = {
        'Content-Type': 'application/json',
        'Sentry-Hook-Resource': resource,
    }
    sig = signature if signature is not None else _sign(body, secret)
    if sig:
        headers['Sentry-Hook-Signature'] = sig
    return client.post('/api/webhooks/sentry', data=body, headers=headers)


def _repo_patch():
    """Patch the repository the route builds; returns the mock class."""
    return patch('routes.sentry_webhook.BugReportRepository')


# ── 1. closed unless signed ────────────────────────────────────────────────

def test_unconfigured_endpoint_refuses_everything(client):
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', None), _repo_patch() as repo:
        resp = _post(client)
    assert resp.status_code == 403
    repo.assert_not_called()


def test_wrong_signature_is_refused(client):
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        resp = _post(client, secret='not-the-secret')
    assert resp.status_code == 403
    repo.assert_not_called()


def test_missing_signature_is_refused(client):
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        resp = _post(client, signature='')
    assert resp.status_code == 403
    repo.assert_not_called()


# ── 2. what gets filed ─────────────────────────────────────────────────────

def test_alert_opens_a_ticket(client):
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        instance = repo.return_value
        instance.find_latest_by_sentry_issue.return_value = None
        instance.create.return_value = {'id': 'ticket-1'}
        resp = _post(client)

    assert resp.status_code == 201
    assert resp.get_json() == {'status': 'created', 'report_id': 'ticket-1'}
    instance.find_latest_by_sentry_issue.assert_called_once_with('optio-backend:6789')

    record = instance.create.call_args[0][0]
    assert record['source'] == 'sentry'
    assert record['type'] == 'bug'
    assert record['status'] == 'new'
    assert record['priority'] == 'high'          # level: error
    assert record['title'] == "[backend] KeyError: 'organization_id'"
    assert record['platform'] == 'backend'
    assert record['current_route'] == '/api/sis/enrollments'
    assert record['user_email'] == 'kellee@horizon.example'
    assert record['app_version'] == 'abc1234'
    assert record['sentry_event_id'] == 'e4874d664c3540c1a32eab185f12c5ab'
    assert record['extra']['sentry_issue_id'] == 'optio-backend:6789'
    assert record['extra']['sentry']['web_url'] == ALERT['data']['event']['web_url']
    assert record['extra']['sentry']['triggered_rule'] == ALERT['data']['triggered_rule']
    assert 'triage_notes' not in record
    # The body carries the link back and the rule that fired.
    assert ALERT['data']['event']['web_url'] in record['message']
    assert 'high priority' in record['message']


def test_fatal_is_urgent_and_warning_is_normal(client):
    for level, priority in (('fatal', 'urgent'), ('warning', 'normal'), ('info', 'low'), ('', 'high')):
        payload = json.loads(json.dumps(ALERT))
        payload['data']['event']['level'] = level
        with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
            instance = repo.return_value
            instance.find_latest_by_sentry_issue.return_value = None
            instance.create.return_value = {'id': 't'}
            resp = _post(client, payload=payload)
        assert resp.status_code == 201, level
        assert instance.create.call_args[0][0]['priority'] == priority, level


def test_title_is_trimmed_to_the_column_limit(client):
    payload = json.loads(json.dumps(ALERT))
    payload['data']['event']['title'] = 'x' * 400
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        instance = repo.return_value
        instance.find_latest_by_sentry_issue.return_value = None
        instance.create.return_value = {'id': 't'}
        _post(client, payload=payload)
    assert len(instance.create.call_args[0][0]['title']) == 120


def test_project_slug_falls_back_when_url_is_missing(client):
    payload = json.loads(json.dumps(ALERT))
    del payload['data']['event']['url']
    payload['data']['event']['project'] = 4509000000000000
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        instance = repo.return_value
        instance.find_latest_by_sentry_issue.return_value = None
        instance.create.return_value = {'id': 't'}
        resp = _post(client, payload=payload)
    assert resp.status_code == 201
    assert instance.create.call_args[0][0]['extra']['sentry_issue_id'] == '4509000000000000:6789'


# ── 2b. one ticket per open issue ──────────────────────────────────────────

def test_repeat_alert_notes_the_open_ticket_instead_of_a_new_one(client):
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        instance = repo.return_value
        instance.find_latest_by_sentry_issue.return_value = {
            'id': 'ticket-1', 'status': 'triaged', 'resolved_at': None, 'triage_notes': 'looked at it',
        }
        resp = _post(client)

    assert resp.status_code == 200
    assert resp.get_json() == {'status': 'noted', 'report_id': 'ticket-1'}
    instance.create.assert_not_called()
    ticket_id, note = instance.append_triage_note.call_args[0]
    assert ticket_id == 'ticket-1'
    assert note.startswith('Sentry: fired again ')
    assert 'e4874d664c3540c1a32eab185f12c5ab' in note
    assert ALERT['data']['event']['web_url'] in note


def test_alert_after_the_ticket_was_closed_opens_a_regression_ticket(client):
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        instance = repo.return_value
        instance.find_latest_by_sentry_issue.return_value = {
            'id': 'ticket-old', 'status': 'resolved', 'resolved_at': '2026-09-01T10:00:00+00:00',
        }
        instance.create.return_value = {'id': 'ticket-new'}
        resp = _post(client)

    assert resp.status_code == 201
    assert resp.get_json()['report_id'] == 'ticket-new'
    instance.append_triage_note.assert_not_called()
    record = instance.create.call_args[0][0]
    assert record['status'] == 'new'
    assert 'ticket-old' in record['triage_notes']
    assert 'resolved' in record['triage_notes']


# ── 3. acknowledged and dropped ────────────────────────────────────────────

def test_installation_handshake_is_acknowledged(client):
    payload = {'action': 'created', 'data': {'installation': {'uuid': 'inst-1', 'status': 'installed'}}}
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        resp = _post(client, payload=payload, resource='installation')
    assert resp.status_code == 200
    assert resp.get_json()['status'] == 'ignored'
    repo.assert_not_called()


def test_issue_resource_is_acknowledged_not_filed(client):
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        resp = _post(client, payload={'action': 'created', 'data': {'issue': {'id': '1'}}}, resource='issue')
    assert resp.status_code == 200
    repo.assert_not_called()


def test_development_events_do_not_file_tickets(client):
    payload = json.loads(json.dumps(ALERT))
    payload['data']['event']['environment'] = 'development'
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        resp = _post(client, payload=payload)
    assert resp.status_code == 200
    assert resp.get_json() == {'status': 'ignored', 'environment': 'development'}
    repo.assert_not_called()


def test_event_without_environment_still_files(client):
    # The mobile SDK only sets an environment in a dev build.
    payload = json.loads(json.dumps(ALERT))
    del payload['data']['event']['environment']
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        instance = repo.return_value
        instance.find_latest_by_sentry_issue.return_value = None
        instance.create.return_value = {'id': 't'}
        resp = _post(client, payload=payload)
    assert resp.status_code == 201


def test_payload_without_an_issue_is_a_400(client):
    payload = {'action': 'triggered', 'data': {'event': {'title': 'no issue id'}}}
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        resp = _post(client, payload=payload)
    assert resp.status_code == 400
    repo.assert_not_called()


def test_database_failure_is_a_500_not_a_crash(client):
    with patch('app_config.Config.SENTRY_WEBHOOK_SECRET', SECRET), _repo_patch() as repo:
        repo.return_value.find_latest_by_sentry_issue.side_effect = RuntimeError('db down')
        resp = _post(client)
    assert resp.status_code == 500
    assert resp.get_json() == {'error': 'ticket not filed'}
