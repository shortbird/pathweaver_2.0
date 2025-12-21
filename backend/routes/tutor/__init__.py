"""
AI Tutor routes package.
Consolidates AI tutor blueprints.

Refactors tutor.py (1,190 lines) into 1 module (management routes not yet split):
- chat.py: All AI tutor functionality (chat, settings, parent monitoring)

All blueprints use '/api/tutor' prefix for backward compatibility.
"""

from flask import Flask
from .chat import bp as chat_bp


def register_tutor_blueprints(app: Flask):
    """Register all tutor blueprints."""
    app.register_blueprint(chat_bp)
