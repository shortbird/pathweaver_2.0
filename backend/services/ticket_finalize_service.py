"""Finish tickets when their fix is live, and tell the reporter once.

The tracker's last step used to belong to whoever pushed: mark the ticket
resolved after the deploy, and tell the person who filed it. In practice the
push happened, the person left, and neither followed. This module gives that
step to the release pipeline and the cron instead, so nothing after
`git push origin main` needs a human.

Three entry points, all reached through POST /api/bug-reports/internal/deploy-sweep:

  apply_deploy(sha, commits, surfaces)
      release.yml calls this once production is serving `sha`, with the SHAs
      in that commit's history and which surfaces are live ('web' after the
      Render deploys, 'mobile' after the OTA publishes). Every `fixed` ticket
      whose fix_commit is in `commits`, and whose reporter's surface is among
      `surfaces`, becomes `resolved`. Matching is by SHA, never by time: a
      ticket can be marked fixed on Monday and its commit pushed on Thursday.
      The report is kept, one row per surface (production_deploys), so that

  replay_last_reports()
      the cron's ten-minute tick can run the same comparison against what
      production was last seen serving. A ticket marked fixed AFTER the
      release that carried its commit -- a backlog being reconciled, or an
      agent writing its rows after a quick push -- resolves on the next tick
      instead of waiting for the next push.

  notify_resolved_reporters()
      Mails every resolved ticket that still owes its reporter a message, and
      stamps reporter_notified_at. One email per person per sweep: everything
      a reporter is owed at that moment goes in one message, ticket by
      ticket, so a release that closes eight of Molly's tickets sends Molly
      one email, not eight. Runs after apply_deploy, and on its own from the
      cron every ten minutes, so a ticket resolved by hand or over the MCP
      (an answered question needs no deploy) is mailed too. The suppression
      rules are here and nowhere else: no address, a Sentry ticket,
      notify_reporter off, or nothing to say.

  fixed_but_not_live_report()
      What has sat in `fixed` for longer than a deploy takes. The cron mails
      it to the admin inbox once a day when it is non-empty. This is the
      alarm for the case the whole design exists for: the push happened,
      the release went red, and nobody was watching.

Every write goes through BugReportRepository on the admin client; the table
is deny-all RLS (see routes/bug_reports.py for why that is right).
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

from app_config import Config
from repositories.bug_report_repository import BugReportRepository
from repositories.production_deploy_repository import ProductionDeployRepository
# admin client justified: bug_reports and production_deploys are deny-all RLS
# (0 policies); the sweep runs from the cron and the release pipeline, with no
# user session to scope to
from utils.admin_client import admin_client
from utils.logger import get_logger
from utils.timestamps import now_iso as _now_iso

logger = get_logger(__name__)

# Which deploy makes a ticket's fix visible to its reporter. A mobile report
# is only fixed for that person once the OTA has published; every other
# source is reading the web platform or the SIS console, live with Render.
SURFACE_FOR_SOURCE = {'mobile': 'mobile'}
DEFAULT_SURFACE = 'web'
KNOWN_SURFACES = ('web', 'mobile')

# A SHA shorter than this is not accepted as a match. Seven is git's default
# abbreviation and collides in a history this size more often than people
# expect; the skill tells the agent to store all forty.
MIN_SHA_MATCH = 12

# A fixed ticket older than this without a deploy is worth a mail to the
# admin inbox. The release pipeline takes about twenty minutes end to end.
STALE_FIXED_AFTER = timedelta(hours=24)


def _repo() -> BugReportRepository:
    return BugReportRepository(client=admin_client())


def _deploys() -> ProductionDeployRepository:
    return ProductionDeployRepository(client=admin_client())


# ---------------------------------------------------------------------------
# apply_deploy


def _normalise_shas(commits: Iterable[Any]) -> List[str]:
    out = []
    for c in commits or ():
        if isinstance(c, str):
            c = c.strip().lower()
            if len(c) >= MIN_SHA_MATCH and all(ch in '0123456789abcdef' for ch in c):
                out.append(c)
    return out


def commit_is_live(fix_commit: Optional[str], live_commits: List[str]) -> bool:
    """True when `fix_commit` names one of `live_commits`.

    Either side may be abbreviated (the agent stores forty characters; a hand
    edit in the console might paste twelve), so the longer must start with
    the shorter. Anything under MIN_SHA_MATCH on the ticket side is refused
    rather than guessed.
    """
    if not fix_commit:
        return False
    needle = fix_commit.strip().lower()
    if len(needle) < MIN_SHA_MATCH:
        return False
    for sha in live_commits:
        if sha.startswith(needle) or needle.startswith(sha):
            return True
    return False


def surface_for(ticket: Dict[str, Any]) -> str:
    return SURFACE_FOR_SOURCE.get(ticket.get('source') or '', DEFAULT_SURFACE)


def apply_deploy(sha: str, commits: Iterable[Any], surfaces: Iterable[str],
                 record: bool = True) -> Dict[str, Any]:
    """Move every fixed ticket whose commit is now live to resolved.

    Returns what it did, for the pipeline log: the ids resolved, the ids
    still waiting (and why), and the ids whose fix_commit could not be read.
    With `record` (the pipeline's call) the report is stored per surface for
    replay_last_reports; a replay passes False so it does not rewrite what it
    just read.
    """
    live = _normalise_shas(commits)
    live_surfaces = {s for s in (surfaces or ()) if s in KNOWN_SURFACES}
    repo = _repo()
    resolved, waiting, unreadable = [], [], []

    if record and live:
        deploys = _deploys()
        for surface in live_surfaces:
            try:
                deploys.record(surface, sha, live)
            except Exception as e:  # the tickets still resolve; only the replay loses this report
                logger.error(f"[TicketFinalize] could not store the {surface} report for {sha[:12]}: {e}")

    for ticket in repo.list_fixed():
        needed = surface_for(ticket)
        if not ticket.get('fix_commit') or len(ticket['fix_commit'].strip()) < MIN_SHA_MATCH:
            unreadable.append(ticket['id'])
            continue
        if not commit_is_live(ticket['fix_commit'], live):
            waiting.append({'id': ticket['id'], 'reason': 'commit not in deployed history'})
            continue
        if needed not in live_surfaces:
            waiting.append({'id': ticket['id'], 'reason': f'{needed} not deployed yet'})
            continue
        stamp = _now_iso()
        repo.update_fields(ticket['id'], {
            'status': 'resolved',
            'resolved_at': stamp,
            'deployed_at': stamp,
        })
        resolved.append(ticket['id'])
        logger.info(f"[TicketFinalize] {ticket['id']} resolved: {ticket['fix_commit'][:12]} live on {needed} ({sha[:12]})")

    if unreadable:
        logger.warning(f"[TicketFinalize] fixed tickets with no usable fix_commit: {unreadable}")
    return {
        'sha': sha,
        'surfaces': sorted(live_surfaces),
        'commits_seen': len(live),
        'resolved': resolved,
        'waiting': waiting,
        'no_fix_commit': unreadable,
    }


def replay_last_reports() -> Dict[str, Any]:
    """Run apply_deploy against the last stored report for each surface.

    The cron's tick. Nothing to replay (no release has reported yet) is an
    empty result, not an error. Each surface is applied on its own, with its
    own history, because the web and mobile reports come from different jobs
    at different times and a mobile ticket must not resolve on web's say-so.
    """
    replayed = []
    resolved: List[str] = []
    for row in _deploys().latest():
        surface = row.get('surface')
        if surface not in KNOWN_SURFACES:
            continue
        out = apply_deploy(row.get('sha') or '', row.get('commits') or [], [surface], record=False)
        replayed.append({'surface': surface, 'sha': (row.get('sha') or '')[:12],
                         'reported_at': row.get('reported_at'), 'resolved': out['resolved']})
        resolved.extend(out['resolved'])
    return {'replayed': replayed, 'resolved': resolved}


# ---------------------------------------------------------------------------
# notify_resolved_reporters


def why_not_notify(ticket: Dict[str, Any]) -> Optional[str]:
    """The reason this resolved ticket should NOT mail its reporter, or None.

    One place for the rule. A Sentry ticket has no reporter (its user_email
    is whoever tripped the error, who never asked); no address means no
    mail; notify_reporter off is a superadmin's call; and a resolution with
    nothing written is not worth a message -- the agent or the console
    should write one first, and the row stays pending until it does.
    """
    if (ticket.get('source') or '') == 'sentry':
        return 'sentry'
    if (ticket.get('source') or '') == 'canary':
        # A canarytoken alert has no reporter; nobody asked to hear back.
        return 'canary'
    if not ticket.get('notify_reporter', True):
        return 'notify_reporter off'
    email = (ticket.get('user_email') or '').strip()
    if not email or '@' not in email:
        return 'no reporter email'
    if not (ticket.get('resolution') or '').strip():
        return 'no resolution written'
    return None


def notify_resolved_reporters() -> Dict[str, Any]:
    """Send each reporter one mail covering every resolved ticket they are owed.

    Tickets are grouped by address (case-insensitive), oldest first inside
    the group, and the whole group is stamped when the one send succeeds. A
    ticket that must never be mailed (Sentry, no address) has its
    notify_reporter flag turned off so the sweep stops rereading it, and
    reporter_notified_at stays null, which is the truth. A ticket with no
    resolution text is left pending: it is mailed once someone writes one,
    and it does not hold up the rest of that person's mail.
    """
    from services.email_service import email_service

    repo = _repo()
    sent, skipped, pending, failed = [], [], [], []
    by_address: Dict[str, List[Dict[str, Any]]] = {}

    for ticket in repo.list_awaiting_reporter_notice():
        reason = why_not_notify(ticket)
        if reason == 'no resolution written':
            pending.append(ticket['id'])
            continue
        if reason:
            repo.update_fields(ticket['id'], {'notify_reporter': False})
            skipped.append({'id': ticket['id'], 'reason': reason})
            continue
        by_address.setdefault(ticket['user_email'].strip().lower(), []).append(ticket)

    emails = 0
    for address, tickets in by_address.items():
        tickets.sort(key=lambda t: t.get('created_at') or '')
        ids = [t['id'] for t in tickets]
        ok = False
        try:
            ok = email_service.send_tickets_resolved_email(address, tickets)
        except Exception as e:  # never let one address break the sweep
            logger.error(f"[TicketFinalize] mail to {address} for {ids} raised: {e}")
        if ok:
            stamp = _now_iso()
            for tid in ids:
                repo.update_fields(tid, {'reporter_notified_at': stamp})
            sent.extend(ids)
            emails += 1
        else:
            failed.extend(ids)

    if sent:
        logger.info(f"[TicketFinalize] {emails} mail(s) covering {len(sent)} tickets: {sent}")
    if failed:
        logger.warning(f"[TicketFinalize] reporter mail failed for {failed}; will retry next sweep")
    return {'sent': sent, 'emails': emails, 'skipped': skipped, 'pending': pending, 'failed': failed}


# ---------------------------------------------------------------------------
# fixed_but_not_live_report


def _age(ticket: Dict[str, Any], now: datetime) -> Optional[timedelta]:
    raw = ticket.get('updated_at') or ticket.get('created_at')
    if not raw:
        return None
    try:
        when = datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
    except ValueError:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return now - when


def fixed_but_not_live_report(now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """Fixed tickets older than STALE_FIXED_AFTER, oldest first.

    `updated_at` is when the ticket became fixed (nothing else writes a fixed
    row), so age is measured from there. Each entry carries what the admin
    mail needs: id, title, source, the short commit, and hours waiting.
    """
    now = now or datetime.now(timezone.utc)
    stale = []
    for ticket in _repo().list_fixed():
        age = _age(ticket, now)
        if age is None or age < STALE_FIXED_AFTER:
            continue
        stale.append({
            'id': ticket['id'],
            'title': ticket.get('title') or '',
            'source': ticket.get('source') or '',
            'fix_commit': (ticket.get('fix_commit') or '')[:12],
            'hours': int(age.total_seconds() // 3600),
        })
    stale.sort(key=lambda t: -t['hours'])
    return stale


def send_fixed_but_not_live_nag() -> Dict[str, Any]:
    """Mail the admin inbox the stale-fixed list, if there is one."""
    stale = fixed_but_not_live_report()
    if not stale:
        return {'stale': 0, 'sent': False}
    from services.email_service import email_service
    ok = email_service.send_tickets_fixed_not_live_email(stale, live_commit=Config.DEPLOYED_COMMIT or '',
                                                         console_url=f"{Config.FRONTEND_URL}/admin/tickets")
    return {'stale': len(stale), 'sent': bool(ok)}
