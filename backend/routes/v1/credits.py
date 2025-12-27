"""
API v1 Credits Routes

Registers credits endpoints under /api/v1/credits prefix.
Reuses existing credits logic from routes/credits.py but with v1 prefix.

Created: December 27, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

# Re-export the credits blueprint from the original routes
# This will be registered in v1/__init__.py with a v1 prefix and unique name
from routes.credits import bp
