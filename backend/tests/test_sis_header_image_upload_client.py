"""
Header image uploads on the SIS quest editor and the training builder.

Tickets 4a2f5cb3, d1aac23f, bd9d92be: both routes built
`FileUploadService()` with no Supabase client. The constructor requires one,
so every upload raised TypeError before it touched storage and the editor
showed a 500. These tests drive the real service with a stubbed client, so
the old bare call fails here exactly the way it failed in production.
"""

import inspect
import io
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import routes.sis.quest_editor as quest_editor
import routes.sis.staff_training as staff_training


ORG = 'org-1'
QUEST = {'id': 'quest-1', 'organization_id': ORG}


def _png_bytes():
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (4, 4), (200, 30, 30)).save(buf, format='PNG')
    return buf.getvalue()


def _storage_client():
    client = MagicMock()
    client.storage.from_.return_value.get_public_url.return_value = (
        'https://cdn.example/quest-headers/quests/x/header.png')
    return client


def _post_image(route_fn, *args, client):
    app = Flask(__name__)
    data = {'image': (io.BytesIO(_png_bytes()), 'header.png', 'image/png')}
    with app.test_request_context(method='POST', data=data,
                                  content_type='multipart/form-data'):
        resp = inspect.unwrap(route_fn)(*args)
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status


@pytest.mark.unit
class TestQuestEditorHeaderUpload:
    def test_upload_gives_the_service_a_client_and_returns_200(self):
        """Tickets 4a2f5cb3 / d1aac23f / bd9d92be: the quest editor upload
        must build FileUploadService with a client and save the image."""
        client = _storage_client()
        with patch.object(quest_editor, '_admin', return_value=client), \
             patch.object(quest_editor, '_load_editable', return_value=(ORG, QUEST, None)), \
             patch.object(quest_editor.editor, 'set_header_image',
                          return_value={'quest': {'id': 'quest-1'}}) as set_img:
            payload, status = _post_image(quest_editor.upload_header_image,
                                          'user-1', 'quest-1', client=client)
        assert status == 200, payload
        assert payload['success'] is True
        client.storage.from_.assert_any_call('quest-headers')
        client.storage.from_.return_value.upload.assert_called_once()
        set_img.assert_called_once()
        assert set_img.call_args[0][2].startswith('https://cdn.example/')


@pytest.mark.unit
class TestTrainingHeaderUpload:
    def test_upload_gives_the_service_a_client_and_returns_200(self):
        """Tickets 4a2f5cb3 / d1aac23f / bd9d92be: the training builder
        upload must build FileUploadService with a client and return the URL."""
        client = _storage_client()
        with patch.object(staff_training, '_admin', return_value=client), \
             patch('services.sis_service.org_or_error', return_value=(ORG, None)):
            payload, status = _post_image(staff_training.upload_training_header_image,
                                          'user-1', client=client)
        assert status == 200, payload
        assert payload == {'success': True,
                           'url': 'https://cdn.example/quest-headers/quests/x/header.png'}
        client.storage.from_.assert_any_call('quest-headers')
        client.storage.from_.return_value.upload.assert_called_once()
