"""Learning Events route package.

Endpoints for spontaneous learning moment capture. The blueprint is built
here; submodule imports register the routes on it.
"""
from flask import Blueprint

from utils.logger import get_logger

logger = get_logger(__name__)

learning_events_bp = Blueprint('learning_events', __name__)


# Submodule imports trigger route registration on bp:
from . import crud  # noqa: F401,E402
from . import evidence  # noqa: F401,E402
from . import threads  # noqa: F401,E402
from . import ai  # noqa: F401,E402
from . import attach  # noqa: F401,E402
