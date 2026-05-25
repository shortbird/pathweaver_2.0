# Gunicorn configuration for memory-optimized deployment
# Designed for 512MB memory limit on Render Starter plan
# ALL settings configurable via environment variables

import logging
import multiprocessing
import os

# Use stdlib logging here: gunicorn parses this config in the master process
# before the Flask app loads, so importing utils.logger (which pulls in flask
# and the auth stack) would slow startup and risk import-order surprises.
logger = logging.getLogger(__name__)

# Basic settings
bind = f"0.0.0.0:{os.getenv('PORT', '5001')}"
backlog = int(os.getenv('GUNICORN_BACKLOG', '128'))

# Worker configuration - CONFIGURABLE
workers = int(os.getenv('GUNICORN_WORKERS', '2'))
worker_class = os.getenv('GUNICORN_WORKER_CLASS', 'sync')
worker_connections = int(os.getenv('GUNICORN_WORKER_CONNECTIONS', '100'))
threads = int(os.getenv('GUNICORN_THREADS', '2'))
max_requests = int(os.getenv('GUNICORN_MAX_REQUESTS', '1000'))
max_requests_jitter = int(os.getenv('GUNICORN_MAX_REQUESTS_JITTER', '50'))

# Timeout settings - CONFIGURABLE
timeout = int(os.getenv('GUNICORN_TIMEOUT', '120'))
keepalive = int(os.getenv('GUNICORN_KEEPALIVE', '2'))
graceful_timeout = int(os.getenv('GUNICORN_GRACEFUL_TIMEOUT', '30'))

# Memory management - CONFIGURABLE
# Prefer /dev/shm (tmpfs) on Linux to avoid disk wear from the heartbeat file;
# fall back to the system default on platforms where it doesn't exist (macOS).
_default_tmp_dir = '/dev/shm' if os.path.isdir('/dev/shm') else None
worker_tmp_dir = os.getenv('GUNICORN_WORKER_TMP_DIR') or _default_tmp_dir

# NOTE: worker_rlimit_as (RLIMIT_AS / virtual address space) is intentionally
# unset. Python + Flask + Pillow + supabase libs have VSZ well above their RSS,
# so capping VSZ at e.g. 400MB causes workers to crash on startup. Render's
# 512Mi container limit applies to RSS, and max_requests below recycles
# workers before any single worker drifts close to it.

# Logging - CONFIGURABLE
loglevel = os.getenv('GUNICORN_LOG_LEVEL', 'info')
accesslog = None  # Disable access logs (redundant with Flask logging)
errorlog = os.getenv('GUNICORN_ERROR_LOG', '-')
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Server mechanics
# preload_app defaults to False: middleware/activity_tracker.py instantiates a
# module-level ThreadPoolExecutor at import time, which is not fork-safe. With
# preload, the master imports once and forks workers, inheriting broken thread
# state. With preload off, each worker imports independently (higher per-worker
# RSS, but stable). Override via GUNICORN_PRELOAD_APP=true if the offending
# import-time thread pools are removed later.
preload_app = os.getenv('GUNICORN_PRELOAD_APP', 'false').lower() == 'true'
daemon = False  # Don't daemonize (Render needs foreground process)

# Process naming
proc_name = os.getenv('GUNICORN_PROC_NAME', 'optio-backend')
worker_process_name = os.getenv('GUNICORN_WORKER_PROCESS_NAME', 'optio-worker')

# Security - CONFIGURABLE
limit_request_line = int(os.getenv('GUNICORN_LIMIT_REQUEST_LINE', '4094'))
limit_request_fields = int(os.getenv('GUNICORN_LIMIT_REQUEST_FIELDS', '100'))
limit_request_field_size = int(os.getenv('GUNICORN_LIMIT_REQUEST_FIELD_SIZE', '8190'))

# Auto-scaling helper (optional)
if os.getenv('GUNICORN_AUTO_SCALE', 'false').lower() == 'true':
    workers = (multiprocessing.cpu_count() * 2) + 1
    logger.debug(f"Auto-scaling enabled: {workers} workers based on {multiprocessing.cpu_count()} CPUs")

# Preload modules to share memory
def when_ready(server):
    """Called just after the server is started."""
    server.log.info("Server is ready. Spawning workers")

def worker_int(worker):
    """Called just after a worker has been killed by signal"""
    worker.log.info("Worker received INT or QUIT signal")

def pre_fork(server, worker):
    """Called just before a worker is forked."""
    server.log.info("Worker spawned (pid: %s)", worker.pid)

def post_fork(server, worker):
    """Called just after a worker has been forked."""
    server.log.info("Worker spawned (pid: %s)", worker.pid)