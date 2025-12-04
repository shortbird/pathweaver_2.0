# Admin routes package

from flask import Blueprint
from .user_management import bp as user_management_bp
from .quest_management import bp as quest_management_bp
from .analytics import bp as analytics_bp
from .student_task_management import bp as student_task_management_bp
from .sample_task_management import bp as sample_task_management_bp
from .course_quest_management import bp as course_quest_management_bp
from .subject_backfill import bp as subject_backfill_bp

from utils.logger import get_logger

logger = get_logger(__name__)

admin_bp = Blueprint('admin', __name__)

# Register all admin sub-blueprints
admin_bp.register_blueprint(user_management_bp)
admin_bp.register_blueprint(quest_management_bp)
admin_bp.register_blueprint(analytics_bp)
admin_bp.register_blueprint(student_task_management_bp)
admin_bp.register_blueprint(sample_task_management_bp)
admin_bp.register_blueprint(course_quest_management_bp)
admin_bp.register_blueprint(subject_backfill_bp)