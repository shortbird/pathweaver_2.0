"""
Parent routes package.
Consolidates all parent dashboard blueprints.

Refactors parent_dashboard.py (1,375 lines) into 4 modules per P2-ARCH-1:
- dashboard.py: Overview, helpers, summary stats
- quests.py: Student quest progress views
- evidence.py: Evidence viewing, task details
- analytics.py: Calendar, insights, communications

All blueprints use '/api/parent' prefix for backward compatibility.
"""

from flask import Flask
from .dashboard import bp as dashboard_bp
from .quests import bp as quests_bp
from .evidence import bp as evidence_bp
from .analytics import bp as analytics_bp


def register_parent_blueprints(app: Flask):
    """Register all parent dashboard blueprints."""
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(quests_bp)
    app.register_blueprint(evidence_bp)
    app.register_blueprint(analytics_bp)
