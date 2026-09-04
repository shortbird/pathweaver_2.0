"""Conformance: the three implementations of "the text of this body" agree.

A message body is turned into readable text in three places, and all three
docstrings claim to mirror each other:

    backend/utils/rich_text.py            email, notification previews, search
    frontend/src/utils/richText.js        the web app, via the DOM
    frontend-v2/src/utils/richText.ts     mobile, via regex (native has no DOM)

Two of them did not. On 2026-09-03 the mobile one was decoding thirteen named
entities and passing the rest through, so an announcement containing
`caf&eacute;` or `&copy;` read correctly in the email and on the web and showed
the raw entity on a phone. It also turned `&nbsp;` into a plain space where the
other two produce U+00A0.

Nothing catches that class of drift by reading the code: the implementations
look different ON PURPOSE, because one has a DOM and one does not. What they
owe each other is the same OUTPUT.

So: shared/richTextCases.json holds the corpus, this file checks the backend
against it, and the two frontends have the matching test. Add a case there and
all three have to agree about it.
"""

import json
from pathlib import Path

import pytest

from utils.rich_text import is_html, to_text

CORPUS = Path(__file__).resolve().parents[3] / 'shared' / 'richTextCases.json'


def _cases():
    data = json.loads(CORPUS.read_text(encoding='utf-8'))
    return data['cases']


def test_the_corpus_is_there_and_not_empty():
    """A conformance test with no cases passes forever."""
    assert CORPUS.exists(), (
        f'{CORPUS} is missing. The two frontends read it too, so this is not a '
        'backend-only problem.')
    assert len(_cases()) >= 20


@pytest.mark.parametrize('case', _cases(), ids=lambda c: c['why'])
def test_backend_matches_the_shared_corpus(case):
    assert to_text(case['input']) == case['text']
    assert is_html(case['input']) is case['isHtml']
    assert (not to_text(case['input']).strip()) is case['isBlank']


def test_every_case_says_why_it_is_there():
    """A corpus of bare strings rots into nobody daring to change any of them."""
    for case in _cases():
        assert case.get('why'), f'case {case["input"]!r} has no "why"'
