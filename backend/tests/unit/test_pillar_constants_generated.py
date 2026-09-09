"""The pillar vocabulary has one definition, and every module reads it.

`shared/data/pillars.json` is that definition. `shared/scripts/generate-constants.mjs`
emits it into `backend/generated/pillars.py` for Flask and
`shared/generated/pillars.ts` for the two apps, and CI re-runs the generator and
diffs the result (tests-web.yml). This file guards the half that generator
cannot see: whether the backend modules that USE the vocabulary still agree with
it.

Before this, seven modules declared the five pillars themselves:

    utils/pillar_utils.py                  keys, display names, legacy aliases
    config/pillars.py                      keys, display names, colours
    prompts/components.py                  keys, legacy display names
    routes/personalization_validators.py   legacy display names
    services/roster_import_service.py      legacy display names
    routes/treehouse.py                    keys
    routes/learning_events/crud.py         keys
    services/bounty_service.py             keys

They did not agree. `prompts/components.PILLAR_DISPLAY_NAMES` and
`utils/pillar_utils.PILLAR_DISPLAY_NAMES` are the same name for two different
maps -- one gives 'STEM', the other 'STEM & Logic' -- so which one a reader
found depended on which file they opened.

WHAT THIS DOES NOT REQUIRE: that every module list the pillars in the same
ORDER. Three of them render an order that reaches a user, and the three orders
differ:

  - config/pillars.py -> GET /api/pillars returns `keys` as a JSON array
  - routes/treehouse.py -> builds its student-facing category list by iterating
  - routes/personalization_validators.py -> joins the list into a 400 message

Forcing one order on them would have been a visible product change made for a
refactor's convenience. So a module may declare its own order, and the
assertion is that the order is a permutation of the canonical keys -- which is
the property that actually matters: no module can add, drop or misspell a
pillar.
"""

import pytest

from generated.pillars import (
    PILLAR_KEYS,
    PILLAR_LABELS,
    PILLAR_COLORS,
    PILLAR_LEGACY_ALIASES,
    PILLAR_LEGACY_DISPLAY_NAMES,
)

CANONICAL = set(PILLAR_KEYS)


def test_there_are_five_pillars():
    # A floor, so a generator that emitted an empty file would fail here rather
    # than making every set comparison below trivially true.
    assert len(PILLAR_KEYS) == 5
    assert len(set(PILLAR_KEYS)) == 5


# --- the modules that hold a KEY LIST -------------------------------------

def _key_lists():
    """(label, keys) for every module that declares its own pillar order."""
    import config.pillars as config_pillars
    import routes.treehouse as treehouse
    import routes.learning_events.crud as le_crud
    import services.bounty_service as bounty_service
    import prompts.components as prompt_components
    from utils import pillar_utils

    return [
        ('config/pillars.py PILLARS', tuple(config_pillars.PILLARS)),
        ('routes/treehouse.py PILLARS', tuple(treehouse.PILLARS)),
        ('routes/learning_events/crud.py VALID_PILLARS', tuple(le_crud.VALID_PILLARS)),
        ('services/bounty_service.py VALID_PILLARS', tuple(bounty_service.VALID_PILLARS)),
        ('prompts/components.py VALID_PILLARS', tuple(prompt_components.VALID_PILLARS)),
        ('utils/pillar_utils.py PILLAR_KEYS', tuple(pillar_utils.PILLAR_KEYS)),
    ]


@pytest.mark.parametrize('label,keys', _key_lists(), ids=lambda v: v if isinstance(v, str) else '')
def test_every_key_list_is_a_permutation_of_the_canonical_keys(label, keys):
    missing = CANONICAL - set(keys)
    extra = set(keys) - CANONICAL
    assert not missing, f'{label} is missing {sorted(missing)}'
    assert not extra, f'{label} has {sorted(extra)}, which is not a pillar'
    assert len(keys) == len(set(keys)), f'{label} lists a pillar twice'


# --- the modules that hold a NAME MAP --------------------------------------

def test_pillar_utils_display_names_are_the_generated_labels():
    from utils import pillar_utils
    assert pillar_utils.PILLAR_DISPLAY_NAMES == PILLAR_LABELS


def test_pillar_utils_legacy_mappings_are_the_generated_aliases():
    from utils import pillar_utils
    assert pillar_utils.LEGACY_PILLAR_MAPPINGS == PILLAR_LEGACY_ALIASES


def test_config_pillars_takes_its_names_and_colours_from_the_generated_module():
    import config.pillars as config_pillars
    assert {k: v['display_name'] for k, v in config_pillars.PILLARS.items()} == PILLAR_LABELS
    assert {k: v['color'] for k, v in config_pillars.PILLARS.items()} == PILLAR_COLORS


def test_prompt_display_names_are_the_generated_legacy_names():
    # This map is the OTHER PILLAR_DISPLAY_NAMES -- the '&' vocabulary the AI
    # prompts were written against. It reaches a model, not a screen, and the
    # wording is load-bearing for the prompts, which is why it stays distinct
    # from PILLAR_LABELS rather than being unified with it.
    import prompts.components as prompt_components
    assert prompt_components.PILLAR_DISPLAY_NAMES == PILLAR_LEGACY_DISPLAY_NAMES


def test_validator_and_roster_vocabularies_are_the_generated_legacy_names():
    import routes.personalization_validators as validators
    import services.roster_import_service as roster

    legacy_names = set(PILLAR_LEGACY_DISPLAY_NAMES.values())
    assert set(validators.VALID_PILLARS) == legacy_names
    assert set(roster.PILLARS) == legacy_names


# --- normalisation still resolves every old spelling -----------------------

@pytest.mark.parametrize('spelling', sorted(PILLAR_LEGACY_ALIASES))
def test_every_legacy_spelling_still_normalises(spelling):
    """The point of keeping the legacy vocabulary at all.

    Rows written before the 2025 rename still carry these values, so a read
    path that stops accepting one of them does not fail loudly -- it raises
    ValueError deep inside an XP calculation.
    """
    from utils.pillar_utils import normalize_pillar_name
    assert normalize_pillar_name(spelling) == PILLAR_LEGACY_ALIASES[spelling]
