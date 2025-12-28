"""
Tests for per-endpoint rate limiting functionality

Tests the enhanced rate_limit decorator with:
- Explicit calls/period parameters
- Config key usage
- Auto-detection from endpoint names
- Different limits for different endpoints
"""
import pytest
import time
import os
from flask import Flask, jsonify
from middleware.rate_limiter import rate_limit, rate_limiter, add_rate_limit_headers

@pytest.fixture
def app():
    """Create Flask app for testing"""
    app = Flask(__name__)
    app.config['TESTING'] = True

    # Register after_request handler for rate limit headers
    app.after_request(add_rate_limit_headers)

    # Test endpoint with explicit limit (10 calls per 60 seconds)
    @app.route('/api/sensitive')
    @rate_limit(calls=10, period=60)
    def sensitive_endpoint():
        return jsonify({'message': 'Success'})

    # Test endpoint using config key
    @app.route('/api/tutor/chat', methods=['POST'])
    @rate_limit('tutor_chat')
    def tutor_chat():
        return jsonify({'message': 'Chat response'})

    # Test endpoint with auto-detection (should use auth_login config)
    @app.route('/api/auth/login', methods=['POST'])
    @rate_limit()
    def auth_login():
        return jsonify({'message': 'Login successful'})

    # Test endpoint with auto-detection (should use task_complete config)
    @app.route('/api/tasks/<task_id>/complete', methods=['POST'])
    @rate_limit()
    def complete_task(task_id):
        return jsonify({'message': 'Task completed'})

    # Test endpoint with legacy parameters
    @app.route('/api/legacy')
    @rate_limit(max_requests=5, window_seconds=30)
    def legacy_endpoint():
        return jsonify({'message': 'Legacy success'})

    # Test endpoint with no decorator (should use default)
    @app.route('/api/default')
    @rate_limit()
    def default_endpoint():
        return jsonify({'message': 'Default success'})

    return app

@pytest.fixture
def client(app):
    """Create test client"""
    return app.test_client()

@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset rate limiter before each test"""
    # Reset in-memory storage
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()

    # Set development environment for all tests
    old_env = os.environ.get('FLASK_ENV')
    os.environ['FLASK_ENV'] = 'development'

    yield

    # Cleanup after test
    rate_limiter.requests.clear()
    rate_limiter.blocked_ips.clear()

    # Restore original environment
    if old_env is not None:
        os.environ['FLASK_ENV'] = old_env
    elif 'FLASK_ENV' in os.environ:
        del os.environ['FLASK_ENV']

class TestPerEndpointRateLimiting:
    """Test suite for per-endpoint rate limiting"""

    def test_explicit_calls_period_limit(self, client):
        """Test explicit calls/period parameters"""
        # Should allow 10 requests
        for i in range(10):
            response = client.get('/api/sensitive')
            assert response.status_code == 200
            assert response.json['message'] == 'Success'

        # 11th request should be rate limited
        response = client.get('/api/sensitive')
        assert response.status_code == 429
        assert 'error' in response.json
        assert 'retry_after' in response.json
        assert 'Retry-After' in response.headers

    def test_config_key_usage(self, client):
        """Test using config_key parameter"""
        # tutor_chat config: 100 requests per hour in dev (from config/rate_limits.py)
        # Let's just test a few requests work
        for i in range(5):
            response = client.post('/api/tutor/chat')
            assert response.status_code == 200
            assert response.json['message'] == 'Chat response'

    def test_auto_detection_auth_login(self, client):
        """Test auto-detection for auth endpoints"""
        # auth_login config: 10 requests per 5 min in dev
        for i in range(10):
            response = client.post('/api/auth/login')
            assert response.status_code == 200

        # 11th request should be rate limited
        response = client.post('/api/auth/login')
        assert response.status_code == 429

    def test_auto_detection_task_complete(self, client):
        """Test auto-detection for task completion"""
        # task_complete config: 60 requests per minute in dev
        for i in range(60):
            response = client.post('/api/tasks/123/complete')
            assert response.status_code == 200

        # 61st request should be rate limited
        response = client.post('/api/tasks/123/complete')
        assert response.status_code == 429

    def test_legacy_parameters(self, client):
        """Test legacy max_requests/window_seconds parameters"""
        # Should allow 5 requests
        for i in range(5):
            response = client.get('/api/legacy')
            assert response.status_code == 200

        # 6th request should be rate limited
        response = client.get('/api/legacy')
        assert response.status_code == 429

    def test_default_rate_limit(self, client):
        """Test default rate limit when no config matches"""
        # Default: 100 requests per minute in dev (api_default from config)
        for i in range(100):
            response = client.get('/api/default')
            assert response.status_code == 200

        # 101st request should be rate limited
        response = client.get('/api/default')
        assert response.status_code == 429

    def test_rate_limit_headers(self, client):
        """Test rate limit headers are present"""
        response = client.get('/api/sensitive')

        assert response.status_code == 200
        assert 'X-RateLimit-Limit' in response.headers
        assert 'X-RateLimit-Remaining' in response.headers
        assert 'X-RateLimit-Reset' in response.headers

        # Check header values
        assert response.headers['X-RateLimit-Limit'] == '10'
        # After first request, should have 9 remaining
        assert int(response.headers['X-RateLimit-Remaining']) == 9

    def test_different_endpoints_separate_limits(self, client):
        """Test that different endpoints have separate rate limits"""
        # Use up limit on sensitive endpoint
        for i in range(10):
            response = client.get('/api/sensitive')
            assert response.status_code == 200

        # Should be rate limited now
        response = client.get('/api/sensitive')
        assert response.status_code == 429

        # But legacy endpoint should still work (separate limit)
        response = client.get('/api/legacy')
        assert response.status_code == 200

    def test_retry_after_header(self, client):
        """Test Retry-After header is set correctly"""
        # Exceed limit
        for i in range(10):
            client.get('/api/sensitive')

        # Get rate limited response
        response = client.get('/api/sensitive')
        assert response.status_code == 429

        # Check Retry-After header exists and is reasonable
        retry_after = int(response.headers['Retry-After'])
        assert retry_after > 0
        assert retry_after <= 60  # Should not exceed window duration

class TestAutoDetection:
    """Test the _auto_detect_config_key function"""

    def test_upload_endpoint_detection(self, client, app):
        """Test upload endpoints are detected"""
        @app.route('/api/upload', methods=['POST'])
        @rate_limit()
        def upload():
            return jsonify({'message': 'Uploaded'})

        # Upload config: 20 requests per hour in dev
        for i in range(20):
            response = client.post('/api/upload')
            assert response.status_code == 200

        response = client.post('/api/upload')
        assert response.status_code == 429

    def test_evidence_upload_detection(self, client, app):
        """Test evidence upload endpoints are detected"""
        @app.route('/api/evidence/upload', methods=['POST'])
        @rate_limit()
        def evidence_upload():
            return jsonify({'message': 'Evidence uploaded'})

        # Evidence upload: 20 requests per hour in dev
        for i in range(20):
            response = client.post('/api/evidence/upload')
            assert response.status_code == 200

        response = client.post('/api/evidence/upload')
        assert response.status_code == 429

    def test_admin_create_detection(self, client, app):
        """Test admin create endpoints are detected"""
        @app.route('/api/admin/users', methods=['POST'])
        @rate_limit()
        def admin_create_user():
            return jsonify({'message': 'User created'})

        # Admin create: 100 requests per minute in dev
        for i in range(100):
            response = client.post('/api/admin/users')
            assert response.status_code == 200

        response = client.post('/api/admin/users')
        assert response.status_code == 429

    def test_admin_update_detection(self, client, app):
        """Test admin update endpoints are detected"""
        @app.route('/api/admin/users/<user_id>', methods=['PUT'])
        @rate_limit()
        def admin_update_user(user_id):
            return jsonify({'message': 'User updated'})

        # Admin update: 100 requests per minute in dev
        for i in range(100):
            response = client.put('/api/admin/users/123')
            assert response.status_code == 200

        response = client.put('/api/admin/users/123')
        assert response.status_code == 429

    def test_admin_delete_detection(self, client, app):
        """Test admin delete endpoints are detected"""
        @app.route('/api/admin/users/<user_id>', methods=['DELETE'])
        @rate_limit()
        def admin_delete_user(user_id):
            return jsonify({'message': 'User deleted'})

        # Admin delete: 50 requests per minute in dev
        for i in range(50):
            response = client.delete('/api/admin/users/123')
            assert response.status_code == 200

        response = client.delete('/api/admin/users/123')
        assert response.status_code == 429

class TestParameterPriority:
    """Test parameter priority (calls/period > limit/per > max_requests/window_seconds)"""

    def test_calls_period_overrides_limit_per(self, client, app):
        """Test calls/period has priority over limit/per"""
        @app.route('/api/test1')
        @rate_limit(calls=5, period=60, limit=10, per=60)
        def test1():
            return jsonify({'message': 'Success'})

        # Should use calls=5, not limit=10
        for i in range(5):
            response = client.get('/api/test1')
            assert response.status_code == 200

        response = client.get('/api/test1')
        assert response.status_code == 429

    def test_limit_per_overrides_max_requests(self, client, app):
        """Test limit/per has priority over max_requests/window_seconds"""
        @app.route('/api/test2')
        @rate_limit(limit=5, per=60, max_requests=10, window_seconds=60)
        def test2():
            return jsonify({'message': 'Success'})

        # Should use limit=5, not max_requests=10
        for i in range(5):
            response = client.get('/api/test2')
            assert response.status_code == 200

        response = client.get('/api/test2')
        assert response.status_code == 429

    def test_config_key_overrides_auto_detection(self, client, app):
        """Test explicit config_key overrides auto-detection"""
        # Endpoint looks like auth_login but uses explicit config
        @app.route('/api/auth/login-special', methods=['POST'])
        @rate_limit('api_default')  # 100 requests per minute in dev
        def special_login():
            return jsonify({'message': 'Login'})

        # Should use api_default (100), not auth_login (10)
        for i in range(100):
            response = client.post('/api/auth/login-special')
            assert response.status_code == 200

        response = client.post('/api/auth/login-special')
        assert response.status_code == 429
