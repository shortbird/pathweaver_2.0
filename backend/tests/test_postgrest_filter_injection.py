"""Lint guard: nothing may interpolate a raw value into a PostgREST filter string.

`.or_()` / `.and_()` take a RAW FILTER STRING, not bound parameters:

    .or_(f"title.ilike.%{search}%,big_idea.ilike.%{search}%")

supabase-py forwards that string to PostgREST verbatim. The grammar is
`column.operator.value`, with `,` separating top-level conditions and
`and(...)` / `or(...)` grouping them -- so a comma inside a VALUE is not
escaped, it ends the condition and starts a new one. Searching for
`x,is_public.eq.true` ORs in a clause the query never asked for. On a listing
endpoint that means returning rows the caller was never entitled to, and
nothing anywhere raises: the query just quietly answers a different question.

Before this guard, every user-facing callsite happened to sanitize correctly,
but the safety was per-callsite rather than by construction. The next
`.or_(f"...")` anyone wrote was unprotected by default and nothing failed. This
test makes the omission loud: every `{...}` inside a filter string must be a
call to one of the `pgrst_*` helpers in utils/validation/sanitizers.py, or be
named in ALLOWED_NAMES below with a reason.

Written in the spirit of tests/test_secret_exposure_guard.py and
frontend/src/utils/__tests__/dangerouslySetInnerHTML.lint.test.js: pure static
analysis over the source tree, no database, no Flask app, no network.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from utils.validation.sanitizers import (
    PostgrestFilterError,
    pgrst_enum,
    pgrst_int,
    pgrst_pattern,
    pgrst_timestamp,
    pgrst_uuid,
    pgrst_uuid_list,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]

# The builders that take a raw filter string.
_FILTER_CALL = re.compile(r'\.(?:or_|and_)\s*\(')

# An f-string placeholder. `{{` is a literal brace, not a placeholder.
_PLACEHOLDER = re.compile(r'(?<!\{)\{([^{}]+)\}')

# Bare names that are already proven safe on the line that produced them.
# Each entry must say WHY -- "it looked fine" is how the original hole shipped.
ALLOWED_NAMES = {
    # backend/repositories/organization_repository.py: assigned two lines above
    # from pgrst_enum(role, [r.value for r in OrgRole]).
    'safe_role',
    # backend/routes/sis/events.py: assigned from pgrst_timestamp(request.args
    # ['from']) inside a try/except that 400s on a bad value.
    'f',
    # backend/services/sis_parent_service.py: assigned from
    # pgrst_timestamp(from_iso) on the line above.
    '_from',
    # backend/routes/auth/oauth.py: a sha256 hexdigest
    # (hashlib.sha256(token.encode()).hexdigest(), line ~430), so it is
    # structurally incapable of carrying a filter metacharacter. Left as a
    # bare name rather than migrated because backend/routes/auth/** is owned by
    # a concurrent workstream; migrate it to pgrst_* when that lands.
    'token_hash',
}

# Files this guard does not read.
SKIP_DIRS = {'tests', 'migrations', 'node_modules', '__pycache__', 'venv'}


def _python_sources():
    for path in BACKEND_ROOT.rglob('*.py'):
        if any(part in SKIP_DIRS for part in path.relative_to(BACKEND_ROOT).parts):
            continue
        yield path


def _call_argument_span(text: str, open_paren: int) -> str:
    """Return the source between a call's parentheses, respecting nesting."""
    depth = 0
    for i in range(open_paren, len(text)):
        if text[i] == '(':
            depth += 1
        elif text[i] == ')':
            depth -= 1
            if depth == 0:
                return text[open_paren + 1:i]
    return text[open_paren + 1:]


def _offenders_in(text: str):
    """Yield (line_number, placeholder_expression) for each unguarded value."""
    for match in _FILTER_CALL.finditer(text):
        open_paren = match.end() - 1
        argument = _call_argument_span(text, open_paren)
        for placeholder in _PLACEHOLDER.finditer(argument):
            expression = placeholder.group(1).strip()
            if 'pgrst_' in expression:
                continue
            if expression in ALLOWED_NAMES:
                continue
            line = text.count('\n', 0, open_paren + placeholder.start()) + 1
            yield line, expression


# ── the guard ────────────────────────────────────────────────────────────────

def test_no_raw_interpolation_reaches_a_postgrest_filter_string():
    offenders = []
    for path in _python_sources():
        text = path.read_text(encoding='utf-8', errors='ignore')
        if not _FILTER_CALL.search(text):
            continue
        # sanitizers.py documents the hole in its own docstrings.
        if path.name == 'sanitizers.py':
            continue
        for line, expression in _offenders_in(text):
            offenders.append(f"{path.relative_to(BACKEND_ROOT)}:{line}  -> {{{expression}}}")

    assert not offenders, (
        "These values are interpolated straight into a PostgREST filter string. "
        "A comma in the value ends the clause and starts another one, silently "
        "widening the query:\n  "
        + '\n  '.join(sorted(offenders))
        + "\n\nWrap each value in the helper that matches what it IS "
          "(utils.validation.sanitizers):\n"
          "  pgrst_uuid / pgrst_uuid_list  - ids\n"
          "  pgrst_timestamp               - date or datetime bounds\n"
          "  pgrst_int                     - numeric bounds\n"
          "  pgrst_enum                    - a value from a known set\n"
          "  pgrst_pattern                 - free text inside an ilike pattern"
    )


def test_the_guard_actually_catches_a_raw_interpolation():
    """A lint test that cannot fail is worse than no lint test."""
    raw = '''
    query = query.or_(f"title.ilike.%{search}%,big_idea.ilike.%{search}%")
    '''
    assert [e for _, e in _offenders_in(raw)] == ['search', 'search']


def test_the_guard_accepts_a_helper_wrapped_interpolation():
    guarded = '''
    query = query.or_(
        f'title.ilike.%{pgrst_pattern(search)}%,'
        f'created_by.eq.{pgrst_uuid(user_id, "user_id")}'
    )
    '''
    assert list(_offenders_in(guarded)) == []


def test_the_guard_reads_across_a_multi_line_call():
    """The real callsites span lines; a line-at-a-time scanner would miss them."""
    raw = '''
    query = query.or_(
        f'organization_id.eq.{org_id},'
        f'created_by.eq.{user_id}'
    )
    '''
    assert sorted(e for _, e in _offenders_in(raw)) == ['org_id', 'user_id']


# ── the helpers themselves ───────────────────────────────────────────────────

class TestPgrstPattern:
    def test_a_comma_cannot_start_a_new_clause(self):
        """The injection the whole guard exists for."""
        assert ',' not in pgrst_pattern('robotics,is_public.eq.true')

    def test_grouping_and_quoting_characters_are_removed(self):
        cleaned = pgrst_pattern('a(b)c"d\\e')
        assert not set(cleaned) & set(',()"\\')

    def test_user_supplied_wildcards_cannot_widen_the_match(self):
        assert '%' not in pgrst_pattern('%%%')
        assert '*' not in pgrst_pattern('***')

    def test_ordinary_search_text_survives_intact(self):
        assert pgrst_pattern('  intro to robotics ') == 'intro to robotics'

    def test_stripping_does_not_glue_words_together(self):
        assert pgrst_pattern('robotics,physics') == 'robotics physics'

    def test_empty_input_is_empty_output(self):
        assert pgrst_pattern(None) == ''
        assert pgrst_pattern('') == ''


class TestPgrstUuid:
    def test_a_uuid_passes_through_unchanged(self):
        value = '123e4567-e89b-12d3-a456-426614174000'
        assert pgrst_uuid(value) == value

    @pytest.mark.parametrize('bad', [
        '123e4567-e89b-12d3-a456-426614174000,is_public.eq.true',
        'a', '', None, 'not-a-uuid', '../../etc/passwd',
    ])
    def test_anything_that_is_not_a_uuid_raises(self, bad):
        with pytest.raises(PostgrestFilterError):
            pgrst_uuid(bad)

    def test_a_list_is_validated_element_by_element(self):
        good = '123e4567-e89b-12d3-a456-426614174000'
        assert pgrst_uuid_list([good, good]) == f'{good},{good}'
        with pytest.raises(PostgrestFilterError):
            pgrst_uuid_list([good, 'id.eq.1'])


class TestPgrstTimestamp:
    @pytest.mark.parametrize('good', [
        '2026-08-15',
        '2026-08-15T10:30:00',
        '2026-08-15T10:30:00Z',
        '2026-08-15T10:30:00.123456+00:00',
        '2026-08-15 10:30',
    ])
    def test_iso_forms_pass_through(self, good):
        assert pgrst_timestamp(good) == good

    def test_a_date_object_is_rendered(self):
        from datetime import date
        assert pgrst_timestamp(date(2026, 8, 15)) == '2026-08-15'

    @pytest.mark.parametrize('bad', [
        '2026-08-15,is_public.eq.true', 'yesterday', '', None,
    ])
    def test_anything_else_raises(self, bad):
        with pytest.raises(PostgrestFilterError):
            pgrst_timestamp(bad)


class TestPgrstEnumAndInt:
    def test_membership_is_the_escape(self):
        assert pgrst_enum('org_admin', ['org_admin', 'student']) == 'org_admin'
        with pytest.raises(PostgrestFilterError):
            pgrst_enum('org_admin,is_public.eq.true', ['org_admin', 'student'])

    def test_an_integer_bound_is_validated(self):
        assert pgrst_int('42') == '42'
        assert pgrst_int(42) == '42'
        with pytest.raises(PostgrestFilterError):
            pgrst_int('42,is_public.eq.true')
