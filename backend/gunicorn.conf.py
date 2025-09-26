# Gunicorn configuration for memory-optimized deployment
# Designed for 512MB memory limit on Render Starter plan

import multiprocessing
import os

# Basic settings
bind = f"0.0.0.0:{os.environ.get('PORT', 5001)}"
backlog = 128

# Worker configuration optimized for memory efficiency
workers = 1  # Single worker to minimize memory usage
worker_class = "sync"  # Sync worker uses less memory than async
worker_connections = 100
max_requests = 1000  # Restart workers after 1000 requests to prevent memory leaks
max_requests_jitter = 50
preload_app = True  # Share memory between workers

# Timeout settings
timeout = 120  # 2 minutes for API requests
keepalive = 2
graceful_timeout = 30

# Memory management
worker_tmp_dir = "/dev/shm"  # Use shared memory for temporary files
worker_rlimit_as = 400 * 1024 * 1024  # Limit worker memory to 400MB

# Logging
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(D)s'
accesslog = "-"
errorlog = "-"

# Process naming
proc_name = "optio-backend"

# Security
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# Performance tuning for low memory
worker_process_name = "optio-worker"
threads = 2  # Small number of threads per worker

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