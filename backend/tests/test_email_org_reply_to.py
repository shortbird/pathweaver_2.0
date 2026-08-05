"""
Emails to organization members carry the org's configured Reply-To
(feature_flags.email_reply_to — set for iCreate so replies reach the school's
inbox instead of Optio support). Platform users and unknown addresses get none,
and any lookup failure fails open to none.

The same org lookup (_recipient_org) also decides whether an org's mail is copied
to SUPPORT_COPY_EMAIL: iCreate is opted out (SUPPORT_COPY_EXCLUDE_ORG_SLUGS).
"""

from unittest.mock import MagicMock, patch

import pytest

from services.email_service import EmailService, SUPPORT_COPY_EXCLUDE_ORG_SLUGS


def _db(user_rows, feature_flags, slug=None):
    """Fake supabase client: users lookup -> user_rows; org lookup -> {slug, feature_flags}."""
    db = MagicMock()

    def table(name):
        t = MagicMock()
        if name == 'users':
            t.select.return_value.ilike.return_value.limit.return_value.execute.return_value.data = user_rows
        else:
            t.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                'slug': slug, 'feature_flags': feature_flags}
        return t

    db.table.side_effect = table
    return db


def _reply_to_from(org):
    """Mirror how send_email derives the Reply-To from the org row."""
    flags = (org or {}).get('feature_flags') or {}
    value = flags.get('email_reply_to')
    return value.strip() if isinstance(value, str) and value.strip() else None


@pytest.mark.unit
class TestOrgReplyTo:
    def _lookup(self, user_rows, feature_flags, slug=None):
        service = EmailService.__new__(EmailService)  # skip config/Jinja init
        with patch('database.get_supabase_admin_client',
                   return_value=_db(user_rows, feature_flags, slug)):
            return _reply_to_from(service._recipient_org('someone@example.com'))

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
            assert service._recipient_org('someone@example.com') is None


@pytest.mark.unit
class TestSupportCopyOptOut:
    def _org(self, slug):
        service = EmailService.__new__(EmailService)
        with patch('database.get_supabase_admin_client',
                   return_value=_db([{'organization_id': 'org-1'}], {}, slug)):
            return service._recipient_org('someone@example.com')

    def test_icreate_is_opted_out(self):
        assert 'icreate' in SUPPORT_COPY_EXCLUDE_ORG_SLUGS
        org = self._org('icreate')
        assert org.get('slug') in SUPPORT_COPY_EXCLUDE_ORG_SLUGS

    def test_other_org_still_copied(self):
        org = self._org('treehouse')
        assert org.get('slug') not in SUPPORT_COPY_EXCLUDE_ORG_SLUGS
