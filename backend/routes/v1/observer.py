"""
API v1 Observer Routes

Registers observer endpoints under /api/v1/observers prefix.
Reuses existing observer logic from routes/observer.py but with v1 prefix.

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

# Re-export the observer blueprint from the original routes
# This will be registered in v1/__init__.py with a v1 prefix and unique name
from routes.observer import bp
