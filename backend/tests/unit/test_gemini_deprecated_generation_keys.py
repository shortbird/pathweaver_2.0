"""Gemini's upcoming models answer 400 INVALID_ARGUMENT to temperature, top_p,
top_k and thinking_budget (Google AI Studio notice, 2026-10-06). Every AI
feature would break on the next model bump, so nothing may send them."""

import pathlib
import re
from unittest.mock import MagicMock, patch

import pytest

from services.base_ai_service import (
    DEPRECATED_GENERATION_KEYS,
    strip_deprecated_generation_keys,
)

BACKEND = pathlib.Path(__file__).resolve().parents[2]


@pytest.mark.unit
def test_strip_drops_only_the_rejected_keys():
    config = {'temperature': 0.1, 'top_p': 0.7, 'top_k': 40,
              'thinking_budget': 512, 'max_output_tokens': 4096}
    assert strip_deprecated_generation_keys(config) == {'max_output_tokens': 4096}
    assert strip_deprecated_generation_keys(None) is None


@pytest.mark.unit
def test_generate_with_timeout_strips_the_rejected_keys():
    from services.ai_gen import generate_with_timeout
    model = MagicMock()
    with patch('google.generativeai.types.RequestOptions', MagicMock()):
        generate_with_timeout(model, 'hi', generation_config={'temperature': 0.0,
                                                              'max_output_tokens': 10})
    assert model.generate_content.call_args.kwargs['generation_config'] == {'max_output_tokens': 10}


@pytest.mark.unit
def test_no_service_sets_a_rejected_key():
    pattern = re.compile(r"""['"](%s)['"]\s*:|\b(%s)\s*=""" % (
        '|'.join(DEPRECATED_GENERATION_KEYS), '|'.join(DEPRECATED_GENERATION_KEYS)))
    offenders = []
    for root in ('services', 'routes', 'utils', 'repositories', 'jobs'):
        for path in (BACKEND / root).rglob('*.py'):
            for n, line in enumerate(path.read_text().splitlines(), 1):
                if pattern.search(line):
                    offenders.append(f'{path.relative_to(BACKEND)}:{n}: {line.strip()}')
    assert not offenders, '\n'.join(offenders)
