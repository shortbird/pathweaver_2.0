"""
Configuration package initialization

This file makes the config directory a Python package,
allowing imports like 'from config.constants import ...'

Note: The main Config class is in app_config.py (not in this package)
to avoid naming conflicts.

Keep this file minimal to avoid circular import issues.
Config files are loaded BEFORE logging is initialized.
"""

# Keep this file minimal to avoid import conflicts
