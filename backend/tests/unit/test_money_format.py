"""One money formatter (utils/money.py, M7 2026-09-17), the rule
web/src/utils/money.js draws too."""

import pytest

from utils.money import format_cents


@pytest.mark.unit
class TestFormatCents:
    def test_dollars_with_cents_and_thousands(self):
        assert format_cents(12345) == '$123.45'
        assert format_cents(150000) == '$1,500.00'
        assert format_cents(0) == '$0.00'
        assert format_cents(5) == '$0.05'

    def test_a_refund_carries_a_real_minus_sign(self):
        assert format_cents(-500) == '−$5.00'

    def test_nothing_on_file_is_a_dash_unless_told_otherwise(self):
        assert format_cents(None) == '—'
        assert format_cents('') == '—'
        assert format_cents('lots') == '—'
        assert format_cents(None, blank='') == ''
        assert format_cents(None, blank=None) is None

    def test_compact_drops_the_cents_of_whole_dollars(self):
        assert format_cents(5000, compact=True) == '$50'
        assert format_cents(1250, compact=True) == '$12.50'

    def test_strings_and_floats_are_read_as_cents(self):
        assert format_cents('1999') == '$19.99'
        assert format_cents(1999.6) == '$20.00'
