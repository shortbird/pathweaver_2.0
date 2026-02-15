"""
Enhanced file validation with security hardening

Security improvements (P1-SEC-1):
- Full file scanning (not just first 2KB)
- Polyglot file detection (multiple offset checks)
- Content-Type verification against actual MIME
- Optional ClamAV virus scanning
- Embedded script detection in images
- File header/footer consistency checks

OWASP A04:2021 - Insecure Design mitigation
"""

import magic
import subprocess
import hashlib
from typing import Optional, Tuple, Dict, List
from dataclasses import dataclass
from pathlib import Path
import re

from utils.logger import get_logger

logger = get_logger(__name__)

# Import file validation constants from centralized config
from config.constants import MAX_FILE_SIZE, ALLOWED_FILE_EXTENSIONS

# Convert set of extensions with dots to set without dots for comparison
ALLOWED_EXTENSIONS = {ext.lstrip('.') for ext in ALLOWED_FILE_EXTENSIONS}

# Allowed MIME types (checked via magic bytes) - file validator specific
ALLOWED_MIME_TYPES = {
    # Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
    # Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    # Videos
    'video/mp4', 'video/webm', 'video/quicktime',
    # Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg'
}

# Suspicious patterns in files (potential XSS/scripting)
SUSPICIOUS_PATTERNS = [
    rb'<script[^>]*>',
    rb'javascript:',
    rb'onerror\s*=',
    rb'onload\s*=',
    rb'<iframe[^>]*>',
    rb'eval\s*\(',
    rb'document\.cookie',
    rb'document\.write',
]


@dataclass
class FileValidationResult:
    """Result of file validation"""
    is_valid: bool
    detected_mime: str
    file_size: int
    sha256_hash: str
    error_message: Optional[str] = None
    warnings: List[str] = None
    virus_scan_result: Optional[str] = None

    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []


class FileValidator:
    """
    Enhanced file validator with multi-layer security checks

    Security features:
    1. Full file content scanning (not just first 2KB)
    2. Polyglot detection at multiple offsets
    3. Content-Type verification
    4. Optional virus scanning
    5. Embedded script detection
    6. File consistency checks
    """

    def __init__(self, enable_virus_scan: bool = False):
        """
        Initialize file validator

        Args:
            enable_virus_scan: Enable ClamAV virus scanning (requires clamd)
        """
        self.enable_virus_scan = enable_virus_scan
        self._check_clamav_available()

    def _check_clamav_available(self) -> bool:
        """Check if ClamAV is installed and available"""
        if not self.enable_virus_scan:
            return False

        try:
            result = subprocess.run(
                ['clamdscan', '--version'],
                capture_output=True,
                timeout=5
            )
            available = result.returncode == 0
            if available:
                logger.info("[FileValidator] ClamAV virus scanning enabled")
            else:
                logger.warning("[FileValidator] ClamAV not available, virus scanning disabled")
                self.enable_virus_scan = False
            return available
        except (subprocess.TimeoutExpired, FileNotFoundError):
            logger.warning("[FileValidator] ClamAV not installed, virus scanning disabled")
            self.enable_virus_scan = False
            return False

    def validate_file(
        self,
        filename: str,
        file_content: bytes,
        claimed_content_type: Optional[str] = None
    ) -> FileValidationResult:
        """
        Comprehensive file validation with security checks

        Args:
            filename: Original filename with extension
            file_content: Full file binary content
            claimed_content_type: Content-Type header from upload (optional)

        Returns:
            FileValidationResult with validation status and details
        """
        warnings = []

        # 1. Basic checks
        if not filename or '.' not in filename:
            return FileValidationResult(
                is_valid=False,
                detected_mime='',
                file_size=0,
                sha256_hash='',
                error_message="File must have an extension"
            )

        extension = filename.rsplit('.', 1)[1].lower()
        if extension not in ALLOWED_EXTENSIONS:
            return FileValidationResult(
                is_valid=False,
                detected_mime='',
                file_size=0,
                sha256_hash='',
                error_message=f"File extension '.{extension}' not allowed"
            )

        # 2. File size check
        file_size = len(file_content)
        if file_size > MAX_FILE_SIZE:
            max_mb = MAX_FILE_SIZE / (1024 * 1024)
            return FileValidationResult(
                is_valid=False,
                detected_mime='',
                file_size=file_size,
                sha256_hash='',
                error_message=f"File exceeds maximum size of {max_mb}MB"
            )

        if file_size == 0:
            return FileValidationResult(
                is_valid=False,
                detected_mime='',
                file_size=0,
                sha256_hash='',
                error_message="File is empty"
            )

        # 3. Calculate file hash (for logging/tracking)
        file_hash = hashlib.sha256(file_content).hexdigest()

        # 4. FULL FILE magic byte validation (not just first 2KB)
        try:
            detected_mime = magic.from_buffer(file_content, mime=True)
        except Exception as e:
            logger.error(f"[FileValidator] Magic byte detection failed: {e}")
            return FileValidationResult(
                is_valid=False,
                detected_mime='',
                file_size=file_size,
                sha256_hash=file_hash,
                error_message=f"Failed to detect file type: {str(e)}"
            )

        # 5. Verify MIME type is allowed
        if detected_mime not in ALLOWED_MIME_TYPES:
            return FileValidationResult(
                is_valid=False,
                detected_mime=detected_mime,
                file_size=file_size,
                sha256_hash=file_hash,
                error_message=f"File type '{detected_mime}' not allowed"
            )

        # 6. Polyglot detection - check file at multiple offsets
        polyglot_result = self._detect_polyglot(file_content, detected_mime)
        if not polyglot_result['is_consistent']:
            return FileValidationResult(
                is_valid=False,
                detected_mime=detected_mime,
                file_size=file_size,
                sha256_hash=file_hash,
                error_message=f"Polyglot file detected: {polyglot_result['reason']}"
            )

        # 7. Content-Type verification (if provided)
        if claimed_content_type:
            if not self._verify_content_type(claimed_content_type, detected_mime):
                warnings.append(
                    f"Content-Type mismatch: claimed '{claimed_content_type}' "
                    f"but detected '{detected_mime}'"
                )

        # 8. Embedded script detection (XSS prevention)
        if self._contains_suspicious_patterns(file_content):
            warnings.append("File contains suspicious patterns (embedded scripts)")
            # For now, warn but don't reject - could be false positive
            # In production, you might want to reject these files

        # 9. Optional virus scanning
        virus_result = None
        if self.enable_virus_scan:
            virus_result = self._scan_for_viruses(file_content, file_hash)
            if virus_result != 'CLEAN':
                return FileValidationResult(
                    is_valid=False,
                    detected_mime=detected_mime,
                    file_size=file_size,
                    sha256_hash=file_hash,
                    error_message=f"Virus detected: {virus_result}",
                    virus_scan_result=virus_result
                )

        # All checks passed
        logger.info(
            f"[FileValidator] File validated successfully - "
            f"mime={detected_mime}, size={file_size}, hash={file_hash[:16]}..."
        )

        return FileValidationResult(
            is_valid=True,
            detected_mime=detected_mime,
            file_size=file_size,
            sha256_hash=file_hash,
            warnings=warnings,
            virus_scan_result=virus_result
        )

    def _detect_polyglot(self, file_content: bytes, expected_mime: str) -> Dict:
        """
        Detect polyglot files by checking MIME type at multiple offsets

        Polyglot files have valid headers but malicious payloads hidden deeper
        in the file. This checks multiple sections to ensure consistency.

        Args:
            file_content: Full file content
            expected_mime: MIME type detected from full file

        Returns:
            Dict with is_consistent (bool) and reason (str)
        """
        file_size = len(file_content)

        # Check at multiple offsets: start, 25%, 50%, 75%, end
        offsets = [
            0,
            file_size // 4,
            file_size // 2,
            (file_size * 3) // 4,
            max(0, file_size - 2048)  # Last 2KB
        ]

        for offset in offsets:
            # Check at least 2KB from each offset (or until end of file)
            chunk_size = min(2048, file_size - offset)
            chunk = file_content[offset:offset + chunk_size]

            try:
                chunk_mime = magic.from_buffer(chunk, mime=True)

                # Allow some flexibility for compound formats
                # (e.g., DOCX is ZIP with XML inside)
                if not self._mime_types_compatible(expected_mime, chunk_mime):
                    return {
                        'is_consistent': False,
                        'reason': f'MIME type changed from {expected_mime} to {chunk_mime} at offset {offset}'
                    }
            except Exception as e:
                logger.warning(f"[FileValidator] Polyglot check failed at offset {offset}: {e}")
                # Continue checking other offsets

        return {'is_consistent': True, 'reason': ''}

    def _mime_types_compatible(self, mime1: str, mime2: str) -> bool:
        """
        Check if two MIME types are compatible (for polyglot detection)

        Some file formats contain multiple types (e.g., DOCX contains XML)
        """
        # Exact match
        if mime1 == mime2:
            return True

        # Same category (image/*, video/*, etc.)
        cat1 = mime1.split('/')[0]
        cat2 = mime2.split('/')[0]
        if cat1 == cat2:
            return True

        # Known compatible pairs
        compatible_pairs = [
            ('application/zip', 'application/vnd.openxmlformats'),  # DOCX, XLSX
            ('text/plain', 'text/html'),  # Plain text vs HTML
        ]

        for pair in compatible_pairs:
            if (mime1.startswith(pair[0]) and mime2.startswith(pair[1])) or \
               (mime1.startswith(pair[1]) and mime2.startswith(pair[0])):
                return True

        return False

    def _verify_content_type(self, claimed: str, detected: str) -> bool:
        """
        Verify claimed Content-Type matches detected MIME type

        Args:
            claimed: Content-Type from HTTP header
            detected: MIME type from magic bytes

        Returns:
            True if types match or are compatible
        """
        # Remove parameters from claimed type (e.g., "text/plain; charset=utf-8")
        claimed_base = claimed.split(';')[0].strip()

        return self._mime_types_compatible(claimed_base, detected)

    def _contains_suspicious_patterns(self, file_content: bytes) -> bool:
        """
        Check for suspicious patterns that might indicate XSS or malicious scripts

        Args:
            file_content: Full file content

        Returns:
            True if suspicious patterns found
        """
        for pattern in SUSPICIOUS_PATTERNS:
            if re.search(pattern, file_content, re.IGNORECASE):
                logger.warning(f"[FileValidator] Suspicious pattern detected: {pattern}")
                return True
        return False

    def _scan_for_viruses(self, file_content: bytes, file_hash: str) -> str:
        """
        Scan file for viruses using ClamAV

        Args:
            file_content: Full file content
            file_hash: SHA256 hash of file

        Returns:
            'CLEAN' if no virus, virus name if detected, 'ERROR' if scan failed
        """
        if not self.enable_virus_scan:
            return 'SCAN_DISABLED'

        try:
            # Write to temp file for scanning
            import tempfile
            with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
                tmp_file.write(file_content)
                tmp_path = tmp_file.name

            # Scan with ClamAV
            result = subprocess.run(
                ['clamdscan', '--no-summary', tmp_path],
                capture_output=True,
                timeout=30,
                text=True
            )

            # Clean up temp file
            Path(tmp_path).unlink(missing_ok=True)

            # Parse result
            if result.returncode == 0:
                return 'CLEAN'
            else:
                # Extract virus name from output
                output = result.stdout + result.stderr
                logger.error(f"[FileValidator] Virus detected in {file_hash[:16]}: {output}")
                return output.split(':')[-1].strip() if ':' in output else 'INFECTED'

        except subprocess.TimeoutExpired:
            logger.error(f"[FileValidator] Virus scan timeout for {file_hash[:16]}")
            return 'SCAN_TIMEOUT'
        except Exception as e:
            logger.error(f"[FileValidator] Virus scan error for {file_hash[:16]}: {e}")
            return 'SCAN_ERROR'


# Global validator instance (initialized without virus scanning by default)
# Enable virus scanning in production by setting ENABLE_VIRUS_SCAN env var
import os
_validator = FileValidator(enable_virus_scan=os.getenv('ENABLE_VIRUS_SCAN', 'false').lower() == 'true')


def validate_file(
    filename: str,
    file_content: bytes,
    claimed_content_type: Optional[str] = None
) -> FileValidationResult:
    """
    Convenience function for file validation

    Args:
        filename: Original filename with extension
        file_content: Full file binary content
        claimed_content_type: Content-Type header from upload (optional)

    Returns:
        FileValidationResult with validation status and details
    """
    return _validator.validate_file(filename, file_content, claimed_content_type)
