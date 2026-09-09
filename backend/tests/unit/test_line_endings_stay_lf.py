"""Guard: nothing is committed with CRLF line endings (OPS-09).

The repository accumulated 883 CRLF files out of 3,555 -- it began on Windows
and moved to macOS, so the line ending a file carried recorded which machine
last rewrote it and nothing else. `.gitattributes` landed 2026-09-07 and the
one-shot `git add --renormalize .` landed 2026-09-08 as commit 5638a977, 879
files. `.git-blame-ignore-revs` carries that SHA.

What it cost while it lasted, so this reads as more than tidiness:

  * Whole-file diffs. An editor that rewrites line endings on save turns a
    one-line change into a diff touching every line, review becomes impossible,
    and git blame attributes the whole file to that commit.
  * Merge conflicts with no semantic content -- the failure mode most likely to
    hit whoever merges a long-lived branch.
  * Silent breakage in anything that compares file content byte for byte,
    including this audit's own move-verification scripts.

`.gitattributes` normalizes a file the next time somebody STAGES it, which is
almost the whole job -- but "almost" is doing work there. A file marked
`-text`, a `binary` line added to `.gitattributes` for something that is
actually text, or a blob written by a tool that bypasses the filter all put
CRLF back in the index, and nothing would say so. Verifying it once (which is
what CLOSED_FINDINGS.md records) proves it was true on 2026-09-08.

Reads the INDEX, not the working tree. `git ls-files --eol` prints both, and
they legitimately differ: a file already on disk with CRLF keeps it until git
next checks it out. On 2026-09-09 the index was 100% LF while ~790 files on
disk were still CRLF, and nothing was wrong -- what gets committed, diffed and
merged is the index.
"""

import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]


def _ls_files_eol():
    """`git ls-files --eol` as (index_eol, path) pairs."""
    out = subprocess.run(
        ['git', 'ls-files', '--eol'],
        cwd=REPO_ROOT, capture_output=True, text=True, check=True,
    ).stdout
    rows = []
    for line in out.splitlines():
        # i/lf    w/crlf  attr/text=auto      path/to/file
        parts = line.split('\t')
        if len(parts) < 2:
            continue
        fields = parts[0].split()
        if not fields or not fields[0].startswith('i/'):
            continue
        rows.append((fields[0][2:], parts[-1]))
    return rows


ROWS = _ls_files_eol()


def test_no_tracked_file_is_committed_with_crlf():
    offenders = sorted(path for eol, path in ROWS if eol == 'crlf')
    assert not offenders, (
        f'{len(offenders)} file(s) are committed with CRLF line endings:\n  '
        + '\n  '.join(offenders[:40])
        + ('\n  ...' if len(offenders) > 40 else '')
        + '\n\nRun `git add --renormalize <file>` and commit. If a file is '
          'genuinely binary, mark it `binary` in .gitattributes instead. See '
          'docs/ops/CRLF_NORMALIZATION.md.')


def test_the_scan_reads_real_files():
    """A guard on the guard: `git ls-files` failing quietly passes forever."""
    assert len(ROWS) > 3000, (
        f'Only {len(ROWS)} tracked files parsed from `git ls-files --eol`. The '
        'parser or the working directory is wrong, not the repo suddenly empty.')


def test_most_of_the_repo_is_lf_text():
    """Marking everything `-text` would also produce zero CRLF, and be wrong.

    `-text` tells git to leave a file's bytes alone, so a repo where every file
    was `-text` would pass the test above while normalizing nothing. The real
    state is the opposite: the overwhelming majority are LF text.
    """
    lf = sum(1 for eol, _ in ROWS if eol == 'lf')
    assert lf / len(ROWS) > 0.9, (
        f'Only {lf} of {len(ROWS)} tracked files are LF text. Files are being '
        'marked binary or -text in bulk, which makes the CRLF check vacuous.')


def test_gitattributes_still_declares_the_policy():
    text = (REPO_ROOT / '.gitattributes').read_text(encoding='utf-8')
    assert '* text=auto' in text, (
        '.gitattributes lost `* text=auto`. Without it, normalization stops '
        'happening on stage and the drift starts growing back one file at a '
        'time -- invisibly, because each file only changes when somebody '
        'touches it.')
    assert '*.sh     text eol=lf' in text, (
        'Shell scripts lost their explicit `eol=lf`. A CRLF shebang line does '
        'not execute, and the error it gives names the interpreter rather than '
        'the line ending.')


@pytest.mark.parametrize('sha', ['5638a977'])
def test_blame_still_ignores_the_normalization_commit(sha):
    """879 files in one commit swallows authorship without this."""
    revs = (REPO_ROOT / '.git-blame-ignore-revs').read_text(encoding='utf-8')
    assert sha in revs, (
        f'.git-blame-ignore-revs no longer lists {sha}, the renormalization '
        'commit. Without it `git blame` attributes 879 files to that commit '
        'and the real authorship is unreachable from the UI.')
