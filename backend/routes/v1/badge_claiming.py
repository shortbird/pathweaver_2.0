"""
API v1 Badge Claiming Routes

Registers badge claiming endpoints under /api/v1 prefix.
Reuses existing badge claiming logic from routes/badge_claiming.py but with v1 prefix.

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

# Re-export the badge_claiming blueprint from the original routes
# This will be registered in v1/__init__.py with a v1 prefix and unique name
from routes.badge_claiming import badge_claiming_bp
