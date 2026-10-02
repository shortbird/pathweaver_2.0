"""Read state is the target's, and a masquerade must leave it alone."""

from utils.logger import get_logger
from utils.session_manager import session_manager

logger = get_logger(__name__)


def masquerade_read_only() -> bool:
    """True when this request must NOT write read state (read_at,
    last_read_at, bell rows, announcement reads, office "opened by" marks).

    During a masquerade the request runs as the target, so every "mark read"
    lands on the target's account. An admin looking at someone's screen to
    see what they see must not change what that person has seen: Marika
    (iCreate, org_admin) viewed as Nicole Connole, opened one of her messages,
    and Nicole's unread badge disappeared -- Nicole never saw that message
    (ticket 50082917).

    Routes that would mark something read still answer with their normal
    success shape; they just skip the write.

    Never raises. A failure to read the session answers False (the normal,
    non-masquerade behaviour), because a broken check must not stop every
    member's messages from ever being marked read.
    """
    try:
        return bool(session_manager.is_masquerading())
    except Exception as exc:  # noqa: BLE001
        logger.debug("masquerade_read_only check failed: %s", exc, exc_info=True)
        return False
