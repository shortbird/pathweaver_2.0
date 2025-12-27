"""
Parent routes package.
Consolidated parent dashboard blueprints.

Modules:
- dashboard.py: All parent dashboard routes (quest progress, evidence, task details, etc.)
- analytics.py: Analytics helpers (currently empty, reserved for future use)

All blueprints use '/api/parent' prefix for backward compatibility.

Note: Previously had duplicate quests.py and evidence.py files with identical routes.
These were removed in Dec 2025 as part of code quality improvements.
"""

from flask import Flask
from .dashboard import bp as dashboard_bp
from .analytics import bp as analytics_bp


def register_parent_blueprints(app: Flask):
    """Register all parent dashboard blueprints."""
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(analytics_bp)
