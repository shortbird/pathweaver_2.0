"""
Configuration for Terms of Service and Privacy Policy versions
Update these when the legal documents change to force re-acceptance
"""
from utils.logger import get_logger

logger = get_logger(__name__)


# Current version of Terms of Service
CURRENT_TOS_VERSION = "1.0"

# Current version of Privacy Policy  
CURRENT_PRIVACY_POLICY_VERSION = "1.0"

# Date when current versions became effective
TOS_EFFECTIVE_DATE = "2025-01-01"
PRIVACY_POLICY_EFFECTIVE_DATE = "2025-01-01"