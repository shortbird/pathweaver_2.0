"""The diploma credit contract has one definition, and the backend reads it.

`shared/data/credits.json` holds three facts that the web app and this process
both act on, and that used to be written out separately in each:

  - XP_PER_CREDIT (2000), which was declared in five backend modules and once
    on the web,
  - the per-subject credit requirement adding to 24, which
    services/credit_mapping_service.py carried under a comment reading
    "Aligned with web/src/utils/creditRequirements.js",
  - the formal transcript names ('Mathematics', not 'Math'), which were in
    routes/public.py, routes/admin/transcript_generator.py and the web table.

What a copy of this costs is on the record. The web guard test
(studentContextCredits.test.jsx) says two of four copies of the requirement
table claimed Social Studies was 3.5 against the 4.0 the others said, and
nothing caught it because two of the copies were never read. A student's
transcript and a student's progress bar are two answers to the same question,
and a family notices when they differ.

This file asserts the backend consumers still resolve to the generated module,
which is what stops a copy coming back. Whether the generated module matches
the JSON is CI's job, not this file's: `npm run generate:check` re-runs the
generator and diffs the result.
"""

import json
from pathlib import Path

from generated.credits import (
    DIPLOMA_CREDIT_REQUIREMENTS,
    ELECTIVE_SUBJECT,
    TOTAL_CREDITS_REQUIRED,
    TRANSCRIPT_SUBJECT_NAMES,
    XP_PER_CREDIT,
)
from generated.subjects import SUBJECT_KEYS

CANONICAL = Path(__file__).resolve().parents[3] / 'shared' / 'data' / 'credits.json'


def _canonical():
    with CANONICAL.open() as fh:
        return json.load(fh)


def test_the_generated_module_matches_the_json_it_came_from():
    data = _canonical()
    assert XP_PER_CREDIT == data['xpPerCredit']
    assert TOTAL_CREDITS_REQUIRED == data['totalCreditsRequired']
    assert ELECTIVE_SUBJECT == data['electiveSubject']
    assert DIPLOMA_CREDIT_REQUIREMENTS == {s['key']: s['credits'] for s in data['subjects']}
    assert TRANSCRIPT_SUBJECT_NAMES == {s['key']: s['transcriptName'] for s in data['subjects']}


def test_the_requirements_cover_exactly_the_school_subjects():
    # A subject with no credit requirement can never be completed, and a
    # requirement for a subject that does not exist is credit nobody can earn.
    assert set(DIPLOMA_CREDIT_REQUIREMENTS) == set(SUBJECT_KEYS)
    assert set(TRANSCRIPT_SUBJECT_NAMES) == set(SUBJECT_KEYS)


def test_the_requirements_add_up_to_the_diploma():
    assert round(sum(DIPLOMA_CREDIT_REQUIREMENTS.values()), 2) == TOTAL_CREDITS_REQUIRED


def test_the_credit_service_reads_the_generated_table():
    from services.credit_mapping_service import CreditMappingService
    assert CreditMappingService.XP_PER_CREDIT == XP_PER_CREDIT
    assert CreditMappingService.DIPLOMA_REQUIREMENTS == DIPLOMA_CREDIT_REQUIREMENTS


def test_every_backend_xp_per_credit_is_the_same_number():
    import routes.admin.transcript_generator as transcript_generator
    import routes.public as public
    import services.transfer_credit_service as transfer_credit_service

    for module in (transcript_generator, public, transfer_credit_service):
        assert module.XP_PER_CREDIT == XP_PER_CREDIT, module.__name__


def test_both_transcript_routes_print_the_same_subject_names():
    # These two render the same document -- one for an admin, one behind a
    # public share link -- and each used to build its own name map inside the
    # handler. A share link showing 'Math' where the admin PDF says
    # 'Mathematics' is the kind of difference a registrar rejects.
    import routes.admin.transcript_generator as transcript_generator

    assert transcript_generator.SUBJECT_DISPLAY_NAMES == TRANSCRIPT_SUBJECT_NAMES


def test_transcript_names_are_the_long_form_where_the_picker_is_short():
    """The two vocabularies are different on purpose, and both are real.

    A transcript says 'Mathematics'; a subject picker says 'Math'. Unifying
    them would be a product decision, not a refactor -- so this pins the three
    places they diverge, which is what stops someone 'fixing' the difference by
    pointing one at the other.
    """
    from generated.subjects import SUBJECT_NAMES

    assert SUBJECT_NAMES['math'] == 'Math'
    assert TRANSCRIPT_SUBJECT_NAMES['math'] == 'Mathematics'
    assert SUBJECT_NAMES['pe'] == 'PE'
    assert TRANSCRIPT_SUBJECT_NAMES['pe'] == 'Physical Education'
    assert SUBJECT_NAMES['cte'] == 'CTE'
    assert TRANSCRIPT_SUBJECT_NAMES['cte'] == 'Career & Technical Education'


def test_no_backend_module_writes_the_conversion_rate_out_again():
    """A ratchet on the LITERAL, not on the name.

    Every one of the six previous declarations spelled `2000` near the word
    credit. Importing the constant is free; typing the number is what let them
    drift, so the number itself is what this looks for.

    AST rather than a text scan, for the reason
    tests/unit/test_admin_client_justified.py records about its own rewrite: a
    line-based version of this flagged three module docstrings explaining the
    rate and missed nothing real, which is the shape of a check people learn to
    ignore. Walking the tree skips string contents for free and sees the
    assignment inside a function body -- which is exactly where the sixth copy
    was hiding (services/portfolio_service.py, a local inside a method).
    """
    import ast

    backend = Path(__file__).resolve().parents[2]
    allowed = {
        # The canonical value has to be written down somewhere.
        'generated/credits.py',
    }
    offenders = []
    for path in sorted(backend.rglob('*.py')):
        rel = path.relative_to(backend).as_posix()
        if rel.startswith(('tests/', 'scripts/')) or rel in allowed:
            continue
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'))
        except SyntaxError:
            continue
        # Anchor each literal to the statement that OWNS it, so "is this about
        # credits" is asked of that statement and not of an ancestor. Without
        # the stop-at-nested-statement rule below, every literal in a function
        # body is also attributed to the `def` and to each enclosing `if`, and
        # a route decorated `@bp.route('/award-credit')` reports as an offender
        # because of a number twenty lines further down.
        def owned(stmt):
            stack = list(ast.iter_child_nodes(stmt))
            while stack:
                node = stack.pop()
                if isinstance(node, ast.stmt):
                    continue          # belongs to that statement, not this one
                yield node
                stack.extend(ast.iter_child_nodes(node))

        for stmt in ast.walk(tree):
            if not isinstance(stmt, ast.stmt) or isinstance(stmt, ast.Expr):
                continue
            if not any(
                isinstance(n, ast.Constant) and n.value == XP_PER_CREDIT
                for n in owned(stmt)
            ):
                continue
            head = ast.unparse(stmt).splitlines()[0]
            if 'credit' in head.lower():
                offenders.append(f'{rel}:{stmt.lineno}: {head}')
    assert not offenders, (
        'These write the XP-per-credit rate out again instead of importing '
        'generated.credits.XP_PER_CREDIT:\n  ' + '\n  '.join(offenders)
    )
