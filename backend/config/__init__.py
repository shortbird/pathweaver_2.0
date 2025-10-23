"""
Configuration package initialization

This file makes the config directory a Python package,
allowing imports like 'from config.constants import ...'

Note: The main Config class is in app_config.py (not in this package)
to avoid naming conflicts.
"""
from utils.logger import get_logger

logger = get_logger(__name__)


# Keep this file minimal to avoid import conflicts
