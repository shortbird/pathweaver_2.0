"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED - Utility/Helper Endpoints
- Helper endpoints (school subjects lookup, pillar normalization)
- Minimal database access (mostly static data/utility functions)
- Not suitable for repository abstraction
- Utility endpoints don't follow standard CRUD patterns

Admin Core Routes
Utility and helper endpoints for admin panel
"""

from flask import Blueprint, jsonify

from utils.logger import get_logger

logger = get_logger(__name__)

bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@bp.route('/school-subjects', methods=['GET'])
def get_school_subjects():
    """
    Get all available school subjects for quest creation.
    Public endpoint - no auth required for getting subject list.
    """
    try:
        from utils.school_subjects import get_all_subjects_with_info
        subjects = get_all_subjects_with_info()
        
        return jsonify({
            'success': True,
            'school_subjects': subjects
        })
        
    except Exception as e:
        logger.error(f"Error getting school subjects: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch school subjects'
        }), 500


# ============================================================================
# REMOVED: Old quest management endpoints (originally lines 35-730)
# ============================================================================
# All quest creation/update/delete functions have been removed because:
# 1. They create quest_tasks entries incompatible with personalized quest system
# 2. They are DUPLICATES of the v3 admin endpoints in quest_management.py  
# 3. Frontend uses /api/v3/admin/quests/* endpoints exclusively
#
# Removed functions (~696 lines):
# - create_quest_v3_clean() - POST /api/admin/quests/create-v3
# - create_quest_v2() - POST /api/admin/quests/create  
# - create_quest() - POST /api/admin/quests
# - update_quest() - PUT /api/admin/quests/<quest_id>
# - delete_quest() - DELETE /api/admin/quests/<quest_id>
# - list_admin_quests() - GET /api/admin/quests
#
# All quest management now happens through /api/v3/admin/* endpoints
# which support the personalized quest system (user_quest_tasks)
# ============================================================================

# =============================================================================
# USER MANAGEMENT ENDPOINTS - MOVED
# =============================================================================
# All /api/admin/users/* routes now live in routes/admin/user_management.py.
#
# They were defined in BOTH modules. Identical rules, and admin_core.bp is
# registered first, so Flask dispatched here and the user_management copies were
# unreachable dead code. That silently pinned the stricter of two auth gates:
# PUT /users/<id> ran @require_admin (superadmin only) instead of the
# org-scoped @require_school_admin, so org admins got "Superadmin access
# required" when saving a user and could never promote anyone to org_admin.
#
# See the two tombstones above for the same bug in 2 earlier rounds. The
# duplicate-route guard in tests/unit/test_no_duplicate_routes.py now fails CI
# on a re-introduction instead of leaving it to be found in production.
# =============================================================================

# ============================================================================
# REMOVED: Duplicate /quests endpoint (originally lines 639-706)
# ============================================================================
# This duplicate GET /api/admin/quests endpoint was removed because:
# 1. It used @require_admin decorator (blocking advisors)
# 2. It conflicts with the proper implementation in quest_management.py
# 3. quest_management.py uses @require_advisor (allows both advisors and admins)
# 4. Flask was routing to this duplicate first, causing authorization errors
#
# The proper endpoint is in routes/admin/quest_management.py (line 439)

# Quest Ideas Management Endpoints

# Quest ideas management moved to admin/quest_ideas.py
# Quest sources management moved to admin/quest_sources.py
