"""
Emails to organization members carry the org's configured Reply-To
(feature_flags.email_reply_to — set for iCreate so replies reach the school's
inbox instead of Optio support). Platform users and unknown addresses get none,
and any lookup failure fails open to none.
"""

from unittest.mock import MagicMock, patch

import pytest

from services.email_service import EmailService


def _db(user_rows, feature_flags):
    """Fake supabase client: users lookup -> user_rows; org lookup -> feature_flags."""
    db = MagicMock()

    def table(name):
        t = MagicMock()
        if name == 'users':
            t.select.return_value.ilike.return_value.limit.return_value.execute.return_value.data = user_rows
        else:
            t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'feature_flags': feature_flags}
        return t

    db.table.side_effect = table
    return db


@pytest.mark.unit
class TestOrgReplyTo:
    def _lookup(self, user_rows, feature_flags):
        service = EmailService.__new__(EmailService)  # skip config/Jinja init
        with patch('database.get_supabase_admin_client',
                   return_value=_db(user_rows, feature_flags)):
            return service._org_reply_to('someone@example.com')

    def test_org_member_gets_org_reply_to(self):
        assert self._lookup([{'organization_id': 'org-1'}],
                            {'email_reply_to': 'icreatecollab@gmail.com'}) == \
            'icreatecollab@gmail.com'

    def test_org_without_config_gets_none(self):
        assert self._lookup([{'organization_id': 'org-1'}], {}) is None
        assert self._lookup([{'organization_id': 'org-1'}],
                            {'email_reply_to': '   '}) is None

    def test_platform_user_and_unknown_email_get_none(self):
        assert self._lookup([{'organization_id': None}], {}) is None
        assert self._lookup([], {}) is None

    def test_lookup_failure_fails_open(self):
        service = EmailService.__new__(EmailService)
        with patch('database.get_supabase_admin_client',
                   side_effect=RuntimeError('no app context')):
            assert service._org_reply_to('someone@example.com') is None
