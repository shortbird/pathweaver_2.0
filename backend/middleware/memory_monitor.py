"""
Memory monitoring middleware for Flask application.
Tracks memory usage and provides cleanup triggers to prevent memory exhaustion.
"""

import psutil
import gc
import os
import time
import threading
from flask import request, g
from datetime import datetime
import logging

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

class MemoryMonitor:
    """Memory monitoring and management middleware"""

    def __init__(self, app=None):
        self.app = app
        self.high_memory_threshold = 450 * 1024 * 1024  # 450MB
        self.critical_memory_threshold = 480 * 1024 * 1024  # 480MB
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
            if memory_diff > 50 * 1024 * 1024:  # More than 50MB increase
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

    # ── Background watchdog ────────────────────────────────────────────────
    # The per-request hooks above only fire while a request is in flight. The
    # OOM kill (SIGKILL) can't reach Sentry — there's no exception — so we poll
    # memory on a background thread and capture a Sentry alert *before* the cap
    # is hit. This is the only way a near-OOM shows up in Sentry instead of just
    # a Render email. See memory: project_prod_backend_oom_history.

    def _read_cgroup_memory(self):
        """Container memory (usage_bytes, limit_bytes) from cgroup, else (None, None).

        cgroup is the right signal — it's the total the OOM killer watches
        (all workers + master), not a single process's RSS.
        """
        # cgroup v2
        try:
            with open('/sys/fs/cgroup/memory.current') as f:
                usage = int(f.read().strip())
            limit = None
            try:
                with open('/sys/fs/cgroup/memory.max') as f:
                    raw = f.read().strip()
                    limit = None if raw == 'max' else int(raw)
            except Exception:
                pass
            return usage, limit
        except Exception:
            pass
        # cgroup v1
        try:
            with open('/sys/fs/cgroup/memory/memory.usage_in_bytes') as f:
                usage = int(f.read().strip())
            limit = None
            try:
                with open('/sys/fs/cgroup/memory/memory.limit_in_bytes') as f:
                    limit = int(f.read().strip())
                    if limit > (1 << 60):  # v1 sentinel for "unlimited"
                        limit = None
            except Exception:
                pass
            return usage, limit
        except Exception:
            return None, None

    def start_watchdog(self):
        """Start the background memory watchdog (idempotent, daemon thread).

        Started per worker (preload_app is off, so app.py imports per worker).
        If preload is ever enabled, move this to gunicorn's post_fork hook so it
        runs in the worker, not the master.
        """
        if os.getenv('MEMORY_WATCHDOG_ENABLED', 'true').lower() != 'true':
            return
        if getattr(self, '_watchdog_started', False):
            return
        self._watchdog_started = True
        t = threading.Thread(target=self._watchdog_loop, name='memory-watchdog', daemon=True)
        t.start()
        logger.info("Memory watchdog started")

    def _watchdog_loop(self):
        interval = int(os.getenv('MEMORY_WATCHDOG_INTERVAL', '15'))
        threshold = float(os.getenv('MEMORY_WATCHDOG_THRESHOLD', '0.85'))
        cooldown = int(os.getenv('MEMORY_WATCHDOG_COOLDOWN', '300'))
        fallback_cap = int(os.getenv('MEMORY_LIMIT_MB', '512')) * 1024 * 1024
        last_alert = 0.0
        over = False
        while True:
            try:
                time.sleep(interval)
                cg_usage, cg_limit = self._read_cgroup_memory()
                rss = self.get_memory_usage().get('rss', 0)
                # Prefer the container total (what the OOM killer watches); fall
                # back to this process's RSS when cgroup isn't readable (e.g. dev).
                usage = cg_usage if cg_usage else rss
                cap = cg_limit if cg_limit else fallback_cap
                pct = (usage / cap) if cap else 0.0
                if pct >= threshold:
                    now = time.monotonic()
                    if not over or (now - last_alert) >= cooldown:
                        over = True
                        last_alert = now
                        self._alert_high_memory(usage, cap, pct, rss)
                    # Try to relieve pressure regardless of alert cooldown.
                    self.force_cleanup()
                else:
                    over = False
            except Exception as e:
                logger.error(f"Memory watchdog error: {e}")

    def _alert_high_memory(self, usage, cap, pct, rss):
        msg = (f"Memory at {usage / 1024 / 1024:.0f}MB / {cap / 1024 / 1024:.0f}MB "
               f"({pct * 100:.0f}%) — nearing OOM")
        logger.warning(f"[memory-watchdog] {msg}")
        try:
            import sentry_sdk
            with sentry_sdk.new_scope() as scope:
                scope.set_tag('memory_watchdog', 'true')
                scope.set_tag('pid', str(os.getpid()))
                # One issue for all near-OOM events, not one per MB value.
                scope.fingerprint = ['memory-watchdog-near-oom']
                scope.set_context('memory', {
                    'container_usage_mb': round(usage / 1024 / 1024, 1),
                    'cap_mb': round(cap / 1024 / 1024, 1),
                    'percent': round(pct * 100, 1),
                    'process_rss_mb': round(rss / 1024 / 1024, 1),
                    'gc_counts': gc.get_count(),
                    'threads': threading.active_count(),
                })
                sentry_sdk.capture_message(f"[memory-watchdog] {msg}", level='warning')
        except Exception:
            pass


# Global instance
memory_monitor = MemoryMonitor()