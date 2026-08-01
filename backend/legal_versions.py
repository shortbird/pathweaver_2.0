"""
Configuration for Terms of Service and Privacy Policy versions
Update these when the legal documents change to force re-acceptance
"""
from utils.logger import get_logger

logger = get_logger(__name__)


# NOTE ON RE-ACCEPTANCE: the docstring above describes an intent that is not
# implemented. These constants are stamped onto users.tos_version /
# users.privacy_policy_version at registration and are never compared against
# afterwards, and `requires_tos_acceptance` is set only for brand-new OAuth
# signups. Bumping a version here therefore does NOT prompt existing users to
# re-accept anything; it only records the correct version for accounts created
# from now on. Prompting existing users would require a comparison at login
# that nothing currently performs.

# Current version of Terms of Service
# Keep in sync with shared/legal/termsOfService.ts (`version`).
# 1.1 (2026-08-01): private-by-default portfolios, parent-controlled
#   publication, transcript share links, opt-in promotional use.
CURRENT_TOS_VERSION = "1.1"

# Current version of Privacy Policy
# Keep in sync with shared/legal/privacyPolicy.ts (`version`).
# 1.1 (2026-06-16): added advertising-audience data-sharing disclosure + opt-out.
# 1.2 (2026-08-01): portfolio visibility corrected to private-by-default with
#   parent control; added private-portfolio readers and transcript links.
CURRENT_PRIVACY_POLICY_VERSION = "1.2"

# Date when current versions became effective (must match the shared docs)
TOS_EFFECTIVE_DATE = "2026-08-01"
PRIVACY_POLICY_EFFECTIVE_DATE = "2026-08-01"