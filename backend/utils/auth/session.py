"""Session management utilities"""

from utils.session_manager import session_manager

from utils.logger import get_logger

logger = get_logger(__name__)

# Re-export session manager for organized access
__all__ = ['session_manager']