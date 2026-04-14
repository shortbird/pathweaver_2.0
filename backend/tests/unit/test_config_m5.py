"""M5 regression tests:

1. **Config attrs** added in M5 must resolve at import time with their
   documented defaults / fallback chains.
2. **Lint**: the 14 files migrated in M5 must not regress to direct
   `os.getenv` calls. New env reads in service code must go through Config.

The lint half is the analog of H1's `test_admin_client_justified.py` —
both lock in audit work so a future commit can't silently undo it.
"""
import ast
import os
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND = REPO_ROOT / 'backend'

# Files migrated in M5. If new files join service code with `os.getenv`,
# add them here to keep the lint coverage current.
M5_MIGRATED_FILES = [
    BACKEND / 'middleware' / 'security.py',
    BACKEND / 'middleware' / 'csrf_protection.py',
    BACKEND / 'middleware' / 'rate_limiter.py',
    BACKEND / 'middleware' / 'idempotency.py',
    BACKEND / 'routes' / 'account_deletion.py',
    BACKEND / 'routes' / 'auth' / 'registration.py',
    BACKEND / 'routes' / 'auth' / 'google_oauth.py',
    BACKEND / 'routes' / 'auth' / 'login' / 'diagnostics.py',
    BACKEND / 'routes' / 'evidence_documents.py',
    # Split into routes/spark_integration/ package on 2026-04-14 (Q1).
    BACKEND / 'routes' / 'spark_integration' / '__init__.py',
    BACKEND / 'routes' / 'spark_integration' / 'sso.py',
    BACKEND / 'routes' / 'spark_integration' / 'webhooks.py',
    BACKEND / 'utils' / 'auth' / 'token_utils.py',
    BACKEND / 'utils' / 'session_manager.py',
    BACKEND / 'utils' / 'log_scrubber.py',
    BACKEND / 'utils' / 'file_validator.py',
]


# ── Lint half: no os.getenv in migrated files ────────────────────────────────

def _calls_os_getenv(tree: ast.AST) -> list[int]:
    """Return line numbers of any `os.getenv(...)` or `os.environ[...]` calls."""
    hits: list[int] = []
    for node in ast.walk(tree):
        # os.getenv(...)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if (
                isinstance(node.func.value, ast.Name)
                and node.func.value.id == 'os'
                and node.func.attr == 'getenv'
            ):
                hits.append(node.lineno)
        # os.environ.get(...) / os.environ[...]
        if isinstance(node, ast.Attribute) and node.attr == 'environ':
            if isinstance(node.value, ast.Name) and node.value.id == 'os':
                hits.append(node.lineno)
    return hits


@pytest.mark.parametrize('path', M5_MIGRATED_FILES, ids=lambda p: str(p.relative_to(BACKEND)))
def test_m5_file_uses_config_not_os_getenv(path: Path):
    assert path.exists(), f'M5-migrated file vanished: {path}'
    tree = ast.parse(path.read_text(encoding='utf-8'))
    hits = _calls_os_getenv(tree)
    assert not hits, (
        f'{path.relative_to(BACKEND)} regressed to direct os.getenv/os.environ at lines {hits}. '
        'Route an env read through Config (see backend/app_config.py + ENV_KEYS_REFERENCE.md).'
    )


# ── Resolution half: Config attrs added in M5 ────────────────────────────────

@pytest.fixture(scope='module')
def config_class():
    if str(BACKEND) not in sys.path:
        sys.path.insert(0, str(BACKEND))
    from app_config import Config
    return Config


def test_jwt_secret_key_resolves_with_fallback(config_class):
    # JWT_SECRET_KEY is the dedicated signing key but falls back to SECRET_KEY
    # for legacy deployments. Either way, it MUST resolve to something usable.
    assert config_class.JWT_SECRET_KEY, 'Config.JWT_SECRET_KEY must resolve (with fallback to SECRET_KEY)'
    assert isinstance(config_class.JWT_SECRET_KEY, str)
    assert len(config_class.JWT_SECRET_KEY) >= 16, 'JWT_SECRET_KEY too short to be meaningful'


def test_token_version_default(config_class):
    assert config_class.TOKEN_VERSION  # default 'v1' if env unset


def test_session_timeout_hours_is_int(config_class):
    assert isinstance(config_class.SESSION_TIMEOUT_HOURS, int)
    assert config_class.SESSION_TIMEOUT_HOURS > 0


def test_evidence_upload_folder_default(config_class):
    # Default value lives in app_config.py — verify it didn't drift to None.
    assert config_class.EVIDENCE_UPLOAD_FOLDER
    assert isinstance(config_class.EVIDENCE_UPLOAD_FOLDER, str)


def test_enable_virus_scan_is_bool(config_class):
    # Defaults to False; must be a bool, not the literal string 'false'.
    assert isinstance(config_class.ENABLE_VIRUS_SCAN, bool)


def test_optional_secrets_present_as_attrs(config_class):
    # These can legitimately be None in dev (no Spark integration set up locally),
    # but the attribute itself must exist on Config or callers will AttributeError.
    for name in ('SPARK_SSO_SECRET', 'SPARK_WEBHOOK_SECRET', 'JWT_PREVIOUS_SECRET_KEY', 'BACKEND_URL'):
        assert hasattr(config_class, name), f'Config.{name} missing — was the M5 attr accidentally removed?'
