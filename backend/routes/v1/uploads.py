"""
API v1 Uploads Routes

Registers upload endpoints under /api/v1/uploads prefix.
Reuses existing upload logic from routes/uploads.py but with v1 prefix.

Created: December 27, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

# Re-export the uploads blueprint from the original routes
# This will be registered in v1/__init__.py with a v1 prefix and unique name
from routes.uploads import bp
