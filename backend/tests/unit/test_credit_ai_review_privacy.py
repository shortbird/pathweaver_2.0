"""Who may see the AI's opinion of a student's work.

The AI's verdict, its confidence, and its view that a student asked for more XP
than the work is worth are working notes for whoever makes the final call. Three
audiences must never receive them, each for a different reason:

**The student.** GET /api/tasks/<id>/credit-history hands them `select('*')` of
their own review rounds. That is why the AI output lives in its own table and not
in a column there -- a student reading "the AI thinks this is worth 100, not 200"
before a human has decided anything is a worse experience than waiting.

**A partner org admin.** They are the first of two review stages. A
recommendation addressed to Optio, on a queue they only start, would read as a
decision that has already been made.

**Anyone at all, via the database.** The table has no RLS policy but the service
role's, so the two gates are independent: a route that forgot its check still
could not read the row under a user's own credentials.
"""

from __future__ import annotations

import inspect
import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]      # backend/
REPO = BACKEND.parent


@pytest.mark.unit
class TestTheStudentNeverSeesIt:
    def test_credit_history_selects_only_the_round(self):
        """If AI output ever moves onto diploma_review_rounds, this fails."""
        from routes.tasks import credit

        source = inspect.getsource(credit.get_credit_history)
        assert 'credit_ai_reviews' not in source
        assert "'ai'" not in source

    def test_my_credit_requests_carries_no_ai_key(self):
        from routes.tasks import credit

        source = inspect.getsource(credit.get_my_credit_requests)
        assert 'credit_ai_reviews' not in source
        assert 'ai_review' not in source

    def test_the_ai_table_is_not_read_anywhere_in_the_student_routes(self):
        student_routes = BACKEND / 'routes' / 'tasks'
        for path in student_routes.glob('*.py'):
            text = path.read_text()
            # The request-credit hook queues a review; it never reads one back.
            reads = re.findall(r"table\(\s*['\"]credit_ai_reviews", text)
            assert not reads, f'{path.name} reads the AI review table'


@pytest.mark.unit
class TestOrgAdminsNeverSeeIt:
    def test_the_list_endpoint_gates_the_ai_fields_on_superadmin(self):
        from routes.credit_dashboard import items

        source = inspect.getsource(items.get_dashboard_items)
        assert 'is_superadmin' in source
        # The filter and the fields are both behind the same flag.
        assert "request.args.get('ai') if is_superadmin else None" in source
        assert 'if is_superadmin:' in source

    def test_the_detail_endpoint_gates_the_ai_payload_on_superadmin(self):
        from routes.credit_dashboard import items

        source = inspect.getsource(items.get_dashboard_item_detail)
        assert 'if caller_is_superadmin:' in source
        assert '_ai_detail' in source

    def test_the_rerun_endpoint_is_superadmin_only(self):
        from routes.credit_dashboard import ai_review

        source = inspect.getsource(ai_review)
        assert "@require_role('superadmin')" in source
        assert "'org_admin'" not in source.split('def rerun_ai_review')[0].split(
            '@bp.route')[-1]

    def test_an_org_admin_cannot_set_the_final_xp(self):
        """Optio sets it. A partner trimming it on the way through would leave
        the second reviewer looking at a number they cannot see the reason for."""
        from routes.credit_dashboard import org_admin_actions

        source = inspect.getsource(org_admin_actions.org_approve_credit)
        assert 'XP_ADJUST_FORBIDDEN' in source
        assert "data.get('xp_value') is not None and not is_superadmin" in source


@pytest.mark.unit
class TestTheDatabaseGate:
    def _migration(self):
        path = (REPO / 'supabase' / 'migrations'
                / '20260910170000_credit_ai_reviews.sql')
        assert path.exists(), 'the AI review migration is missing'
        return path.read_text()

    def test_row_level_security_is_on(self):
        assert 'ENABLE ROW LEVEL SECURITY' in self._migration()

    def test_the_only_policy_is_the_service_role(self):
        sql = self._migration()
        policies = re.findall(r'CREATE POLICY(.*?);', sql, re.S)
        assert len(policies) == 1
        assert "auth.role()) = 'service_role'" in policies[0]

    def test_no_policy_mentions_a_user_facing_role(self):
        sql = self._migration()
        for role in ('student', 'org_admin', 'advisor', 'parent', 'authenticated'):
            assert f"'{role}'" not in sql.split('CREATE POLICY')[1].split(';')[0]
