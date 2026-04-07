"""
Credit Review Dashboard routes package.
Unified dashboard for advisors, accreditors, and superadmins to review credit activity.
"""

from flask import Blueprint

bp = Blueprint('credit_dashboard', __name__, url_prefix='/api/credit-dashboard')

from . import items, accreditor_actions, merge, org_admin_actions  # noqa: E402, F401
