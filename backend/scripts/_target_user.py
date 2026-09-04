"""Which account a one-off script operates on. No default, on purpose.

Twenty scripts in this directory used to open with:

    from scripts._target_user import resolve_target_user_id
user_id = resolve_target_user_id(client, mutates=False)

Eight of them then WRITE to production. A script that hardcodes whose data it
repairs is one copy-paste away from repairing the wrong person's, and it gives
no signal at all when the account it names is not the one you meant -- it just
succeeds, against somebody else.

So: `--user-email` is required, there is no default, and the mutating scripts
additionally require `--yes`. Refusing to guess is the whole point; a default
here would put the old behaviour back with extra steps.

    python scripts/check_evidence.py --user-email someone@example.com
    python scripts/repair_subject_xp.py --user-email someone@example.com --yes
"""

import argparse
import sys


def _parse(mutates: bool):
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument(
        '--user-email', required=True,
        help='Email of the account to operate on. Required -- there is no default.')
    if mutates:
        parser.add_argument(
            '--yes', action='store_true',
            help='Confirm that this script WRITES to the database.')
    return parser.parse_known_args()[0]


def resolve_target_user_id(client, *, mutates: bool = False) -> str:
    """The user id named by --user-email, or exit with a readable message.

    `mutates=True` additionally requires `--yes`. A read-only script asking for
    confirmation trains people to pass --yes without reading, which is exactly
    how the flag stops meaning anything.
    """
    args = _parse(mutates)

    if mutates and not args.yes:
        print(f'REFUSING TO RUN: this script writes to the database.\n'
              f'Re-run with --yes if you mean to modify {args.user_email}.',
              file=sys.stderr)
        sys.exit(2)

    rows = (client.table('users').select('id, email')
            .eq('email', args.user_email.strip().lower())
            .limit(1).execute()).data or []
    if not rows:
        print(f'No user found with email {args.user_email!r}.', file=sys.stderr)
        sys.exit(1)

    if mutates:
        print(f'Operating on {rows[0]["email"]} ({rows[0]["id"]}) -- WRITES ENABLED')
    return rows[0]['id']
