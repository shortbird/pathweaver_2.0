"""One rule, three implementations: the backend half of the role conformance.

`shared/roleCases.json` is generated from THIS module (get_effective_role /
get_effective_roles), and the two clients read the same file through
`shared/roles.ts`. This test is the one that keeps the corpus honest: if the
Python changes, this fails first, and regenerating the corpus is what tells the
clients they have to follow.

See the file's own `_comment` for what it was written after -- the mobile app
resolved org-managed users without looking at `org_roles` at all.
"""

import json
from pathlib import Path

import pytest

from utils.roles import (
    VALID_ORG_ROLES,
    VALID_ROLES,
    get_effective_role,
    get_effective_roles,
)

CORPUS = Path(__file__).resolve().parents[3] / 'shared' / 'roleCases.json'


def _corpus():
    with CORPUS.open() as fh:
        return json.load(fh)


def test_corpus_exists_and_is_not_empty():
    """A conformance suite that silently tests nothing is worse than none."""
    cases = _corpus()['cases']
    assert len(cases) >= 15, f'only {len(cases)} cases -- did the corpus get truncated?'


def test_role_vocabularies_match_the_enums():
    """The clients render pickers from these lists. A role added to OrgRole and
    not to the corpus is a role the web app will not offer."""
    data = _corpus()
    assert sorted(VALID_ROLES) == data['validRoles']
    assert sorted(VALID_ORG_ROLES) == data['validOrgRoles']


@pytest.mark.parametrize('case', _corpus()['cases'], ids=lambda c: c['why'])
def test_effective_role_matches_the_corpus(case):
    assert get_effective_role(case['user']) == case['effectiveRole'], case['why']


@pytest.mark.parametrize('case', _corpus()['cases'], ids=lambda c: c['why'])
def test_effective_roles_match_the_corpus(case):
    assert get_effective_roles(case['user']) == case['effectiveRoles'], case['why']
