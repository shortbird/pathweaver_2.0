"""The `csrf_reason` tag that splits CSRF rejections into separate Sentry issues.

Every cookie-authenticated CSRF rejection used to be captured under one
message, so the routine case (a token aged past WTF_CSRF_TIME_LIMIT in a tab
left open, which the web client refetches and retries invisibly) sat in the
same issue as the shapes a forgery attempt makes. classify_csrf_failure turns
Flask-WTF's human-facing description into the stable slug used for the tag and
the fingerprint.
"""

from __future__ import annotations

import pytest

from middleware.csrf_protection import classify_csrf_failure


@pytest.mark.parametrize(
    'description,expected',
    [
        # Flask-WTF's actual wording, which is what production sends.
        ('The CSRF token has expired.', 'expired'),
        ('The CSRF token is missing.', 'missing'),
        ('The CSRF tokens do not match.', 'mismatch'),
        ('The CSRF session token is missing.', 'session_missing'),
        ('The CSRF token is invalid.', 'invalid'),
        ('The referrer header is missing.', 'referrer'),
        ('The referrer does not match the host.', 'referrer'),
    ],
)
def test_classifies_flask_wtf_descriptions(description, expected):
    assert classify_csrf_failure(description) == expected


def test_session_missing_does_not_collapse_into_missing():
    """A missing SESSION token means the cookie or session store is gone — a
    different bug from a client that forgot the header, and it must not be
    filed under the same issue."""
    assert classify_csrf_failure('The CSRF session token is missing.') == 'session_missing'
    assert classify_csrf_failure('The CSRF token is missing.') == 'missing'


def test_matching_is_case_insensitive_and_substring_based():
    """The descriptions are prose and have been reworded between Flask-WTF
    releases; matching exact strings would silently reclassify everything as
    'other' on an upgrade."""
    assert classify_csrf_failure('CSRF TOKEN HAS EXPIRED') == 'expired'
    assert classify_csrf_failure('csrf token expired 3600 seconds ago') == 'expired'


@pytest.mark.parametrize('value', [None, '', 'something nobody anticipated'])
def test_unrecognized_reasons_fall_through_to_other(value):
    assert classify_csrf_failure(value) == 'other'
