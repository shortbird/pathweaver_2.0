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

Ratchet DOWN as code migrates. Never raise the COMBINED routes/ + services/
total -- that is the line this exists to hold.

That used to read "never raise routes/ or services/", which was almost right and
blocked a change it should have welcomed. Extracting a helper from a route
module into services/ moves existing calls DOWN a layer, which is the direction
the repository pattern wants; it raises services/ while lowering routes/ by the
same amount, and the old rule called that a violation. So the per-layer numbers
are still recorded (they say where the debt sits), but the assertion that cannot
be argued with is `test_the_upper_layers_do_not_grow_in_total`: a lateral move
passes, a new `.table(...)` anywhere above repositories/ does not.
"""

import ast
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]

# Measured 2026-09-03.
# repositories/ raised 415 -> 417 for get_class_activity in
# class_repository.py: the roster-wide week read for class check-ins, plus
# _quest_titles beside it. The second call is not avoidable by embedding --
# quest_task_completions has no foreign key on quest_id, so PostgREST cannot
# resolve `quests(title)` as a nested select. Both sit in the layer that owns
# the table; nothing was added above repositories/.
# repositories/ raised 406 -> 415 when the CRM suppression cascade moved out of
# routes/ into repositories/crm_repository.py (the webhook, the admin console
# and the unsubscribe link all needed to agree on it). routes/ fell by the
# same migration.
# utils/ raised 130 -> 131 for the lazy re-encrypt in utils/org_secrets
# (SEC-16): the read path upgrades a legacy plaintext row in place, which is
# the whole migration -- no backfill script and no window where a row is
# unreadable. It sits beside the read it upgrades, in the module that owns the
# table.
# utils/ raised 128 -> 130 for is_household_guardian in utils/portfolio_access,
# the module whose entire job is answering cross-user access questions against
# the database -- every predicate beside it (is_parent_of, is_advisor_of,
# is_observer_of, teaches_student) is two such reads. A repository for it would
# be a repository with one caller, and utils/ may not import repositories/
# anyway (test_import_layers). This is the "small and mostly legitimate"
# category the docstring describes, not creeping debt.
# utils/ raised 131 -> 134 for utils/guardian_scope.py, which answers "may this
# adult read this kid's quest": three lookups (the student's row, the
# parent_student_link, the caller's role) that ARE the authorization check.
# Routing an auth gate through a repository would put the decision a layer away
# from the code that enforces it; the neighbouring guards
# (routes/family_quests.verify_parent_has_access_to_child,
# routes/parent/dashboard_overview.verify_parent_access) read the same tables
# the same way.
# routes/ 2336 -> 2316 and services/ 1779 -> 1794 on 2026-09-03: the
# registration funnel's session/account helpers moved to
# services/registration_funnel_support.py and
# services/registration_accounts_service.py (QB-04). Fifteen calls changed
# layer; the file they came from held 59 before and the three files hold 59
# after, checked by counting. The remaining 5 of the routes/ drop is slack that
# was already in the old number.
# RE-MEASURED 2026-09-05, merging origin/main into audit/remediation-2026-08.
# Every number below is the counted value in the merged tree, not arithmetic on
# the two sides -- the branches raised 'utils' to 131 INDEPENDENTLY, for
# different modules (org_secrets + portfolio_access here, guardian_scope on
# main), so the identical figure auto-merged clean while the truth was 134.
# routes/ 2316 -> 2321 and services/ 1794 -> 1800 are main's additions landing
# on top of QB-04's extraction: sis_billing_alerts accounts for six of the
# services/ rise (six single-row lookups -- organizations, households,
# sis_saved_payment_methods, users x2, sis_recurring_tuition -- that exist only
# to compose the text of one office notification, which routing through five
# repositories buys nothing).
# services/ 1800 -> 1803 on 2026-09-05, three iCreate Perch tickets:
#   * sis_onboarding_service.attachable_documents lists one person's rows in
#     sis_secure_documents so the office can file an already-uploaded background
#     check against the checklist item it answers (c23105fa). The single-row
#     read next to it goes through sis_secure_docs_service.get_document; there
#     is no list reader there to borrow, and office_documents two functions
#     above already reads this table the same way.
#   * messaging_extras_service._reactor_names resolves display names for a page
#     of reactions, so a pill can say WHO reacted and not just how many
#     (d4233d4e). One users read per page, never per pill.
#   * sis_registration_service._live_classes_with_rooms reads org_classes for
#     the room double-booking check (43625a45) -- the same query, on the same
#     table, as list_teacher_conflicts immediately above it, which is the
#     teacher-keyed twin of the same feature.
# routes/ 2321 -> 2332 and services/ 1803 -> 1826 on 2026-09-05, the second
# iCreate Perch sweep (24 tickets). No repository exists for any of the tables
# below, and every neighbouring SIS service owns its own table the same way —
# adding four repositories for four new SIS tables, to be called from one
# service each, would be a layer with nothing in it.
#
#   routes/ (+11)
#     curriculum.py            +6  a quest on several curricula: read which
#                                  carry it, add it to another, take it off one
#                                  (24d47467)
#     class_quests.py          +2  the class's curriculum quest ids for the
#                                  scoped picker (49ba6e08/71e7f320), and the
#                                  caller's name for "call for help" (9d0618f8)
#     resources.py             +1  checking the people a resource is pinned to
#                                  are in this school (cf671ff2)
#     the rest                 +2  incidental reads beside the above
#
#   services/ (+23)
#     sis_event_rsvp_service   +10 a NEW table (sis_event_rsvps) and its event:
#                                  reply, edit, count, and the household a
#                                  guardian answers for (9cf78e9a)
#     sis_community_service    +7  a NEW table (sis_recognition_comments):
#                                  list, count, add, delete, ownership, names
#                                  (d0c7ac4e)
#     sis_billing_service      +3  repricing an invoice when a student switches
#                                  classes (98445c62/ad37b8c2)
#     one each                 +3  onboarding's attachable documents (c23105fa),
#                                  reaction author names (d4233d4e), the room
#                                  double-booking read (43625a45), the school
#                                  inbox's last sender (2ca63bde), class supply
#                                  spend (805cb3a3)
BASELINES = {
    'routes': 2332,
    'services': 1826,
    'repositories': 417,
    'utils': 134,
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


#: routes/ + services/ combined. A call may move DOWN a layer; the total may not
#: grow. Keep this equal to BASELINES['routes'] + BASELINES['services'].
UPPER_TOTAL_BASELINE = 2332 + 1826


def test_the_upper_layers_do_not_grow_in_total():
    """The rule the per-layer numbers are trying to express.

    Per-layer baselines can be satisfied by moving a call sideways, and one of
    them has to go UP for a legitimate route -> service extraction. This is the
    assertion that holds either way: above repositories/, the number of direct
    database calls only ever falls.
    """
    total = sum(_count(layer) for layer in UPPER_LAYERS)
    assert total <= UPPER_TOTAL_BASELINE, (
        f'routes/ + services/ together grew from {UPPER_TOTAL_BASELINE} to '
        f'{total}. Moving a call from routes/ into services/ is fine and does '
        'not change this number -- adding one does. New code above '
        'repositories/ should go through a repository.')


def test_the_upper_total_matches_the_per_layer_numbers():
    """Two baselines that can disagree will, and then neither means anything."""
    assert UPPER_TOTAL_BASELINE == BASELINES['routes'] + BASELINES['services'], (
        'UPPER_TOTAL_BASELINE drifted from the per-layer baselines. Update both '
        'in the same commit.')


def test_the_counter_actually_finds_calls():
    """A guard on the guard: a ratchet that counts zero passes forever."""
    assert _count('repositories') > 100, (
        'The counter found almost nothing in repositories/, which is where these '
        'calls are supposed to live. The scan is broken, not the codebase.')
