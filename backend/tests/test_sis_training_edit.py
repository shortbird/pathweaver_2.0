"""
Reopening a training quest to change it.

iCreate, 2026-08-17: an admin fixing the wording of one task could not save.
Every attempt came back "That image was not uploaded here. Upload the file
instead of linking to it." — about an image they had never touched.

The quest had no uploaded artwork, so it carried the school logo (a base64 data
URI the create route fills in). The edit form was handed that string as its
image, and posting the form back sent it to a validator whose whole job is to
reject anything that is not an upload. The form was arguing with itself.

Two rules come out of it, and both are tested here:
  - the form is only ever given back an image it could legitimately re-send,
  - an image identical to the one already stored is a no-op, not an error.
"""

from unittest.mock import Mock, patch

import pytest

import routes.sis.staff_training as training

ORG = 'org-1'
QUEST = 'quest-1'
TRAINING_ID = 'training-1'

LOGO = 'data:image/png;base64,iVBORw0KGgo'
UPLOADED = f'https://x.supabase.co{training._HEADER_IMAGE_PATH}abc.png'


class _FakeTable:
    def __init__(self, name, rows, log):
        self.name, self._rows, self._log = name, rows, log

    def __getattr__(self, _n):
        return lambda *a, **k: self

    def update(self, payload):
        self._log.append(('update', self.name, payload))
        return self

    def insert(self, payload):
        self._log.append(('insert', self.name, payload))
        return self

    def delete(self):
        self._log.append(('delete', self.name, None))
        return self

    def execute(self):
        return Mock(data=self._rows)


def _client(rows, log):
    client = Mock()
    client.table.side_effect = lambda n: _FakeTable(n, rows.get(n, []), log)
    return client


def _item():
    return {'id': TRAINING_ID, 'organization_id': ORG, 'quest_id': QUEST,
            'audience': 'family', 'visible_to_roles': None, 'auto_assign': True,
            'category': None, 'is_required': False}


def _run(view, body=None, header_image=LOGO, tasks=None):
    """Drive one of the edit endpoints with a stubbed DB."""
    log = []
    rows = {
        'quests': [{'id': QUEST, 'organization_id': ORG, 'title': 'Orientation',
                    'big_idea': 'Look around', 'header_image_url': header_image,
                    'is_active': True, 'xp_threshold': 300,
                    'allow_custom_tasks': False, 'source_material': None}],
        'quest_template_tasks': tasks if tasks is not None else [
            {'title': 'Take a selfie', 'description': '', 'pillar': 'art',
             'xp_value': 25, 'is_required': True, 'order_index': 0}],
        'sis_staff_training': [_item()],
    }
    from flask import Flask
    app = Flask(__name__)
    with patch.object(training, '_admin', return_value=_client(rows, log)), \
         patch.object(training, '_owned_item', return_value=(_item(), None)), \
         app.test_request_context(json=body or {}):
        fn = getattr(view, '__wrapped__', view)
        resp = fn('user-1', TRAINING_ID)
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status, log


def _updates(log, table):
    return [p for (op, n, p) in log if op == 'update' and n == table]


@pytest.mark.unit
class TestWhatTheFormIsHandedBack:
    def test_the_org_logo_is_not_offered_as_the_forms_image(self):
        """It is not an upload, so the form could not send it back."""
        body, status, _ = _run(training.get_training_quest, header_image=LOGO)
        assert status == 200 and body['quest']['image_url'] == ''

    def test_a_stock_image_is_not_offered_either(self):
        body, _, _ = _run(training.get_training_quest,
                          header_image='https://images.unsplash.com/photo-1')
        assert body['quest']['image_url'] == ''

    def test_an_uploaded_image_is_offered_so_it_survives_a_save(self):
        body, _, _ = _run(training.get_training_quest, header_image=UPLOADED)
        assert body['quest']['image_url'] == UPLOADED


@pytest.mark.unit
class TestSavingEdits:
    def test_the_wording_of_a_task_can_be_changed(self):
        body, status, log = _run(training.update_training_quest, {
            'title': 'Orientation', 'tasks': [{'title': 'Take a photo of your room'}],
        })
        assert status == 200
        assert [(op, n) for (op, n, _p) in log if n == 'quest_template_tasks'] == [
            ('delete', 'quest_template_tasks'), ('insert', 'quest_template_tasks')]
        inserted = [p for (op, n, p) in log if op == 'insert' and n == 'quest_template_tasks'][0]
        assert inserted[0]['title'] == 'Take a photo of your room'

    def test_posting_back_the_artwork_it_already_has_is_not_an_error(self):
        """The bug. The form was given the logo and handed it straight back."""
        _body, status, _log = _run(training.update_training_quest,
                                   {'title': 'Orientation', 'image_url': LOGO},
                                   header_image=LOGO)
        assert status == 200

    def test_and_it_does_not_rewrite_the_header(self):
        _body, _status, log = _run(training.update_training_quest,
                                   {'title': 'Orientation', 'image_url': LOGO},
                                   header_image=LOGO)
        assert 'header_image_url' not in _updates(log, 'quests')[0]

    def test_a_new_upload_still_replaces_it(self):
        _body, status, log = _run(training.update_training_quest,
                                  {'title': 'Orientation', 'image_url': UPLOADED},
                                  header_image=LOGO)
        assert status == 200
        assert _updates(log, 'quests')[0]['header_image_url'] == UPLOADED

    def test_linking_to_somebody_elses_image_is_still_refused(self):
        body, status, _log = _run(training.update_training_quest,
                                  {'title': 'Orientation',
                                   'image_url': 'https://example.com/cat.png'},
                                  header_image=LOGO)
        assert status == 400 and 'uploaded here' in body['error']
