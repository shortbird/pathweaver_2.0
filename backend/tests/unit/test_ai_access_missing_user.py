"""A valid token whose users row is gone must not be an error, and must not be
granted AI access by the error fallback.

Sentry OPTIO-BACKEND-7J (2026-08-29): an Android session for a user that exists
in neither public.users nor auth.users hit /api/ai-access/status. The lookup
used .single(), which raises PGRST116 on zero rows; the except branch logged an
error and then returned has_access=True with every feature on -- the "on error,
grant" fallback written for transient DB failures, applied to a missing account.
"""
from unittest.mock import MagicMock, patch

from utils import ai_access


def _client_returning(rows):
    """A supabase admin client whose users query yields `rows`."""
    client = MagicMock()
    query = MagicMock()
    query.select.return_value = query
    query.eq.return_value = query
    query.limit.return_value = query
    query.execute.return_value = MagicMock(data=rows)
    client.table.return_value = query
    return client, query


class TestMissingUserRow:
    def test_status_reports_no_access_without_logging_an_error(self):
        client, query = _client_returning([])
        with patch.object(ai_access, 'get_supabase_admin_client', return_value=client), \
             patch.object(ai_access.logger, 'error') as log_error:
            result = ai_access.get_ai_feature_status('ghost-user')

        assert result['has_access'] is False
        assert result['code'] == 'USER_NOT_FOUND'
        assert result['features'] == {'chatbot': False, 'lesson_helper': False,
                                      'task_generation': False}
        log_error.assert_not_called()
        # The read must not be .single(): that is what turned "no row" into an
        # exception in the first place.
        query.single.assert_not_called()
        query.limit.assert_called_once_with(1)

    def test_check_ai_access_returns_404_for_a_missing_row(self):
        client, query = _client_returning([])
        with patch.object(ai_access, 'get_supabase_admin_client', return_value=client):
            has_access, error, status = ai_access.check_ai_access('ghost-user')

        assert has_access is False
        assert status == 404
        assert error == {'error': 'User not found'}
        query.single.assert_not_called()

    def test_a_present_row_is_still_read_as_one_dict(self):
        row = {'id': 'u1', 'is_dependent': False, 'ai_features_enabled': True,
               'organization_id': None, 'ai_chatbot_enabled': True,
               'ai_lesson_helper_enabled': False, 'ai_task_generation_enabled': True}
        client, _ = _client_returning([row])
        with patch.object(ai_access, 'get_supabase_admin_client', return_value=client):
            result = ai_access.get_ai_feature_status('u1')

        assert result['has_access'] is True
        assert result['features'] == {'chatbot': True, 'lesson_helper': False,
                                      'task_generation': True}
