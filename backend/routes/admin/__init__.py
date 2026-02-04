# Admin routes package
# Individual admin blueprints are registered directly in app.py
# This package only exports the blueprint modules for import

from .user_management import bp as user_management_bp
from .quest_management import bp as quest_management_bp
from .analytics import bp as analytics_bp
from .student_task_management import bp as student_task_management_bp
from .sample_task_management import bp as sample_task_management_bp
from .course_quest_management import bp as course_quest_management_bp
from .observer_audit import bp as observer_audit_bp
from .ferpa_compliance import bp as ferpa_compliance_bp
from .xp_reconciliation import bp as xp_reconciliation_bp

__all__ = [
    'user_management_bp',
    'quest_management_bp',
    'analytics_bp',
    'student_task_management_bp',
    'sample_task_management_bp',
    'course_quest_management_bp',
    'observer_audit_bp',
    'ferpa_compliance_bp',
    'xp_reconciliation_bp'
]