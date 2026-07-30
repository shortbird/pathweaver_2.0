"""
Guard the `message_content` column name in PostgREST select strings.

`direct_messages` and `group_messages` both store the body in
**message_content**, but the API and the frontend both call the field
`content` (`ParentMessageViewer` renders `message.content`). The two are bridged
with a PostgREST alias — `content:message_content`.

Selecting a bare `content` from either table is a 42703 at runtime
("column group_messages.content does not exist"), and unit tests cannot catch it
because they mock the client: the select string is just an opaque argument, never
parsed by anything until production. That is exactly how the parent group-message
endpoint shipped broken while the direct-message endpoint 80 lines above it was
correct.

So this checks the select strings as text. It is a cheap stand-in for the schema
awareness CLAUDE.md rule 4 asks for by hand.
"""

from __future__ import annotations

import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]

SCAN_DIRS = [BACKEND / 'routes', BACKEND / 'services', BACKEND / 'repositories']

# Tables whose body column is `message_content`, not `content`.
TABLES = ('direct_messages', 'group_messages')

# A .table('<one of TABLES>') ... .select( '...' ) pair. Selects are sometimes
# triple-quoted across several lines, so match non-greedily through newlines.
_SELECT_RE = re.compile(
    r"""table\(\s*['"](?P<table>%s)['"]\s*\).*?select\(\s*"""
    r"""(?P<q>'''|\"\"\"|'|")(?P<cols>.*?)(?P=q)"""
    % '|'.join(TABLES),
    re.DOTALL,
)

# A bare `content` column reference: not preceded by `:` (the alias target in
# `content:message_content`) and not part of `message_content`.
_BARE_CONTENT_RE = re.compile(r'(?<![:\w])content(?!\s*:)(?![\w])')


def _findings() -> list[str]:
    out: list[str] = []
    for base in SCAN_DIRS:
        if not base.exists():
            continue
        for path in sorted(base.rglob('*.py')):
            if '__pycache__' in path.parts:
                continue
            text = path.read_text(encoding='utf-8')
            for m in _SELECT_RE.finditer(text):
                cols = m.group('cols')
                if '*' in cols:
                    continue  # select('*') returns the real column, fine
                if _BARE_CONTENT_RE.search(cols):
                    line = text[:m.start('cols')].count('\n') + 1
                    out.append(
                        f"{path.relative_to(BACKEND)}:{line} selects a bare "
                        f"`content` from {m.group('table')}"
                    )
    return out


def test_message_tables_are_never_selected_with_a_bare_content_column():
    findings = _findings()
    assert not findings, (
        'These queries select `content` from a table whose column is '
        '`message_content`, which is a 42703 at runtime. Use the alias '
        '`content:message_content` so the response keeps the field name the '
        'frontend renders:\n  ' + '\n  '.join(findings)
    )


def test_the_detector_actually_catches_the_shipped_regression():
    """Pin the detector against the real bug and its correct form, so a future
    refactor can't quietly turn this into a test that always passes."""
    broken = """
        messages = supabase.table('group_messages').select('''
            id, sender_id, content, created_at,
            sender:sender_id(id, display_name)
        ''').eq('group_id', group_id).execute()
    """
    fixed = broken.replace('content,', 'content:message_content,')

    assert _BARE_CONTENT_RE.search(_SELECT_RE.search(broken).group('cols'))
    assert not _BARE_CONTENT_RE.search(_SELECT_RE.search(fixed).group('cols'))
    # And `message_content` on its own must never look like a bare `content`.
    assert not _BARE_CONTENT_RE.search('id, message_content, created_at')
