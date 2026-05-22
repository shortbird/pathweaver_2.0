"""
Advisor routes package.
Contains advisor-specific endpoints including student overview, learning moments,
and main advisor routes.

Note: Credit review endpoints used to live here. They moved to
routes/credit_dashboard/superadmin_actions.py (under /api/credit-dashboard/items/<id>/*)
since only superadmin uses them.
"""

from flask import Flask
from .student_overview import bp as student_overview_bp
from .main import advisor_bp
from .learning_moments import bp as learning_moments_bp

# Export blueprints for direct import
__all__ = [
    'student_overview_bp',
    'advisor_bp',
    'learning_moments_bp',
    'register_advisor_blueprints'
]


def register_advisor_blueprints(app: Flask):
    """Register all advisor blueprints."""
    # Main advisor routes (/api/advisor/*)
    app.register_blueprint(advisor_bp, url_prefix='/api/advisor')
    # Student overview routes (/api/advisor/student-overview/*)
    app.register_blueprint(student_overview_bp)
    # Learning moments routes (/api/advisor/students/<id>/learning-moments/*)
    app.register_blueprint(learning_moments_bp)
