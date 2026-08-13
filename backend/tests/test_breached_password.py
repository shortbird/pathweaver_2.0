"""Unit tests for the HaveIBeenPwned breach check.

The property that matters most here is the failure mode: this check sits in
front of registration, password reset and change-password, so an HIBP outage
that returned "breached" (or raised) would lock every user out of all three at
once. That would be a far worse incident than the one the check prevents.
It must fail open, and these tests pin that.
"""

from unittest.mock import Mock, patch

import pytest

from utils.validation.breached_password import (
    is_breached_password,
    validate_password_not_breached,
)


# SHA-1('correct horse battery staple') =
# ABF7AAD6438836DBE526AA231ABDE2D0EEF74D42 -> prefix ABF7A, suffix AD64388...
KNOWN = 'correct horse battery staple'
KNOWN_SUFFIX = 'AD6438836DBE526AA231ABDE2D0EEF74D42'


def _response(body: str):
    resp = Mock()
    resp.text = body
    resp.raise_for_status = Mock()
    return resp


@pytest.mark.unit
class TestIsBreachedPassword:
    def test_detects_a_hash_present_in_the_range(self):
        with patch('utils.validation.breached_password.requests.get',
                   return_value=_response(f'{KNOWN_SUFFIX}:1337\nFFFF:2')) as get:
            assert is_breached_password(KNOWN) is True

        # Only the 5-character prefix is ever sent.
        url = get.call_args.args[0]
        assert url.endswith('/ABF7A')
        assert KNOWN_SUFFIX not in url

    def test_absent_hash_is_clean(self):
        with patch('utils.validation.breached_password.requests.get',
                   return_value=_response('AAAA:5\nBBBB:9')):
            assert is_breached_password(KNOWN) is False

    def test_padding_entries_do_not_count_as_hits(self):
        # Add-Padding responses include decoy hashes with a count of 0.
        with patch('utils.validation.breached_password.requests.get',
                   return_value=_response(f'{KNOWN_SUFFIX}:0')):
            assert is_breached_password(KNOWN) is False

    def test_api_failure_fails_open(self):
        with patch('utils.validation.breached_password.requests.get',
                   side_effect=OSError('connection reset')):
            assert is_breached_password(KNOWN) is False

    def test_http_error_fails_open(self):
        bad = Mock()
        bad.raise_for_status.side_effect = RuntimeError('503')
        with patch('utils.validation.breached_password.requests.get', return_value=bad):
            assert is_breached_password(KNOWN) is False

    def test_empty_password_makes_no_request(self):
        with patch('utils.validation.breached_password.requests.get') as get:
            assert is_breached_password('') is False
            get.assert_not_called()


@pytest.mark.unit
class TestValidatePasswordNotBreached:
    def test_breached_password_explains_the_refusal(self):
        with patch('utils.validation.breached_password.requests.get',
                   return_value=_response(f'{KNOWN_SUFFIX}:9')):
            is_valid, error = validate_password_not_breached(KNOWN)

        assert is_valid is False
        assert 'data breach' in error
        # She may well have invented it; the message must not call her careless.
        assert 'may still be one you invented' in error

    def test_clean_password_passes(self):
        with patch('utils.validation.breached_password.requests.get',
                   return_value=_response('AAAA:5')):
            assert validate_password_not_breached(KNOWN) == (True, None)
