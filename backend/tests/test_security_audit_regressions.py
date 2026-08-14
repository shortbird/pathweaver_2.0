"""Regression tests for the 2026-08-14 security audit.

Each test here pins a property that was NOT true before that audit. They are
grouped by the finding they close so a failure names the vulnerability it
reopens rather than just the function that broke.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import pytest


# ---------------------------------------------------------------------------
# H1 — impersonation renewed forever without re-checking authority
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestImpersonationRefreshIsReauthorized:
    """A masquerade/acting-as refresh token used to be renewed purely from its
    own claims: no database check that the grant still stood, and a re-stamped
    `iat` that slid the expiry forward forever. A demoted superadmin kept
    impersonating anyone, permanently, with no way to revoke it."""

    def _sm(self):
        from utils.session_manager import session_manager
        return session_manager

    def test_masquerade_refresh_refused_once_admin_is_no_longer_superadmin(self, app):
        sm = self._sm()
        with app.test_request_context():
            token = sm.generate_masquerade_refresh_token('admin-1', 'victim-1')
            with patch('utils.token_authority.is_masquerade_still_authorized',
                       return_value=False):
                assert sm._refresh_impersonation_session(token) is None

    def test_masquerade_refresh_allowed_while_still_superadmin(self, app):
        sm = self._sm()
        with app.test_request_context():
            token = sm.generate_masquerade_refresh_token('admin-1', 'victim-1')
            with patch('utils.token_authority.is_masquerade_still_authorized',
                       return_value=True), \
                 patch('utils.token_authority.session_revoked_since',
                       return_value=False):
                result = sm._refresh_impersonation_session(token)
            assert result is not None
            assert result[2] == 'victim-1'

    def test_acting_as_refresh_refused_once_the_custody_link_is_gone(self, app):
        sm = self._sm()
        with app.test_request_context():
            token = sm.generate_acting_as_refresh_token('parent-1', 'child-1')
            with patch('utils.token_authority.is_acting_as_still_authorized',
                       return_value=False):
                assert sm._refresh_impersonation_session(token) is None

    def test_refreshing_cannot_slide_the_absolute_deadline(self, app):
        """The whole bug in one assertion: `iat` re-stamps on every refresh, so
        the cap has to be measured from `iat0`, which does not."""
        sm = self._sm()
        with app.test_request_context():
            long_ago = int((datetime.now(timezone.utc)
                            - sm.masquerade_max_lifetime - timedelta(hours=1)).timestamp())
            # Freshly issued (iat = now) but originally granted beyond the cap.
            token = sm.generate_masquerade_refresh_token(
                'admin-1', 'victim-1', origin_iat=long_ago)
            with patch('utils.token_authority.is_masquerade_still_authorized',
                       return_value=True), \
                 patch('utils.token_authority.session_revoked_since',
                       return_value=False):
                assert sm._refresh_impersonation_session(token) is None

    def test_origin_timestamp_survives_a_refresh(self, app):
        import jwt as _jwt
        from app_config import Config
        sm = self._sm()
        with app.test_request_context():
            origin = int((datetime.now(timezone.utc) - timedelta(hours=1)).timestamp())
            token = sm.generate_masquerade_refresh_token(
                'admin-1', 'victim-1', origin_iat=origin)
            with patch('utils.token_authority.is_masquerade_still_authorized',
                       return_value=True), \
                 patch('utils.token_authority.session_revoked_since',
                       return_value=False):
                _, new_refresh, _, _ = sm._refresh_impersonation_session(token)
            claims = _jwt.decode(new_refresh, Config.JWT_SECRET_KEY, algorithms=['HS256'])
            assert claims['iat0'] == origin, 'iat0 must not be re-stamped by a refresh'

    def test_logout_ends_an_impersonation_session(self, app):
        """last_logout_at could never reject these: the refresh path reported
        datetime.now() as the issue time, so `issued_at < last_logout_at` was
        always false."""
        sm = self._sm()
        with app.test_request_context():
            token = sm.generate_masquerade_refresh_token('admin-1', 'victim-1')
            with patch('utils.token_authority.is_masquerade_still_authorized',
                       return_value=True), \
                 patch('utils.token_authority.session_revoked_since',
                       return_value=True):
                assert sm._refresh_impersonation_session(token) is None


# ---------------------------------------------------------------------------
# H2 — recipients were never checked against the acting org
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestRecipientsMustBelongToTheOrg:
    """Assignment rows carry the CALLER's organization_id but a user_id taken
    from the request, so without this check an org admin could file a document
    into any account on the platform — in any other tenant — and have the
    product notify them about it."""

    def _client(self, rows):
        client, table = Mock(), Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'in_', 'insert'):
            getattr(table, chained).return_value = table
        table.execute.return_value = Mock(data=rows)
        return client

    def test_rejects_a_user_from_another_org(self):
        from services import sis_onboarding_service as onboarding
        client = self._client([{'id': 'u-1', 'organization_id': 'org-OTHER'}])
        with patch.object(onboarding, '_admin', return_value=client):
            with pytest.raises(onboarding.RecipientNotInOrg):
                onboarding.assert_recipients_in_org('org-MINE', ['u-1'])

    def test_rejects_a_user_that_does_not_exist(self):
        from services import sis_onboarding_service as onboarding
        client = self._client([])
        with patch.object(onboarding, '_admin', return_value=client):
            with pytest.raises(onboarding.RecipientNotInOrg):
                onboarding.assert_recipients_in_org('org-MINE', ['ghost'])

    def test_rejects_the_whole_batch_if_one_recipient_is_foreign(self):
        from services import sis_onboarding_service as onboarding
        client = self._client([
            {'id': 'u-1', 'organization_id': 'org-MINE'},
            {'id': 'u-2', 'organization_id': 'org-OTHER'},
        ])
        with patch.object(onboarding, '_admin', return_value=client):
            with pytest.raises(onboarding.RecipientNotInOrg):
                onboarding.assert_recipients_in_org('org-MINE', ['u-1', 'u-2'])

    def test_accepts_members_of_the_org(self):
        from services import sis_onboarding_service as onboarding
        client = self._client([
            {'id': 'u-1', 'organization_id': 'org-MINE'},
            {'id': 'u-2', 'organization_id': 'org-MINE'},
        ])
        with patch.object(onboarding, '_admin', return_value=client):
            onboarding.assert_recipients_in_org('org-MINE', ['u-1', 'u-2'])

    def test_fails_closed_when_the_lookup_errors(self):
        """An authorization check we could not complete is not permission."""
        from services import sis_onboarding_service as onboarding
        client, table = Mock(), Mock()
        client.table.return_value = table
        for chained in ('select', 'eq', 'limit', 'in_'):
            getattr(table, chained).return_value = table
        table.execute.side_effect = RuntimeError('db down')
        with patch.object(onboarding, '_admin', return_value=client):
            with pytest.raises(onboarding.RecipientNotInOrg):
                onboarding.assert_recipients_in_org('org-MINE', ['u-1'])


# ---------------------------------------------------------------------------
# M3 — uploads were validated by extension, and served with the caller's
#      Content-Type
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestUploadContentTypeComesFromTheBytes:
    MINIMAL_PDF = b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'

    def test_html_wearing_a_pdf_extension_is_refused(self):
        from services import sis_secure_docs_service as docs
        content_type, error = docs.resolve_content_type(
            b'<html><script>alert(1)</script></html>', 'pdf')
        assert content_type is None
        assert error

    def test_a_real_pdf_is_served_as_a_pdf(self):
        from services import sis_secure_docs_service as docs
        content_type, error = docs.resolve_content_type(self.MINIMAL_PDF, 'pdf')
        assert error is None
        assert content_type == 'application/pdf'

    def test_word_documents_are_never_served_inline(self):
        """Only positively-identified images and PDFs get a renderable type;
        everything else is handed back as an opaque download."""
        from services import sis_secure_docs_service as docs
        assert 'application/msword' not in docs._INLINE_SAFE_MIMES
        assert docs._INLINE_SAFE_MIMES <= {
            'application/pdf', 'image/png', 'image/jpeg', 'image/webp'}


# ---------------------------------------------------------------------------
# M4 — LTI evidence tokens never expired
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestEvidenceTokensExpire:
    def test_a_fresh_token_still_works(self):
        from services import lti_service
        token = lti_service.issue_evidence_token('student-1', 'quest-1')
        with patch('utils.token_authority.session_revoked_since', return_value=False):
            assert lti_service.verify_evidence_token(token, 'student-1') is True

    def test_a_token_now_carries_an_expiry(self):
        import jwt as _jwt
        from app_config import Config
        from services import lti_service
        token = lti_service.issue_evidence_token('student-1', 'quest-1')
        claims = _jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=['HS256'])
        assert 'exp' in claims, 'evidence tokens must not be perpetual'

    def test_an_expired_token_is_refused(self):
        import jwt as _jwt
        from app_config import Config
        from services import lti_service
        stale = _jwt.encode({
            'purpose': 'lti_evidence', 'uid': 'student-1', 'qid': 'quest-1',
            'iat': int((datetime.now(timezone.utc) - timedelta(days=400)).timestamp()),
            'exp': int((datetime.now(timezone.utc) - timedelta(days=1)).timestamp()),
        }, Config.JWT_SECRET_KEY, algorithm='HS256')
        assert lti_service.decode_evidence_token(stale) is None

    def test_a_legacy_token_with_no_expiry_is_refused(self):
        """Perpetual tokens were already issued; they must now fail closed
        rather than validate forever."""
        import jwt as _jwt
        from app_config import Config
        from services import lti_service
        legacy = _jwt.encode({
            'purpose': 'lti_evidence', 'uid': 'student-1', 'qid': 'quest-1',
            'iat': int(datetime.now(timezone.utc).timestamp()),
        }, Config.JWT_SECRET_KEY, algorithm='HS256')
        assert lti_service.decode_evidence_token(legacy) is None

    def test_an_ordinary_access_token_is_not_an_evidence_token(self):
        from services import lti_service
        from utils.session_manager import session_manager
        from flask import Flask
        with Flask(__name__).test_request_context():
            access = session_manager.generate_access_token('student-1')
        assert lti_service.verify_evidence_token(access, 'student-1') is False


# ---------------------------------------------------------------------------
# M6 — device fingerprint was computed, compared, then ignored
# ---------------------------------------------------------------------------

@pytest.mark.unit
class TestDeviceFingerprintIsEnforcedOnRefresh:
    CHROME_140 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0.7259.2 Safari/537.36'
    CHROME_141 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0.7301.9 Safari/537.36'
    FIREFOX    = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15) Gecko/20100101 Firefox/131.0'

    def test_mismatch_is_rejected_when_enforcing(self, app):
        from utils.session_manager import session_manager as sm
        with app.test_request_context(headers={'User-Agent': self.CHROME_140}):
            payload = {'dfp2': 'not-this-device', 'user_id': 'u-1'}
            assert sm._check_device_fingerprint(payload, 'refresh', enforce=True) is False

    def test_mismatch_is_tolerated_when_not_enforcing(self, app):
        from utils.session_manager import session_manager as sm
        with app.test_request_context(headers={'User-Agent': self.CHROME_140}):
            payload = {'dfp2': 'not-this-device', 'user_id': 'u-1'}
            assert sm._check_device_fingerprint(payload, 'access', enforce=False) is True

    def test_a_matching_device_passes(self, app):
        from utils.session_manager import session_manager as sm
        with app.test_request_context(headers={'User-Agent': self.CHROME_140}):
            payload = {'dfp2': sm._get_device_fingerprint(), 'user_id': 'u-1'}
            assert sm._check_device_fingerprint(payload, 'refresh', enforce=True) is True

    def test_a_browser_update_does_not_sign_the_user_out(self, app):
        """The reason the fingerprint ignores version numbers. Hashing the raw
        User-Agent would have logged out every Chrome user roughly monthly once
        this check started enforcing."""
        from utils.session_manager import session_manager as sm
        with app.test_request_context(headers={'User-Agent': self.CHROME_140}):
            issued = sm._get_device_fingerprint()
        with app.test_request_context(headers={'User-Agent': self.CHROME_141}):
            assert sm._check_device_fingerprint(
                {'dfp2': issued, 'user_id': 'u-1'}, 'refresh', enforce=True) is True

    def test_a_different_browser_is_still_caught(self, app):
        """...while the thing it exists to catch still trips it."""
        from utils.session_manager import session_manager as sm
        with app.test_request_context(headers={'User-Agent': self.CHROME_140}):
            issued = sm._get_device_fingerprint()
        with app.test_request_context(headers={'User-Agent': self.FIREFOX}):
            assert sm._check_device_fingerprint(
                {'dfp2': issued, 'user_id': 'u-1'}, 'refresh', enforce=True) is False

    def test_legacy_tokens_are_observed_but_never_rejected(self, app):
        """Tokens already in the wild carry only the old version-sensitive
        `dfp`. Enforcing it would log out the whole platform at deploy."""
        from utils.session_manager import session_manager as sm
        with app.test_request_context(headers={'User-Agent': self.CHROME_140}):
            assert sm._check_device_fingerprint(
                {'dfp': 'stale-legacy-value', 'user_id': 'u-1'},
                'refresh', enforce=True) is True

    def test_a_token_predating_fingerprinting_is_not_treated_as_a_mismatch(self, app):
        from utils.session_manager import session_manager as sm
        with app.test_request_context(headers={'User-Agent': self.CHROME_140}):
            assert sm._check_device_fingerprint({'user_id': 'u-1'}, 'refresh', enforce=True) is True
