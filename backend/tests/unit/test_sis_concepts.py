"""The backend half of the SIS concept manifest (shared/sisConcepts.json).

Between 2026-06-23 and 2026-09-10 the SIS console was built in eleven one-day
rounds, and each round added a feature next to the one that already did most
of the job: seven Stripe checkout sites, twenty-seven copies of one org helper,
eleven files that write the family hold. The audit that counted them
(docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md) found, on re-checking three
days later, that four findings had been fixed upstream and seventeen new
duplicates had appeared. Whatever merges them (docs/sis/CONSOLIDATION_PLAN.md)
loses to the feature cadence unless the count is frozen first.

So: one manifest names every concept, its owner, and the pattern that spells a
copy of it. This test takes the rows with a `forbid.backend` and, per row,
asserts a ceiling (no more copies than the baseline), a floor (no fewer -- a
scan that stops matching passes forever, and a copy that was genuinely removed
lowers the baseline in the same commit), and freshness (owners exist unless
the row says they are proposed; a proposed row whose owners have all arrived
must drop the flag).

The failing message prints every offending path:line and the row's
`use_instead` sentence, which is the documentation a session reads at the
moment it is about to write another copy. web/src/__tests__/sisConcepts.test.js
and mobile/src/__tests__/sisConcepts.test.ts do the same for their sides; the
scanning rules here and there must agree, and the manifest's `_comment` is the
contract all three follow.

Manifest fields the scanner honours, per side: `pattern` (a regular expression
applied line by line, after comments and docstrings are blanked), `dirs` (scan
roots relative to backend/; a file path scans that file; a prefix such as
`services/sis_` scans the files that start with it), `files` (paths whose mere
existence counts one each), `unit` ('lines' or 'files'), and `exempt` (paths
left out of the count, defaulting to the row's owners).
"""

import json
import os
import re
from datetime import date
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
MANIFEST = BACKEND.parent / 'shared' / 'sisConcepts.json'
SIDE = 'backend'

SKIP_DIRS = {'__pycache__', 'tests', '.venv', 'venv', 'node_modules'}
TEST_FILE = re.compile(r'(^|/)(test_[^/]*|[^/]*_test)\.py$')


def _manifest():
    with MANIFEST.open(encoding='utf-8') as fh:
        return json.load(fh)


def _rows():
    return [r for r in _manifest()['concepts'] if SIDE in r.get('forbid', {})]


def code_lines(text: str):
    """The file's lines with comments and docstrings blanked, positions kept.

    Line-by-line on purpose: a pattern that mentions `checkout.Session.create`
    must not count the sentence in a docstring that says not to call it. A
    triple-quoted block is tracked by toggling on lines that carry an odd
    number of `\"\"\"` / `'''`; a line that opens and closes one is blanked
    too. A `#` at the start of the line is a comment; two spaces and a `#`
    later in the line is an inline comment (PEP 8's spelling), and the text
    after it is dropped.
    """
    out = []
    in_doc = False
    for line in text.split('\n'):
        stripped = line.lstrip()
        triples = line.count('"""') + line.count("'''")
        if in_doc:
            if triples % 2 == 1:
                in_doc = False
            out.append('')
            continue
        if triples:
            if triples % 2 == 1:
                in_doc = True
            out.append('')
            continue
        if stripped.startswith('#'):
            out.append('')
            continue
        idx = line.find('  #')
        out.append(line[:idx] if idx >= 0 else line)
    return out


def _files_under(rel: str):
    """Source files a `dirs` entry names: a directory, one file, or a prefix."""
    base = BACKEND / rel
    if base.is_file():
        yield rel
        return
    if not base.is_dir():
        parent, prefix = os.path.split(rel)
        pdir = BACKEND / parent
        if pdir.is_dir():
            for name in sorted(os.listdir(pdir)):
                if name.startswith(prefix) and name.endswith('.py'):
                    yield f'{parent}/{name}' if parent else name
        return
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            if not name.endswith('.py'):
                continue
            rel_path = Path(dirpath, name).relative_to(BACKEND).as_posix()
            if TEST_FILE.search(rel_path):
                continue
            yield rel_path


def scan(row) -> list:
    """Every copy of the concept on this side, as path:line (or path)."""
    forbid = row['forbid'][SIDE]
    exempt = set(forbid.get('exempt', row.get('owner', {}).get(SIDE, [])))
    hits = []
    if forbid.get('pattern'):
        rx = re.compile(forbid['pattern'])
        seen = set()
        for entry in forbid.get('dirs', []):
            for rel in _files_under(entry):
                if rel in seen or rel in exempt:
                    continue
                seen.add(rel)
                text = (BACKEND / rel).read_text(encoding='utf-8', errors='replace')
                for number, line in enumerate(code_lines(text), 1):
                    if rx.search(line):
                        hits.append(f'{rel}:{number}')
    if forbid.get('unit') == 'files':
        hits = sorted({h.rsplit(':', 1)[0] for h in hits})
    for rel in forbid.get('files', []):
        if (BACKEND / rel).exists():
            hits.append(f'{rel} (exists)')
    return hits


def _explain(row, hits) -> str:
    listing = '\n'.join(f'    {h}' for h in hits) or '    (none)'
    return (
        f"\n\nConcept `{row['id']}`: {row['means']}\n"
        f"Owner: {', '.join(row.get('owner', {}).get(SIDE, [])) or '(none on this side)'}"
        f"{' (proposed; created by ' + row['lowered_by'] + ')' if row.get('proposed') else ''}\n"
        f"Copies found:\n{listing}\n"
        f"Use instead: {row['use_instead']}\n"
        f"Manifest: shared/sisConcepts.json (lowered by {row['lowered_by']})."
    )


ROWS = _rows()
IDS = [r['id'] for r in ROWS]


def test_manifest_is_well_formed():
    """The three side tests share this file; a malformed row is invisible to
    all of them unless something reads every field."""
    data = _manifest()
    ids = [r['id'] for r in data['concepts']]
    assert len(ids) == len(set(ids)), 'duplicate concept ids in shared/sisConcepts.json'
    for row in data['concepts']:
        for key in ('id', 'means', 'baseline', 'measured', 'lowered_by', 'use_instead'):
            assert key in row, f"{row.get('id')}: missing `{key}`"
        assert 'forbid' in row or 'enforced_by' in row, (
            f"{row['id']}: a row needs a `forbid` pattern or an `enforced_by` test")
        for side, cfg in row.get('forbid', {}).items():
            assert side in row['baseline'], f"{row['id']}: `forbid.{side}` has no `baseline.{side}`"
            assert cfg.get('pattern') or cfg.get('files'), (
                f"{row['id']}.{side}: a `forbid` needs a `pattern` or `files`")
            if cfg.get('pattern'):
                assert cfg.get('dirs'), f"{row['id']}.{side}: `pattern` needs `dirs`"
                re.compile(cfg['pattern'])
            assert cfg.get('unit', 'lines') in ('lines', 'files'), f"{row['id']}.{side}: bad `unit`"
        date.fromisoformat(row['measured'])
        for side, n in row['baseline'].items():
            assert isinstance(n, int) and n >= 0, f"{row['id']}: baseline.{side} must be a non-negative integer"


@pytest.mark.parametrize('row', ROWS, ids=IDS)
def test_no_new_copies(row):
    """Ceiling: the concept may not gain another copy."""
    hits = scan(row)
    baseline = row['baseline'][SIDE]
    assert len(hits) <= baseline, (
        f"{len(hits)} copies of `{row['id']}` against a baseline of {baseline}."
        + _explain(row, hits))


@pytest.mark.parametrize('row', ROWS, ids=IDS)
def test_baseline_still_means_something(row):
    """Floor: a copy that was removed lowers the baseline in the same commit.

    Slack below the real number is the fraction of a fix that can be undone
    without anything failing, and a scan that finds nothing looks exactly
    like success (RATCHETS.md rule 3). The baselines here are small, so the
    floor is exact.
    """
    hits = scan(row)
    baseline = row['baseline'][SIDE]
    assert len(hits) >= baseline, (
        f"Only {len(hits)} copies of `{row['id']}` against a baseline of {baseline}. "
        f"If a copy was genuinely removed, lower baseline.{SIDE} to {len(hits)} in "
        f"shared/sisConcepts.json in this commit. If not, the scan is broken: "
        f"check `forbid.{SIDE}.dirs` and the pattern." + _explain(row, hits))


@pytest.mark.parametrize('row', ROWS, ids=IDS)
def test_owner_is_fresh(row):
    """An owner that does not exist is a plan, and the row says so with
    `proposed`; the move that ships it drops the flag in the same commit."""
    owners = row.get('owner', {}).get(SIDE, [])
    if not owners:
        return
    missing = [o for o in owners if not (BACKEND / o).exists()]
    if row.get('proposed'):
        assert missing, (
            f"`{row['id']}` is marked proposed but every backend owner exists "
            f"({', '.join(owners)}). {row['lowered_by']} has shipped: remove `proposed`.")
    else:
        assert not missing, (
            f"`{row['id']}` names an owner that does not exist: {', '.join(missing)}. "
            f"Either the canonical module moved (update the row) or the row should say "
            f"`proposed: true` and name the move that creates it.")


def test_the_scan_reads_real_files():
    """A guard on the guard: the scanner and its comment stripper see code."""
    scanned = list(_files_under('services'))
    assert len(scanned) > 100, f'only {len(scanned)} files under services/ -- the walk is broken'
    assert not any(TEST_FILE.search(p) for p in scanned), 'test files leaked into the scan'
    billing = code_lines((BACKEND / 'services' / 'sis_billing_service.py').read_text(encoding='utf-8'))
    assert sum(1 for line in billing if line.strip()) > 1000, 'the stripper blanked the code, not just the comments'


def test_comment_stripping_rules():
    """The rules the pattern rows depend on, stated once."""
    src = (
        'def f():\n'
        '    """Doc mentioning checkout.Session.create( in prose."""\n'
        '    x = 1  # trailing checkout.Session.create( is a comment\n'
        '    # checkout.Session.create( on its own line\n'
        '    """\n'
        '    a longer docstring with checkout.Session.create(\n'
        '    """\n'
        '    return stripe.checkout.Session.create(x)\n'
    )
    lines = code_lines(src)
    assert [i for i, l in enumerate(lines, 1) if 'checkout.Session.create(' in l] == [8]
    assert lines[2] == '    x = 1'
