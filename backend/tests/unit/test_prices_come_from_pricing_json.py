"""
Prices come from shared/data/pricing.json, not from typed dollar amounts.

On 2026-10-13 one price had been typed into the marketing site, the Academy
agreement, the Terms of Service, email copy, CRM funnels, the help center and a
partner pricing sheet, and they had drifted: the Terms said Full-Time Academy
was $8,000 a year while the agreement said $500 a month, and retired $149 class
pages were still live. Every Optio price now lives in pricing.json and reaches
each surface generated (PRICING / PRICE_TEXT), or as {{price.<name>}} in
database-held copy (utils/pricing_text.py).

This test counts lines with a typed dollar amount ("$" then a digit) in each
source file and holds every file at its count. What is left in the baseline is
not an Optio price: money formatting helpers and their examples, $0 cases,
school-to-family amounts schools set themselves, and history in comments.

If this fails because a count went UP: write the price as PRICE_TEXT.<name>
(web, mobile, marketing: import from @shared/pricing or
marketing/src/data/pricing.generated), {{ price.<name> }} (email_copy.yaml),
or PRICE_TEXT / PRICING from generated.pricing (backend). A new price goes in
shared/data/pricing.json first; run `npm run generate`. If the amount truly is
not an Optio price, raise the file's count here and say why in the commit.

If it fails because a count went DOWN: lower the baseline to match.
"""

import os
import re

import pytest

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

ROOTS = ['web/src', 'mobile/src', 'marketing/src', 'marketing/scripts', 'shared', 'backend/services', 'backend/routes', 'backend/templates', 'backend/utils', 'backend/scripts', 'backend/app_config.py', 'backend/repositories', 'backend/jobs', 'backend/programs']
EXTENSIONS = ('.js', '.jsx', '.ts', '.tsx', '.astro', '.py', '.yaml', '.yml', '.html', '.mjs', '.md', '.json')
SKIP = re.compile(r'(__tests__|\.test\.|/tests?/|/test_|generated|node_modules|/dist/|\.d\.ts$|shared/data/pricing\.json)')
TYPED_PRICE = re.compile(r'\$\s?\d')

BASELINE = {
    'backend/app_config.py': 1,
    'backend/routes/registration_payments.py': 4,
    'backend/routes/sis/__init__.py': 2,
    'backend/scripts/price_copy_to_tokens.py': 2,
    'backend/scripts/seed_crm_funnels.py': 1,
    'backend/scripts/seed_icreate_parent_demo.py': 1,
    'backend/services/crm_broadcast_service.py': 4,
    'backend/services/crm_registration_segments.py': 1,
    'backend/services/prior_learning_report_pdf.py': 1,
    'backend/services/registration_pricing.py': 3,
    'backend/services/sis_billing_service.py': 7,
    'backend/services/sis_recurring_tuition_service.py': 1,
    'backend/services/sis_reports_service.py': 1,
    'backend/services/sis_schedule_ai_service.py': 4,
    'backend/services/sis_service.py': 3,
    'backend/services/sis_supply_expense_service.py': 2,
    'backend/services/sis_tuition_service.py': 3,
    'backend/utils/ai_pricing.py': 1,
    'backend/utils/money.py': 6,
    'shared/legal/termsOfService.ts': 1,
    'shared/pricing.ts': 4,
    'shared/scripts/generate-constants.mjs': 3,
    'shared/sisConcepts.json': 1,
    'web/src/App.jsx': 1,
    'web/src/components/HomeRoute.jsx': 1,
    'web/src/components/home/AICostChart.jsx': 1,
    'web/src/components/marketing/MarketingNav.jsx': 1,
    'web/src/components/registration/MonthlyPlan.jsx': 2,
    'web/src/pages/RegisterFunnelPage.jsx': 4,
    'web/src/pages/admin/AdminBillingPage.jsx': 1,
    'web/src/pages/embed/embedShared.js': 1,
    'web/src/pages/registerFunnel/FeeStep.jsx': 2,
    'web/src/pages/sis/FamilyDetailModal.jsx': 1,
    'web/src/pages/sis/billingPage/AddChargeModal.jsx': 1,
    'web/src/pages/sis/billingPage/LedgerPanel.jsx': 2,
    'web/src/pages/sis/billingPage/SplitInvoiceModal.jsx': 1,
    'web/src/pages/sis/reportsPage/OverviewStats.jsx': 1,
    'web/src/services/api.ts': 1,
    'web/src/utils/money.js': 8,
}


def _counts():
    counts = {}
    for root in ROOTS:
        full = os.path.join(REPO, root)
        if os.path.isfile(full):
            paths = [full]
        else:
            paths = [os.path.join(dp, f) for dp, _, fs in os.walk(full) for f in fs]
        for path in paths:
            rel = os.path.relpath(path, REPO)
            if not rel.endswith(EXTENSIONS) or SKIP.search(rel):
                continue
            try:
                with open(path, encoding='utf8') as fh:
                    text = fh.read()
            except (OSError, UnicodeDecodeError):
                continue
            n = sum(1 for line in text.split('\n') if TYPED_PRICE.search(line))
            if n:
                counts[rel] = n
    return counts


@pytest.mark.unit
def test_no_file_gains_a_typed_price():
    grew = {p: (n, BASELINE.get(p, 0)) for p, n in _counts().items() if n > BASELINE.get(p, 0)}
    assert not grew, (
        'Typed dollar amounts where a price should come from shared/data/pricing.json '
        '(file: now vs baseline):\n' + '\n'.join(f'  {p}: {n} vs {b}' for p, (n, b) in sorted(grew.items()))
        + '\nUse PRICE_TEXT / PRICING (see this module\'s docstring).')


@pytest.mark.unit
def test_the_baseline_does_not_linger():
    counts = _counts()
    stale = {p: (counts.get(p, 0), b) for p, b in BASELINE.items() if counts.get(p, 0) < b}
    assert not stale, ('Lower BASELINE to match (file: now vs baseline):\n'
                       + '\n'.join(f'  {p}: {n} vs {b}' for p, (n, b) in sorted(stale.items())))
