"""Ratchet: "is this person the child's parent?" has one definition.

A family is linked three ways -- `users.managed_by_parent_id`, an approved
`parent_student_links` row, and a guardian row in `household_members`. The
answer lives in `utils.portfolio_access.is_parent_of`, which
`utils.auth.relationships._parent` delegates to, so all 82
`allow=('parent', ...)` route tuples share it.

Until 2026-09-10 they did not share it. Eleven other places had each written
their own version, and most knew only the first two links -- so a guardian who
registered through the SIS funnel could pay their child's tuition and pick their
classes, and got a 403 from that same child's dashboard, their quest view, their
messages and their portfolio. The capability set a parent had depended on which
of three code paths had created the account, which is not a rule anyone could
explain to a family on the phone.

The failure mode is why this is a ratchet rather than a style note: a copy that
omits a link does not crash, it silently refuses a real parent on one screen
while the next screen lets them in.

This counts the direct reads of the two link tables outside the modules that own
them. The number may fall. It may not rise: if you need to know whether someone
is a parent, call is_parent_of.
"""

import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
SCAN_DIRS = ('routes', 'services', 'repositories', 'utils', 'jobs', 'middleware')

#: The modules that OWN the relationship question, plus the ones that write the
#: links rather than interpret them. A read here is the definition, not a copy.
CANONICAL = {
    Path('utils') / 'portfolio_access.py',      # is_parent_of, is_household_guardian
    Path('utils') / 'class_membership.py',      # the batched {student: guardians} form
    Path('services') / 'sis_parent_service.py',  # registerable_students, the SIS entry
}

#: Filters that mean "I am deciding a parent-child relationship myself".
PATTERNS = (
    re.compile(r"""\.eq\(\s*['"]managed_by_parent_id['"]"""),
    re.compile(r"""\.table\(\s*['"]parent_student_links['"]"""),
    # The SQL function behind the old /api/dependents/my-dependents read: two
    # links, no households. Mobile's Family tab was fed by it until 2026-09-15.
    re.compile(r"""\.rpc\(\s*['"]get_parent_dependents['"]"""),
    # Repository methods that each answered the question with two links.
    re.compile(r"""\.find_parents\("""),
    re.compile(r"""\.find_children\("""),
    re.compile(r"""\.managing_parents\("""),
    re.compile(r"""\.approved_links\("""),
)

#: Measured 2026-09-10, after the seven access checks named in the plan started
#: delegating. This is NOT a clean number and is not claimed to be: most of the
#: survivors legitimately WRITE or LIST the links rather than decide access from
#: them -- routes/parent_linking (the request-and-approve flow), the observer
#: routes (a different relationship entirely), the admin tools, the registration
#: funnel, roster import -- but some are access checks that have not been swept
#: yet: portfolio_service, bounty_service, sis/goals.py, family_student_service.
#:
#: The number is here to stop it GROWING while that sweep happens. Lower it as
#: each one moves over.
#:
#: 2026-09-15: 115 -> 107 after notification_service, announcement_service,
#: sis/goals.py, the weekly digest and the my-children / my-dependents routes
#: moved over, and the five extra patterns
#: above were added (they matched nothing new once those four were done).
BASELINE = 107


def _count():
    total = 0
    hits = []
    for directory in SCAN_DIRS:
        for path in sorted((BACKEND / directory).glob('**/*.py')):
            if '__pycache__' in path.parts:
                continue
            if path.relative_to(BACKEND) in CANONICAL:
                continue
            source = path.read_text(encoding='utf-8', errors='replace')
            for pattern in PATTERNS:
                found = len(pattern.findall(source))
                if found:
                    total += found
                    hits.append(f'{path.relative_to(BACKEND)}: {found}')
    return total, hits


def test_parent_relationship_checks_do_not_multiply():
    count, hits = _count()
    assert count <= BASELINE, (
        f'Direct parent-link reads grew from {BASELINE} to {count}.\n\n'
        'If you are deciding whether someone may act for a child, call '
        'utils.portfolio_access.is_parent_of -- it knows all three links, and a '
        'hand-rolled check that misses one refuses a real parent on one screen '
        'while another screen lets them in.\n\n'
        'If you are genuinely writing or listing the links (parent_linking, an '
        'admin tool, the registration funnel), raise BASELINE in the same '
        'commit and say which.\n\nCurrent:\n  ' + '\n  '.join(hits)
    )


def test_the_canonical_modules_exist():
    """A stale path here would silently exempt nothing and hide a real copy."""
    missing = [str(p) for p in CANONICAL if not (BACKEND / p).exists()]
    assert not missing, f'CANONICAL names files that no longer exist: {missing}'


#: Bodies that once carried their own two-link copy and now must call the
#: resolver. (file, function name, resolver name it must call.) Each of these
#: fed a family-facing surface -- the bell, the announcement fan-out, the goals
#: page, the weekly digest -- so a regression here is a guardian who is let
#: into the child's dashboard and never told about the child's work.
NAMED_READERS = (
    (Path('services') / 'notification_service.py', 'get_parents_for_student', 'guardians_by_student'),
    (Path('services') / 'announcement_service.py', 'recipients_by_role', 'parents_of_students'),
    (Path('services') / 'parent_weekly_digest_service.py', '_guardians', 'guardians_by_student'),
    (Path('routes') / 'sis' / 'goals.py', '_my_student_ids', 'children_of_parent'),
    (Path('routes') / 'sis' / 'goals.py', '_parent_ids_for_student', 'parents_of_students'),
)


def _function_body(source: str, name: str) -> str:
    """The text of `def name(` up to the next def or class at the same or a
    shallower indentation (a nested helper inside it stays part of it)."""
    head = f'def {name}('
    assert head in source, f'{name} is gone; update NAMED_READERS'
    before, after = source.split(head, 1)
    indent = len(before.rsplit('\n', 1)[-1])
    lines = after.split('\n')
    body = [lines[0]]
    for line in lines[1:]:
        stripped = line.lstrip()
        if stripped.startswith(('def ', 'class ', '@')) and len(line) - len(stripped) <= indent:
            break
        body.append(line)
    return '\n'.join(body)


def test_named_readers_call_the_resolver():
    for rel, fn, resolver in NAMED_READERS:
        body = _function_body((BACKEND / rel).read_text(encoding='utf-8'), fn)
        assert f'{resolver}(' in body, (
            f'{rel}::{fn} no longer calls {resolver}. It used to keep its own '
            'two-link copy of "who is this child\'s parent", which skipped '
            'household-only guardians. Call the resolver.'
        )
        for pattern in PATTERNS:
            assert not pattern.search(body), f'{rel}::{fn} reads a link table directly'


def test_the_relationship_gate_delegates_to_the_one_definition():
    """`_parent` is what 82 route tuples resolve through. If it ever stops
    calling is_parent_of, every one of them quietly narrows at once."""
    source = (BACKEND / 'utils' / 'auth' / 'relationships.py').read_text()
    parent_fn = source.split('def _parent(')[1].split('def ')[0]
    assert 'is_parent_of' in parent_fn
