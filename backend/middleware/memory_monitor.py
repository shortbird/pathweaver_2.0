"""
Memory monitoring middleware for Flask application.
Tracks memory usage and provides cleanup triggers to prevent memory exhaustion.
"""

import psutil
import gc
import os
from flask import request, g
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class MemoryMonitor:
    """Memory monitoring and management middleware"""

    def __init__(self, app=None):
        self.app = app
        self.high_memory_threshold = 400 * 1024 * 1024  # 400MB
        self.critical_memory_threshold = 450 * 1024 * 1024  # 450MB
        self.cleanup_count = 0

        if app:
            self.init_app(app)

    def init_app(self, app):
        """Initialize memory monitoring for Flask app"""
        app.before_request(self.before_request)
        app.after_request(self.after_request)
        app.teardown_appcontext(self.cleanup_context)

        # Add health check endpoint
        @app.route('/api/health/memory')
        def memory_health():
            return self.get_memory_stats()

    def get_memory_usage(self):
        """Get current memory usage of the process"""
        try:
            process = psutil.Process(os.getpid())
            memory_info = process.memory_info()
            return {
                'rss': memory_info.rss,  # Resident Set Size
                'vms': memory_info.vms,  # Virtual Memory Size
                'percent': process.memory_percent(),
                'available': psutil.virtual_memory().available
            }
        except Exception as e:
            logger.error(f"Error getting memory usage: {e}")
            return {'rss': 0, 'vms': 0, 'percent': 0, 'available': 0}

    def before_request(self):
        """Monitor memory before request processing"""
        g.start_memory = self.get_memory_usage()
        g.request_start_time = datetime.utcnow()

        # Check if memory usage is high
        if g.start_memory['rss'] > self.high_memory_threshold:
            logger.warning(f"High memory usage detected: {g.start_memory['rss'] / 1024 / 1024:.1f}MB")

            # Force garbage collection if memory is high
            if g.start_memory['rss'] > self.critical_memory_threshold:
                logger.warning("Critical memory usage - forcing garbage collection")
                self.force_cleanup()

    def after_request(self, response):
        """Monitor memory after request processing"""
        end_memory = self.get_memory_usage()

        if hasattr(g, 'start_memory'):
            memory_diff = end_memory['rss'] - g.start_memory['rss']
            request_time = (datetime.utcnow() - g.request_start_time).total_seconds()

            # Log memory usage for analysis
            if memory_diff > 10 * 1024 * 1024:  # More than 10MB increase
                logger.warning(
                    f"Large memory increase: {memory_diff / 1024 / 1024:.1f}MB "
                    f"for {request.method} {request.path} "
                    f"(took {request_time:.2f}s)"
                )

            # Add memory info to response headers for debugging
            response.headers['X-Memory-Usage'] = f"{end_memory['rss'] / 1024 / 1024:.1f}MB"
            response.headers['X-Memory-Percent'] = f"{end_memory['percent']:.1f}%"

        return response

    def cleanup_context(self, error):
        """Cleanup after request context teardown"""
        # Periodic garbage collection
        self.cleanup_count += 1
        if self.cleanup_count % 10 == 0:  # Every 10 requests
            gc.collect()

    def force_cleanup(self):
        """Force aggressive cleanup to free memory"""
        # Clear any cached data
        gc.collect()

        # Additional cleanup for specific services
        try:
            # Clear any module-level caches
            import sys
            for module_name, module in list(sys.modules.items()):
                if hasattr(module, '_cache'):
                    if hasattr(module._cache, 'clear'):
                        module._cache.clear()
        except Exception as e:
            logger.error(f"Error during force cleanup: {e}")

    def get_memory_stats(self):
        """Get detailed memory statistics for health check"""
        try:
            memory = self.get_memory_usage()
            process = psutil.Process(os.getpid())

            return {
                'status': 'healthy' if memory['rss'] < self.high_memory_threshold else 'warning',
                'memory': {
                    'used_mb': round(memory['rss'] / 1024 / 1024, 1),
                    'percent': round(memory['percent'], 1),
                    'virtual_mb': round(memory['vms'] / 1024 / 1024, 1),
                    'available_mb': round(memory['available'] / 1024 / 1024, 1)
                },
                'thresholds': {
                    'high_mb': round(self.high_memory_threshold / 1024 / 1024, 1),
                    'critical_mb': round(self.critical_memory_threshold / 1024 / 1024, 1)
                },
                'process': {
                    'pid': process.pid,
                    'create_time': datetime.fromtimestamp(process.create_time()).isoformat(),
                    'threads': process.num_threads()
                },
                'gc_stats': {
                    'collections': gc.get_count(),
                    'cleanup_count': self.cleanup_count
                },
                'timestamp': datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Error generating memory stats: {e}")
            return {
                'status': 'error',
                'error': str(e),
                'timestamp': datetime.utcnow().isoformat()
            }

# Global instance
memory_monitor = MemoryMonitor()