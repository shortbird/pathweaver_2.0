"""Evidence write routes refuse a virtual moment-task id with a 400.

Sentry tickets 9f3206de / 8350643f / 2fe50e77 / 890f62fc (2026-10-02): a
student pressed Add on a moment shown as a task on the quest page. The page
sent its id, "moment-<uuid>", to POST /api/evidence/documents/<id>/upload-init
and POST /api/evidence/documents/<id>; both handed it to a uuid column and
Postgres answered "invalid input syntax for type uuid" (22P02), which the
routes turned into a 500. There is no task row or evidence document behind a
moment-task, so the answer is a 400 that names what to do instead, and no
query runs.

The GET route keeps its own answer for the same id (an empty document), which
the quest page relies on.
"""

from unittest.mock import MagicMock, patch

import pytest

MOMENT_ID = 'moment-915a0ca3-a8e4-4e67-a376-4a9471452d28'
AUTH = {'Authorization': 'Bearer t'}


@pytest.fixture
def admin():
    client = MagicMock()
    with patch('routes.evidence_documents.get_supabase_admin_client', return_value=client), \
         patch('routes.evidence_uploads.get_supabase_admin_client', return_value=client):
        yield client


@pytest.mark.parametrize('method, path, kwargs', [
    ('post', f'/api/evidence/documents/{MOMENT_ID}', {'json': {'blocks': [], 'status': 'draft'}}),
    ('put', f'/api/evidence/documents/{MOMENT_ID}', {'json': {'blocks': [], 'status': 'draft'}}),
    ('post', f'/api/evidence/documents/{MOMENT_ID}/complete', {'json': {}}),
    ('post', f'/api/evidence/documents/{MOMENT_ID}/upload-init',
     {'json': {'filename': 'photo.png', 'file_size': 2048, 'content_type': 'image/png'}}),
    ('post', f'/api/evidence/documents/{MOMENT_ID}/upload-finalize',
     {'json': {'storage_path': 'p', 'bucket': 'quest-evidence'}}),
])
def test_moment_task_id_is_refused_without_a_query(client, mock_verify_token, admin, method, path, kwargs):
    resp = getattr(client, method)(path, headers=AUTH, **kwargs)

    assert resp.status_code == 400
    body = resp.get_json()
    assert body['success'] is False
    assert 'learning moment' in body['error']
    admin.table.assert_not_called()


def test_multipart_upload_refuses_a_moment_task_id(client, mock_verify_token, admin):
    from io import BytesIO

    resp = client.post(
        f'/api/evidence/documents/{MOMENT_ID}/upload',
        data={'file': (BytesIO(b'x'), 'photo.png')},
        content_type='multipart/form-data',
        headers=AUTH,
    )

    assert resp.status_code == 400
    admin.table.assert_not_called()


def test_get_still_answers_an_empty_document_for_a_moment_task(client, mock_verify_token, admin):
    resp = client.get(f'/api/evidence/documents/{MOMENT_ID}', headers=AUTH)

    assert resp.status_code == 200
    assert resp.get_json() == {'success': True, 'document': None, 'blocks': []}


def test_a_real_task_id_still_reaches_the_task_lookup(client, mock_verify_token, admin):
    """The guard is the prefix, nothing wider: a task id goes on to the query."""
    admin.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

    resp = client.post(
        '/api/evidence/documents/task-1/upload-init',
        json={'filename': 'photo.png', 'file_size': 2048},
        headers=AUTH,
    )

    assert resp.status_code == 404
    admin.table.assert_any_call('user_quest_tasks')
