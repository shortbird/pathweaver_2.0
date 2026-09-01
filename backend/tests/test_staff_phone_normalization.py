"""
A phone number is stored one way, whichever screen wrote it.

users.phone_number had two authors with two formats. The SMS verification flow
writes E.164 ("+15551234567"); the staff profile kept whatever was typed
("(555) 123-4567"). Same column, so the staff directory and export showed a
mix, and — the part that actually breaks — the verification screen PREFILLS
from this column, so a raw string went straight back into a flow that expects a
real number.

Both writers now go through normalize_phone. The staff profile refuses a number
it cannot parse (a number nobody can text is not worth recording, and the
person is told which field to fix); the public registration funnel keeps an
unparseable one as typed rather than turning a family away at enrollment.
"""

from unittest.mock import Mock, patch

import pytest

import app  # noqa: F401 — import graph ordering
import services.sis_staff_service as staff


ORG = 'org-1'
USER = 'staff-1'


@pytest.fixture
def saved():
    """Capture what upsert_staff_profile writes to users.phone_number."""
    writes = {}

    class _Table:
        def __init__(self, name):
            self.name = name
            self._payload = None

        def update(self, payload):
            self._payload = payload
            return self

        def eq(self, *_a, **_k):
            return self

        def select(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            if self.name == 'users' and self._payload is not None:
                writes.update(self._payload)
            return Mock(data=[])

    client = Mock()
    client.table.side_effect = lambda name: _Table(name)

    def _call(value):
        writes.clear()
        with patch.object(staff, '_admin', return_value=client), \
             patch.object(staff, 'get_staff_profile', return_value={}):
            result = staff.upsert_staff_profile(
                ORG, USER, {'phone_number': value},
                allowed=staff.SELF_PROFILE_FIELDS,
            )
        return result, writes

    return _call


class TestStoredAsE164:
    @pytest.mark.parametrize('typed', [
        '(555) 123-4567',
        '555-123-4567',
        '555.123.4567',
        '5551234567',
        '  5551234567  ',
        '1-555-123-4567',
        '+1 555 123 4567',
    ])
    def test_every_us_shape_lands_the_same_way(self, saved, typed):
        result, writes = saved(typed)
        assert 'error' not in result
        assert writes['phone_number'] == '+15551234567'

    def test_an_international_number_keeps_its_country_code(self, saved):
        _, writes = saved('+44 20 7946 0958')
        assert writes['phone_number'] == '+442079460958'

    def test_the_stored_shape_matches_what_verification_writes(self, saved):
        """verify_code stores normalize_phone's output; so must this, or the
        verification screen prefills a string it cannot use."""
        from services.phone_verification_service import normalize_phone
        _, writes = saved('(555) 123-4567')
        assert writes['phone_number'] == normalize_phone('(555) 123-4567')


class TestClearing:
    @pytest.mark.parametrize('empty', ['', '   ', None])
    def test_an_empty_value_clears_the_number(self, saved, empty):
        result, writes = saved(empty)
        assert 'error' not in result
        assert writes['phone_number'] is None


class TestRefusal:
    @pytest.mark.parametrize('bad', [
        'nope',
        '12345',
        '555-1234',
        'call the office',
    ])
    def test_an_unusable_number_is_refused_not_stored(self, saved, bad):
        result, writes = saved(bad)
        assert 'error' in result
        assert 'phone_number' not in writes

    def test_the_refusal_says_what_to_do(self, saved):
        result, _ = saved('nope')
        assert '10-digit' in result['error'] or 'country code' in result['error']
