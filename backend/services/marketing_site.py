"""Rebuilding www.optioeducation.com when its content changes.

The marketing site is static (Astro on Render) and reads the public stories
endpoint at build time, so a published, edited or withdrawn story is not on the
site until the site is rebuilt. Render exposes a deploy hook URL for that; this
module is the only thing that POSTs to it.

Debounced through the `marketing_rebuilds` table rather than in memory,
because there are several web processes and a cron job, and none of them can
see the others' timers. The rule:

    a request inside MARKETING_REBUILD_MIN_INTERVAL_SECONDS of the last fire
    stays `requested`; the cron's rebuild-sweep fires ONE deploy for all of
    them once the interval has passed and marks the rest `coalesced`.

An unset hook URL (local development, a preview branch) records `skipped`.
Nothing here raises into a publish: a story that is published and not yet on
the site is a delay; a story the database says is published but that the
publish call reported as failed is a lie the editor would act on.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import requests

from app_config import Config
from utils.error_reporting import report_error
from utils.logger import get_logger
from utils.timestamps import now_iso

logger = get_logger(__name__)


def _repo(repo=None):
    if repo is not None:
        return repo
    from repositories.marketing_rebuild_repository import MarketingRebuildRepository
    return MarketingRebuildRepository()


def _parse(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        when = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except (TypeError, ValueError):
        return None
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def _interval() -> timedelta:
    return timedelta(seconds=max(0, int(Config.MARKETING_REBUILD_MIN_INTERVAL_SECONDS)))


def _inside_interval(last_fired_at: Optional[str]) -> bool:
    last = _parse(last_fired_at)
    if last is None:
        return False
    return datetime.now(timezone.utc) - last < _interval()


def _fire(url: str) -> tuple:
    """(fired, response_text). Ten seconds is plenty for a webhook."""
    try:
        response = requests.post(url, timeout=10)
    except requests.RequestException as e:
        return False, f'request failed: {e}'[:500]
    body = (response.text or '')[:500]
    if 200 <= response.status_code < 300:
        return True, f'{response.status_code} {body}'.strip()
    return False, f'{response.status_code} {body}'.strip()


def request_rebuild(reason: str, *, repo=None) -> Dict[str, Any]:
    """Record the ask and fire the hook now if the debounce allows. Never raises."""
    try:
        repo = _repo(repo)
        row = repo.create(reason or 'unspecified', status='requested')
        row_id = row.get('id')
        hook = Config.MARKETING_DEPLOY_HOOK_URL
        if not hook:
            logger.info(f'Marketing rebuild ({reason}) skipped: MARKETING_DEPLOY_HOOK_URL is unset')
            if row_id:
                repo.patch(row_id, {'status': 'skipped',
                                    'response': 'MARKETING_DEPLOY_HOOK_URL unset'})
            return {'status': 'skipped', 'id': row_id}

        if _inside_interval(repo.last_fired_at()):
            logger.info(f'Marketing rebuild ({reason}) deferred: inside the debounce interval')
            return {'status': 'requested', 'id': row_id, 'deferred': True}

        fired, response = _fire(hook)
        status = 'fired' if fired else 'failed'
        if row_id:
            repo.patch(row_id, {'status': status, 'fired_at': now_iso(), 'response': response})
        if fired:
            # This deploy covers every earlier ask still waiting.
            others = [r['id'] for r in repo.requested() if r.get('id') and r['id'] != row_id]
            repo.mark_many(others, {'status': 'coalesced', 'fired_at': now_iso()})
        else:
            logger.warning(f'Marketing rebuild ({reason}) failed: {response}')
        return {'status': status, 'id': row_id, 'response': response}
    except Exception as e:  # noqa: BLE001
        report_error(e, 'Marketing rebuild request failed', reason=reason)
        return {'status': 'error', 'error': str(e)[:300]}


def fire_pending(*, repo=None) -> Dict[str, Any]:
    """The cron half of the debounce. One deploy for every deferred ask. Never raises."""
    try:
        repo = _repo(repo)
        pending = repo.requested()
        if not pending:
            return {'fired': False, 'pending': 0}

        ids = [r['id'] for r in pending if r.get('id')]
        hook = Config.MARKETING_DEPLOY_HOOK_URL
        if not hook:
            repo.mark_many(ids, {'status': 'skipped',
                                 'response': 'MARKETING_DEPLOY_HOOK_URL unset'})
            return {'fired': False, 'pending': len(ids), 'skipped': len(ids)}

        if _inside_interval(repo.last_fired_at()):
            return {'fired': False, 'pending': len(ids), 'deferred': True}

        fired, response = _fire(hook)
        stamp = now_iso()
        first, rest = ids[0], ids[1:]
        repo.patch(first, {'status': 'fired' if fired else 'failed',
                           'fired_at': stamp, 'response': response})
        if fired:
            repo.mark_many(rest, {'status': 'coalesced', 'fired_at': stamp})
        else:
            logger.warning(f'Marketing rebuild sweep failed: {response}')
        return {'fired': fired, 'pending': len(ids), 'coalesced': len(rest) if fired else 0,
                'response': response}
    except Exception as e:  # noqa: BLE001
        report_error(e, 'Marketing rebuild sweep failed')
        return {'fired': False, 'error': str(e)[:300]}


def story_url(slug: str) -> str:
    base = (Config.MARKETING_URL or 'https://www.optioeducation.com').rstrip('/')
    return f'{base}/stories/{slug}/'
