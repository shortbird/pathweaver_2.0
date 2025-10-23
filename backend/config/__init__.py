"""
Configuration package initialization

This file makes the config directory a Python package,
allowing imports like 'from config.constants import ...'
"""

# This file can be empty, but we'll add package-level exports for convenience
from .constants import *
from .pillars import *
from .xp_progression import *
from .rate_limits import *
