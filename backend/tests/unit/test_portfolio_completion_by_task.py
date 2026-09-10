"""Route tests for GET /api/portfolio/completions/by-task/<task_id>.

The behaviour pinned here is the one that was wrong in production: the quest
detail screen injects virtual "moment-<uuid>" tasks (routes/quest/detail.py),
and the "Include in portfolio" toggle asks this endpoint about whichever task
is open. Handing that id to a uuid column throws Postgres 22P02, which the
route turned into a 500 and a Sentry error on every such view
(OPTIO-BACKEND-7S, 2026-09-03).

Three sibling routes already guard the same id shape -- tasks/credit.py,
evidence_documents.py and quest/completion.py -- so the fix is the guard they
share, and this test is what keeps the fourth from drifting back.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

MOMENT_TASK_ID = "moment-8fc41111-60e6-44a0-8ae7-371a10766a8b"
REAL_TASK_ID = "8fc41111-60e6-44a0-8ae7-371a10766a8b"


@pytest.fixture
def mock_portfolio_admin():
    # portfolio.py imports get_supabase_admin_client inside the function, so
    # patch at the source module rather than the route module.
    admin = MagicMock()
    with patch("database.get_supabase_admin_client", return_value=admin):
        yield admin


def _completion_row(admin, row):
    chain = (admin.table.return_value.select.return_value
             .eq.return_value.eq.return_value.limit.return_value.execute)
    chain.return_value = MagicMock(data=([row] if row else []))


def test_moment_task_reports_no_completion_instead_of_500(
    client, mock_verify_token, mock_portfolio_admin
):
    """The regression: a virtual moment-task id reached the uuid column."""
    resp = client.get(
        f"/api/portfolio/completions/by-task/{MOMENT_TASK_ID}",
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 200
    body = resp.get_json()
    assert (body.get("data") or body)["has_completion"] is False
    # The guard must short-circuit before the query that raised 22P02 -- which
    # is a query against THIS table, with a non-uuid id.
    #
    # Named, rather than `table.assert_not_called()`. That was the assertion
    # here until 2026-09-10 and it was order-dependent: every authenticated
    # request also passes through middleware that reads the database on a cold
    # cache -- the phone-verification hold, then the SIS onboarding gate -- and
    # those reads go through the same get_supabase_admin_client this fixture
    # patches. So the assertion was measuring the MIDDLEWARE, and passed only
    # when an earlier test in the run happened to have warmed their caches:
    # green in a full local run, red in CI, red on its own. Naming the table
    # measures the route, which is what the test is about, and does not break
    # the next time something is added to the request path.
    queried = [c.args[0] for c in mock_portfolio_admin.table.call_args_list if c.args]
    assert "quest_task_completions" not in queried, (
        f"the moment-id guard did not short-circuit; tables queried: {queried}"
    )


def test_real_task_id_still_resolves_its_completion(
    client, mock_verify_token, mock_portfolio_admin
):
    """The guard must not swallow the case the endpoint exists for."""
    _completion_row(mock_portfolio_admin, {"id": "completion-1", "in_portfolio": True})

    resp = client.get(
        f"/api/portfolio/completions/by-task/{REAL_TASK_ID}",
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 200
    data = resp.get_json().get("data") or resp.get_json()
    assert data["has_completion"] is True
    assert data["completion_id"] == "completion-1"
    assert data["in_portfolio"] is True


def test_real_task_with_no_completion_reports_none(
    client, mock_verify_token, mock_portfolio_admin
):
    _completion_row(mock_portfolio_admin, None)

    resp = client.get(
        f"/api/portfolio/completions/by-task/{REAL_TASK_ID}",
        headers={"Authorization": "Bearer t"},
    )

    assert resp.status_code == 200
    data = resp.get_json().get("data") or resp.get_json()
    assert data["has_completion"] is False
