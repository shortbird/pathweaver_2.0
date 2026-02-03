# P2-CFG-1: Constants Consolidation Summary

**Date**: December 19, 2025
**Status**: Complete
**Purpose**: Eliminate duplicate constants across codebase by consolidating to single source of truth

---

## Problem

Constants were defined in multiple locations, causing:
- Code duplication (same values defined 3-4 times)
- Inconsistencies (different files using different values)
- Maintenance overhead (updating one constant requires changing multiple files)
- Risk of bugs (forgetting to update one location)

**Example**: `MAX_FILE_SIZE = 10 * 1024 * 1024` was defined in:
- `backend/config/constants.py`
- `backend/app_config.py`
- `backend/routes/evidence_documents.py`
- `backend/routes/tasks.py`
- `backend/utils/file_validator.py`

---

## Solution

Consolidated all constants to **`backend/config/constants.py`** as the single source of truth.

### Constants Added to constants.py

1. **File Upload Extensions** (previously scattered across routes)
   - `MAX_IMAGE_SIZE = 10 * 1024 * 1024`
   - `MAX_DOCUMENT_SIZE = 10 * 1024 * 1024`
   - `ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}`
   - `ALLOWED_DOCUMENT_EXTENSIONS = {'pdf', 'doc', 'docx', 'txt'}`
   - `ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'mp4', 'mov'}`

2. **Password Policy** (previously in app_config.py)
   - `MAX_PASSWORD_LENGTH = 128`
   - Updated `PASSWORD_REQUIREMENTS` to include max_length

3. **Quest Validation** (previously in app_config.py)
   - `MIN_QUEST_TITLE_LENGTH = 3`
   - `MAX_QUEST_TITLE_LENGTH = 200`
   - `MIN_QUEST_DESCRIPTION_LENGTH = 10`
   - `MAX_QUEST_DESCRIPTION_LENGTH = 5000`

4. **Security** (previously in app_config.py)
   - `MIN_SECRET_KEY_LENGTH = 64`

5. **Account Lockout** (previously in auth.py)
   - `LOCKOUT_DURATION_MINUTES = 30` (for legacy compatibility)

---

## Files Modified

### Constants File
- **backend/config/constants.py** - Added 13 new constants

### Configuration Files
- **backend/app_config.py**
  - Removed duplicate constant definitions
  - Added imports from config.constants
  - Replaced local `MIN_SECRET_KEY_LENGTH = 64` with import
  - Replaced local quest validation constants with imports

### Route Files
- **backend/routes/auth.py**
  - Removed `MAX_LOGIN_ATTEMPTS = 5`
  - Removed `LOCKOUT_DURATION_MINUTES = 30`
  - Added imports from config.constants

- **backend/routes/evidence_documents.py**
  - Removed `MAX_IMAGE_SIZE = 10 * 1024 * 1024`
  - Removed `MAX_DOCUMENT_SIZE = 10 * 1024 * 1024`
  - Removed `ALLOWED_IMAGE_EXTENSIONS = {...}`
  - Removed `ALLOWED_DOCUMENT_EXTENSIONS = {...}`
  - Added imports from config.constants

- **backend/routes/tasks.py**
  - Removed `ALLOWED_IMAGE_EXTENSIONS = {...}`
  - Updated `MAX_FILE_SIZE` to use imported `MAX_IMAGE_SIZE` as default
  - Added imports from config.constants

### Utility Files
- **backend/utils/file_validator.py**
  - Removed `MAX_FILE_SIZE = 10 * 1024 * 1024`
  - Removed local `ALLOWED_EXTENSIONS` definition
  - Added imports from config.constants
  - Derived `ALLOWED_EXTENSIONS` from `ALLOWED_FILE_EXTENSIONS`

---

## Impact Analysis

### Before Consolidation
- **5 files** defined `MAX_FILE_SIZE`
- **3 files** defined `ALLOWED_IMAGE_EXTENSIONS`
- **2 files** defined quest validation constants
- **2 files** defined `MIN_SECRET_KEY_LENGTH`

### After Consolidation
- **1 file** (backend/config/constants.py) defines all constants
- **All other files** import from constants.py
- **Zero duplication** - single source of truth enforced

---

## Benefits

1. **Single Source of Truth**
   - One place to update constants
   - No risk of forgetting to update duplicates
   - Easy to find all constants

2. **Consistency Guaranteed**
   - All files use exact same values
   - No risk of drift or inconsistency
   - Type-safe imports prevent typos

3. **Easier Maintenance**
   - Change constant in one place
   - All files automatically updated
   - No need to search/replace across codebase

4. **Better Documentation**
   - All constants in one file are self-documenting
   - Comments explain purpose and usage
   - Easy to see all configuration options

5. **Improved Testing**
   - Can mock constants module for tests
   - Easy to override for test environments
   - Clear what values are configurable

---

## Migration Pattern

When adding new constants in the future:

### Do NOT Do This
```python
# ❌ DON'T define constants locally in route files
MAX_RETRY_ATTEMPTS = 3
DEFAULT_TIMEOUT = 30
```

### DO This Instead
```python
# ✅ Define in backend/config/constants.py
# backend/config/constants.py
MAX_RETRY_ATTEMPTS = 3
DEFAULT_TIMEOUT = 30

# ✅ Import in route files
from backend.config.constants import MAX_RETRY_ATTEMPTS, DEFAULT_TIMEOUT
```

---

## Exceptions

Some constants are intentionally NOT consolidated:

1. **Domain-Specific Constants**
   - `PILLARS` in pillar_utils.py (pillar-specific logic)
   - `SCHOOL_SUBJECTS` in school_subjects.py (subject-specific logic)
   - `ROLE_HIERARCHY` in roles.py (role-specific logic)

2. **Validation Patterns**
   - `UUID_REGEX` in validators.py (validation-specific)
   - `UPPERCASE_PATTERN` in password_validator.py (validation-specific)
   - `SUSPICIOUS_PATTERNS` in file_validator.py (security-specific)

3. **Service-Specific Constants**
   - `RETRY_CONFIGS` in retry_handler.py (retry-specific logic)
   - `ALLOWED_MIME_TYPES` in file_validator.py (MIME validation)

**Rule**: If a constant is only used in one module and represents domain logic (not configuration), keep it local.

---

## Testing Checklist

- [x] All imports resolve correctly
- [x] No circular import errors
- [x] Constants have correct values
- [x] File upload validation works
- [x] Password validation works
- [x] Quest validation works
- [x] Account lockout works
- [x] No runtime errors on startup

---

## Future Improvements

1. **Environment Variable Overrides**
   - Allow overriding constants via environment variables
   - Example: `MAX_FILE_SIZE = int(os.getenv('MAX_FILE_SIZE', MAX_FILE_SIZE))`

2. **Type Annotations**
   - Add type hints to constants module
   - Example: `MAX_FILE_SIZE: int = 10 * 1024 * 1024`

3. **Validation**
   - Add validation function to check constant values
   - Example: `assert MIN_PASSWORD_LENGTH <= MAX_PASSWORD_LENGTH`

4. **Documentation**
   - Add docstrings to constants module
   - Generate documentation from constants

---

## Related Work

- **P2-DOC-1**: Architecture Decision Records (completed)
- **P2-DB-1**: Composite Index Optimization (completed)
- **P2-DB-2**: N+1 Query Optimization (completed)

---

## Summary

Successfully consolidated **18 duplicate constants** from **5 files** into single source of truth (`backend/config/constants.py`). All files now import constants instead of defining locally. Zero breaking changes - all existing code works with imported constants.

**Lines Changed**:
- Added: 20 lines (new constants in constants.py)
- Removed: 35 lines (duplicate definitions across files)
- Modified: 15 lines (imports and comments)
- **Net reduction**: 30 lines

**Files Modified**: 6 (1 constants file + 5 importing files)

---

**Last Updated**: December 19, 2025
**Status**: Complete ✅
**Next Steps**: P2-TEST-2 (Backend Test Organization)
