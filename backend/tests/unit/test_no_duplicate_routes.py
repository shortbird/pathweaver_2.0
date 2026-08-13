"""Guard: no two view functions may claim the same URL rule + method.

Flask does not warn when two blueprints register the same rule. It silently
dispatches to whichever blueprint registered first and the other view becomes
unreachable dead code. That is invisible in review — both files look correct —
and what actually ships is the FIRST-REGISTERED module's auth decorator.

This has bitten production at least four times, every time through
routes/admin_core.py shadowing routes/admin/*:

  - GET  /api/admin/quests   -> superadmin-only copy won, advisors got 403s
  - GET  /api/admin/users    -> copy searching a nonexistent 'username' column
                                won, admin panel showed "Failed to load users"
  - PUT  /api/admin/users/<id>
                             -> @require_admin copy won over the org-scoped
                                @require_school_admin one, so org admins hit
                                "Superadmin access required" saving a user and
                                could not promote anyone to org_admin

Each was diagnosed from a user report and fixed by hand-deleting the loser.
This test turns the next one into a red CI run instead.

Rules are compared by PATH SHAPE, not source text: Werkzeug matches on the
converter sequence, so '/users/<user_id>' and '/users/<target_user_id>' are the
same rule. The parameter name only changes the kwarg the view receives.
"""

import re
from collections import defaultdict

import pytest


def _shape(rule: str) -> str:
    """Normalize '<converter:name>' to '<converter>' so differently-named but
    identically-matching rules collide, exactly as Werkzeug sees them."""
    def norm(m):
        inner = m.group(1)
        return f'<{inner.split(":")[0]}>' if ':' in inner else '<default>'
    return re.sub(r'<([^>]+)>', norm, rule)


@pytest.fixture(scope='module')
def url_map():
    from app import app
    return app.url_map


def test_no_two_views_claim_the_same_rule_and_method(url_map):
    claims = defaultdict(list)
    for rule in url_map.iter_rules():
        for method in rule.methods - {'HEAD', 'OPTIONS'}:
            claims[(_shape(str(rule)), method)].append(rule.endpoint)

    collisions = {k: v for k, v in claims.items() if len(v) > 1}

    if collisions:
        report = []
        for (path, method), endpoints in sorted(collisions.items()):
            live, *shadowed = endpoints
            report.append(
                f"  {method:6} {path}\n"
                f"    dispatches to : {live}\n"
                f"    unreachable   : {', '.join(shadowed)}"
            )
        pytest.fail(
            "Duplicate route registrations — the 'unreachable' views below are "
            "dead code, and the live view's auth decorator is what actually "
            "applies:\n\n" + "\n".join(report) +
            "\n\nDelete the duplicate, or merge the two into one view."
        )


def test_shape_normalization_matches_werkzeug():
    """The normalizer must collide exactly what Werkzeug collides."""
    assert _shape('/users/<user_id>') == _shape('/users/<target_user_id>')
    assert _shape('/users/<int:page>') == _shape('/users/<int:offset>')
    # Different converters genuinely match different paths - must NOT collide.
    assert _shape('/users/<int:id>') != _shape('/users/<id>')
    assert _shape('/users/<id>/role') != _shape('/users/<id>')
