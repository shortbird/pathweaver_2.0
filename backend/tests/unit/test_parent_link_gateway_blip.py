"""A Supabase gateway blip during a parent-link check is a 503, not a 403.

Ticket 79e84902 (Sentry, optio-backend): a parent on iOS removed evidence she
had uploaded for her child (DELETE /api/evidence/helper/blocks/<id>). The
parent-link lookup hit a PostgREST 502 ('JSON could not be generated').
ParentRepository.is_linked caught every exception, logged it at error level and
answered False, so has_parent_claim said "not her child" and the route answered
403 "You do not have access to this student's data". An outage looked like a
permission denial, and the error log filed a Sentry issue.

This is a missed case of e6e32e154, which taught utils.retry_handler.
is_retryable_error to recognise a gateway 502/503/504 and taught the global
ErrorHandler to answer those with 503 + Retry-After and a warning. The lookup
now re-raises a retryable error, and the helper-evidence routes let it reach the
global handler instead of answering 500 themselves.
"""

from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from postgrest.exceptions import APIError

from middleware.error_handler import ErrorHandler
from repositories.parent_repository import ParentRepository
from routes import helper_evidence


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
CHILD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
BLOCK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'


def _gateway_error():
    return APIError({'code': 502, 'message': 'JSON could not be generated',
                     'details': '502 Bad Gateway', 'hint': None})


@pytest.mark.unit
class TestIsLinkedOnAGatewayBlip:
    def test_a_postgrest_502_is_raised_and_logged_as_a_warning(self):
        repo = ParentRepository(client=MagicMock())
        with patch('utils.portfolio_access.is_parent_of',
                   side_effect=_gateway_error()), \
             patch('repositories.parent_repository.logger') as log:
            with pytest.raises(APIError) as exc:
                repo.is_linked(PARENT, CHILD)
        assert 'JSON could not be generated' in str(exc.value)
        log.error.assert_not_called()
        assert log.warning.called

    def test_a_non_retryable_error_still_answers_false(self):
        """Other callers rely on the fail-closed default for a real defect."""
        repo = ParentRepository(client=MagicMock())
        with patch('utils.portfolio_access.is_parent_of',
                   side_effect=ValueError('bad state')), \
             patch('repositories.parent_repository.logger') as log:
            assert repo.is_linked(PARENT, CHILD) is False
        assert log.error.called

    def test_link_exists_re_raises_a_502_too(self):
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value \
            .eq.return_value.execute.side_effect = _gateway_error()
        with patch('repositories.parent_repository.logger') as log:
            with pytest.raises(APIError):
                ParentRepository(client=client).link_exists(PARENT, CHILD)
        log.error.assert_not_called()

    def test_link_exists_still_answers_false_on_a_non_retryable_error(self):
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value \
            .eq.return_value.execute.side_effect = ValueError('bad state')
        assert ParentRepository(client=client).link_exists(PARENT, CHILD) is False


class _Query:
    """A chainable stand-in for one supabase.table(...) call."""

    def __init__(self, table, log):
        self.table = table
        self.log = log
        self.op = 'select'

    def select(self, *_a, **_k):
        return self

    def delete(self):
        self.op = 'delete'
        self.log.append((self.table, 'delete'))
        return self

    def eq(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self.op == 'delete':
            return MagicMock(data=[])
        if self.table == 'evidence_document_blocks':
            return MagicMock(data=[{
                'id': BLOCK, 'document_id': DOC, 'content': {},
                'block_type': 'text', 'uploaded_by_user_id': PARENT,
                'uploaded_by_role': 'parent',
            }])
        if self.table == 'user_task_evidence_documents':
            return MagicMock(data=[{'id': DOC, 'user_id': CHILD}])
        return MagicMock(data=[])


def _client():
    app = Flask(__name__)
    ErrorHandler().init_app(app)
    view = helper_evidence.delete_helper_evidence_block.__wrapped__

    @app.route('/blocks/<block_id>', methods=['DELETE'])
    def delete(block_id):
        return view(PARENT, block_id)

    return app.test_client()


@pytest.mark.unit
def test_delete_helper_block_during_a_gateway_blip_is_a_503_and_deletes_nothing():
    """The ticket. Before the fix this answered 403 'You do not have access'."""
    writes = []
    supabase = MagicMock()
    supabase.table.side_effect = lambda name: _Query(name, writes)
    with patch.object(helper_evidence, 'get_supabase_admin_client',
                      return_value=supabase), \
         patch('utils.portfolio_access.is_parent_of',
               side_effect=_gateway_error()), \
         patch('sentry_sdk.capture_exception') as sentry:
        r = _client().delete(f'/blocks/{BLOCK}')
    assert r.status_code == 503, r.get_data(as_text=True)
    assert int(r.headers['Retry-After']) > 0
    assert writes == []
    sentry.assert_not_called()


@pytest.mark.unit
def test_delete_helper_block_with_a_real_link_still_succeeds():
    writes = []
    supabase = MagicMock()
    supabase.table.side_effect = lambda name: _Query(name, writes)
    with patch.object(helper_evidence, 'get_supabase_admin_client',
                      return_value=supabase), \
         patch('utils.portfolio_access.is_parent_of', return_value=True):
        r = _client().delete(f'/blocks/{BLOCK}')
    assert r.status_code == 200, r.get_data(as_text=True)
    assert ('evidence_document_blocks', 'delete') in writes
