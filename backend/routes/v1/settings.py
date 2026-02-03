"""
API v1 Settings Routes

Registers settings endpoints under /api/v1/settings prefix.
Reuses existing settings logic from routes/settings.py but with v1 prefix.

Created: December 27, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

# Re-export the settings blueprint from the original routes
# This will be registered in v1/__init__.py with a v1 prefix and unique name
from routes.settings import settings_bp as bp
