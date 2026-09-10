#!/usr/bin/env python3
"""PreToolUse gate on Bash. Refuses the commands CLAUDE.md used to ask about.

Four families, each of which has already cost this repository something:

1. DESTRUCTIVE GIT. Several agents and the user share one working tree, so at
   any moment there are uncommitted changes in files you did not touch. On
   2026-08-14 a session ran a reset while tidying up and took a half-finished
   feature and a security fix with it, from two other sessions. Untracked files
   survived; edits to tracked files did not, and there is no undo. These have no
   override -- if you need to discard your own edit, edit it back.

2. BROAD STAGING. `git add -A` in a shared tree sweeps somebody else's
   half-finished work into your commit and onto main under your message. Stage
   the files you touched.

3. EMOJI IN A COMMIT MESSAGE. House style, and the one place it is mechanically
   checkable.

4. PUSHING TO MAIN, AND FORCE-PUSHING. Production ships by direct push to main
   with no PR gate (OPS-05, declined deliberately), so this hook is the only
   thing standing between an agent and a production release. It is a stop, not
   a ban: once the user has said yes, prefix the command with
   OPTIO_HOOK_OVERRIDE=1 and it goes through.

The override exists for exactly one reason: a gate a person cannot get past
becomes a gate somebody deletes. It leaves a mark in the transcript, which is
the point -- the same shape as the `--yes` flag on the production repair
scripts.

Fails open. If this script raises, the command runs.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import allow, block, read_event  # noqa: E402

OVERRIDE = 'OPTIO_HOOK_OVERRIDE=1'

# Emoji and pictographs. Deliberately narrow: it must not fire on the arrows,
# checkmarks and dashes that ordinary prose uses.
EMOJI = re.compile(
    '['
    '\U0001F300-\U0001FAFF'   # pictographs, symbols, faces, flags
    '\U0001F000-\U0001F0FF'   # mahjong/cards
    '\U00002190-\U000021FF'   # arrows (only when emoji-presented, see below)
    '\U00002600-\U000026FF'   # misc symbols
    '\U00002700-\U000027BF'   # dingbats
    ']'
)
# An arrow or dingbat is only an emoji when it carries the variation selector.
PLAIN_SYMBOL = re.compile('[\U00002190-\U000021FF\U00002700-\U000027BF](?!️)')

#: (regex, human explanation). Order matters only for which message you get.
DESTRUCTIVE_GIT: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\bgit\s+reset\s+(--hard|--merge|--keep)\b'),
     'git reset --hard discards every uncommitted change in the tree, including '
     'the ones belonging to other sessions.'),
    (re.compile(r'\bgit\s+checkout\s+(--\s|\.|-f\b|--force\b)'),
     'git checkout -- <path> overwrites the working copy from the index. '
     'Another session may be mid-edit in that file.'),
    (re.compile(r'\bgit\s+restore\s+(?!--staged\b)'),
     'git restore discards working-tree changes -- the same loss as '
     'git checkout -- <path>, spelled differently. (git restore --staged only '
     'unstages, and is allowed.)'),
    # `git stash list` and `git stash show` read; everything else stashes.
    # Blocking the read-only pair was a false positive found in use: asking
    # what is stashed is how you find out whether somebody else's work is
    # sitting in one.
    (re.compile(r'\bgit\s+stash\b(?!\s+(list|show)\b)'),
     'git stash removes changes from the tree, including other sessions\'. '
     'A stash made by one agent is invisible to the next one. '
     '(git stash list and git stash show are allowed.)'),
    # `-n` / `--dry-run` is how you find out what clean WOULD delete.
    (re.compile(r'\bgit\s+clean\b(?![^|;&]*(-n\b|--dry-run\b))'),
     'git clean deletes untracked files. Untracked new files are the one class '
     'of work that survived the 2026-08-14 incident. '
     '(git clean -n is allowed; it only lists.)'),
    (re.compile(r'\b(killall|pkill)\b[^|;&]*\bnode\b'),
     'killall/pkill node kills Claude Code itself, and any dev server another '
     'session is mid-verification on. Stop a server by port: '
     'lsof -tnP -iTCP:3000 -sTCP:LISTEN | xargs kill'),
]

BROAD_STAGING: list[tuple[re.Pattern, str]] = [
    (re.compile(r'\bgit\s+add\s+(-A\b|--all\b|\.(\s|$))'),
     'git add -A / git add . stages everything in a tree several agents share. '
     'Name the files you changed.'),
    (re.compile(r'\bgit\s+commit\b[^|;&]*\s-[a-zA-Z]*a[a-zA-Z]*\b'),
     'git commit -a stages every modified tracked file, including files this '
     'session never touched. Stage yours explicitly, then commit.'),
]


#: `cmd <<'MSG' [rest of the line]\n <body> \nMSG`. Only the body is removed;
#: the marker line keeps whatever followed the redirect (`&& git log ...` is a
#: real command and has to stay visible to the scan).
HEREDOC = re.compile(
    r"""(<<-?\s*'?"?([A-Za-z_][A-Za-z0-9_]*)'?"?[^\n]*\n)(.*?\n)?(\2\b)""",
    re.DOTALL,
)
QUOTED_MESSAGE = re.compile(r"""(-m|--message)(=|\s+)(['"]).*?\3""", re.DOTALL)


def _executable_part(command: str) -> str:
    """The command with its message bodies removed.

    A commit message that *describes* a banned command is not a banned command.
    This file's own first commit was refused by this hook, because the message
    explains what a hard reset did to somebody's work on 2026-08-14. Text a
    shell would treat as data has to be treated as data here too, or the gate
    makes the incident undocumentable -- and an undocumented incident is how
    the rule gets dropped as unexplained the next time somebody trims this file.

    Heredoc bodies and quoted -m arguments come out. This is a readability
    measure, not a sandbox: a genuinely destructive command hidden in a heredoc
    and piped to a shell would get past it, and nothing here pretends otherwise.
    The audience is an agent following rules, not an attacker evading them.
    """
    without_heredocs = HEREDOC.sub(
        lambda m: f'{m.group(1)}<HEREDOC-BODY-REMOVED>\n{m.group(4)}', command
    )
    return QUOTED_MESSAGE.sub('-m <MESSAGE-REMOVED>', without_heredocs)


def _has_emoji(text: str) -> str | None:
    for match in EMOJI.finditer(text):
        char = match.group()
        if PLAIN_SYMBOL.fullmatch(char):
            continue
        return char
    return None


def main() -> None:
    event = read_event()
    if event.get('tool_name') != 'Bash':
        allow()

    command = str((event.get('tool_input') or {}).get('command') or '')
    if not command.strip():
        allow()

    overridden = OVERRIDE in command
    executable = _executable_part(command)

    for pattern, why in DESTRUCTIVE_GIT:
        if pattern.search(executable):
            block(
                f'BLOCKED by .claude/hooks/guard_bash.py\n\n{why}\n\n'
                'This one has no override: several agents and the user share this '
                'working tree (CLAUDE.md, "Working alongside other agents"). '
                'If the change to discard is your own, edit it back instead.'
            )

    for pattern, why in BROAD_STAGING:
        if pattern.search(executable):
            block(
                f'BLOCKED by .claude/hooks/guard_bash.py\n\n{why}\n\n'
                'Run `git status` first and stage the paths you edited this '
                'session (CLAUDE.md rule 12).'
            )

    if re.search(r'\bgit\s+commit\b', executable):
        # The emoji check reads the WHOLE command, message body included --
        # that body is exactly what it is checking.
        found = _has_emoji(command)
        if found:
            block(
                f'BLOCKED by .claude/hooks/guard_bash.py\n\n'
                f'The commit message contains an emoji ({found!r}). House style is '
                'no emoji in commit messages, PR bodies or UI copy.'
            )

    push = re.search(r'\bgit\s+push\b([^|;&]*)', executable)
    if push and not overridden:
        args = push.group(1)
        forced = re.search(r'(--force\b|--force-with-lease\b|\s-f\b)', args)
        # `git push origin main`, and also a bare `git push` while main is
        # checked out -- which is the same release with the branch left implicit.
        names_a_branch = re.search(r'\borigin\b|\bHEAD\b|:', args)
        to_main = bool(re.search(r'\bmain\b', args)) or (
            not names_a_branch and _current_branch() == 'main'
        )
        if forced:
            block(
                'BLOCKED by .claude/hooks/guard_bash.py\n\n'
                'Force-pushing rewrites history other sessions may have pulled, '
                'and nothing on this repository protects a branch from it '
                '(OPS-05 was declined on the grounds that the deploy gate is the '
                'real control -- that argument does not cover a force-push).\n\n'
                f'If the user has agreed, re-run with {OVERRIDE} in front of the command.'
            )
        if to_main:
            block(
                'BLOCKED by .claude/hooks/guard_bash.py\n\n'
                'A push to main is a production release. main has no PR gate, so '
                'this is the confirmation step: release.yml deploys the pushed SHA '
                'to prod and publishes the production OTA if the suites pass.\n\n'
                'Ask the user first (CLAUDE.md rule 2). Once they have said yes, '
                f're-run with {OVERRIDE} in front of the command.'
            )

    allow()


def _current_branch() -> str:
    from _common import run
    code, out = run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], timeout=10)
    return out.strip() if code == 0 else ''


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # pragma: no cover - fail open, loudly
        sys.stderr.write(f'guard_bash hook error (command allowed): {exc}\n')
        sys.exit(1)
