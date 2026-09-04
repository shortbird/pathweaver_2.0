"""Ratchet: direct database calls in the upper layers may shrink, never grow.

The repository pattern is documented as the way new code reaches the database
(CLAUDE.md, backend/docs/REPOSITORY_PATTERN.md). Measured, adherence is around
9%: routes/ alone makes 2339 direct `.table(...)` calls, services/ another 1779.
Finishing that migration is a large piece of work that has not been funded, and
QB-06 puts the choice to the user.

This test is the fence in the meantime. It does not ask anyone to migrate
anything; it asks that the number stop climbing while the decision is pending.
A new route that reaches for `.table(...)` instead of a repository fails the
build, and the reviewer gets to ask why. Existing debt is untouched.

Baselines are per LAYER, not a single total, because the layers mean different
things:

  routes/       calling the database directly is the actual violation -- it
                skips the layer that is supposed to own the query.
  services/     the same, one level down.
  repositories/ this is where `.table(...)` BELONGS. The number is here to
                notice churn, not to shame it; raising this one alongside a real
                migration is expected and fine.
  utils/, middleware/, jobs/, modules/
                small and mostly legitimate (auth lookups, cron jobs).

Ratchet DOWN as code migrates. Never raise routes/ or services/ -- that is the
line this exists to hold.
"""

import ast
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]

# Measured 2026-09-03.
# repositories/ raised 406 -> 415 when the CRM suppression cascade moved out of
# routes/ into repositories/crm_repository.py (the webhook, the admin console
# and the unsubscribe link all needed to agree on it). routes/ fell by the
# same migration.
# utils/ raised 128 -> 131 for utils/guardian_scope.py, which answers "may this
# adult read this kid's quest": three lookups (the student's row, the
# parent_student_link, the caller's role) that ARE the authorization check.
# Routing an auth gate through a repository would put the decision a layer away
# from the code that enforces it; the neighbouring guards
# (routes/family_quests.verify_parent_has_access_to_child,
# routes/parent/dashboard_overview.verify_parent_access) read the same tables
# the same way.
BASELINES = {
    'routes': 2336,
    # 1779 -> 1785 on 2026-09-04: sis_billing_alerts, six single-row lookups
    # (organizations, households, sis_saved_payment_methods, users x2,
    # sis_recurring_tuition) that exist only to compose the text of one office
    # notification. Deliberate: routing name lookups for a notification body
    # through five repositories buys nothing the layer boundary is for.
    'services': 1785,
    'repositories': 415,
    'utils': 131,
    'jobs': 7,
    'middleware': 3,
    'modules': 1,
}

#: Layers where a direct call is a design violation rather than the design.
UPPER_LAYERS = ('routes', 'services')


def _count(layer: str) -> int:
    base = BACKEND / layer
    if not base.is_dir():
        return 0
    total = 0
    for path in base.rglob('*.py'):
        if '__pycache__' in path.parts:
            continue
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr == 'table'):
                total += 1
    return total


@pytest.mark.parametrize('layer', sorted(BASELINES))
def test_direct_db_calls_do_not_grow(layer):
    count = _count(layer)
    baseline = BASELINES[layer]
    assert count <= baseline, (
        f"Direct `.table(...)` calls in {layer}/ grew from {baseline} to {count}.\n\n"
        + ("New code in this layer should go through a repository "
           "(backend/docs/REPOSITORY_PATTERN.md); the layer below owns the query.\n"
           if layer in UPPER_LAYERS else
           "This layer legitimately talks to the database -- if the growth is a "
           "real migration landing, raise the baseline in the same commit.\n")
        + f"If the increase is deliberate, say so and update BASELINES[{layer!r}]."
    )


def test_the_counter_actually_finds_calls():
    """A guard on the guard: a ratchet that counts zero passes forever."""
    assert _count('repositories') > 100, (
        'The counter found almost nothing in repositories/, which is where these '
        'calls are supposed to live. The scan is broken, not the codebase.')
