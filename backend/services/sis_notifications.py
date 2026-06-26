"""
SIS notifications — thin, best-effort wrapper over the existing NotificationService.

SIS events (enrollment confirmed, waitlist seat offered, payment reminders) reuse the
platform's in-app notification + Realtime + push pipeline. Delivery is best-effort:
a notification failure must never break a registration/enrollment/billing operation,
so every call is guarded. Uses the existing 'announcement' type so the notification
bell renders it without any frontend change.
"""

from typing import Optional, Dict, Any

from utils.logger import get_logger

logger = get_logger(__name__)

SIS_NOTIFICATION_TYPE = 'announcement'


def notify(user_id: Optional[str], title: str, message: str,
           link: Optional[str] = None, organization_id: Optional[str] = None,
           metadata: Optional[Dict[str, Any]] = None) -> None:
    """Send an in-app notification, swallowing any error (best-effort)."""
    if not user_id:
        return
    try:
        from services.notification_service import NotificationService
        NotificationService().create_notification(
            user_id, SIS_NOTIFICATION_TYPE, title, message,
            link=link, metadata=metadata, organization_id=organization_id,
        )
    except Exception as e:  # pragma: no cover - delivery failures are non-fatal
        logger.warning(f"SIS notification skipped for {str(user_id)[:8]}: {e}")
