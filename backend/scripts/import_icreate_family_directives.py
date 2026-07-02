"""
Import iCreate's legacy registration spreadsheet into sis_family_directives.

The school collected registrations on their old form (parent name/phone/email,
whether the fee was paid, and a priority tier). This stages that data BY PARENT
EMAIL so the iCreate registration funnel can apply it when each family
re-registers on Optio:
  - fee_prepaid   -> the funnel skips the registration fee
  - registration_hold (their "yellow"/discrepancy rows) -> family can register
                     but cannot sign up for classes until staff clear the hold
  - registration_tier -> staggered class-registration opening (dates set in
                     SIS Settings)

Input: a CSV export of their sheet. Column headers are matched loosely
(case/space-insensitive): registration date, reg fee, last name, first name,
text number / phone, email, tier. A non-empty "reg fee" cell (their yellow
marker, e.g. "Discrepancy") means NOT paid + hold; an empty cell means paid.
Rows where phone and email are in swapped columns are auto-corrected.

Dry-run by default; pass --apply to write.

Run from backend/ with the venv:
    ../venv/bin/python scripts/import_icreate_family_directives.py path/to/sheet.csv
    ../venv/bin/python scripts/import_icreate_family_directives.py path/to/sheet.csv --apply
"""
import argparse
import csv
import os
import re
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))
from supabase import create_client

SUPABASE_URL = os.environ['SUPABASE_URL']
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ['SUPABASE_SERVICE_KEY']

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

# header-name fragments -> canonical field
HEADER_MAP = [
    ('email', 'email'),
    ('regfee', 'fee_flag'),
    ('fee', 'fee_flag'),
    ('lastname', 'last'),
    ('firstname', 'first'),
    ('textnumber', 'phone'),
    ('phone', 'phone'),
    ('tier', 'tier'),
    ('registrationdate', 'reg_date'),
]


def _norm_header(h):
    return re.sub(r'[^a-z]', '', (h or '').lower())


def _map_headers(fieldnames):
    mapping = {}
    for raw in fieldnames or []:
        key = _norm_header(raw)
        for fragment, field in HEADER_MAP:
            if fragment in key and field not in mapping.values():
                mapping[raw] = field
                break
    return mapping


def _valid_email(v):
    return bool(v and EMAIL_RE.match(v.strip()))


def _parse_tier(v):
    m = re.search(r'\d+', str(v or ''))
    return int(m.group()) if m else None


def parse_rows(csv_path):
    """-> (directives, problems). Directives are upsert-ready dicts (no org yet)."""
    directives, problems = [], []
    with open(csv_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        mapping = _map_headers(reader.fieldnames)
        missing = {'email', 'last'} - set(mapping.values())
        if missing:
            sys.exit(f'Could not find columns for: {", ".join(sorted(missing))}. '
                     f'Headers seen: {reader.fieldnames}')
        for i, raw in enumerate(reader, start=2):  # 1-based + header row
            row = {field: (raw.get(col) or '').strip() for col, field in mapping.items()}
            name = f"{row.get('first', '')} {row.get('last', '')}".strip() or f'row {i}'

            email, phone = row.get('email', ''), row.get('phone', '')
            if not _valid_email(email) and _valid_email(phone):
                email, phone = phone, email  # columns were swapped on the sheet
            email = email.strip().lower()
            if not _valid_email(email):
                problems.append(f'row {i} ({name}): no usable email — needs manual follow-up')
                continue

            fee_flag = row.get('fee_flag', '')
            hold = bool(fee_flag)  # any mark (their yellow cell) = unpaid/discrepancy
            directives.append({
                'email': email,
                'registration_tier': _parse_tier(row.get('tier')),
                'registration_hold': hold,
                'hold_reason': f'Legacy form: {fee_flag}' if hold else None,
                'fee_prepaid': not hold,
                'notes': ' | '.join(x for x in (
                    name,
                    f"phone {phone}" if phone else None,
                    f"registered {row['reg_date']}" if row.get('reg_date') else None,
                ) if x),
            })
    # duplicate emails: keep the first, report the rest
    seen, unique = set(), []
    for d in directives:
        if d['email'] in seen:
            problems.append(f"duplicate email skipped: {d['email']}")
            continue
        seen.add(d['email'])
        unique.append(d)
    return unique, problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('csv_path')
    ap.add_argument('--org-slug', default='icreate', help='organization slug (default: icreate)')
    ap.add_argument('--apply', action='store_true', help='write to the database (default: dry run)')
    args = ap.parse_args()

    directives, problems = parse_rows(args.csv_path)

    holds = [d for d in directives if d['registration_hold']]
    tiers = {}
    for d in directives:
        tiers[d['registration_tier']] = tiers.get(d['registration_tier'], 0) + 1
    print(f'Parsed {len(directives)} families: {len(directives) - len(holds)} fee-prepaid, '
          f'{len(holds)} on hold (discrepancy)')
    print('Tiers: ' + ', '.join(f'{"untiered" if t is None else f"tier {t}"}={n}'
                                for t, n in sorted(tiers.items(), key=lambda x: (x[0] is None, x[0]))))
    for p in problems:
        print(f'  PROBLEM: {p}')
    for d in holds:
        print(f'  HOLD: {d["email"]} ({d["notes"].split(" | ")[0]})')

    if not args.apply:
        print('\nDry run — pass --apply to write.')
        return

    admin = create_client(SUPABASE_URL, SERVICE_KEY)
    org_rows = admin.table('organizations').select('id, name').eq('slug', args.org_slug).execute().data
    if not org_rows:
        sys.exit(f'No organization with slug "{args.org_slug}"')
    org = org_rows[0]
    now = datetime.utcnow().isoformat()
    payload = [{**d, 'organization_id': org['id'], 'updated_at': now} for d in directives]
    saved = admin.table('sis_family_directives') \
        .upsert(payload, on_conflict='organization_id,email').execute().data or []
    print(f'\nUpserted {len(saved)} directives for {org["name"]} ({org["id"]})')


if __name__ == '__main__':
    main()
