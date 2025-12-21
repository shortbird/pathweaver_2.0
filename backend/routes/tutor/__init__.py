"""
Tutor routes package.
Consolidates AI tutor blueprints.

Refactors tutor.py (1,190 lines) into 2 modules per P2-ARCH-1:
- chat.py: Core chat functionality, usage stats
- management.py: Settings, conversations, parent monitoring

All blueprints use '/api/tutor' prefix for backward compatibility.
"""

from flask import Flask
from .chat import bp as chat_bp
from .management import bp as management_bp


def register_tutor_blueprints(app: Flask):
    """Register all tutor blueprints."""
    app.register_blueprint(chat_bp)
    app.register_blueprint(management_bp)
