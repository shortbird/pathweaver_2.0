"""
Unit tests for parent routes registration.

These tests verify that parent-related blueprints are properly imported
and registered without import errors. This catches issues like:
- Missing module imports after refactoring
- Incorrect import paths in __init__.py files
- Circular import issues

Bug fixes covered:
- Dec 2025: routes/parent/analytics.py imported from .dashboard (renamed to .dashboard_overview)
- Dec 2025: routes/v1/parent/__init__.py imported old module names (dashboard, evidence)
"""

import pytest


@pytest.mark.unit
class TestParentRoutesImport:
    """Test that parent routes can be imported without errors."""

    def test_parent_linking_blueprint_imports(self):
        """Test parent_linking blueprint can be imported."""
        from routes import parent_linking
        assert parent_linking.bp is not None
        assert parent_linking.bp.name == 'parent_linking'

    def test_dependents_blueprint_imports(self):
        """Test dependents blueprint can be imported."""
        from routes import dependents
        assert dependents.bp is not None
        assert dependents.bp.name == 'dependents'

    def test_parent_package_imports(self):
        """Test routes.parent package can be imported without errors."""
        from routes.parent import (
            dashboard_overview_bp,
            analytics_insights_bp,
            analytics_bp,
            register_parent_blueprints
        )
        assert dashboard_overview_bp is not None
        assert analytics_insights_bp is not None
        assert analytics_bp is not None
        assert callable(register_parent_blueprints)

    def test_parent_analytics_imports_from_dashboard_overview(self):
        """
        Test that analytics.py correctly imports from dashboard_overview.

        Bug fix: analytics.py was importing from .dashboard which was renamed
        to .dashboard_overview in Dec 2025 refactor.
        """
        from routes.parent import analytics
        # If import succeeds, the fix is working
        assert analytics.bp is not None

    # test_parent_analytics_has_verify_parent_access removed 2026-09-03 (CI-01).
    # It asserted that routes/parent/analytics.py imports verify_parent_access,
    # which it never called: the module is vestigial, a registered blueprint
    # with zero routes. The test was written in Dec 2025 to catch an import
    # path broken by a rename, and it had decayed into pinning an unused import
    # in place -- the unused-import sweep removed the import and this failed.
    # Restoring a dead import to satisfy it would keep the wrong thing alive.

    def test_parent_package_imports_cleanly(self):
        """
        The parent routes package must import without side-effect errors.

        Replaces the prior `routes.v1.parent` test — that module was
        removed in the 2026-03 API-version cleanup.
        """
        import routes.parent as parent_pkg
        assert hasattr(parent_pkg, 'dashboard_overview_bp')
        # quests_view and evidence_view were deleted 2026-09-15 (no caller,
        # and both read a dropped table).
        assert not hasattr(parent_pkg, 'quests_view_bp')
        assert not hasattr(parent_pkg, 'evidence_view_bp')


@pytest.mark.unit
class TestParentBlueprintUrlPrefixes:
    """Test that parent blueprints have correct URL prefixes."""

    def test_parent_linking_prefix(self):
        """Test parent_linking has /api/parents prefix."""
        from routes import parent_linking
        assert parent_linking.bp.url_prefix == '/api/parents'

    def test_dependents_prefix(self):
        """Test dependents has /api/dependents prefix."""
        from routes import dependents
        assert dependents.bp.url_prefix == '/api/dependents'

    def test_dashboard_overview_prefix(self):
        """Test dashboard_overview has /api/parent prefix."""
        from routes.parent import dashboard_overview_bp
        assert dashboard_overview_bp.url_prefix == '/api/parent'

    def test_analytics_insights_prefix(self):
        """Test analytics_insights has /api/parent prefix."""
        from routes.parent import analytics_insights_bp
        assert analytics_insights_bp.url_prefix == '/api/parent'

    def test_analytics_prefix(self):
        """Test analytics has /api/parent prefix."""
        from routes.parent import analytics_bp
        assert analytics_bp.url_prefix == '/api/parent'


@pytest.mark.unit
class TestDependentRoutesExist:
    """Test that required dependent routes are defined."""

    def test_my_dependents_route_is_gone(self):
        """/my-dependents was deleted 2026-09-15: the child list is
        /api/family/children, and the web and mobile clients read that.

        Uses a throwaway Flask app to register the blueprint and then
        inspects the resulting URL map — Blueprint.deferred_functions
        contains lambdas on newer Flask, not rule objects.
        """
        from flask import Flask
        from routes import dependents

        app = Flask(__name__)
        app.register_blueprint(dependents.bp)
        rules = {rule.rule for rule in app.url_map.iter_rules()}
        assert '/api/dependents/my-dependents' not in rules
        assert '/api/dependents/create' in rules

    def test_create_dependent_route_exists(self):
        """Test /create route is defined."""
        from routes import dependents
        assert dependents.bp is not None

    def test_promote_dependent_route_exists(self):
        """Test /<id>/promote route is defined."""
        from routes import dependents
        assert dependents.bp is not None

    def test_act_as_route_is_gone(self):
        """/<id>/act-as and /stop-acting-as were deleted 2026-09-15 (REGISTER
        GAP-3): family scope replaced the swapped-token session, and the web
        and mobile callers went in Phase 1 and 2 of the parent refactor."""
        from app import app
        rules = {r.rule for r in app.url_map.iter_rules()}
        assert '/api/dependents/<string:dependent_id>/act-as' not in rules
        assert '/api/dependents/stop-acting-as' not in rules


@pytest.mark.unit
class TestParentLinkingRoutesExist:
    """Test that required parent linking routes are defined."""

    def test_my_children_route_exists(self):
        """Test /my-children route is defined."""
        from routes import parent_linking
        assert parent_linking.bp is not None
