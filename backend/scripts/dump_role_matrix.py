#!/usr/bin/env python3
"""Print who can reach every SIS route, read off the decorators themselves.

iCreate asked for admin-defined roles. The answer was no -- the seven roles are
load-bearing in two Postgres CHECK constraints, a cross-language conformance
fixture and ~15 touch points, and replacing them is an auth rewrite. What they
actually needed was for somebody to be able to SAY what each role can do, which
nobody could: the answer was 30-odd route files' worth of decorators, and the
one document that described it (docs/sis/ROLE_CAPABILITIES.md) is written by
hand and drifts the moment a route is added.

So this reads the source rather than a description of it. Run it to see the
current truth; tests/unit/test_role_matrix_doc.py runs it to fail the build when
the document and the code disagree.

    python backend/scripts/dump_role_matrix.py            # human readable
    python backend/scripts/dump_role_matrix.py --json     # for the test
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
SIS_ROUTES = BACKEND / 'routes' / 'sis'
# Runnable from anywhere: `python backend/scripts/dump_role_matrix.py` from the
# repo root is how a human will reach for it.
sys.path.insert(0, str(BACKEND))

ROLE_TUPLE = re.compile(r'@require_role\(\*(\w+)\)')
LITERAL_ROLES = re.compile(r"@require_role\(((?:\s*'[\w]+'\s*,?)+)\)")
RELATIONSHIP = re.compile(r"@require_relationship_to\([^)]*allow=\(([^)]*)\)")
MODULE = re.compile(r"@require_module\('([\w]+)'")


def scan(path: Path) -> dict:
    src = path.read_text(encoding='utf-8', errors='replace')
    tiers = sorted(set(ROLE_TUPLE.findall(src)))
    literals = sorted({r.strip().strip("'") for group in LITERAL_ROLES.findall(src)
                       for r in group.split(',') if r.strip()})
    relationships = sorted({r.strip().strip("'") for group in RELATIONSHIP.findall(src)
                            for r in group.split(',') if r.strip()})
    modules = sorted(set(MODULE.findall(src)))
    return {
        'tiers': tiers,
        'literal_roles': literals,
        'relationships': relationships,
        'modules': modules,
        # No role gate at all: the file authorizes some other way (a per-class
        # moderator check, a signed token, a family relationship). Worth seeing.
        'ungated': not tiers and not literals,
    }


def build() -> dict:
    out = {}
    for path in sorted(SIS_ROUTES.glob('*.py')):
        if path.name == '__init__.py':
            continue
        out[path.name] = scan(path)
    out['__init__.py'] = scan(SIS_ROUTES / '__init__.py')
    return out


def main() -> int:
    matrix = build()
    if '--json' in sys.argv:
        print(json.dumps(matrix, indent=2, sort_keys=True))
        return 0

    from utils import sis_roles
    print('SIS route gates, read from the decorators\n')
    print('Tiers (backend/utils/sis_roles.py):')
    for name in ('STAFF_ROLES', 'ADMIN_ROLES', 'FINANCE_ROLES', 'HR_ROLES',
                 'ROLE_GRANT_ROLES'):
        print(f'  {name:<18} {", ".join(getattr(sis_roles, name))}')
    print()

    by_tier = defaultdict(list)
    for filename, info in sorted(matrix.items()):
        key = ' + '.join(info['tiers']) or ('(no role gate)' if info['ungated'] else '')
        by_tier[key].append(filename)

    for key in sorted(by_tier):
        print(f'{key}:')
        for filename in by_tier[key]:
            info = matrix[filename]
            extras = []
            if info['relationships']:
                extras.append('rel: ' + ', '.join(info['relationships']))
            if info['literal_roles']:
                extras.append('also: ' + ', '.join(info['literal_roles']))
            suffix = f"  ({'; '.join(extras)})" if extras else ''
            print(f'  {filename}{suffix}')
        print()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
