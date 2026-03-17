"""
Unit tests for FCMNotificationService.

Tests device token management and push notification delivery.
"""

import pytest
import uuid
from unittest.mock import Mock, patch

from services.base_service import ValidationError


@pytest.mark.unit
class TestFCMTokenManagement:

    def test_register_token_success(self):
        from services.fcm_notification_service import FCMNotificationService
        service = FCMNotificationService()
        user_id = str(uuid.uuid4())

        with patch('database.get_supabase_admin_client') as mock_get:
            mock_supabase = Mock()
            mock_resp = Mock()
            mock_resp.data = [{'id': str(uuid.uuid4()), 'user_id': user_id, 'token': 'fcm_token_123'}]
            mock_supabase.table.return_value.upsert.return_value.execute.return_value = mock_resp
            mock_get.return_value = mock_supabase

            result = service.register_device_token(user_id, 'fcm_token_123', 'ios', 'iPhone 15')

            assert result['user_id'] == user_id

    def test_register_token_invalid_platform(self):
        from services.fcm_notification_service import FCMNotificationService
        service = FCMNotificationService()

        with pytest.raises(ValidationError, match="platform"):
            service.register_device_token(str(uuid.uuid4()), 'token', 'windows')

    def test_deactivate_token(self):
        from services.fcm_notification_service import FCMNotificationService
        service = FCMNotificationService()

        with patch('database.get_supabase_admin_client') as mock_get:
            mock_supabase = Mock()
            mock_get.return_value = mock_supabase

            service.deactivate_token(str(uuid.uuid4()), 'old_token')

            mock_supabase.table.return_value.update.assert_called_once()


@pytest.mark.unit
class TestFCMNotificationDelivery:

    def test_send_no_active_tokens_returns_silently(self):
        """When user has no active tokens, send_notification does nothing."""
        from services.fcm_notification_service import FCMNotificationService
        service = FCMNotificationService()
        service._firebase_app = Mock()  # skip firebase init

        with patch('database.get_supabase_admin_client') as mock_get:
            mock_supabase = Mock()
            mock_resp = Mock()
            mock_resp.data = []
            mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_resp
            mock_get.return_value = mock_supabase

            # Should not raise
            service.send_notification(str(uuid.uuid4()), 'Title', 'Body')

    def test_send_error_does_not_raise(self):
        """Errors in send_notification are caught, not propagated."""
        from services.fcm_notification_service import FCMNotificationService
        service = FCMNotificationService()
        service._firebase_app = Mock()

        with patch('database.get_supabase_admin_client') as mock_get:
            mock_supabase = Mock()
            mock_resp = Mock()
            mock_resp.data = [{'token': 'some_token'}]
            mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mock_resp
            mock_get.return_value = mock_supabase

            # send_notification should catch the ImportError from firebase_admin and not raise
            service.send_notification(str(uuid.uuid4()), 'Test', 'Body')
