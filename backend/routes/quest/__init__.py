"""
Quest routes package.
Consolidates all quest-related blueprints.

This package refactors the original quests.py mega-file (1,507 lines)
into 4 focused modules per P2-ARCH-1:
- listing.py: Quest listing, filtering, pagination
- detail.py: Quest detail views, enrollment status
- enrollment.py: Enrollment logic, quest creation
- completion.py: Progress tracking, completion, utilities

All blueprints use the same '/api/quests' prefix for backward compatibility.
"""

from flask import Flask
from .listing import bp as listing_bp
from .detail import bp as detail_bp
from .enrollment import bp as enrollment_bp
from .completion import bp as completion_bp


def register_quest_blueprints(app: Flask):
    """Register all quest-related blueprints with the Flask app."""
    app.register_blueprint(listing_bp)
    app.register_blueprint(detail_bp)
    app.register_blueprint(enrollment_bp)
    app.register_blueprint(completion_bp)
