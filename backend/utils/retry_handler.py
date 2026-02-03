"""Retry logic for handling transient failures"""

import time
import functools
import logging
from typing import Tuple, Type, Union, Callable
import random

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

class RetryConfig:
    """Configuration for retry behavior"""
    def __init__(
        self,
        max_attempts: int = 3,
        initial_delay: float = 1.0,
        max_delay: float = 30.0,
        exponential_base: float = 2.0,
        jitter: bool = True
    ):
        self.max_attempts = max_attempts
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter

# Default configurations for different scenarios
RETRY_CONFIGS = {
    'database': RetryConfig(max_attempts=3, initial_delay=0.5, max_delay=5.0),
    'external_api': RetryConfig(max_attempts=5, initial_delay=1.0, max_delay=30.0),
    'network': RetryConfig(max_attempts=4, initial_delay=1.0, max_delay=10.0),
    'quick': RetryConfig(max_attempts=2, initial_delay=0.2, max_delay=1.0)
}

# Exceptions that should trigger retry
RETRYABLE_EXCEPTIONS = (
    ConnectionError,
    TimeoutError,
    IOError,
)

def is_retryable_error(error: Exception) -> bool:
    """Check if an error is retryable"""
    error_message = str(error).lower()
    
    # Check exception type
    if isinstance(error, RETRYABLE_EXCEPTIONS):
        return True
    
    # Check error message patterns
    retryable_patterns = [
        'connection',
        'timeout',
        'temporarily unavailable',
        'service unavailable',
        'too many requests',
        'rate limit',
        'network',
        'could not connect',
        'connection reset',
        'broken pipe'
    ]
    
    return any(pattern in error_message for pattern in retryable_patterns)

def calculate_delay(attempt: int, config: RetryConfig) -> float:
    """Calculate delay for next retry attempt using exponential backoff"""
    delay = min(
        config.initial_delay * (config.exponential_base ** attempt),
        config.max_delay
    )
    
    if config.jitter:
        # Add random jitter to prevent thundering herd
        delay = delay * (0.5 + random.random())
    
    return delay

def retry_on_exception(
    config: Union[str, RetryConfig] = 'network',
    exceptions: Tuple[Type[Exception], ...] = None,
    should_retry: Callable[[Exception], bool] = None
):
    """
    Decorator to retry function on transient failures
    
    Args:
        config: RetryConfig instance or string key for predefined config
        exceptions: Tuple of exception types to retry on
        should_retry: Custom function to determine if error is retryable
    
    Usage:
        @retry_on_exception('database')
        def fetch_data():
            # database operation
            pass
        
        @retry_on_exception(RetryConfig(max_attempts=5))
        def call_api():
            # API call
            pass
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Get configuration
            retry_config = config if isinstance(config, RetryConfig) else RETRY_CONFIGS.get(config, RETRY_CONFIGS['network'])
            retry_exceptions = exceptions or RETRYABLE_EXCEPTIONS
            check_retry = should_retry or is_retryable_error
            
            last_error = None
            
            for attempt in range(retry_config.max_attempts):
                try:
                    return func(*args, **kwargs)
                
                except Exception as e:
                    last_error = e
                    
                    # Check if we should retry
                    should_retry_error = (
                        isinstance(e, retry_exceptions) or 
                        check_retry(e)
                    )
                    
                    if not should_retry_error:
                        # Don't retry for non-retryable errors
                        raise
                    
                    if attempt < retry_config.max_attempts - 1:
                        # Calculate delay for next attempt
                        delay = calculate_delay(attempt, retry_config)
                        
                        logger.warning(
                            f"Retry {attempt + 1}/{retry_config.max_attempts} for {func.__name__}: {str(e)}. "
                            f"Waiting {delay:.2f}s before next attempt."
                        )
                        
                        time.sleep(delay)
                    else:
                        # Final attempt failed
                        logger.error(
                            f"All {retry_config.max_attempts} attempts failed for {func.__name__}: {str(e)}"
                        )
            
            # Raise the last error after all retries exhausted
            raise last_error
        
        return wrapper
    return decorator

class RetryableOperation:
    """Context manager for retryable operations with manual control"""
    
    def __init__(self, config: Union[str, RetryConfig] = 'network'):
        self.config = config if isinstance(config, RetryConfig) else RETRY_CONFIGS.get(config, RETRY_CONFIGS['network'])
        self.attempt = 0
        self.last_error = None
    
    def should_retry(self, error: Exception = None) -> bool:
        """Check if operation should be retried"""
        if error:
            self.last_error = error
            
        if self.attempt >= self.config.max_attempts:
            return False
        
        if error and not is_retryable_error(error):
            return False
        
        return True
    
    def wait_before_retry(self):
        """Wait with exponential backoff before next retry"""
        if self.attempt > 0:
            delay = calculate_delay(self.attempt - 1, self.config)
            logger.info(f"Waiting {delay:.2f}s before retry attempt {self.attempt + 1}")
            time.sleep(delay)
    
    def execute(self, operation: Callable, *args, **kwargs):
        """Execute operation with retry logic"""
        while self.should_retry():
            self.attempt += 1
            self.wait_before_retry()
            
            try:
                result = operation(*args, **kwargs)
                return result
            except Exception as e:
                logger.warning(f"Attempt {self.attempt} failed: {str(e)}")
                
                if not self.should_retry(e):
                    raise
        
        if self.last_error:
            raise self.last_error
        else:
            raise RuntimeError(f"Failed after {self.attempt} attempts")

# Specific retry decorators for common scenarios
def retry_database_operation(func):
    """Retry decorator specifically for database operations"""
    return retry_on_exception('database')(func)

def retry_api_call(func):
    """Retry decorator specifically for external API calls"""
    return retry_on_exception('external_api')(func)

def retry_network_operation(func):
    """Retry decorator specifically for network operations"""
    return retry_on_exception('network')(func)


def with_connection_retry(operation: Callable, max_retries: int = 3, base_delay: float = 0.5, operation_name: str = None):
    """
    Execute an operation with automatic retry on transient connection failures.

    Use this for inline operations (lambdas) that can't use decorators.
    Specifically designed for Supabase database calls that may fail with
    "Connection reset by peer" (errno 104) when connections become stale.

    Args:
        operation: A callable (function or lambda) to execute
        max_retries: Maximum number of retry attempts (default: 3)
        base_delay: Base delay in seconds for exponential backoff (default: 0.5)
        operation_name: Optional name for logging (default: uses callable name)

    Returns:
        The result of the operation

    Raises:
        The last exception if all retries fail

    Usage:
        # Basic usage with lambda
        result = with_connection_retry(
            lambda: admin_client.table('users').select('*').eq('id', user_id).execute()
        )

        # With custom settings
        result = with_connection_retry(
            lambda: some_db_call(),
            max_retries=5,
            operation_name='fetch_user_profile'
        )
    """
    name = operation_name or getattr(operation, '__name__', 'anonymous_operation')
    last_error = None

    for attempt in range(max_retries):
        try:
            return operation()
        except Exception as e:
            last_error = e

            # Only retry on transient connection errors
            if not is_retryable_error(e):
                raise

            # Don't retry on the last attempt
            if attempt >= max_retries - 1:
                logger.error(
                    f"All {max_retries} retry attempts failed for {name}: {str(e)}"
                )
                raise

            # Calculate exponential backoff delay
            delay = base_delay * (2 ** attempt)
            # Add small jitter to prevent thundering herd
            delay = delay * (0.5 + random.random())

            logger.warning(
                f"Connection retry {attempt + 1}/{max_retries} for {name}: {str(e)}. "
                f"Waiting {delay:.2f}s before retry."
            )

            time.sleep(delay)

    # Should not reach here, but raise last error just in case
    if last_error:
        raise last_error