"""
The silent-truncation canary.

PostgREST caps a response at db-max-rows and supabase-py exposes only `data` and
`count`, so a truncated read is invisible at the call site — that is how the SIS
class list under-reported enrollment with no error and no log line. The canary
reads `Content-Range` off the httpx session and warns when a response comes back
holding exactly the cap.

Two properties matter, and both are pinned here: it must fire on a truncated
read, and it must NEVER be able to break a query.
"""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from utils import db_truncation_canary as canary


@pytest.fixture(autouse=True)
def _clear_dedupe():
    canary._reported.clear()
    yield
    canary._reported.clear()


def _response(content_range, url='https://x.supabase.co/rest/v1/class_enrollments'
                                 '?class_id=in.%28a%2Cb%29&status=eq.active'):
    headers = {} if content_range is None else {'content-range': content_range}
    return httpx.Response(
        200, headers=headers, json=[],
        request=httpx.Request('GET', url),
    )


@pytest.mark.unit
class TestRowsInContentRange:
    @pytest.mark.parametrize('value,expected', [
        ('0-999/*', 1000),
        ('0-999/1070', 1000),
        ('0-13/*', 14),
        ('1000-1069/1070', 70),
        ('0-0/*', 1),
    ])
    def test_parses_the_row_span(self, value, expected):
        assert canary._rows_in(value) == expected

    @pytest.mark.parametrize('value', ['*/0', '*/*', '', 'garbage', 'a-b/*'])
    def test_unparseable_or_empty_ranges_are_ignored(self, value):
        assert canary._rows_in(value) is None


@pytest.mark.unit
class TestFiring:
    def test_warns_when_a_response_holds_exactly_the_cap(self):
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning') as warn:
            canary._on_response(_response('0-999/*'))

        warn.assert_called_once()
        msg = warn.call_args[0][0]
        assert 'TRUNCATED' in msg
        assert 'class_enrollments' in msg
        assert 'fetch_all_rows' in msg  # tells the reader what to do

    def test_silent_on_a_normal_short_read(self):
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning') as warn:
            canary._on_response(_response('0-13/*'))

        warn.assert_not_called()

    def test_silent_when_there_is_no_content_range(self):
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning') as warn:
            canary._on_response(_response(None))

        warn.assert_not_called()

    def test_each_query_shape_is_reported_once(self):
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning') as warn:
            for _ in range(5):
                canary._on_response(_response('0-999/*'))

        assert warn.call_count == 1

    def test_different_tables_are_reported_separately(self):
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning') as warn:
            canary._on_response(_response('0-999/*', 'https://x/rest/v1/a?x=1'))
            canary._on_response(_response('0-999/*', 'https://x/rest/v1/b?x=1'))

        assert warn.call_count == 2

    def test_the_dedupe_set_is_bounded(self):
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning'):
            for i in range(canary._MAX_REPORTED + 50):
                canary._on_response(_response('0-999/*', f'https://x/rest/v1/t{i}?x=1'))

        assert len(canary._reported) <= canary._MAX_REPORTED

    def test_silent_on_a_full_page_of_an_explicitly_paged_read(self):
        """fetch_all_rows pages at exactly the cap, so every full page holds
        cap rows — that is paging working, not truncation. Warning on it buried
        the real hits under noise (OPTIO-BACKEND-39: 180 events from the one
        read pattern that cannot silently truncate)."""
        url = ('https://x/rest/v1/class_enrollments?class_id=in.%28a%2Cb%29'
               '&status=eq.active&order=id&limit=1000&offset=0')
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning') as warn:
            canary._on_response(_response('0-999/*', url))

        warn.assert_not_called()

    def test_warns_when_the_requested_limit_exceeds_the_cap(self):
        """`.limit(5000)` capped to 1000 rows IS silent truncation — PostgREST
        overrode the caller's bound, which is exactly the trap being watched."""
        url = 'https://x/rest/v1/class_enrollments?status=eq.active&limit=5000'
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning') as warn:
            canary._on_response(_response('0-999/*', url))

        warn.assert_called_once()

    def test_an_unparseable_limit_still_warns(self):
        url = 'https://x/rest/v1/class_enrollments?status=eq.active&limit=abc'
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning') as warn:
            canary._on_response(_response('0-999/*', url))

        warn.assert_called_once()

    def test_filter_values_are_not_logged(self):
        """Query shapes go to logs and Sentry, so they must carry filter KEYS
        only — never the ids or emails being filtered on."""
        url = 'https://x/rest/v1/users?id=in.%28abc-secret-uuid%29&email=eq.a%40b.com'
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning') as warn:
            canary._on_response(_response('0-999/*', url))

        msg = warn.call_args[0][0]
        assert 'abc-secret-uuid' not in msg
        assert 'a@b.com' not in msg
        assert 'users' in msg and 'id' in msg and 'email' in msg


@pytest.mark.unit
class TestNeverBreaksAQuery:
    """A canary that can throw is worse than no canary."""

    def test_a_malformed_response_object_is_swallowed(self):
        with patch.object(canary.logger, 'warning'):
            canary._on_response(object())  # no .headers at all

    def test_a_sentry_failure_is_swallowed(self):
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary, '_report_to_sentry', side_effect=RuntimeError('boom')), \
             patch.object(canary.logger, 'warning'):
            canary._on_response(_response('0-999/*'))

    def test_a_cap_of_zero_disables_the_canary(self):
        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 0), \
             patch.object(canary.logger, 'warning') as warn:
            canary._on_response(_response('0-999/*'))

        warn.assert_not_called()


@pytest.mark.unit
class TestInstall:
    def test_appends_a_response_hook(self):
        client = MagicMock()
        client.postgrest.session = httpx.Client()

        canary.install(client)

        assert canary._on_response in client.postgrest.session.event_hooks['response']

    def test_is_idempotent(self):
        client = MagicMock()
        client.postgrest.session = httpx.Client()

        canary.install(client)
        canary.install(client)

        hooks = client.postgrest.session.event_hooks['response']
        assert hooks.count(canary._on_response) == 1

    def test_returns_the_client_even_when_the_session_is_unavailable(self):
        """A supabase-py version change must not stop clients being created."""
        client = MagicMock()
        del client.postgrest  # attribute access raises

        assert canary.install(client) is client

    def test_httpx_really_invokes_the_hook_and_the_request_still_works(self):
        """The whole design rests on httpx calling an appended response hook, so
        pin it end to end rather than trusting the direct-call tests above."""
        def handler(request):
            # What PostgREST actually returns for a capped collection read.
            return httpx.Response(200, headers={'content-range': '0-999/*'},
                                  json=[{'class_id': 'a'}])

        client = MagicMock()
        client.postgrest.session = httpx.Client(transport=httpx.MockTransport(handler))
        canary.install(client)

        with patch.object(canary.Config, 'POSTGREST_MAX_ROWS', 1000), \
             patch.object(canary.logger, 'warning') as warn:
            response = client.postgrest.session.get(
                'https://x.supabase.co/rest/v1/class_enrollments',
                params={'class_id': 'in.(a,b)', 'status': 'eq.active'})

        warn.assert_called_once()
        # And the hook left the response completely intact.
        assert response.status_code == 200
        assert response.json() == [{'class_id': 'a'}]
