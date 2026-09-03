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
from utils.log_scrubber import scrub_log_text


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


def _scrub_record(record: logging.LogRecord) -> logging.LogRecord:
    """Mask emails and JWTs in a record, in place.

    Both halves matter. `record.msg` catches the f-string style this codebase
    writes; the args are scrubbed individually rather than by folding them into
    the message so that %-style templates stay templates -- Sentry groups
    issues by the template, and folding the values in would make every log line
    its own issue.
    """
    if isinstance(record.msg, str):
        record.msg = scrub_log_text(record.msg)

    if isinstance(record.args, tuple):
        record.args = tuple(
            scrub_log_text(a) if isinstance(a, str) else a for a in record.args)
    elif isinstance(record.args, dict):
        record.args = {
            k: scrub_log_text(v) if isinstance(v, str) else v
            for k, v in record.args.items()}

    return record


# Attribute names logging itself puts on every record. Anything else came from
# an `extra=` dict at the call site.
_STANDARD_RECORD_ATTRS = frozenset(
    logging.LogRecord('', 0, '', 0, '', (), None).__dict__) | {'message', 'asctime'}


def _scrub_value(value):
    if isinstance(value, str):
        return scrub_log_text(value)
    if isinstance(value, dict):
        return {k: _scrub_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        scrubbed = [_scrub_value(v) for v in value]
        return type(value)(scrubbed) if isinstance(value, list) else tuple(scrubbed)
    return value


def _scrub_record_extras(record: logging.LogRecord) -> logging.LogRecord:
    """Mask the `extra=` values, which the factory never sees.

    Logger.makeRecord() merges `extra` onto the record AFTER the factory has
    returned it, so this half has to run there. It is not a corner: FERPA
    access logging (utils/access_logger.py) and the route decorators put their
    whole context in `extra`, JSONFormatter writes extra_fields straight into
    the log line, and Sentry ships record attributes as issue context.
    """
    for key, value in record.__dict__.items():
        if key in _STANDARD_RECORD_ATTRS:
            continue
        scrubbed = _scrub_value(value)
        if scrubbed is not value:
            record.__dict__[key] = scrubbed
    return record


def install_pii_scrubbing():
    """Scrub every LogRecord the process creates, before anything handles it.

    A logging.Filter on our console handler would not be enough. Sentry's
    LoggingIntegration patches `logging.Logger.callHandlers` and reads the
    record there, outside any handler's filter chain, so an address masked at
    the handler would still have shipped to Sentry in full. The record factory
    runs at creation -- ahead of callHandlers, ahead of every handler, and
    ahead of any integration added later in startup.

    Idempotent: setup_logging() runs again in tests and on any second import of
    app.py, and wrapping the factory twice would scrub twice and grow the chain
    each time.
    """
    original_make_record = logging.Logger.makeRecord
    if not getattr(original_make_record, '_optio_pii_scrubbing', False):
        def make_record(self, *args, **kwargs):
            return _scrub_record_extras(
                original_make_record(self, *args, **kwargs))

        make_record._optio_pii_scrubbing = True
        logging.Logger.makeRecord = make_record

    factory = logging.getLogRecordFactory()
    if getattr(factory, '_optio_pii_scrubbing', False):
        return factory

    def scrubbing_factory(*args, **kwargs):
        return _scrub_record(factory(*args, **kwargs))

    scrubbing_factory._optio_pii_scrubbing = True
    logging.setLogRecordFactory(scrubbing_factory)
    return scrubbing_factory


def setup_logging():
    """Configure application logging"""
    # PII never reaches a sink, Sentry included. Installed before the handlers
    # so the very first startup line is covered.
    install_pii_scrubbing()

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
