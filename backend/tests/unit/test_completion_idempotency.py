"""E3 — create_completion is idempotent on a UNIQUE-violation from the DB.

Unit-style: stubs the repository's client directly to bypass the Flask
app-context requirement of the integration-style tests in
tests/repositories/test_task_repository.py.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


def _build_repo_with_stub_client():
    from repositories.task_repository import TaskCompletionRepository

    # Instantiate without hitting the real Flask context by stubbing the
    # base-repository client property for the lifetime of this test.
    with patch.object(TaskCompletionRepository, "client", create=True, new=MagicMock()):
        repo = TaskCompletionRepository()
        return repo


def test_duplicate_key_returns_existing_row():
    repo = _build_repo_with_stub_client()

    user_id = "u1"
    task_id = "t1"
    existing = {
        "id": "c1",
        "user_id": user_id,
        "user_quest_task_id": task_id,
        "xp_awarded": 100,
    }

    client = MagicMock()
    # First insert raises a unique-violation-shaped error.
    client.table.return_value.insert.return_value.execute.side_effect = Exception(
        "duplicate key value violates unique constraint "
        '"uniq_quest_task_completions_user_task" (23505)'
    )
    # Lookup returns the canonical existing row.
    lookup = MagicMock()
    lookup.data = [existing]
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = lookup

    with patch.object(type(repo), "client", new_callable=lambda: client):
        result = repo.create_completion(
            {
                "user_id": user_id,
                "quest_id": "q1",
                "user_quest_task_id": task_id,
            }
        )

    assert result == existing


def test_non_duplicate_insert_failure_propagates():
    repo = _build_repo_with_stub_client()

    client = MagicMock()
    client.table.return_value.insert.return_value.execute.side_effect = Exception(
        "some unrelated DB error"
    )

    with patch.object(type(repo), "client", new_callable=lambda: client):
        with pytest.raises(Exception, match="unrelated DB error"):
            repo.create_completion(
                {
                    "user_id": "u",
                    "quest_id": "q",
                    "user_quest_task_id": "t",
                }
            )


def test_missing_required_fields_raises_value_error():
    repo = _build_repo_with_stub_client()
    with pytest.raises(ValueError, match="Missing required fields"):
        repo.create_completion({"xp_awarded": 10})
