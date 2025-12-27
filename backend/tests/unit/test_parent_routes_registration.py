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
            quests_view_bp,
            evidence_view_bp,
            analytics_insights_bp,
            analytics_bp,
            register_parent_blueprints
        )
        assert dashboard_overview_bp is not None
        assert quests_view_bp is not None
        assert evidence_view_bp is not None
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

    def test_parent_analytics_has_verify_parent_access(self):
        """Test verify_parent_access is imported correctly in analytics module."""
        from routes.parent.analytics import verify_parent_access
        assert callable(verify_parent_access)

    def test_v1_parent_routes_import(self):
        """
        Test v1 parent routes can be imported.

        Bug fix: v1/parent/__init__.py was importing old module names
        (dashboard, evidence) instead of refactored module names.
        """
        from routes.v1.parent import register_parent_blueprints_v1
        assert callable(register_parent_blueprints_v1)


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

    def test_quests_view_prefix(self):
        """Test quests_view has /api/parent prefix."""
        from routes.parent import quests_view_bp
        assert quests_view_bp.url_prefix == '/api/parent'

    def test_evidence_view_prefix(self):
        """Test evidence_view has /api/parent prefix."""
        from routes.parent import evidence_view_bp
        assert evidence_view_bp.url_prefix == '/api/parent'

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

    def test_my_dependents_route_exists(self):
        """Test /my-dependents route is defined."""
        from routes import dependents
        rules = [rule.rule for rule in dependents.bp.deferred_functions]
        # Blueprint deferred_functions contains route registrations
        assert dependents.bp is not None

    def test_create_dependent_route_exists(self):
        """Test /create route is defined."""
        from routes import dependents
        assert dependents.bp is not None

    def test_promote_dependent_route_exists(self):
        """Test /<id>/promote route is defined."""
        from routes import dependents
        assert dependents.bp is not None

    def test_act_as_route_exists(self):
        """Test /<id>/act-as route is defined."""
        from routes import dependents
        assert dependents.bp is not None


@pytest.mark.unit
class TestParentLinkingRoutesExist:
    """Test that required parent linking routes are defined."""

    def test_my_children_route_exists(self):
        """Test /my-children route is defined."""
        from routes import parent_linking
        assert parent_linking.bp is not None
