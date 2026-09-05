"""A page past the last row is an empty page, not a 500.

PostgREST answers a range whose offset is beyond the result set with 416
PGRST103 rather than an empty body, and only when the query also asks for
`count='exact'` -- it needs the total to call the range unsatisfiable. So the
trap sits in exactly the endpoints that page a counted list for a client.

It fired on the credit review dashboard on 2026-09-05: an admin holding page 2
narrowed the status filter to 44 rows, the next fetch asked for offset 50, and
the handler's except turned the APIError into a 500 and a blank dashboard
(Sentry OPTIO-BACKEND-83, surfaced to the browser as OPTIO-WEB-T).
"""

import pytest
from postgrest.exceptions import APIError

from utils.pagination import Page, fetch_page, fetch_range


class _Response:
    def __init__(self, data, count):
        self.data = data
        self.count = count


class _Builder:
    """Records the offset/limit it was ranged with, then answers `outcome`.

    Mirrors the one property of a real postgrest builder that matters here:
    `range()` ADDS its params rather than replacing them, so a builder that has
    been ranged once cannot be ranged again. Anything that re-ranges the same
    object is a bug, and this raises on it.
    """

    def __init__(self, outcome, log):
        self._outcome = outcome
        self._log = log
        self._ranged = False

    def range(self, start, end):
        assert not self._ranged, 'builder was ranged twice'
        self._ranged = True
        self._log.append((start, end))
        return self

    def execute(self):
        if isinstance(self._outcome, Exception):
            raise self._outcome
        return self._outcome


def _range_not_satisfiable(offset, total):
    return APIError({
        'message': 'Requested range not satisfiable',
        'code': 'PGRST103',
        'hint': None,
        'details': f'An offset of {offset} was requested, but there are only {total} rows.',
    })


def _factory(*outcomes):
    """A build_query that answers each call with the next outcome in turn."""
    log = []
    it = iter(outcomes)

    def build():
        return _Builder(next(it), log)

    return build, log


def test_page_within_range_is_returned_untouched():
    build, log = _factory(_Response([{'id': 'a'}], 44))

    result = fetch_page(build, page=1, per_page=50)

    assert result.data == [{'id': 'a'}]
    assert result.count == 44
    assert log == [(0, 49)]


def test_page_past_the_end_is_empty_with_the_real_total():
    # Page 2 of 50 over 44 rows: what the dashboard asked for when the filter
    # narrowed under it.
    build, log = _factory(_range_not_satisfiable(50, 44), _Response([{'id': 'a'}], 44))

    result = fetch_page(build, page=2, per_page=50)

    assert result == Page([], 44)
    # The overrun attempt, then a single row read back purely for its count.
    assert log == [(50, 99), (0, 0)]


def test_count_survives_a_null_count_on_the_fallback_read():
    build, _ = _factory(_range_not_satisfiable(50, 0), _Response([], None))

    assert fetch_page(build, page=2, per_page=50) == Page([], 0)


def test_other_api_errors_still_raise():
    boom = APIError({'message': 'column does not exist', 'code': '42703',
                     'hint': None, 'details': None})
    build, _ = _factory(boom)

    with pytest.raises(APIError) as caught:
        fetch_page(build, page=1, per_page=50)
    assert caught.value.code == '42703'


@pytest.mark.parametrize('page', [0, -3])
def test_page_below_one_reads_from_the_top(page):
    """A hand-edited ?page=0 would otherwise range from a negative offset."""
    build, log = _factory(_Response([], 0))

    fetch_page(build, page=page, per_page=25)

    assert log == [(0, 24)]


# ── fetch_range: the offset/limit callers ────────────────────────────────────
# Some endpoints take ?offset= straight from the client (the announcement
# archive, the subject-backfill list, CRM suppressions) rather than a page
# number, so the overrun is one keystroke away rather than a filter change.


def test_offset_window_within_range_is_returned_untouched():
    build, log = _factory(_Response([{'id': 'a'}], 44))

    result = fetch_range(build, offset=20, limit=10)

    assert result.data == [{'id': 'a'}]
    assert log == [(20, 29)]


def test_offset_past_the_end_is_empty_with_the_real_total():
    build, log = _factory(_range_not_satisfiable(900, 44), _Response([{'id': 'a'}], 44))

    assert fetch_range(build, offset=900, limit=25) == Page([], 44)
    # The overrun attempt, then a single row read back purely for its count.
    assert log == [(900, 924), (0, 0)]


@pytest.mark.parametrize('offset', [-1, -100])
def test_negative_offset_reads_from_the_top(offset):
    """?offset=-1 would otherwise reach PostgREST as a malformed range."""
    build, log = _factory(_Response([], 0))

    fetch_range(build, offset=offset, limit=10)

    assert log == [(0, 9)]


def test_fetch_page_is_fetch_range_in_page_units():
    build, log = _factory(_Response([], 0))

    fetch_page(build, page=3, per_page=20)

    assert log == [(40, 59)]
