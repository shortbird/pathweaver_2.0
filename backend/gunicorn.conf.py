# Gunicorn configuration for memory-optimized deployment
# Designed for 512MB memory limit on Render Starter plan
# ALL settings configurable via environment variables

import multiprocessing
import os

from utils.logger import get_logger

logger = get_logger(__name__)

# Basic settings
bind = f"0.0.0.0:{os.getenv('PORT', '5001')}"
backlog = int(os.getenv('GUNICORN_BACKLOG', '128'))

# Worker configuration - CONFIGURABLE
workers = int(os.getenv('GUNICORN_WORKERS', '1'))
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
worker_tmp_dir = os.getenv('GUNICORN_WORKER_TMP_DIR', '/dev/shm')
worker_rlimit_as = int(os.getenv('GUNICORN_WORKER_MEMORY_LIMIT', str(400 * 1024 * 1024)))

# Logging - CONFIGURABLE
loglevel = os.getenv('GUNICORN_LOG_LEVEL', 'info')
accesslog = os.getenv('GUNICORN_ACCESS_LOG', '-')  # '-' = stdout
errorlog = os.getenv('GUNICORN_ERROR_LOG', '-')
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'

# Server mechanics
preload_app = os.getenv('GUNICORN_PRELOAD_APP', 'true').lower() == 'true'
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