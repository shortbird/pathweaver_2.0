"""Unit tests for the POE showcase — the unauthenticated pilot summary shared
with POE/AGO leadership (`GET /api/public/poe/showcase?key=...`).

Network-free. The link-key gate is exercised against the real app so a wrong
key is proven to short-circuit *before* any database read, and the shaping
helpers are tested directly.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app_config import Config  # noqa: E402
from routes.poe import (  # noqa: E402
    _day_number,
    _is_internal_test_account,
    _short_name,
    _showcase_block,
)

SHOWCASE_URL = '/api/public/poe/showcase'


@pytest.fixture
def showcase_key(monkeypatch):
    monkeypatch.setattr(Config, 'POE_SHOWCASE_KEY', 'test-link-key', raising=False)
    return 'test-link-key'


class TestLinkKeyGate:
    """A caller without the link must learn nothing — including whether the
    page exists — so every rejection is a 404, never a 403."""

    def test_missing_key_is_404(self, client, showcase_key):
        assert client.get(SHOWCASE_URL).status_code == 404

    def test_wrong_key_is_404(self, client, showcase_key):
        assert client.get(f'{SHOWCASE_URL}?key=nope').status_code == 404

    def test_unset_key_closes_the_page_everywhere(self, client, monkeypatch):
        """Unset config => the page is off, even if a caller guesses an empty
        key. Any deploy that hasn't deliberately been given a key serves 404."""
        monkeypatch.setattr(Config, 'POE_SHOWCASE_KEY', None, raising=False)
        assert client.get(SHOWCASE_URL).status_code == 404
        assert client.get(f'{SHOWCASE_URL}?key=').status_code == 404


class TestInternalTestAccounts:
    """The pilot contains one dry-run participant on a plus-addressed
    superadmin account. Nothing else in the row distinguishes it from a real
    camper, so leaving it in would put a fake camper in front of POE."""

    def test_plus_addressed_superadmin_is_excluded(self, monkeypatch):
        monkeypatch.setattr(Config, 'SUPERADMIN_EMAIL', 'admin@example.com', raising=False)
        assert _is_internal_test_account('admin+poe1@example.com')
        assert _is_internal_test_account('ADMIN+POE1@EXAMPLE.COM')
        assert _is_internal_test_account('admin@example.com')

    def test_real_campers_are_kept(self, monkeypatch):
        monkeypatch.setattr(Config, 'SUPERADMIN_EMAIL', 'admin@example.com', raising=False)
        assert not _is_internal_test_account('camper@example.com')
        assert not _is_internal_test_account('admin@other.com')
        # A camper whose address merely starts with the same letters stays in.
        assert not _is_internal_test_account('administrator@example.com')
        assert not _is_internal_test_account(None)

    def test_no_superadmin_configured_excludes_nobody(self, monkeypatch):
        monkeypatch.setattr(Config, 'SUPERADMIN_EMAIL', None, raising=False)
        assert not _is_internal_test_account('anyone@example.com')


class TestShortName:
    def test_shortens_to_first_name_and_last_initial(self):
        assert _short_name('Aleena', 'Mayer') == 'Aleena M.'

    def test_handles_a_missing_last_name(self):
        assert _short_name('Annie', '') == 'Annie'
        assert _short_name('Annie', None) == 'Annie'

    def test_falls_back_rather_than_rendering_an_empty_heading(self):
        assert _short_name('', 'Mayer') == 'Participant'


class TestDayNumber:
    def test_orders_days_numerically_not_lexically(self):
        titles = ['POE Day 10', 'POE Day 2', 'POE Day 1']
        assert sorted(titles, key=_day_number) == ['POE Day 1', 'POE Day 2', 'POE Day 10']

    def test_unrecognized_titles_sort_last(self):
        assert _day_number('Extra evidence') == 99
        assert _day_number(None) == 99


class TestShowcaseBlock:
    def test_text_block_is_passed_through_trimmed(self):
        block = {'block_type': 'text', 'content': {'text': '  I toured the organ.  '}}
        assert _showcase_block(block, {}) == {'type': 'text', 'text': 'I toured the organ.'}

    def test_empty_text_block_is_dropped(self):
        assert _showcase_block({'block_type': 'text', 'content': {'text': '   '}}, {}) is None

    def test_multi_item_images_get_display_and_thumbnail_urls(self):
        block = {
            'block_type': 'image',
            'content': {'items': [
                {'url': 'raw://a', 'filename': 'a.jpg', 'caption': 'The console'},
            ]},
        }
        out = _showcase_block(block, {'raw://a': ('signed://large-a', 'signed://thumb-a')})
        assert out == {
            'type': 'image',
            'items': [{
                'url': 'signed://large-a',
                'title': 'a.jpg',
                'caption': 'The console',
                'thumb_url': 'signed://thumb-a',
            }],
        }

    def test_legacy_single_item_shape_still_renders(self):
        """Older blocks store url/filename at the top level instead of items[].
        Both shapes are live in the table, and dropping the old one would blank
        out the earliest camps."""
        block = {'block_type': 'image', 'content': {'url': 'raw://b', 'filename': 'b.jpg'}}
        out = _showcase_block(block, {'raw://b': ('signed://b', None)})
        assert out['items'] == [{'url': 'signed://b', 'title': 'b.jpg', 'caption': None}]

    def test_unsigned_media_falls_back_to_the_stored_url(self):
        block = {'block_type': 'video', 'content': {'items': [{'url': 'raw://v'}]}}
        out = _showcase_block(block, {})
        assert out['items'][0]['url'] == 'raw://v'

    def test_media_block_with_nothing_left_is_dropped(self):
        block = {'block_type': 'image', 'content': {'items': [{'caption': 'no url'}]}}
        assert _showcase_block(block, {}) is None

    def test_unknown_block_types_are_dropped(self):
        assert _showcase_block({'block_type': 'audio', 'content': {'url': 'x'}}, {}) is None
