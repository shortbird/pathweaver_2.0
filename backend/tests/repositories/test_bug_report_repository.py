"""
Unit tests for BugReportRepository, the ticket tracker's data access.

Two things the route tests cannot see because they mock the repository
wholesale: that the list carries PostgREST's exact count rather than the page
length, and that resolving a ticket stamps resolved_at while reopening it
clears the stamp again.
"""

from unittest.mock import Mock

import pytest


def _make_repo():
    from repositories.bug_report_repository import BugReportRepository
    repo = BugReportRepository()
    mock_client = Mock()
    repo._client = mock_client
    return repo, mock_client


def _chain(mock_client, data, count=None):
    """A query builder whose every method returns itself, ending in `data`."""
    q = Mock()
    for name in ('select', 'order', 'range', 'limit', 'eq', 'in_', 'or_', 'update'):
        getattr(q, name).return_value = q
    q.execute.return_value = Mock(data=data, count=count)
    mock_client.table.return_value = q
    return q


@pytest.mark.unit
class TestListFiltered:

    def test_total_is_the_exact_count_not_the_page_length(self):
        repo, mock = _make_repo()
        _chain(mock, data=[{'id': 'a'}, {'id': 'b'}], count=412)

        rows, total = repo.list_filtered(limit=2)

        assert [r['id'] for r in rows] == ['a', 'b']
        assert total == 412
        select_kwargs = mock.table.return_value.select.call_args.kwargs
        assert select_kwargs.get('count') == 'exact'

    def test_open_means_the_three_working_statuses(self):
        repo, mock = _make_repo()
        q = _chain(mock, data=[], count=0)

        repo.list_filtered(status='open')

        q.in_.assert_called_once_with('status', ['new', 'triaged', 'fixing'])
        q.eq.assert_not_called()

    def test_search_goes_through_pgrst_pattern(self):
        """A comma in the search box must not become a second OR clause."""
        repo, mock = _make_repo()
        q = _chain(mock, data=[], count=0)

        repo.list_filtered(search='roster,(export)')

        q.or_.assert_called_once_with('title.ilike.%roster export%,message.ilike.%roster export%')

    def test_a_search_of_only_structural_characters_is_no_filter(self):
        repo, mock = _make_repo()
        q = _chain(mock, data=[], count=0)

        repo.list_filtered(search=',,()')

        q.or_.assert_not_called()


@pytest.mark.unit
class TestUpdateFields:

    def test_resolving_stamps_resolved_at(self):
        repo, mock = _make_repo()
        q = _chain(mock, data=[{'id': 'r1', 'status': 'resolved'}])

        repo.update_fields('r1', {'status': 'resolved', 'resolution': 'Fixed.'})

        sent = q.update.call_args[0][0]
        assert sent['status'] == 'resolved'
        assert sent['resolution'] == 'Fixed.'
        assert sent['resolved_at']

    def test_declining_stamps_resolved_at_too(self):
        repo, mock = _make_repo()
        q = _chain(mock, data=[{'id': 'r1'}])

        repo.update_fields('r1', {'status': 'wont_fix'})

        assert q.update.call_args[0][0]['resolved_at']

    def test_reopening_clears_resolved_at(self):
        repo, mock = _make_repo()
        q = _chain(mock, data=[{'id': 'r1'}])

        repo.update_fields('r1', {'status': 'triaged'})

        sent = q.update.call_args[0][0]
        assert 'resolved_at' in sent and sent['resolved_at'] is None

    def test_a_notes_only_edit_leaves_resolved_at_alone(self):
        repo, mock = _make_repo()
        q = _chain(mock, data=[{'id': 'r1'}])

        repo.update_fields('r1', {'triage_notes': 'Looked at it.'})

        assert q.update.call_args[0][0] == {'triage_notes': 'Looked at it.'}

    def test_missing_ticket_raises_not_found(self):
        from repositories.base_repository import NotFoundError
        repo, mock = _make_repo()
        _chain(mock, data=[])

        with pytest.raises(NotFoundError):
            repo.update_fields('nope', {'status': 'fixing'})
