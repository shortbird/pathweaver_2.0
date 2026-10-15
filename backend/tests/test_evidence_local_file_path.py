"""
A path to a file on the student's own device is refused by the save route.

Ticket d0cc8d45 / Arete Academy, 2026-10-15: Maci pasted
`file:///home/chronos/u-.../Screenshot ....png` into a Link block 14 times.
The file never left her Chromebook and the grader showed nothing. The web and
mobile editors refuse these (474f4ca44); the server now refuses a NEW one too,
so an old cached bundle or app build cannot save it. One already stored on the
document stays, or every later edit to that document would fail.
"""

import inspect
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask

import routes.evidence_documents as evidence_documents
from utils.local_file_path import is_local_file_path, new_local_paths

CHROMEBOOK = ('file:///home/chronos/u-1ac4/MyFiles/Downloads/'
              'Screenshot%202026-07-23%208.43.22%20AM.png')


def _table(data=None):
    t = MagicMock()
    for m in ('select', 'eq', 'insert', 'update', 'order', 'limit', 'single'):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    return t


def _save(blocks, stored_links=()):
    tables = {
        'user_quest_tasks': _table([{'quest_id': 'q-1', 'title': 'T', 'xp_value': 50,
                                     'pillar': 'stem', 'user_id': 'student-1'}]),
        'user_quests': _table([{'id': 'uq-1'}]),
        'user_task_evidence_documents': _table([{'id': 'doc-1'}]),
        'evidence_document_blocks': _table(
            [{'content': {'items': [{'url': u}]}} for u in stored_links]),
        'quest_task_completions': _table([]),
    }
    client = MagicMock()
    client.table.side_effect = lambda name: tables[name]
    app = Flask(__name__)
    with patch.object(evidence_documents, 'get_supabase_admin_client', return_value=client), \
         patch.object(evidence_documents, 'current_student_scope', return_value=None), \
         patch.object(evidence_documents, 'update_document_blocks') as write, \
         app.test_request_context(method='POST', json={'blocks': blocks, 'status': 'draft'}):
        try:
            resp = inspect.unwrap(evidence_documents.save_evidence_document)('student-1', 'task-1')
        except Exception:  # past the check, the stub runs out; the write is what matters
            resp = None
    if resp is None:
        return None, None, write
    payload = resp[0].get_json() if isinstance(resp, tuple) else resp.get_json()
    status = resp[1] if isinstance(resp, tuple) else 200
    return payload, status, write


def _link(url):
    return {'type': 'link', 'content': {'items': [{'url': url, 'title': 'Unit 1'}]}}


@pytest.mark.unit
class TestLocalFilePathRule:
    @pytest.mark.parametrize('value', [
        CHROMEBOOK, 'blob:https://app.optioeducation.com/1234', 'content://media/1',
        'C:\\Users\\maci\\shot.png', 'C:/Users/maci/shot.png', '\\\\server\\share\\a.png',
        '/Users/maci/Desktop/a.png', '/home/maci/a.png', '~/a.png',
        'home/chronos/u-1ac4/MyFiles/a.png',
    ])
    def test_device_paths_are_local(self, value):
        """Ticket d0cc8d45: every shape the web rule refuses, the server refuses."""
        assert is_local_file_path(value)

    @pytest.mark.parametrize('value', [
        'https://www.khanacademy.org/math/unit-1', 'http://example.com/home/chronos/u-1',
        '', None, 'just some words',
    ])
    def test_web_links_are_not(self, value):
        """Ticket d0cc8d45: a real web link, even one mentioning chronos, is fine."""
        assert not is_local_file_path(value)

    def test_an_already_saved_path_is_not_new(self):
        """Ticket d0cc8d45: a stored path is the student's record, not a new one."""
        assert new_local_paths([_link(CHROMEBOOK)], {CHROMEBOOK}) == set()
        assert new_local_paths([_link(CHROMEBOOK)], set()) == {CHROMEBOOK}

    def test_only_link_blocks_are_checked(self):
        """Ticket d0cc8d45: an image block's in-flight blob: preview is the
        upload queue's business, not a pasted path."""
        block = {'type': 'image', 'content': {'items': [{'url': 'blob:https://x/1'}]}}
        assert new_local_paths([block], set()) == set()


@pytest.mark.unit
class TestSaveRouteRefusesNewLocalPaths:
    def test_a_new_chromebook_path_is_a_400_before_any_write(self):
        """Ticket d0cc8d45: the save answers 400 with the student's message and
        writes no block."""
        payload, status, write = _save([_link(CHROMEBOOK)])
        assert status == 400
        assert payload['code'] == 'local_file_path'
        assert 'Use Upload' in payload['error']
        write.assert_not_called()

    def test_a_path_already_on_the_document_still_saves(self):
        """Ticket d0cc8d45: Maci's 14 stored blocks must not make her
        documents uneditable."""
        payload, status, write = _save([_link(CHROMEBOOK)], stored_links=[CHROMEBOOK])
        assert status != 400
        write.assert_called_once()

    def test_a_real_link_saves(self):
        """Ticket d0cc8d45: an ordinary web link is untouched."""
        payload, status, write = _save([_link('https://www.khanacademy.org/math')])
        assert status != 400
        write.assert_called_once()
