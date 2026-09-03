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
           metadata: Optional[Dict[str, Any]] = None,
           service: Optional[Any] = None) -> None:
    """Send an in-app notification, swallowing any error (best-effort).

    `service` lets a caller notifying a whole team hand in ONE
    NotificationService instead of paying for one per recipient. Its
    constructor builds a fresh Supabase client every time, which a fan-out
    inside a request the client only waits fifteen seconds for cannot afford
    (Sentry OPTIO-MOBILE-4: reporting four children absent to an eight-person
    office built thirty-two of them, and the POST took ~18s).
    """
    if not user_id:
        return
    try:
        if service is None:
            service = shared_service()
        service.create_notification(
            user_id, SIS_NOTIFICATION_TYPE, title, message,
            link=link, metadata=metadata, organization_id=organization_id,
        )
    except Exception as e:  # pragma: no cover - delivery failures are non-fatal
        logger.warning(f"SIS notification skipped for {str(user_id)[:8]}: {e}")


def shared_service():
    """One NotificationService for a fan-out. See `notify(service=...)`."""
    from services.notification_service import NotificationService
    return NotificationService()
