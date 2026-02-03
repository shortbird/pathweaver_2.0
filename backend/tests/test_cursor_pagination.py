"""
Unit tests for cursor pagination utilities.

Tests the cursor-based pagination implementation in utils/pagination.py
"""

import pytest
import base64
import json
from utils.pagination import (
    encode_cursor,
    decode_cursor,
    get_cursor_params,
    build_cursor_meta
)


class TestCursorEncoding:
    """Test cursor encoding and decoding."""

    def test_encode_cursor_basic(self):
        """Test basic cursor encoding."""
        item = {
            'id': '123e4567-e89b-12d3-a456-426614174000',
            'created_at': '2025-01-01T12:00:00Z'
        }
        cursor = encode_cursor(item)

        # Should be base64 encoded
        assert isinstance(cursor, str)
        assert len(cursor) > 0

        # Should decode back to same data
        decoded = base64.b64decode(cursor).decode()
        data = json.loads(decoded)
        assert data['id'] == item['id']
        assert data['created_at'] == item['created_at']

    def test_decode_cursor_basic(self):
        """Test basic cursor decoding."""
        cursor_data = {
            'id': '123e4567-e89b-12d3-a456-426614174000',
            'created_at': '2025-01-01T12:00:00Z'
        }
        encoded = base64.b64encode(json.dumps(cursor_data).encode()).decode()

        decoded = decode_cursor(encoded)
        assert decoded['id'] == cursor_data['id']
        assert decoded['created_at'] == cursor_data['created_at']

    def test_decode_cursor_invalid(self):
        """Test decoding invalid cursor raises error."""
        with pytest.raises(ValueError, match="Invalid cursor format"):
            decode_cursor("not-valid-base64")

    def test_decode_cursor_missing_fields(self):
        """Test decoding cursor with missing fields raises error."""
        # Cursor with only id, missing created_at
        cursor_data = {'id': '123'}
        encoded = base64.b64encode(json.dumps(cursor_data).encode()).decode()

        with pytest.raises(ValueError, match="must contain 'id' and 'created_at'"):
            decode_cursor(encoded)

    def test_encode_decode_roundtrip(self):
        """Test encoding and decoding roundtrip."""
        item = {
            'id': 'test-id-123',
            'created_at': '2025-12-26T10:30:00Z',
            'other_field': 'ignored'  # Should be ignored
        }

        cursor = encode_cursor(item)
        decoded = decode_cursor(cursor)

        assert decoded['id'] == item['id']
        assert decoded['created_at'] == item['created_at']
        assert 'other_field' not in decoded  # Only id and created_at


class TestBuildCursorMeta:
    """Test cursor metadata building."""

    def test_build_cursor_meta_no_more(self):
        """Test building metadata when no more items."""
        items = [
            {'id': '1', 'created_at': '2025-01-01'},
            {'id': '2', 'created_at': '2025-01-02'}
        ]
        limit = 5  # More than items

        data, meta, links = build_cursor_meta(items, limit)

        assert len(data) == 2
        assert meta['has_more'] is False
        assert 'next_cursor' not in meta

    def test_build_cursor_meta_has_more(self):
        """Test building metadata when more items exist."""
        items = [
            {'id': '1', 'created_at': '2025-01-01'},
            {'id': '2', 'created_at': '2025-01-02'},
            {'id': '3', 'created_at': '2025-01-03'}  # Extra item
        ]
        limit = 2

        data, meta, links = build_cursor_meta(items, limit)

        assert len(data) == 2  # Should only return limit items
        assert meta['has_more'] is True
        assert 'next_cursor' in meta
        assert isinstance(meta['next_cursor'], str)

        # Verify cursor encodes last returned item
        decoded = decode_cursor(meta['next_cursor'])
        assert decoded['id'] == '2'  # Last item in data, not in items

    def test_build_cursor_meta_with_links(self):
        """Test building metadata with HATEOAS links."""
        items = [
            {'id': '1', 'created_at': '2025-01-01'},
            {'id': '2', 'created_at': '2025-01-02'},
            {'id': '3', 'created_at': '2025-01-03'}
        ]
        limit = 2
        base_url = '/api/v1/quests'

        data, meta, links = build_cursor_meta(items, limit, base_url)

        assert links is not None
        assert 'self' in links
        assert 'next' in links
        assert links['next'] is not None  # Has more items
        assert base_url in links['next']
        assert 'cursor=' in links['next']

    def test_build_cursor_meta_empty_items(self):
        """Test building metadata with empty items."""
        items = []
        limit = 10

        data, meta, links = build_cursor_meta(items, limit)

        assert len(data) == 0
        assert meta['has_more'] is False
        assert 'next_cursor' not in meta


class TestGetCursorParams:
    """Test cursor parameter extraction from request."""

    def test_get_cursor_params_defaults(self, app, client):
        """Test getting cursor params with defaults."""
        with app.test_request_context('/api/quests'):
            cursor, limit = get_cursor_params()

            assert cursor is None
            assert limit == 20  # Default

    def test_get_cursor_params_with_cursor(self, app, client):
        """Test getting cursor params with cursor."""
        with app.test_request_context('/api/quests?cursor=abc123&limit=50'):
            cursor, limit = get_cursor_params()

            assert cursor == 'abc123'
            assert limit == 50

    def test_get_cursor_params_max_limit(self, app, client):
        """Test limit is capped at max."""
        with app.test_request_context('/api/quests?limit=999'):
            cursor, limit = get_cursor_params(max_limit=100)

            assert limit == 100  # Capped

    def test_get_cursor_params_invalid_limit(self, app, client):
        """Test invalid limit falls back to default."""
        with app.test_request_context('/api/quests?limit=invalid'):
            cursor, limit = get_cursor_params()

            assert limit == 20  # Default


@pytest.fixture
def app():
    """Create Flask app for testing."""
    from flask import Flask
    app = Flask(__name__)
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
