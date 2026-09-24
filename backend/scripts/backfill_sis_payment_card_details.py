"""Stamp card brand + last four onto card payments recorded before 2026-09-24.

iCreate, ticket 03226ede (2026-09-24): "On receipts, can you add method of
payment (card/check) and last four digits of card number if paid by card so
that people can turn those in for reimbursements?" From that date every Stripe
payment records its card as it is taken (sis_billing_service.record_payment).
This is the other half: payments already made, so a family reprinting an old
receipt gets the last four too.

What it targets, and nothing else:
  * method = 'card',
  * card_last4 IS NULL,
  * external_ref names a Stripe PaymentIntent (pi_...; a whole-family payment
    carries 'pi_...:<invoice id>', and the intent is the part before the colon).

Each intent is read from the school's own Stripe account. A read that fails is
skipped and reported; nothing else is written.

Requires migration 20260924170000_sis_payment_card_details.sql.

Dry run by default; --apply writes.

Usage:
    cd backend && python scripts/backfill_sis_payment_card_details.py
    cd backend && python scripts/backfill_sis_payment_card_details.py --apply
    cd backend && python scripts/backfill_sis_payment_card_details.py --org <uuid>
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from supabase import create_client  # noqa: E402

from app_config import Config  # noqa: E402
from utils.db_fetch import fetch_all_rows  # noqa: E402


def intent_id(external_ref):
    """The PaymentIntent id in a payment's external_ref, or None."""
    ref = (external_ref or '').split(':', 1)[0].strip()
    return ref if ref.startswith('pi_') else None


def find_candidates(admin, org_id=None):
    def query():
        q = (admin.table('sis_payment_records')
             .select('id, organization_id, external_ref')
             .eq('method', 'card').is_('card_last4', 'null'))
        return q.eq('organization_id', org_id) if org_id else q
    return [p for p in fetch_all_rows(query) if intent_id(p.get('external_ref'))]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--apply', action='store_true', help='write (default is a dry run)')
    parser.add_argument('--org', help='limit to one organization id')
    args = parser.parse_args()

    # Imported here, after the client exists: the service imports `database`.
    from services.sis_billing_service import _org_stripe_secret, card_details_from_intent

    admin = create_client(Config.SUPABASE_URL, Config.SUPABASE_SERVICE_ROLE_KEY)
    payments = find_candidates(admin, args.org)
    print(f'{len(payments)} card payment(s) without card details')

    secrets = {}
    found = skipped = 0
    for p in payments:
        org = p['organization_id']
        if org not in secrets:
            secrets[org] = _org_stripe_secret(org)
        card = card_details_from_intent(secrets[org], intent_id(p['external_ref']))
        if not card.get('last4'):
            skipped += 1
            print(f"  skip {p['id'][:8]}: no card details from Stripe")
            continue
        found += 1
        print(f"  {p['id'][:8]}: {card.get('brand')} ending {card['last4']}")
        if args.apply:
            admin.table('sis_payment_records').update(
                {'card_brand': card.get('brand'), 'card_last4': card['last4']}
            ).eq('id', p['id']).execute()

    verb = 'updated' if args.apply else 'would update'
    print(f'{verb} {found}, skipped {skipped}')


if __name__ == '__main__':
    main()
