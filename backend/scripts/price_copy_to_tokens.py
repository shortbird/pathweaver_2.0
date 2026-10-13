"""
Turn typed prices in database-held copy into {{price.<name>}} names.

Help center articles (docs_articles) and CRM funnel emails (crm_funnel_steps)
live in the database, so they cannot import shared/data/pricing.json. They
name a price instead, and utils/pricing_text.fill_prices fills it in when the
copy is served or sent. This script does the one-time conversion of the copy
written before that existed, and adds the prior-learning price to the
transfer-credit help article.

RUN IT ONLY AFTER THE RELEASE THAT CARRIES utils/pricing_text.py IS LIVE.
Before that, production serves the names raw: on 2026-10-13 the conversion
was applied early and reverted within minutes for exactly that reason.

    cd backend && ../venv/bin/python scripts/price_copy_to_tokens.py           # dry run
    cd backend && ../venv/bin/python scripts/price_copy_to_tokens.py --apply   # write

Idempotent: copy that already uses names has no typed amounts left to match.
Archived funnels are left alone; they do not send.

Every typed amount in this copy on 2026-10-13 was an Optio Academy tuition
price, which is why a plain amount -> name map is safe here. Do not reuse the
map for other copy: "$50" is also the licensed credit price, a different name
that happens to print the same today.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / '.env')

from app import app  # noqa: E402  (loads the package in the order the app does)
from database import get_supabase_admin_client  # noqa: E402
from generated.pricing import PRICE_TEXT  # noqa: E402
from utils.pricing_text import fill_prices  # noqa: E402

# Longest first, so $500 is never read as $50 followed by a 0.
TUITION_NAMES = ['fullTimeMonthly', 'academyTuitionYearly', 'academyFamilyCapMonthly',
                 'academyCredit', 'academyTuitionMonthly']

PRIOR_LEARNING_SLUG = 'transfer-credits-and-prior-learning'
PRIOR_LEARNING_MARKER = '## What It Costs'
PRIOR_LEARNING_SECTION = """## What It Costs

- **Credit from an accredited school** transfers {{price.transferAccredited}} when that school sends an official transcript.
- **Homeschool and other prior learning** is reviewed by an Optio Academy teacher. Each credit awarded is **{{price.transferUnaccreditedPrivate}}**. Nothing is charged for learning that is not accepted.
- **Students whose school holds an Optio license** pay **{{price.transferUnaccreditedLicensed}}** a credit.
- **OpenEd families** buy prior learning credit through OpenEd.
- Up to **{{price.maxTransferCredits}} credits** can transfer in toward the {{price.diplomaCredits}}-credit diploma.

"""


# OpenEd families buy through OpenEd and are never shown a price (Tanner,
# 2026-10-13). In the Academy welcome emails, the two passages that quote one
# are wrapped so the funnel engine drops them for a family in the `opened`
# segment (services/crm_registration_segments.py).
OPENED_HIDES = [
    re.compile(r'(<p[^>]*>\s*<strong>What you pay\.</strong>.*?</p>)', re.DOTALL),
    re.compile(r'(It is \{\{price\.fullTimeMonthly\}\} a month, and that includes the '
               r'\{\{price\.academyTuitionMonthly\}\} program fee\. )'),
]
_OPENED_TAGS = re.compile(r'\{\{#unless opened\}\}|\{\{/unless\}\}')


def hide_from_opened(text):
    if not text or '{{#unless opened}}' in text:
        return text
    for pattern in OPENED_HIDES:
        text = pattern.sub(lambda m: '{{#unless opened}}' + m.group(1) + '{{/unless}}', text)
    return text


def to_names(text):
    if not text:
        return text
    for name in TUITION_NAMES:
        amount = re.escape(PRICE_TEXT[name])
        text = re.sub(amount + r'(?![0-9,])', '{{price.' + name + '}}', text)
    return text


def main(apply):
    db = get_supabase_admin_client()
    changes = []

    for row in (db.table('docs_articles').select('id, slug, content, summary').execute().data or []):
        update = {}
        for field in ('content', 'summary'):
            new = to_names(row.get(field))
            if new != row.get(field):
                update[field] = new
        if row['slug'] == PRIOR_LEARNING_SLUG and PRIOR_LEARNING_MARKER not in (row.get('content') or ''):
            content = update.get('content', row.get('content') or '')
            anchor = '## Related'
            update['content'] = (content.replace(anchor, PRIOR_LEARNING_SECTION + anchor, 1)
                                 if anchor in content else content + '\n\n' + PRIOR_LEARNING_SECTION)
        if update:
            changes.append(('docs_articles', row['id'], row['slug'], update, row))

    funnels = {f['id']: f for f in (db.table('crm_funnels').select('id, key, status').execute().data or [])}
    for row in (db.table('crm_funnel_steps').select('id, funnel_id, name, subject, text_body, html_body')
                .execute().data or []):
        if (funnels.get(row['funnel_id']) or {}).get('status') == 'archived':
            continue
        update = {}
        for field in ('subject', 'text_body', 'html_body'):
            new = hide_from_opened(to_names(row.get(field)))
            if new != row.get(field):
                update[field] = new
        if update:
            changes.append(('crm_funnel_steps', row['id'], row['name'], update, row))

    for table, row_id, label, update, original in changes:
        print(f'{table}: {label} -> {sorted(update)}')
        for field, value in update.items():
            unknown = re.findall(r'\{\{\s*price\.(\w+)', value or '')
            assert all(name in PRICE_TEXT for name in unknown), f'unknown price name in {label}'
            # Filled in, the copy must read exactly as it does today (the new
            # prior-learning section aside, which is added, not converted).
            filled = _OPENED_TAGS.sub('', (fill_prices(value) or '')
                                      .replace(fill_prices(PRIOR_LEARNING_SECTION) or '', ''))
            assert filled.strip() == (original.get(field) or '').strip(), f'{label}.{field} would change'
        if apply:
            db.table(table).update(update).eq('id', row_id).execute()

    print(f"{len(changes)} row(s) {'updated' if apply else 'would change (dry run; pass --apply)'}")

if __name__ == '__main__':
    with app.app_context():
        main('--apply' in sys.argv)
