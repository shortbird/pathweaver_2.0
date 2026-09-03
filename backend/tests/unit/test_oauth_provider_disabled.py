"""Guard: the OAuth 2.0 PROVIDER surface stays closed until it is finished.

Optio-as-an-identity-provider (`/api/oauth/authorize`, `/token`, `/revoke`,
`/clients`) is not registered unless `Config.OAUTH_PROVIDER_ENABLED`, which
defaults off. Two separate reasons, and the second is the one that matters:

1. It does not work. The endpoints read `public.oauth_clients`,
   `oauth_authorization_codes` and `oauth_access_tokens`, and NONE of those
   tables exists in production -- checked against the live database on
   2026-09-03. `backend/migrations/20251226_create_oauth2_infrastructure.sql`
   creates them and was never applied. Every endpoint raises 42P01 the moment
   it touches the database, so nothing can be using it and closing it breaks
   nobody.

2. Finishing it by creating the tables would be worse than leaving it dead.
   There is no consent screen, so an authenticated user who follows an
   /authorize link for a registered client grants access with no prompt. And
   the token minted is a full Optio SESSION token: the requested `scope` is
   recorded on the code and the token row, and enforced in exactly zero places.
   Together that is "any registered client gets a full-privilege token for any
   user who clicks a link". Creating the tables turns a broken endpoint into
   that.

So the flag is not a feature toggle waiting to be flipped. It is a lock with a
note on it. SEC-12's real fix is a consent screen plus a scoped, non-session
token type, and the flag exists so that work can be developed behind it.

NOT COVERED BY THIS, deliberately: signing in TO Optio with Google or Apple.
That is OAuth in the other direction (routes/auth/google_oauth.py,
routes/auth/apple_oauth.py), it works, and it does not read this flag.
"""

import pytest

from app_config import Config


PROVIDER_RULES = (
    '/api/oauth/authorize',
    '/api/oauth/token',
    '/api/oauth/revoke',
    '/api/oauth/clients',
)


def test_the_provider_is_off_by_default():
    """A default that has to be argued with gets flipped. This one is explicit."""
    assert Config.OAUTH_PROVIDER_ENABLED is False, (
        'OAUTH_PROVIDER_ENABLED defaults on. It must not: there is no consent '
        'screen and the token it mints is a full session token with scope '
        'enforced nowhere.')


def test_no_provider_route_is_registered(app):
    registered = {r.rule for r in app.url_map.iter_rules()}
    leaked = sorted(r for r in PROVIDER_RULES if r in registered)
    assert not leaked, (
        f'OAuth provider routes are registered: {leaked}. They mint '
        'full-privilege session tokens with no consent step.')


@pytest.mark.parametrize('path', PROVIDER_RULES)
def test_the_provider_answers_404_not_500(client, path):
    """404, not 500, and the difference is the point.

    A 500 reads as "this is meant to work and is broken", which invites the
    next person to go and create the missing tables -- the one change that
    would turn this from dead code into a live full-privilege grant. A 404 says
    there is no such endpoint, which is the truth.
    """
    assert client.get(path).status_code == 404


def test_signing_in_with_google_is_unaffected(app):
    """The other direction of OAuth still works and must not be caught by this.

    Someone reading "OAuth disabled" in a config file will eventually wonder
    whether that broke Google sign-in. It did not, and this is the proof.
    """
    registered = {r.rule for r in app.url_map.iter_rules()}
    assert any('google' in r for r in registered), (
        'Google sign-in routes vanished -- the provider flag has caught the '
        'wrong OAuth')
