"""
Configuration for Terms of Service and Privacy Policy versions
Update these when the legal documents change to force re-acceptance
"""
from utils.logger import get_logger

logger = get_logger(__name__)


# Current version of Terms of Service
# Keep in sync with shared/legal/termsOfService.ts (`version`).
CURRENT_TOS_VERSION = "1.0"

# Current version of Privacy Policy
# Keep in sync with shared/legal/privacyPolicy.ts (`version`).
# 1.1 (2026-06-16): added advertising-audience data-sharing disclosure + opt-out.
CURRENT_PRIVACY_POLICY_VERSION = "1.1"

# Date when current versions became effective (must match the shared docs)
TOS_EFFECTIVE_DATE = "2026-06-16"
PRIVACY_POLICY_EFFECTIVE_DATE = "2026-06-16"