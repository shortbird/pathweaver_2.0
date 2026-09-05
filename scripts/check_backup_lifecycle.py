#!/usr/bin/env python3
"""Fail if the backup bucket's lifecycle policy could delete a live backup.

Why this exists, precisely: on 2026-09-05 the bucket carried a single unscoped
rule, `{"action": {"type": "Delete"}, "condition": {"age": 90}}`. That rule was
CORRECT when it was written -- the bucket held nothing but nightly database
dumps, and a 90-day-old dump really is obsolete. It became a data-loss bug when
the storage backup started writing an rclone mirror into the same bucket, which
put 3,548 student-evidence objects on a 90-day deletion timer nobody chose.

The distinction the guard encodes:

  daily/    dated snapshots. A new file every night, never rewritten. An
            object's age IS its obsolescence, so age-based expiry is right.

  storage/  a MIRROR. Every object is the backup of a file that is currently
            live in Supabase, written once when the sync first saw it and
            never touched again. Its age is the age of the BACKUP, not of
            anything expiring. Deleting by age here deletes the only off-site
            copy of evidence that is still in use -- while the backup job goes
            on reporting success.

So retention for the mirror must act on NONCURRENT versions only: when a file
is deleted upstream and the next sync propagates that deletion, the superseded
version survives its window and can be restored.

Reads `gcloud storage buckets describe --format=json` on stdin (or a file
argument). Exit 0 if safe, 1 with an explanation if not.
"""

import json
import sys

#: The prefix holding a mirror, where age-based deletion is never correct.
MIRROR_PREFIX = 'storage/'


def _prefix_can_match(rule_prefixes, target):
    """Could a rule scoped to `rule_prefixes` act on objects under `target`?

    No prefixes at all means the rule matches every object in the bucket --
    which is exactly the shape that caused the incident, so it must read as
    dangerous rather than as "unscoped, probably fine".
    """
    if not rule_prefixes:
        return True
    # Either direction is a hit: a rule on "st" reaches "storage/", and a rule
    # on "storage/quest-evidence/" is inside it.
    return any(target.startswith(p) or p.startswith(target) for p in rule_prefixes)


def deletes_live_objects_under(policy, prefix):
    """Rules in `policy` that could delete a LIVE object under `prefix`."""
    dangerous = []
    for rule in (policy or {}).get('rule', []):
        if rule.get('action', {}).get('type') != 'Delete':
            continue
        cond = rule.get('condition', {})

        # Explicitly scoped to noncurrent versions -- cannot touch a live one.
        if cond.get('isLive') is False:
            continue
        # These two conditions only exist for noncurrent versions, so a rule
        # carrying either is likewise incapable of deleting a live object.
        if 'daysSinceNoncurrentTime' in cond or 'numNewerVersions' in cond:
            continue

        # Deliberately ignoring matchesSuffix / matchesStorageClass: object
        # names here are encrypted, so we cannot reason about them. Erring
        # toward "dangerous" costs a false alarm; erring the other way costs
        # the backup.
        if not _prefix_can_match(cond.get('matchesPrefix'), prefix):
            continue

        dangerous.append(rule)
    return dangerous


def check(bucket):
    """Return a list of human-readable problems. Empty means healthy."""
    problems = []

    # gcloud's describe uses `lifecycle_config` / `versioning_enabled`; the raw
    # JSON API uses `lifecycle` / `versioning.enabled`. Accept either so this
    # works against both.
    policy = bucket.get('lifecycle_config') or bucket.get('lifecycle') or {}
    versioning = bucket.get('versioning_enabled')
    if versioning is None:
        versioning = bucket.get('versioning', {}).get('enabled', False)

    if not versioning:
        problems.append(
            'Object versioning is OFF. The noncurrent-version rules that '
            'protect the mirror are inert without it, so anything the sync '
            'deletes is gone beyond the soft-delete window.')

    for rule in deletes_live_objects_under(policy, MIRROR_PREFIX):
        problems.append(
            'This rule can delete a LIVE object under {}:\n    {}\n'
            '  {} is an rclone mirror, not a series of snapshots. Scope the '
            'rule with matchesPrefix, or restrict it to noncurrent versions '
            '(isLive: false / daysSinceNoncurrentTime).'.format(
                MIRROR_PREFIX, json.dumps(rule), MIRROR_PREFIX))

    return problems


def main():
    raw = open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()
    problems = check(json.loads(raw))
    if not problems:
        print('Lifecycle policy is safe: versioning on, and no rule can delete '
              'a live object under {}'.format(MIRROR_PREFIX))
        return 0
    for p in problems:
        print('::error::{}'.format(p))
    print('\nSee backend/docs/BACKUP_RESTORE.md, section Retention.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
