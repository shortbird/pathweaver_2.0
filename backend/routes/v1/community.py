"""
API v1 Community Routes

Registers community/social endpoints under /api/v1/community prefix.
Reuses existing community logic from routes/community.py but with v1 prefix.

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

# Re-export the community blueprint from the original routes
# This will be registered in v1/__init__.py with a v1 prefix and unique name
from routes.community import bp
