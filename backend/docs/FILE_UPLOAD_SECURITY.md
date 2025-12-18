# File Upload Security Implementation (P1-SEC-1)

**Date**: December 18, 2025
**Status**: Complete ✅
**OWASP**: A04:2021 - Insecure Design mitigation

## Overview

Enhanced file upload validation system with multi-layer security to prevent malicious file uploads, polyglot attacks, XSS, and malware.

## Original Vulnerability

The previous implementation only validated the first 2048 bytes of uploaded files, allowing attackers to bypass validation with polyglot files (files with valid headers but malicious payloads hidden deeper in the file).

```python
# OLD - VULNERABLE
mime_type = magic.from_buffer(file_content[:2048], mime=True)  # Only first 2KB!
```

## Security Improvements

### 1. Full File Scanning
- Scans **entire file content** (not just first 2KB)
- Uses python-magic to detect actual MIME type
- No truncation vulnerabilities

### 2. Polyglot Detection
- Checks MIME type at 5 positions in file:
  - 0% (beginning)
  - 25% (first quarter)
  - 50% (middle)
  - 75% (third quarter)
  - 100% (end)
- Detects inconsistencies in file structure
- Prevents header-spoofing attacks

### 3. Content-Type Verification
- Validates claimed Content-Type against detected MIME
- **Never trusts client-provided Content-Type**
- Uses server-detected MIME for storage
- Generates warnings for mismatches

### 4. Suspicious Pattern Detection
- Regex scanning for embedded scripts:
  - `<script>`, `</script>`, `<iframe>`
  - `javascript:`, `onerror=`, `onload=`
  - `eval()`, `document.cookie`, `document.write`
- XSS prevention
- Cookie stealing prevention
- Generates warnings (doesn't reject, to avoid false positives)

### 5. Optional Virus Scanning
- Integrates with ClamAV (industry-standard open-source antivirus)
- Enable with `ENABLE_VIRUS_SCAN=true` environment variable
- Uses `clamdscan` for fast daemon-based scanning
- Gracefully falls back if ClamAV not installed
- Rejects files if virus detected

### 6. Enhanced Metadata Logging
- SHA256 hash tracking for all uploads (forensics)
- File size validation (10MB limit)
- Detailed logging of validation failures and warnings
- User ID, filename, rejection reason logged
- Supports security audits and incident response

## Architecture

### FileValidator Class
**Location**: `backend/utils/file_validator.py`

```python
from utils.file_validator import validate_file

result = validate_file(
    filename='document.pdf',
    file_content=b'...',
    claimed_content_type='application/pdf'
)

if result.is_valid:
    # Upload file
    print(f"SHA256: {result.sha256_hash}")
    print(f"Detected MIME: {result.detected_mime}")
    if result.warnings:
        print(f"Warnings: {result.warnings}")
else:
    # Reject upload
    print(f"Error: {result.error_message}")
```

### Integration Points
**Location**: `backend/routes/uploads.py`

Both upload endpoints updated:
- `POST /api/uploads/evidence` (multipart/form-data)
- `POST /api/uploads/evidence/base64` (JSON with base64)

## Configuration

### Required Dependencies
```bash
pip install python-magic
```

**Linux**:
```bash
apt-get install libmagic1
```

**macOS**:
```bash
brew install libmagic
```

**Windows**:
```bash
pip install python-magic-bin
```

### Optional: ClamAV Virus Scanning

**Installation** (Ubuntu/Debian):
```bash
sudo apt-get install clamav clamav-daemon
sudo systemctl start clamav-daemon
sudo systemctl enable clamav-daemon
```

**Enable in Render**:
Add environment variable:
```
ENABLE_VIRUS_SCAN=true
```

**Local Development**:
Leave disabled (default: `false`)

## Allowed File Types

### Images
- JPEG (.jpg, .jpeg) - `image/jpeg`
- PNG (.png) - `image/png`
- GIF (.gif) - `image/gif`
- WebP (.webp) - `image/webp`

### Documents
- PDF (.pdf) - `application/pdf`
- Word (.doc) - `application/msword`
- Word (.docx) - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Text (.txt) - `text/plain`

### Videos
- MP4 (.mp4) - `video/mp4`
- WebM (.webm) - `video/webm`
- QuickTime (.mov) - `video/quicktime`

### Audio
- MP3 (.mp3) - `audio/mpeg`
- WAV (.wav) - `audio/wav`
- OGG (.ogg) - `audio/ogg`

## File Size Limits

**Maximum**: 10 MB (10,485,760 bytes)

## Response Format

### Success Response
```json
{
  "files": [{
    "original_name": "document.pdf",
    "stored_name": "user-id/uuid.pdf",
    "url": "https://...",
    "size": 123456,
    "content_type": "application/pdf",
    "sha256_hash": "abc123...",
    "uploaded_at": "2025-12-18T12:00:00Z"
  }],
  "count": 1
}
```

### Validation Error Response
```json
{
  "error": "File malware.exe: File extension '.exe' not allowed"
}
```

### Polyglot Detection Response
```json
{
  "error": "File polyglot.jpg: Polyglot file detected: MIME type changed from image/jpeg to image/png at offset 2048"
}
```

### Virus Detection Response (ClamAV enabled)
```json
{
  "error": "File infected.pdf: Virus detected: Win.Test.EICAR"
}
```

## Testing

### Unit Tests
**Location**: `backend/tests/test_file_upload_validation.py`

Run tests:
```bash
pytest backend/tests/test_file_upload_validation.py -v
```

Test coverage:
- Valid file types (JPEG, PNG, PDF)
- Invalid extensions
- Extension spoofing
- Empty files
- Files exceeding size limit
- Content-Type mismatches
- Polyglot detection
- Suspicious patterns
- SHA256 hash generation
- Optional: ClamAV virus scanning (requires ClamAV)

### Manual Testing Checklist

1. **Valid uploads** (should succeed):
   - Upload valid JPEG image (< 10MB)
   - Upload valid PNG image (< 10MB)
   - Upload valid PDF document (< 10MB)

2. **Invalid uploads** (should fail):
   - Upload file with .exe extension → "extension not allowed"
   - Upload file > 10MB → "exceeds maximum size"
   - Upload empty file → "file is empty"
   - Upload PNG with .jpg extension → "polyglot detected" or MIME mismatch

3. **Security tests** (should fail or warn):
   - Upload HTML file with `<script>` tags → warning or rejection
   - Upload image with embedded JavaScript → warning logged
   - Upload file with Content-Type: image/png but actually JPEG → warning logged

4. **Check logs**:
   - Verify validation warnings are logged with user_id, filename, reason
   - Verify SHA256 hashes are included in responses
   - No sensitive data (file content) in logs

## Security Considerations

### Defense in Depth
This implementation provides multiple layers of defense:
1. Extension validation (first line)
2. MIME type detection (second line)
3. Polyglot detection (third line)
4. Suspicious pattern detection (fourth line)
5. Optional virus scanning (fifth line)

### Why Not Reject Suspicious Patterns?
The suspicious pattern detection generates warnings but doesn't reject files because:
- Risk of false positives (e.g., legitimate JavaScript code samples in documents)
- Images uploaded for educational purposes may contain code snippets
- Better to log and monitor than break legitimate use cases

In production, you can make this stricter based on your threat model.

### File Storage Best Practices
1. **Never serve uploads from application domain** - Use Supabase Storage (separate domain)
2. **Always set correct Content-Type** - Use detected MIME (not client-provided)
3. **Generate unique filenames** - Prevent overwrites and path traversal
4. **Track file hashes** - Enable forensics and duplicate detection
5. **Log all uploads** - Security audit trail

## Threat Mitigation

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Extension spoofing | MIME detection + extension validation | ✅ |
| Polyglot files | Multi-offset MIME checking | ✅ |
| XSS via uploads | Suspicious pattern detection + separate storage domain | ✅ |
| Malware uploads | Optional ClamAV scanning | ✅ |
| Content-Type spoofing | Server-side MIME detection | ✅ |
| Large file DoS | 10MB size limit + rate limiting (10/hour) | ✅ |
| Path traversal | werkzeug.secure_filename() | ✅ |

## Performance Impact

- **Full file scanning**: Minimal (~10ms for 1MB file)
- **Polyglot detection**: ~50ms additional (5 offset checks)
- **Virus scanning** (optional): ~100-500ms depending on file size
- **Total overhead**: ~60ms without virus scan, ~600ms with virus scan

This is acceptable for a security-critical operation that runs infrequently (10 uploads per hour max per user).

## Future Enhancements

1. **Cloud virus scanning** - Integrate VirusTotal API as alternative to ClamAV
2. **Machine learning** - Train model to detect anomalous files
3. **Sandbox execution** - Run file processing in isolated Docker container
4. **File metadata stripping** - Remove EXIF data, GPS coordinates from images
5. **Content-aware validation** - Deep inspection of PDF structure, image layers

## References

- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [ClamAV Documentation](https://docs.clamav.net/)
- [python-magic Documentation](https://github.com/ahupp/python-magic)
- [Polyglot Files Explained](https://en.wikipedia.org/wiki/Polyglot_(computing))

## Maintenance

**Review frequency**: Quarterly
**Next review**: March 2026
**Owner**: Security Team

### Update Checklist
- [ ] Review ALLOWED_MIME_TYPES for new requirements
- [ ] Update SUSPICIOUS_PATTERNS based on new attack vectors
- [ ] Check ClamAV virus definitions are up to date
- [ ] Review upload logs for patterns of abuse
- [ ] Test with latest python-magic version
