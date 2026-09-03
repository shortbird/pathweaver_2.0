"""
Re-run the onboarding sequences the sweep killed before they ever sent
(docs/CRM_REPLACEMENT_PLAN.md — AUDIT 2026-09-03, defect 1).

Until 2026-09-03 the funnel sweep exited any membership whose lead was not
status='active'. An onboarding member is 'converted' by construction — that
is *why* they are in a welcome sequence — so every new_account_welcome and
course_student_onboarding membership was exited `lead_converted` with
last_step_sent=0 about an hour after entry, having sent nothing. The engine
fix stops the bleeding; it cannot help the people already exited, because
re-entering a funnel you have already been in is (correctly) refused.

This script reopens those memberships so the normal sweep picks them up.

  * Default target: exit_reason='lead_converted' AND last_step_sent=0 — the
    post-cutover signups who genuinely received nothing.
  * NOT included by default: the Brevo-import memberships (last_step_sent>0),
    whose earlier steps Brevo actually delivered and whose remaining steps are
    now weeks stale. --include-imported opts them in.

Entries are STAGGERED. Reopening 40 memberships at once makes step 1 due for
all of them on the next sweep, and a 40-email burst on a young sending domain
is how a warm-up gets thrown away. Default spread is 6 hours, which the sweep
drains inside its 09:00-19:00 window.

Safety gates, per membership — skipped if any is true:
  * lead is unsubscribed/suppressed, or the address is on crm_suppressions
  * the lead has another ACTIVE membership (the one-funnel-per-lead index
    would reject the write anyway)
  * anything was ever sent against this membership (crm_sends rows)
  * no users row for the address (account deleted since — do not mail them)

Dry run by default; --apply writes.

Usage:
    cd backend && python scripts/backfill_onboarding_memberships.py
    cd backend && python scripts/backfill_onboarding_memberships.py --apply
    cd backend && python scripts/backfill_onboarding_memberships.py \
        --apply --stagger-hours 12 --limit 20
"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ONBOARDING_KEYS = ('new_account_welcome', 'course_student_onboarding')


def _now():
    return datetime.now(timezone.utc)


def _client():
    """Direct service-role client (standalone-script pattern, same as
    seed_crm_funnels.py: importing the app's database module drags in the
    whole Flask import graph). CRM tables are service-role only — RLS on,
    no policies — so this is the only key that reaches them.
    """
    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), '.env'))
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
    if not url or not key:
        print('ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
        sys.exit(1)
    return create_client(url, key)


def _load_candidates(db, include_imported):
    funnels = (db.table('crm_funnels').select('id, key, name, status, funnel_type')
               .eq('funnel_type', 'onboarding').execute()).data or []
    funnel_by_id = {f['id']: f for f in funnels}
    if not funnel_by_id:
        return [], {}

    memberships, page, page_size = [], 0, 500
    while True:
        batch = (db.table('crm_funnel_memberships')
                 .select('*, crm_leads(id, email, status, first_name)')
                 .in_('funnel_id', list(funnel_by_id))
                 .eq('status', 'exited').eq('exit_reason', 'lead_converted')
                 .order('entered_at')
                 .range(page * page_size, page * page_size + page_size - 1)
                 .execute()).data or []
        memberships.extend(batch)
        if len(batch) < page_size:
            break
        page += 1

    if not include_imported:
        memberships = [m for m in memberships if (m.get('last_step_sent') or 0) == 0]
    memberships.sort(key=lambda m: m['entered_at'])
    return memberships, funnel_by_id


def _skip_reason(db, membership):
    """Why this membership must not be reopened, or None to proceed."""
    lead = membership.get('crm_leads') or {}
    email = (lead.get('email') or '').lower()
    if not email:
        return 'no lead row'
    if lead.get('status') in ('unsubscribed', 'suppressed'):
        return f"lead is {lead['status']}"
    if (db.table('crm_suppressions').select('id')
            .eq('email', email).limit(1).execute()).data:
        return 'address is suppressed'
    active = (db.table('crm_funnel_memberships').select('id')
              .eq('lead_id', lead['id']).eq('status', 'active')
              .limit(1).execute()).data
    if active:
        return 'lead already has an active membership'
    if (db.table('crm_sends').select('id')
            .eq('membership_id', membership['id']).limit(1).execute()).data:
        return 'membership already has sends'
    if not (db.table('users').select('id')
            .ilike('email', email).limit(1).execute()).data:
        return 'no account for this address (deleted?)'
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true',
                        help='write the changes (default is a dry run)')
    parser.add_argument('--include-imported', action='store_true',
                        help='also reopen Brevo-import memberships that already '
                             'had steps delivered by Brevo (last_step_sent > 0)')
    parser.add_argument('--stagger-hours', type=float, default=6.0,
                        help='spread the reopened entries across this many hours '
                             'so step 1 does not fire for everyone at once '
                             '(default 6; 0 disables)')
    parser.add_argument('--limit', type=int, help='process at most N memberships')
    args = parser.parse_args()

    db = _client()

    memberships, funnel_by_id = _load_candidates(db, args.include_imported)
    if args.limit:
        memberships = memberships[:args.limit]
    if not memberships:
        print('Nothing to backfill.')
        return 0

    # Step 1's delay counts from entry, so entered_at is back-dated past it:
    # the first email goes out on the next in-window sweep, and the rest of
    # the sequence keeps its designed spacing from there.
    steps_by_funnel = {}
    for funnel_id in funnel_by_id:
        rows = (db.table('crm_funnel_steps').select('step_order, delay_hours')
                .eq('funnel_id', funnel_id).eq('is_active', True)
                .order('step_order').execute()).data or []
        steps_by_funnel[funnel_id] = rows

    now = _now()
    eligible, skipped = [], []
    for membership in memberships:
        reason = _skip_reason(db, membership)
        (skipped if reason else eligible).append((membership, reason))

    slot = (args.stagger_hours / max(1, len(eligible))) if args.stagger_hours else 0.0
    plan = []
    for i, (membership, _) in enumerate(eligible):
        funnel = funnel_by_id[membership['funnel_id']]
        steps = steps_by_funnel.get(funnel['id']) or []
        first_delay = steps[0]['delay_hours'] if steps else 0
        due_at = now + timedelta(hours=slot * i)
        entered_at = due_at - timedelta(hours=first_delay)
        plan.append((membership, funnel, entered_at, due_at, len(steps)))

    label = 'APPLYING' if args.apply else 'DRY RUN'
    print(f'== CRM onboarding backfill ({label}) ==')
    print('NOTE: run this only once the fixed crm_funnel_engine is deployed. '
          'The old sweep exits these memberships again on its next pass.\n')
    print(f'{len(plan)} to reopen, {len(skipped)} skipped, '
          f'staggered over {args.stagger_hours}h\n')

    for membership, funnel, _entered_at, due_at, step_count in plan:
        lead = membership['crm_leads']
        resume = (membership.get('last_step_sent') or 0) + 1
        print(f"  {lead['email']:<44} {funnel['key']:<26} "
              f"steps {resume}-{step_count}  "
              f"due {due_at.strftime('%m-%d %H:%M')}Z"
              f"{'' if funnel['status'] == 'active' else '  [FUNNEL PAUSED]'}")
    if skipped:
        print('\n  skipped:')
        for membership, reason in skipped:
            lead = membership.get('crm_leads') or {}
            print(f"    {(lead.get('email') or '?'):<44} {reason}")

    if not args.apply:
        print('\nDry run — nothing written. Re-run with --apply.')
        return 0

    reopened = 0
    for membership, funnel, entered_at, _due_at, _steps in plan:
        db.table('crm_funnel_memberships').update({
            'status': 'active',
            'exit_reason': None,
            'exited_at': None,
            'entered_at': entered_at.isoformat(),
            'last_step_sent': membership.get('last_step_sent') or 0,
            'last_sent_at': None,
        }).eq('id', membership['id']).execute()
        try:
            db.table('crm_events').insert({
                'lead_id': membership['lead_id'],
                'event_type': 'backfilled_onboarding',
                'detail': {
                    'funnel_key': funnel['key'],
                    'reason': 'sweep exited this membership before it ever sent '
                              '(engine bug fixed 2026-09-03)',
                    'original_exited_at': membership.get('exited_at'),
                    'resumes_from_step': (membership.get('last_step_sent') or 0) + 1,
                },
            }).execute()
        except Exception as e:  # noqa: BLE001
            print(f"  warn: timeline write failed for {membership['id']}: {e}")
        reopened += 1

    print(f'\nReopened {reopened} membership(s). The next in-window sweep '
          '(09:00-19:00 America/Denver) will start sending; the 20h per-lead '
          'throttle paces the rest.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
