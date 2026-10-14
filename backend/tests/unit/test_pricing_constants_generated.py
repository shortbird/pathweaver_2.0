"""Optio's prices have one definition, and every reader takes it from there.

shared/data/pricing.json is the price list (2026-10-13). The generator emits it
for the backend (generated/pricing.py), the apps (shared/generated/pricing.ts)
and the marketing site, which builds alone and gets its own generated copy.
CI's `npm run generate:check` diffs the generated files against the JSON; this
file checks the Python side matches it and that the places that charge or quote
money read it, which is what stops a typed copy coming back.
"""

import json
from pathlib import Path

from generated.pricing import PRICE_TEXT, PRICING

REPO = Path(__file__).resolve().parents[3]


def _strip(v):
    if isinstance(v, dict):
        return {k: _strip(x) for k, x in v.items() if not k.startswith('_')}
    return v


def test_the_generated_module_matches_the_json():
    data = json.loads((REPO / 'shared' / 'data' / 'pricing.json').read_text())
    assert PRICING == _strip(data)


def test_the_marketing_site_carries_the_same_generated_file_as_the_apps():
    apps = (REPO / 'shared' / 'generated' / 'pricing.ts').read_text()
    site = (REPO / 'marketing' / 'src' / 'data' / 'pricing.generated.ts').read_text()
    assert apps == site


def test_the_copy_rules_hold():
    a = PRICING['academy']
    # "Every $100 of tuition is one credit": a year of tuition buys the
    # included credits. The generator refuses to emit a list that breaks it.
    assert a['tuitionMonthlyCents'] * 12 == a['creditsIncludedPerYear'] * a['creditCents']
    assert PRICING['licensed']['creditCents'] * 2 == a['creditCents']
    assert PRICE_TEXT['academyTuitionMonthly'] == '$%d' % (a['tuitionMonthlyCents'] // 100)


def test_what_charges_money_reads_the_list():
    from services import sis_billing_service
    from services.registration_pricing import monthly_plan
    assert sis_billing_service._DEFAULT_PROCESSING_FEE == {
        'percent': PRICING['cardProcessing']['percent'],
        'flat_cents': PRICING['cardProcessing']['flatCents'],
    }
    plan = monthly_plan({'monthly': {'pricing': 'optio_academy', 'add_ons': []}})
    assert plan['per_student_cents'] == PRICING['academy']['tuitionMonthlyCents']


def test_database_copy_fills_in_prices():
    from utils.pricing_text import fill_prices, unknown_price_tokens
    assert fill_prices('Tuition is {{price.academyTuitionMonthly}} a month.') == \
        f"Tuition is {PRICE_TEXT['academyTuitionMonthly']} a month."
    assert fill_prices('{{ price.nope }}') == '{{ price.nope }}'
    assert unknown_price_tokens('{{price.nope}} {{price.fullTimeMonthly}}') == ['nope']


def test_unaccredited_transfer_and_opened_marketplace_prices():
    """Tanner, 2026-10-14: unaccredited prior learning is $25 a half credit
    for everyone; OpenEd adds a $5 marketplace fee, so an OpenEd family pays
    $30 a half credit in the marketplace. Help articles quote these names."""
    from generated.pricing import PRICE_TEXT
    assert PRICE_TEXT['transferUnaccreditedHalfCredit'] == '$25'
    assert PRICE_TEXT['transferUnaccredited'] == '$50'
    assert PRICE_TEXT['transferUnaccreditedPrivate'] == PRICE_TEXT['transferUnaccredited']
    assert PRICE_TEXT['transferUnaccreditedLicensed'] == PRICE_TEXT['transferUnaccredited']
    assert PRICE_TEXT['openEdPriorLearningHalfCredit'] == '$30'
