"""
Unit tests for CreditMappingService.get_credit_ledger_entries (H3).

The credit_ledger.task_id FK to the archived `quest_tasks` table was dropped, so
the prior implementation's `.select('*, quest_tasks(title)')` would 500 against
real Supabase. The fix uses `quests(title)` for quest titles plus a separate
batched lookup against `user_quest_tasks(id, title)` for task titles.
"""

from unittest.mock import patch, MagicMock

from services.credit_mapping_service import CreditMappingService


def _supabase_with(ledger_rows, task_rows):
    """Build a Supabase mock where:
       - .table('credit_ledger').select(...).eq(...).order(...).execute() → ledger_rows
       - .table('user_quest_tasks').select(...).in_(...).execute()        → task_rows
    """
    supabase = MagicMock()

    ledger_query = MagicMock()
    ledger_query.execute.return_value = MagicMock(data=ledger_rows)
    # The query builder is chainable; .eq/.order return self
    ledger_query.eq.return_value = ledger_query
    ledger_query.order.return_value = ledger_query

    tasks_query = MagicMock()
    tasks_query.execute.return_value = MagicMock(data=task_rows)
    tasks_query.in_.return_value = tasks_query

    def table(name):
        t = MagicMock()
        if name == 'credit_ledger':
            t.select.return_value = ledger_query
        elif name == 'user_quest_tasks':
            t.select.return_value = tasks_query
        else:
            raise AssertionError(f'Unexpected table: {name}')
        return t

    supabase.table.side_effect = table
    return supabase, ledger_query, tasks_query


def test_get_credit_ledger_entries_resolves_task_titles_via_user_quest_tasks():
    user_id = 'user-1'
    ledger_rows = [
        {
            'id': 'l1', 'credit_type': 'math', 'xp_amount': 1000,
            'credits_earned': 0.5, 'date_earned': '2026-04-01',
            'academic_year': 2026, 'task_id': 't1',
            'quests': {'title': 'Algebra Quest'},
        },
        {
            'id': 'l2', 'credit_type': 'science', 'xp_amount': 2000,
            'credits_earned': 1.0, 'date_earned': '2026-04-02',
            'academic_year': 2026, 'task_id': 't2',
            'quests': {'title': 'Biology Quest'},
        },
    ]
    task_rows = [
        {'id': 't1', 'title': 'Solve linear equations'},
        {'id': 't2', 'title': 'Dissect a frog'},
    ]
    supabase, _, tasks_query = _supabase_with(ledger_rows, task_rows)

    with patch(
        'services.credit_mapping_service.get_supabase_admin_client',
        return_value=supabase,
    ):
        entries = CreditMappingService.get_credit_ledger_entries(user_id)

    # Single batched lookup against user_quest_tasks (not per-row)
    tasks_query.in_.assert_called_once()
    in_args = tasks_query.in_.call_args
    assert in_args[0][0] == 'id'
    assert sorted(in_args[0][1]) == ['t1', 't2']

    assert len(entries) == 2
    assert entries[0]['quest_title'] == 'Algebra Quest'
    assert entries[0]['task_title'] == 'Solve linear equations'
    assert entries[1]['quest_title'] == 'Biology Quest'
    assert entries[1]['task_title'] == 'Dissect a frog'
    assert entries[0]['credits_earned'] == 0.5


def test_get_credit_ledger_entries_falls_back_to_unknown_for_missing_titles():
    """Rows without a matching quest or task should report 'Unknown' rather than crash."""
    ledger_rows = [
        {
            'id': 'l1', 'credit_type': 'math', 'xp_amount': 1000,
            'credits_earned': 0.5, 'date_earned': '2026-04-01',
            'academic_year': 2026, 'task_id': 't1',
            'quests': None,  # quest deleted
        },
        {
            'id': 'l2', 'credit_type': 'science', 'xp_amount': 2000,
            'credits_earned': 1.0, 'date_earned': '2026-04-02',
            'academic_year': 2026, 'task_id': 't-missing',  # no matching task
            'quests': {'title': 'Biology Quest'},
        },
    ]
    task_rows = [{'id': 't1', 'title': 'Solve linear equations'}]
    supabase, _, _ = _supabase_with(ledger_rows, task_rows)

    with patch(
        'services.credit_mapping_service.get_supabase_admin_client',
        return_value=supabase,
    ):
        entries = CreditMappingService.get_credit_ledger_entries('user-1')

    assert entries[0]['quest_title'] == 'Unknown'
    assert entries[0]['task_title'] == 'Solve linear equations'
    assert entries[1]['quest_title'] == 'Biology Quest'
    assert entries[1]['task_title'] == 'Unknown'


def test_get_credit_ledger_entries_skips_task_lookup_when_no_task_ids():
    """Empty ledger should not issue a wasted user_quest_tasks query."""
    supabase, _, tasks_query = _supabase_with([], [])

    with patch(
        'services.credit_mapping_service.get_supabase_admin_client',
        return_value=supabase,
    ):
        entries = CreditMappingService.get_credit_ledger_entries('user-1')

    assert entries == []
    tasks_query.in_.assert_not_called()


def test_get_credit_ledger_entries_applies_year_and_subject_filters():
    """Verify .eq is called with the academic_year and credit_type filters when supplied."""
    supabase, ledger_query, _ = _supabase_with([], [])

    with patch(
        'services.credit_mapping_service.get_supabase_admin_client',
        return_value=supabase,
    ):
        CreditMappingService.get_credit_ledger_entries(
            'user-1', academic_year=2026, credit_type='math'
        )

    eq_calls = [c.args for c in ledger_query.eq.call_args_list]
    assert ('user_id', 'user-1') in eq_calls
    assert ('academic_year', 2026) in eq_calls
    assert ('credit_type', 'math') in eq_calls
