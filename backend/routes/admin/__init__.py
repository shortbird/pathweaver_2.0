# Admin routes package

from flask import Blueprint
from .user_management import bp as user_management_bp
from .quest_management import bp as quest_management_bp
from .quest_ideas import bp as quest_ideas_bp
from .quest_sources import bp as quest_sources_bp
from .analytics import bp as analytics_bp

admin_bp = Blueprint('admin', __name__)

# Register all admin sub-blueprints
admin_bp.register_blueprint(user_management_bp)
admin_bp.register_blueprint(quest_management_bp)
admin_bp.register_blueprint(quest_ideas_bp)
admin_bp.register_blueprint(quest_sources_bp)
admin_bp.register_blueprint(analytics_bp)