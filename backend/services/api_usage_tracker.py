"""
API Usage Tracker for Pexels API

Tracks API calls to ensure we stay within rate limits:
- 200 requests per hour (Pexels free tier)
- Resets every hour
"""
from datetime import datetime, timedelta
from typing import Dict
from services.base_service import BaseService

from utils.logger import get_logger

logger = get_logger(__name__)

class APIUsageTracker:
    def __init__(self):
        self.hourly_limit = 200
        self.usage = {}  # {hour_key: count}
        self.last_reset = datetime.utcnow()

    def _get_hour_key(self) -> str:
        """Get current hour key for tracking"""
        now = datetime.utcnow()
        return now.strftime('%Y-%m-%d-%H')

    def _reset_if_needed(self):
        """Reset counter if we've moved to a new hour"""
        now = datetime.utcnow()
        if (now - self.last_reset) >= timedelta(hours=1):
            # Clear old hours
            current_hour = self._get_hour_key()
            self.usage = {current_hour: self.usage.get(current_hour, 0)}
            self.last_reset = now

    def increment(self) -> int:
        """
        Increment usage counter and return current count

        Returns:
            Current usage count for this hour
        """
        self._reset_if_needed()
        hour_key = self._get_hour_key()
        self.usage[hour_key] = self.usage.get(hour_key, 0) + 1
        return self.usage[hour_key]

    def get_usage(self) -> Dict[str, int]:
        """
        Get current API usage stats

        Returns:
            Dict with used, limit, remaining, and reset time
        """
        self._reset_if_needed()
        hour_key = self._get_hour_key()
        used = self.usage.get(hour_key, 0)

        # Calculate reset time (next hour)
        now = datetime.utcnow()
        next_hour = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)

        return {
            'used': used,
            'limit': self.hourly_limit,
            'remaining': max(0, self.hourly_limit - used),
            'resets_at': next_hour.strftime('%H:%M UTC')
        }

    def can_make_request(self, count: int = 1) -> bool:
        """
        Check if we can make N more requests without hitting limit

        Args:
            count: Number of requests to check

        Returns:
            True if we have capacity, False otherwise
        """
        stats = self.get_usage()
        return stats['remaining'] >= count

# Global tracker instance
pexels_tracker = APIUsageTracker()
