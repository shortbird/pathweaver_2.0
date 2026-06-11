"""
TaskLibraryService regression tests.

Sentry OPTIO-BACKEND-1 (2026-06-11): BaseService dropped its `self.supabase`
in the Dec 2025 repository-pattern refactor, which silently broke EVERY
TaskLibraryService method with AttributeError — the methods' own try/excepts
swallowed it, so the library quietly returned []/None/False for ~6 months.
These tests pin the service-local `supabase` property and the post-audit
behavior around the dropped `quest_task_flags` table.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from services.task_library_service import TaskLibraryService


class ChainingClient:
    """Minimal supabase-client stand-in: every query-builder method chains,
    execute() returns data configured per table name."""

    def __init__(self, data_by_table):
        self.data_by_table = data_by_table
        self.tables_touched = []
        self.updates = {}

    def table(self, name):
        self.tables_touched.append(name)
        return _Chain(self, name)

    def rpc(self, *_args, **_kwargs):
        return _Chain(self, '__rpc__')


class _Chain:
    def __init__(self, client, table):
        self._client = client
        self._table = table

    def __getattr__(self, _name):
        return self._chain

    def _chain(self, *args, **kwargs):
        if args and isinstance(args[0], dict):
            self._client.updates[self._table] = args[0]
        return self

    def execute(self):
        return SimpleNamespace(data=self._client.data_by_table.get(self._table))


@pytest.fixture
def service():
    return TaskLibraryService()


def _patch_client(client):
    return patch(
        'services.task_library_service.get_supabase_admin_client',
        return_value=client,
    )


def test_supabase_property_resolves(service):
    """The OPTIO-BACKEND-1 regression: `self.supabase` must exist."""
    client = MagicMock()
    with _patch_client(client):
        assert service.supabase is client


def test_get_library_tasks_returns_tasks_not_empty(service):
    """Before the fix this returned [] for every call (AttributeError was
    swallowed by the method's try/except)."""
    tasks = [
        {'id': f't{i}', 'title': f'Task {i}', 'usage_count': 30 - i,
         'created_at': '2026-06-01T00:00:00+00:00'}
        for i in range(25)
    ]
    client = ChainingClient({
        'user_quest_tasks': [{'title': 'Task 0'}],  # user already has Task 0
        'quest_sample_tasks': tasks,
    })
    with _patch_client(client):
        result = service.get_library_tasks('quest-1', user_id='user-1', limit=20)

    assert len(result) == 20
    assert all(t['title'] != 'Task 0' for t in result)


def test_flag_task_skips_dropped_flags_table(service):
    """quest_task_flags was dropped in the Mar 2026 audit — flagging must only
    touch the aggregate counters on quest_sample_tasks."""
    client = ChainingClient({'quest_sample_tasks': {'flag_count': 2}})
    with _patch_client(client):
        assert service.flag_task('task-1', 'user-1', reason='confusing') is True

    assert 'quest_task_flags' not in client.tables_touched
    # 3rd flag crosses the auto-flag threshold.
    assert client.updates['quest_sample_tasks'] == {'flag_count': 3, 'is_flagged': True}


def test_get_task_flags_returns_empty_after_table_drop(service):
    """Per-flag detail is gone with the table; the admin endpoint must keep
    working with an empty list rather than erroring."""
    with _patch_client(MagicMock()):
        assert service.get_task_flags('task-1') == []
