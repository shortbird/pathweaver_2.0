"""Configuration module for LMS integration"""

from .lms_platforms import (

from utils.logger import get_logger

logger = get_logger(__name__)
    get_platform_config,
    get_supported_platforms,
    validate_platform_config,
    get_platform_display_name,
    LMS_PLATFORMS
)

__all__ = [
    'get_platform_config',
    'get_supported_platforms',
    'validate_platform_config',
    'get_platform_display_name',
    'LMS_PLATFORMS'
]
