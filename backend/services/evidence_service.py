"""
Evidence validation and storage service for Quest V3 system.
Handles validation, sanitization, and storage of task completion evidence.
"""

import re
import os
from typing import Dict, Any, Optional, Tuple
from werkzeug.utils import secure_filename
from datetime import datetime

# Evidence validation rules
EVIDENCE_RULES = {
    'text': {
        'min_length': 50,
        'max_length': 5000,
        'required_fields': ['content']
    },
    'link': {
        'url_pattern': r'^https?://.+',
        'max_length': 500,
        'required_fields': ['url']
    },
    'image': {
        'allowed_extensions': {'jpg', 'jpeg', 'png', 'gif', 'webp'},
        'max_size': 10 * 1024 * 1024,  # 10MB
        'required_fields': ['file_url']
    }
}

class EvidenceService:
    """Service for handling evidence validation and storage."""
    
    def __init__(self, upload_folder: str = 'uploads/evidence'):
        self.upload_folder = upload_folder
        os.makedirs(upload_folder, exist_ok=True)
    
    def validate_evidence(self, evidence_type: str, evidence_data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        Validate evidence based on type and rules.
        
        Args:
            evidence_type: Type of evidence (text, link, image)
            evidence_data: Dictionary containing evidence data
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if evidence_type not in EVIDENCE_RULES:
            return False, f"Invalid evidence type: {evidence_type}"
        
        rules = EVIDENCE_RULES[evidence_type]
        
        # Check required fields
        for field in rules.get('required_fields', []):
            if field not in evidence_data or not evidence_data[field]:
                return False, f"Missing required field: {field}"
        
        # Type-specific validation
        if evidence_type == 'text':
            return self._validate_text(evidence_data, rules)
        elif evidence_type == 'link':
            return self._validate_link(evidence_data, rules)
        elif evidence_type == 'image':
            return self._validate_image(evidence_data, rules)
        
        return True, None
    
    def _validate_text(self, data: Dict[str, Any], rules: Dict) -> Tuple[bool, Optional[str]]:
        """Validate text evidence."""
        content = data.get('content', '')
        
        if len(content) < rules['min_length']:
            return False, f"Text must be at least {rules['min_length']} characters"
        
        if len(content) > rules['max_length']:
            return False, f"Text must not exceed {rules['max_length']} characters"
        
        # Basic sanitization check for malicious content
        if self._contains_script_tags(content):
            return False, "Text contains potentially malicious content"
        
        return True, None
    
    def _validate_link(self, data: Dict[str, Any], rules: Dict) -> Tuple[bool, Optional[str]]:
        """Validate link evidence."""
        url = data.get('url', '')
        
        if len(url) > rules['max_length']:
            return False, f"URL must not exceed {rules['max_length']} characters"
        
        # Validate URL format
        url_pattern = rules['url_pattern']
        if not re.match(url_pattern, url):
            return False, "Invalid URL format. Must start with http:// or https://"
        
        # Block potentially dangerous URLs
        dangerous_patterns = [
            'javascript:', 'data:', 'file:', 'ftp:', 'about:', 'chrome:'
        ]
        if any(url.lower().startswith(pattern) for pattern in dangerous_patterns):
            return False, "URL contains potentially dangerous protocol"
        
        return True, None
    
    def _validate_image(self, data: Dict[str, Any], rules: Dict) -> Tuple[bool, Optional[str]]:
        """Validate image evidence."""
        file_url = data.get('file_url', '')
        file_size = data.get('file_size', 0)
        
        # Check file extension
        ext = file_url.split('.')[-1].lower() if '.' in file_url else ''
        if ext not in rules['allowed_extensions']:
            return False, f"Invalid image format. Allowed: {', '.join(rules['allowed_extensions'])}"
        
        # Check file size
        if file_size > rules['max_size']:
            max_mb = rules['max_size'] / (1024 * 1024)
            return False, f"Image size must not exceed {max_mb}MB"
        
        return True, None
    
    def _contains_script_tags(self, text: str) -> bool:
        """Check if text contains potentially malicious script tags."""
        dangerous_patterns = [
            r'<script', r'</script', r'javascript:', r'onerror=', r'onclick=',
            r'<iframe', r'</iframe'
        ]
        text_lower = text.lower()
        return any(re.search(pattern, text_lower) for pattern in dangerous_patterns)
    
    def sanitize_text(self, text: str) -> str:
        """Sanitize text input to remove potentially dangerous content."""
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', text)
        
        # Escape special characters
        replacements = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;'
        }
        
        for char, replacement in replacements.items():
            text = text.replace(char, replacement)
        
        return text.strip()
    
    def prepare_evidence_for_storage(self, evidence_type: str, evidence_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepare evidence data for database storage.
        
        Args:
            evidence_type: Type of evidence
            evidence_data: Raw evidence data
            
        Returns:
            Prepared evidence data for storage
        """
        prepared_data = {
            'type': evidence_type,
            'created_at': datetime.utcnow().isoformat()
        }
        
        if evidence_type == 'text':
            prepared_data['content'] = self.sanitize_text(evidence_data.get('content', ''))
        
        elif evidence_type == 'link':
            prepared_data['url'] = evidence_data.get('url', '').strip()
            prepared_data['title'] = self.sanitize_text(evidence_data.get('title', ''))
        
        elif evidence_type == 'image':
            prepared_data['file_url'] = evidence_data.get('file_url', '')
            prepared_data['file_size'] = evidence_data.get('file_size', 0)
            prepared_data['original_name'] = secure_filename(evidence_data.get('original_name', ''))
        
        return prepared_data
    
    def get_evidence_display_data(self, evidence_type: str, evidence_content: str) -> Dict[str, Any]:
        """
        Format evidence for display in the UI.
        
        Args:
            evidence_type: Type of evidence
            evidence_content: Stored evidence content (URL or text)
            
        Returns:
            Formatted evidence data for display
        """
        display_data = {
            'type': evidence_type,
            'content': evidence_content
        }
        
        if evidence_type == 'text':
            # Truncate long text for preview
            if len(evidence_content) > 200:
                display_data['preview'] = evidence_content[:200] + '...'
            else:
                display_data['preview'] = evidence_content
        
        elif evidence_type == 'link':
            # Extract domain for display
            domain_match = re.match(r'https?://([^/]+)', evidence_content)
            if domain_match:
                display_data['domain'] = domain_match.group(1)
        
        elif evidence_type == 'image':
            # Ensure URL is properly formatted
            if not evidence_content.startswith('http'):
                display_data['content'] = f"/api/uploads/evidence/{evidence_content}"
        
        return display_data