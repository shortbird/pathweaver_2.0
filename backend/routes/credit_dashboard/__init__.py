"""
Credit Review Dashboard routes package.
Unified dashboard for org admins and superadmins to review credit activity.
Superadmin approval is the final stamp -- Optio is platform-accredited.
"""

from flask import Blueprint

bp = Blueprint('credit_dashboard', __name__, url_prefix='/api/credit-dashboard')

from . import items, merge, org_admin_actions, superadmin_actions  # noqa: E402, F401
