"""Stories: the admin API behind the grader's Publish button, and the public feed.

Two blueprints, the same pair as docs:

  admin_stories_bp   /api/admin/stories/...   superadmin (cron secret for /internal)
  public_stories_bp  /api/public/stories/...  no auth, allowlisted projection, cached

No `.table()` call lives in this package. Every read and write goes through
repositories/story_*_repository.py and services/stories/.
"""

from flask import Blueprint

admin_stories_bp = Blueprint('admin_stories', __name__, url_prefix='/api/admin/stories')
public_stories_bp = Blueprint('public_stories', __name__, url_prefix='/api/public/stories')

# Route modules attach to the blueprints above on import.
from routes.stories import admin, consents, internal, public  # noqa: E402,F401

__all__ = ['admin_stories_bp', 'public_stories_bp']
