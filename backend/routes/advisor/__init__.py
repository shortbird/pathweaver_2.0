"""
Advisor routes package.
Contains advisor-specific endpoints including student overview.
"""

from flask import Flask
from .student_overview import bp as student_overview_bp

# Export blueprints for direct import
__all__ = [
    'student_overview_bp',
    'register_advisor_blueprints'
]


def register_advisor_blueprints(app: Flask):
    """Register all advisor blueprints."""
    app.register_blueprint(student_overview_bp)
