"""Tasks blueprint — split from the original 1376-line ``routes/tasks.py``.

The single Blueprint lives here; submodules import it and register
their routes via ``@bp.route``. Importing each submodule below triggers
route registration by side effect.
"""

from flask import Blueprint

bp = Blueprint('tasks', __name__, url_prefix='/api/tasks')

# Order matters only for readability — each import attaches routes to `bp`.
from . import completion  # noqa: F401,E402
from . import crud        # noqa: F401,E402
from . import credit      # noqa: F401,E402

# Re-export XP helpers so callers can keep using `from routes.tasks import ...`
# (the pattern from before the 2026-04-14 package split). Several downstream
# modules — credit_dashboard/items.py, advisor/credit_review.py, etc. — rely
# on this. Without it, the credit review dashboard 500s with ImportError.
from .xp_helpers import (  # noqa: F401,E402
    add_pending_subject_xp,
    finalize_subject_xp,
    get_subject_xp_distribution,
    remove_pending_subject_xp,
)

__all__ = [
    'bp',
    'add_pending_subject_xp',
    'finalize_subject_xp',
    'get_subject_xp_distribution',
    'remove_pending_subject_xp',
]
