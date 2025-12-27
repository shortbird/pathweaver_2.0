"""
API v1 LMS Integration Routes

Registers LMS integration endpoints under /api/v1/lms prefix.
Reuses existing LMS logic from routes/lms_integration.py but with v1 prefix.

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

# Re-export the lms_integration blueprint from the original routes
# This will be registered in v1/__init__.py with a v1 prefix and unique name
from routes.lms_integration import bp
