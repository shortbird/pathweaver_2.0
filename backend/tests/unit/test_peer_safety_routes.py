"""The routes of Friends phase 3: reporting peer text, the queue's takedown,
the cron sweep's gate, and a parent's hide."""

import json
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

COMMENT_ID = '00000000-0000-4000-8000-000000000c01'


def _headers():
    return {'Authorization': 'Bearer t', 'Content-Type': 'application/json'}


@pytest.mark.parametrize('target_type', ['peer_comment', 'message', 'group_message'])
def test_a_peer_comment_or_a_message_can_be_reported(client, mock_verify_token, target_type):
    supabase = MagicMock()
    table = supabase.table.return_value
    table.select.return_value.eq.return_value.eq.return_value.eq.return_value \
        .limit.return_value.execute.return_value = MagicMock(data=[])
    table.insert.return_value.execute.return_value = MagicMock(data=[{'id': 'rep-1'}])
    with patch('routes.moderation.get_supabase_admin_client', return_value=supabase):
        resp = client.post('/api/moderation/report', headers=_headers(), data=json.dumps({
            'target_type': target_type, 'target_id': COMMENT_ID, 'reason': 'harassment'}))
    assert resp.status_code == 201
    assert table.insert.call_args.args[0]['target_type'] == target_type


def _queue_app():
    from routes.admin.moderation_queue import bp, update_report, text_screen_sweep
    app = Flask(__name__)
    app.register_blueprint(bp)
    return app, update_report.__wrapped__, text_screen_sweep


def test_actioned_takes_the_target_down_and_says_so():
    app, view, _ = _queue_app()
    supabase = MagicMock()
    with app.test_request_context('/api/admin/moderation/reports/r1', method='PATCH',
                                  json={'status': 'actioned'}), \
         patch('routes.admin.moderation_queue.get_supabase_admin_client', return_value=supabase), \
         patch('repositories.content_report_repository.ContentReportRepository') as repo_cls, \
         patch('services.content_takedown_service.take_down',
               return_value={'taken_down': True}) as take_down:
        repo_cls.return_value.get.return_value = {'id': 'r1', 'target_type': 'peer_comment',
                                                  'target_id': COMMENT_ID}
        resp, status = view('admin-1', 'r1')
    assert status == 200
    assert resp.get_json()['takedown'] == {'taken_down': True}
    take_down.assert_called_once()
    assert take_down.call_args.args[1] == 'admin-1'
    assert supabase.table.return_value.update.call_args.args[0]['status'] == 'actioned'


def test_dismissed_touches_nothing():
    app, view, _ = _queue_app()
    supabase = MagicMock()
    with app.test_request_context('/api/admin/moderation/reports/r1', method='PATCH',
                                  json={'status': 'dismissed'}), \
         patch('routes.admin.moderation_queue.get_supabase_admin_client', return_value=supabase), \
         patch('services.content_takedown_service.take_down') as take_down:
        resp, status = view('admin-1', 'r1')
    assert status == 200
    assert resp.get_json()['takedown'] is None
    take_down.assert_not_called()


def test_the_sweep_runs_for_the_cron_secret_and_refuses_everyone_else():
    app, _, sweep = _queue_app()
    with app.test_request_context('/api/admin/moderation/internal/text-screen-sweep',
                                  method='POST', headers={'X-Cron-Secret': 'right'}), \
         patch('utils.cron_auth.is_valid_cron_secret', return_value=True), \
         patch('services.peer_text_screen_service.rescreen_pending',
               return_value={'screened': 1, 'hidden': 0, 'still_pending': 0}) as run:
        resp, status = sweep()
    assert status == 200
    assert resp.get_json()['screened'] == 1
    run.assert_called_once()

    with app.test_request_context('/api/admin/moderation/internal/text-screen-sweep',
                                  method='POST'), \
         patch('utils.cron_auth.is_valid_cron_secret', return_value=False), \
         patch('utils.session_manager.session_manager.get_effective_user_id', return_value=None), \
         patch('services.peer_text_screen_service.rescreen_pending') as run:
        resp, status = sweep()
    assert status == 401
    run.assert_not_called()


def test_the_sweep_takes_its_limit_from_config_by_default():
    from app_config import Config
    app, _, sweep = _queue_app()
    with app.test_request_context('/api/admin/moderation/internal/text-screen-sweep',
                                  method='POST'), \
         patch('utils.cron_auth.is_valid_cron_secret', return_value=True), \
         patch('services.peer_text_screen_service.rescreen_pending',
               return_value={}) as run:
        sweep()
    run.assert_called_once_with(Config.PEER_TEXT_SCREEN_SWEEP_LIMIT)


def test_the_cron_dispatcher_calls_the_sweep_every_tick():
    from pathlib import Path
    src = (Path(__file__).resolve().parents[2] / 'jobs' / 'cron_dispatch.py').read_text()
    assert '/api/admin/moderation/internal/text-screen-sweep' in src


def test_a_parent_hides_a_comment_through_the_route(client, mock_verify_token):
    with patch('routes.connections.svc.hide_comment',
               return_value={'id': COMMENT_ID, 'hidden': True}) as hide, \
         patch('modules.gate.check_module', return_value=None):
        resp = client.post(f'/api/connections/comments/{COMMENT_ID}/hide', headers=_headers())
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()['data'] == {'id': COMMENT_ID, 'hidden': True}
    hide.assert_called_once_with('test-user-123', COMMENT_ID)


def test_the_hide_route_reads_the_services_no_as_not_found(client, mock_verify_token):
    from services.peer_connection_service import PeerConnectionError
    with patch('routes.connections.svc.hide_comment',
               side_effect=PeerConnectionError('Comment not found')), \
         patch('modules.gate.check_module', return_value=None):
        resp = client.post(f'/api/connections/comments/{COMMENT_ID}/hide', headers=_headers())
    assert resp.status_code in (400, 403, 404)


def test_the_screen_tracker_is_superadmin_only_and_clamps_its_window():
    """The superadmin home's card reads one SQL function; the route only
    bounds the window and refuses non-integers."""
    from routes.admin.moderation_queue import bp, screen_stats
    app = Flask(__name__)
    app.register_blueprint(bp)
    view = screen_stats.__wrapped__
    repo = MagicMock()
    repo.screen_stats.return_value = {'days': 7, 'surfaces': {}, 'model': {}}
    with app.test_request_context('/api/admin/moderation/screen-stats?days=400'), \
         patch('repositories.peer_text_screen_repository.PeerTextScreenRepository', return_value=repo):
        resp, status = view('admin-1')
    assert status == 200
    repo.screen_stats.assert_called_once_with(90)
    assert resp.get_json()['days'] == 7
    with app.test_request_context('/api/admin/moderation/screen-stats?days=soon'), \
         patch('repositories.peer_text_screen_repository.PeerTextScreenRepository', return_value=repo):
        _, status = view('admin-1')
    assert status == 400


def test_the_screen_tracker_route_is_gated_by_superadmin():
    import inspect
    from routes.admin import moderation_queue as mq
    src = inspect.getsource(mq)
    at = src.index("@bp.route('/screen-stats'")
    assert '@require_superadmin' in src[at:at + 200]


def test_a_parent_opens_a_hold_through_the_route(client, mock_verify_token):
    with patch('services.peer_connection_service.hold_for_guardian',
               return_value={'id': 'h1', 'text': 'x'}) as svc:
        resp = client.get('/api/connections/holds/1b5cf0c4-ef50-4a1b-8b2a-0b5a2a6f1a11',
                          headers=_headers())
    assert resp.status_code == 200
    assert resp.get_json()['data'] == {'id': 'h1', 'text': 'x'}
    assert svc.call_args.args[1] == '1b5cf0c4-ef50-4a1b-8b2a-0b5a2a6f1a11'


def test_the_hold_route_reads_the_services_no_as_a_client_error(client, mock_verify_token):
    from services.peer_connection_service import PeerConnectionError
    with patch('services.peer_connection_service.hold_for_guardian',
               side_effect=PeerConnectionError('Not found')):
        resp = client.get('/api/connections/holds/1b5cf0c4-ef50-4a1b-8b2a-0b5a2a6f1a11',
                          headers=_headers())
    assert resp.status_code == 400
