"""
API v1 Dependents Routes

Registers dependent profile endpoints under /api/v1/dependents prefix.
Reuses existing dependent logic from routes/dependents.py but with v1 prefix.

Created: December 26, 2025
Purpose: API Versioning Infrastructure (Week 8)
Reference: ACTIONABLE_PRIORITY_LIST_2025.md - Week 8
"""

# Re-export the dependents blueprint from the original routes
# This will be registered in v1/__init__.py with a v1 prefix and unique name
from routes.dependents import bp
