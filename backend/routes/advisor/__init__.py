"""
Advisor routes package.
Contains advisor-specific endpoints including student overview and main advisor routes.
"""

from flask import Flask
from .student_overview import bp as student_overview_bp
from .main import advisor_bp

# Export blueprints for direct import
__all__ = [
    'student_overview_bp',
    'advisor_bp',
    'register_advisor_blueprints'
]


def register_advisor_blueprints(app: Flask):
    """Register all advisor blueprints."""
    # Main advisor routes (/api/advisor/*)
    app.register_blueprint(advisor_bp, url_prefix='/api/advisor')
    # Student overview routes (/api/advisor/student-overview/*)
    app.register_blueprint(student_overview_bp)
