"""
Email copy loader utility
Loads email content from YAML configuration file
"""
import os
import yaml
import logging
from typing import Dict, Any

from utils.logger import get_logger

logger = get_logger(__name__)

logger = logging.getLogger(__name__)

class EmailCopyLoader:
    def __init__(self):
        self.copy_data = None
        self.load_copy()

    def load_copy(self) -> None:
        """Load email copy from YAML configuration file"""
        try:
            # Get path to email_copy.yaml
            current_dir = os.path.dirname(os.path.dirname(__file__))
            yaml_path = os.path.join(current_dir, 'templates', 'email', 'email_copy.yaml')

            with open(yaml_path, 'r', encoding='utf-8') as f:
                self.copy_data = yaml.safe_load(f)

            logger.info("Email copy loaded successfully from email_copy.yaml")
        except Exception as e:
            logger.error(f"Failed to load email copy from YAML: {str(e)}")
            # Fallback to empty dict if file doesn't exist
            self.copy_data = {'emails': {}, 'signatures': {}}

    def get_email_copy(self, email_type: str) -> Dict[str, Any]:
        """
        Get copy for a specific email type

        Args:
            email_type: The type of email (e.g., 'welcome', 'email_confirmation')

        Returns:
            Dictionary containing email copy data
        """
        if not self.copy_data:
            self.load_copy()

        email_copy = self.copy_data.get('emails', {}).get(email_type, {})
        if not email_copy:
            logger.warning(f"No copy found for email type: {email_type}")

        return email_copy

    def get_signature(self, signature_type: str) -> Dict[str, str]:
        """
        Get signature data for a specific signature type

        Args:
            signature_type: The type of signature ('team', 'tanner', 'support')

        Returns:
            Dictionary containing signature data
        """
        if not self.copy_data:
            self.load_copy()

        signature = self.copy_data.get('signatures', {}).get(signature_type, {})
        if not signature:
            logger.warning(f"No signature found for type: {signature_type}")
            # Fallback to support signature
            signature = self.copy_data.get('signatures', {}).get('support', {
                'name': 'Optio Support',
                'email': 'support@optioeducation.com'
            })

        return signature

    def get_all_signatures(self) -> Dict[str, Dict[str, str]]:
        """Get all available signatures"""
        if not self.copy_data:
            self.load_copy()

        return self.copy_data.get('signatures', {})

    def reload(self) -> None:
        """Reload copy from YAML file (useful for development)"""
        self.load_copy()

# Create singleton instance
email_copy_loader = EmailCopyLoader()
