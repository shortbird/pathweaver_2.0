"""POST /api/interest-tracks/<id>/evolve accepts an empty body.

The mobile app's Evolve button posted ``{}`` and every tap died with
"Request body is required" (reported 2026-08-30). The service already
generates title/description/tasks with AI when none are supplied, so the
route only insists on a title when the caller sends its own reviewed tasks.
"""
import json
from unittest.mock import patch

TRACK_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
URL = f'/api/interest-tracks/{TRACK_ID}/evolve'
JSON_HEADERS = {'Authorization': 'Bearer t', 'Content-Type': 'application/json'}
SERVICE_OK = {
    'success': True,
    'quest': {'id': 'q1', 'title': 'Parkour'},
    'quest_id': 'q1',
    'tasks_created': 3,
    'message': 'Evolved',
}


def _post(client, body=None, headers=JSON_HEADERS):
    with patch(
        'routes.interest_tracks.InterestTracksService.evolve_to_quest',
        return_value=SERVICE_OK,
    ) as evolve:
        resp = client.post(URL, headers=headers, data=body)
    return resp, evolve


def test_empty_json_body_lets_the_service_generate_the_structure(client, mock_verify_token):
    resp, evolve = _post(client, json.dumps({}))

    assert resp.status_code == 201
    assert resp.get_json()['quest_id'] == 'q1'
    kwargs = evolve.call_args.kwargs
    assert kwargs['track_id'] == TRACK_ID
    assert kwargs['title'] is None
    assert kwargs['description'] is None
    assert kwargs['tasks'] is None


def test_json_null_body_is_treated_as_empty(client, mock_verify_token):
    # The platform middleware already insists on Content-Type: application/json
    # for every POST, so "no body" in practice means a JSON body that isn't an
    # object. That must not 500 on data.get().
    resp, evolve = _post(client, 'null')

    assert resp.status_code == 201
    assert evolve.call_args.kwargs['title'] is None


def test_reviewed_structure_is_passed_through_trimmed(client, mock_verify_token):
    tasks = [{'title': 'Land a front flip', 'pillar': 'wellness', 'xp_value': 50}]
    resp, evolve = _post(client, json.dumps({
        'title': '  Parkour  ',
        'description': ' Flips and vaults ',
        'tasks': tasks,
    }))

    assert resp.status_code == 201
    kwargs = evolve.call_args.kwargs
    assert kwargs['title'] == 'Parkour'
    assert kwargs['description'] == 'Flips and vaults'
    assert kwargs['tasks'] == tasks


def test_tasks_without_a_title_is_rejected(client, mock_verify_token):
    resp, evolve = _post(client, json.dumps({'title': '   ', 'tasks': [{'title': 'x'}]}))

    assert resp.status_code == 400
    assert 'title' in resp.get_json()['error'].lower()
    evolve.assert_not_called()


def test_non_string_title_is_treated_as_missing(client, mock_verify_token):
    resp, evolve = _post(client, json.dumps({'title': 42}))

    assert resp.status_code == 201
    assert evolve.call_args.kwargs['title'] is None


def test_service_failure_is_reported_not_swallowed(client, mock_verify_token):
    with patch(
        'routes.interest_tracks.InterestTracksService.evolve_to_quest',
        return_value={'success': False, 'error': 'Track needs at least 5 moments to evolve (currently has 2)'},
    ):
        resp = client.post(URL, headers=JSON_HEADERS, data=json.dumps({}))

    assert resp.status_code == 400
    assert 'at least 5 moments' in resp.get_json()['error']
