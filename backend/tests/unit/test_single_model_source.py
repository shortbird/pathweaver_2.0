"""
Guards the "one variable" property of the Gemini model setting.

Config.GEMINI_MODEL (app_config.py) is the single source of truth for every
Gemini call in the platform. Before 2026-08-13 the model name was restated in
four places -- config/constants.py, BaseAIService.DEFAULT_MODEL,
CurriculumAIService.CURRICULUM_MODEL, and two hardcoded pricing tables -- so
"change the model" silently meant "change the model in some of the places".

These tests fail if a bare 'gemini-<version>' literal reappears in backend code
outside the small allowlist below.
"""

import re
from pathlib import Path

import pytest

from app_config import Config
from services.base_ai_service import BaseAIService

BACKEND_ROOT = Path(__file__).resolve().parents[2]

# Files allowed to contain a literal model name, and why.
ALLOWED_FILES = {
    # The single source of truth itself, plus its pricing table.
    'app_config.py',
}

# First-party source trees. Deliberately excludes tests/ (fixtures pin model
# names), docs/, scripts/, and any vendored virtualenv.
SCANNED_DIRS = ('services', 'routes', 'repositories', 'utils', 'middleware', 'config')

MODEL_LITERAL = re.compile(r"""['"]gemini-\d""")


def _python_sources():
    roots = [BACKEND_ROOT / d for d in SCANNED_DIRS]
    # Top-level modules (app_config.py, app.py, ...) alongside the packages.
    top_level = [p for p in BACKEND_ROOT.glob('*.py')]

    for path in [p for root in roots for p in root.rglob('*.py')] + top_level:
        rel = path.relative_to(BACKEND_ROOT)
        if '__pycache__' in rel.parts:
            continue
        if str(rel) in ALLOWED_FILES:
            continue
        yield rel, path


def test_no_hardcoded_model_names_outside_config():
    """Only app_config.py may contain a literal Gemini model name."""
    offenders = []
    for rel, path in _python_sources():
        for lineno, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            stripped = line.strip()
            # Comments and docstrings may reference models for historical context.
            if stripped.startswith('#'):
                continue
            if MODEL_LITERAL.search(line):
                offenders.append(f"{rel}:{lineno}: {stripped}")

    assert not offenders, (
        "Hardcoded Gemini model name(s) found. Config.GEMINI_MODEL is the single "
        "source of truth -- read the model from Config instead:\n  "
        + "\n  ".join(offenders)
    )


def test_every_ai_service_resolves_to_the_configured_model():
    """A plain AI service uses Config.GEMINI_MODEL, with no separate default."""
    assert BaseAIService.default_model() == Config.GEMINI_MODEL
    assert not hasattr(BaseAIService, 'DEFAULT_MODEL'), (
        "DEFAULT_MODEL reintroduces a second model name; use default_model()."
    )


def test_curriculum_model_follows_the_platform_model_by_default():
    """The curriculum pipeline tracks GEMINI_MODEL unless explicitly pinned."""
    assert Config.GEMINI_CURRICULUM_MODEL == Config.GEMINI_MODEL, (
        "GEMINI_CURRICULUM_MODEL is pinned to a different model. That is a "
        "supported override, but update this test to record why."
    )


def test_constants_module_does_not_redeclare_the_model():
    """config/constants.py once held an unused duplicate GEMINI_MODEL."""
    import config.constants as constants
    assert not hasattr(constants, 'GEMINI_MODEL'), (
        "config.constants.GEMINI_MODEL is a duplicate of Config.GEMINI_MODEL "
        "and is not read by anything -- remove it."
    )


@pytest.mark.parametrize('model', ['gemini-2.5-flash-lite', 'gemini-2.5-pro'])
def test_known_models_have_explicit_pricing(model):
    """Priced models resolve to their own rate, not the default placeholder."""
    from utils.ai_pricing import get_model_pricing
    assert get_model_pricing(model) == Config.GEMINI_PRICING[model]


def test_unknown_model_falls_back_to_default_rate_not_zero():
    """An unpriced model must produce approximate costs, never a silent $0."""
    from utils.ai_pricing import get_model_pricing
    rate = get_model_pricing('gemini-does-not-exist')
    assert rate == Config.GEMINI_PRICING_DEFAULT
    assert all(r > 0 for r in rate)
