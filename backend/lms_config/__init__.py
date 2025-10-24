"""Configuration module for LMS integration"""

from .lms_platforms import (
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
