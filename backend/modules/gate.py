"""
The server-side module gate (docs/ARCHITECTURE_BLOCKS.md section 4.3).

Two ways to attach it:

    from modules.gate import module_guard, require_module

    module_guard(bp, 'billing')       # one line, gates every route on the
                                      # blueprint (single-module blueprints)

    @bp.route('/billing', methods=['GET'])
    @require_auth
    @require_module('billing')        # per-route, for shared blueprints
    def family_billing(user_id): ...  # (parent.py spans many modules)

What the gate answers is "is this module on for the org this request is
about" -- it is org configuration, not authorization, so it deliberately
passes through anything it cannot attribute:

  - an unauthenticated request (the route's own @require_role/@require_auth
    still 401s it; internal cron routes authenticate by secret header, so
    they pass here and the *jobs* filter per-org instead),
  - a request whose org cannot be resolved (the view's own _org_or_error
    still 400s it).

A disabled module answers 404 with a generic body -- "the ones you turn off
disappear completely", so the response must not confirm the module exists.
Superadmins get NO bypass: the console mirrors exactly what the org's own
admin sees (the same choice ModuleRoute made on the frontend); superadmins
change an org's blocks in the Blocks panel, not by walking through walls.

Rollout: MODULE_ENFORCEMENT = off | log | enforce (env). The default is
'log' -- would-be blocks are logged and Sentry-tagged (source:module_gate)
but pass through. P3 flips to 'enforce' per tier only after every logged
hit has been explained. Not a secret, so read from the environment directly
rather than Config (CLAUDE.md rule 9 covers keys and secrets).
"""

import os
from functools import wraps
from typing import Optional, Tuple

from flask import jsonify, request

from modules.enabled import module_enabled
from utils.logger import get_logger

logger = get_logger(__name__)

# Introspection for the coverage test (test_module_coverage, lands with the
# blueprint wave): blueprint name -> module key, and view functions carry
# _module_keys. Every /api/sis rule must appear in one of the two or on the
# explicit allowlist.
BLUEPRINT_MODULES = {}


def enforcement_mode() -> str:
    mode = (os.environ.get('MODULE_ENFORCEMENT') or 'log').strip().lower()
    return mode if mode in ('off', 'log', 'enforce') else 'log'


def _request_identity() -> Optional[str]:
    """The identity this request is authorized as, via the same path the auth
    decorators use (masquerade-aware). None when unauthenticated."""
    try:
        from utils.auth.decorators import authorizing_user_id
        return authorizing_user_id()
    except Exception:
        return None


def _request_org(user_id: str) -> Optional[str]:
    """Resolve the org exactly the way the SIS views do (_org_or_error):
    query string, silent JSON body, or multipart form field, then
    sis_service.resolve_org_id (non-superadmins only ever reach their own
    org; superadmins need the explicit param)."""
    try:
        body = request.get_json(silent=True) or {}
        requested = (request.args.get('organization_id')
                     or body.get('organization_id')
                     or request.form.get('organization_id'))
        from services import sis_service
        return sis_service.resolve_org_id(user_id, requested)
    except Exception as e:
        logger.warning(f'[ModuleGate] org resolution failed: {e}')
        return None


def check_module(*keys: str, any_of: bool = False) -> Optional[Tuple]:
    """Gate the current request on the named module(s). Returns None to let
    the request continue, or a (response, status) pair to short-circuit."""
    mode = enforcement_mode()
    if mode == 'off':
        return None

    user_id = _request_identity()
    if not user_id:
        return None
    org_id = _request_org(user_id)
    if not org_id:
        return None

    answers = [module_enabled(org_id, k) for k in keys]
    if (any(answers) if any_of else all(answers)):
        return None

    denied = [k for k, ok in zip(keys, answers, strict=False) if not ok]
    _report(org_id, denied, mode)
    if mode == 'log':
        return None
    return jsonify({'success': False, 'error': 'Not found'}), 404


def require_module(*keys: str, any_of: bool = False):
    """Per-route gate. Place UNDER the auth decorator (decorators run bottom
    up, but the gate resolves identity itself, so order only matters for
    which error wins: auth's 401 should beat the gate's 404)."""
    if not keys:
        raise ValueError('require_module needs at least one module key')

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            blocked = check_module(*keys, any_of=any_of)
            if blocked is not None:
                return blocked
            return fn(*args, **kwargs)
        existing = getattr(fn, '_module_keys', ())
        wrapper._module_keys = tuple(existing) + tuple(keys)
        return wrapper
    return decorator


def module_guard(bp, key: str) -> None:
    """Blueprint-level gate for single-module blueprints: one line after the
    Blueprint(...) call gates every route on it."""
    BLUEPRINT_MODULES[bp.name] = key

    @bp.before_request
    def _module_gate():  # noqa: F841 -- registered by decoration
        return check_module(key)


def _report(org_id: str, denied, mode: str) -> None:
    line = (f'[ModuleGate] {"blocked" if mode == "enforce" else "would block"} '
            f'{request.method} {request.path} for org {org_id}: '
            f'{", ".join(denied)} disabled')
    logger.warning(line)
    try:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            scope.set_tag('source', 'module_gate')
            scope.set_tag('module', denied[0] if denied else 'unknown')
            scope.set_tag('gate_mode', mode)
            scope.set_context('module_gate', {
                'path': request.path,
                'method': request.method,
                'organization_id': org_id,
                'denied_modules': list(denied),
            })
            sentry_sdk.capture_message(line, level='warning')
    except Exception as e:  # noqa: BLE001 -- best-effort, no-op in local dev
        logger.debug(f'[ModuleGate] sentry report skipped: {e}')
