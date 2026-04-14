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

__all__ = ['bp']
