"""
Structured logging utility for Optio Platform
Provides JSON and text logging formats with correlation ID tracking
"""

import logging
import sys
import json
from datetime import datetime
from typing import Any, Dict
from flask import has_request_context, request
from app_config import Config


class JSONFormatter(logging.Formatter):
    """Format logs as JSON for structured logging"""

    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno,
        }

        # Add request context if available
        if has_request_context():
            log_data['request'] = {
                'method': request.method,
                'path': request.path,
                'remote_addr': request.remote_addr,
                'user_agent': request.headers.get('User-Agent', ''),
            }

            # Add correlation ID if available
            if hasattr(request, 'correlation_id'):
                log_data['correlation_id'] = request.correlation_id

        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        # Add extra fields
        if hasattr(record, 'extra_fields'):
            log_data.update(record.extra_fields)

        return json.dumps(log_data)


class TextFormatter(logging.Formatter):
    """Format logs as human-readable text for development"""

    def format(self, record: logging.LogRecord) -> str:
        timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        level_color = {
            'DEBUG': '\033[36m',    # Cyan
            'INFO': '\033[32m',     # Green
            'WARNING': '\033[33m',  # Yellow
            'ERROR': '\033[31m',    # Red
            'CRITICAL': '\033[35m', # Magenta
        }.get(record.levelname, '')
        reset_color = '\033[0m'

        message = f"{timestamp} {level_color}{record.levelname:8s}{reset_color} [{record.name}] {record.getMessage()}"

        if record.exc_info:
            message += '\n' + self.formatException(record.exc_info)

        return message


def setup_logging():
    """Configure application logging"""
    # Determine log format
    use_json = Config.LOG_FORMAT == 'json'

    # Create formatter
    formatter = JSONFormatter() if use_json else TextFormatter()

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, Config.LOG_LEVEL.upper()))

    # Remove existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # Add console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # Silence noisy third-party loggers
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('hpack').setLevel(logging.WARNING)

    return root_logger


def get_logger(name: str) -> logging.Logger:
    """Get a logger instance with extra field support"""
    logger = logging.getLogger(name)

    # Add convenience methods for logging with extra fields
    def log_with_extra(level: int, message: str, **extra_fields):
        extra = {'extra_fields': extra_fields}
        logger.log(level, message, extra=extra)

    # Add extra logging methods
    logger.debug_extra = lambda msg, **kw: log_with_extra(logging.DEBUG, msg, **kw)
    logger.info_extra = lambda msg, **kw: log_with_extra(logging.INFO, msg, **kw)
    logger.warning_extra = lambda msg, **kw: log_with_extra(logging.WARNING, msg, **kw)
    logger.error_extra = lambda msg, **kw: log_with_extra(logging.ERROR, msg, **kw)

    return logger
