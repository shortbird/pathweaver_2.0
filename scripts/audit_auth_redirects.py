#!/usr/bin/env python3
"""
Audit Supabase's OAuth redirect allow-list against the URLs our clients ask for.

Supabase does not reject a redirect it does not recognise. It substitutes the
project's Site URL and carries on, so an unlisted callback looks exactly like a
successful sign-in right up to the moment the user lands somewhere that has no
code to read the token out of the fragment.

That is how the www -> app cutover broke Google and Apple sign-in on the web
(2026-09-03): the app moved to app.optioeducation.com, the allow-list still
named www and the apex, and every OAuth round trip quietly ended on the
marketing home page with a session in the URL and nothing to consume it. The
mobile app was unaffected -- its optio:// callback was listed.

    python3 scripts/audit_auth_redirects.py            # audit prod
    python3 scripts/audit_auth_redirects.py --dev      # include the dev hosts

Needs no credentials. The probe is GoTrue's own verify endpoint with a token
that cannot be valid: the redirect decision happens before the token is
checked, so the Location header tells us whether the URL was honoured, and the
only thing we ever get back is an expired-link error.

Fix a gap in the Supabase dashboard (Authentication -> URL Configuration):
Site URL, plus one `.../**` entry per host under Redirect URLs.
"""
import argparse
import sys
import urllib.error
import urllib.parse
import urllib.request

AUTH_BASE = "https://auth.optioeducation.com"

APP = "https://app.optioeducation.com"

# Every redirect our clients hand to Supabase. Keep this list honest -- a URL
# that is not here is a URL nobody is checking.
PROD = [
    (f"{APP}/auth/callback", "web Google sign-in (authService.signInWithGoogle)"),
    (f"{APP}/auth/callback?provider=apple", "web Apple sign-in (authService.signInWithApple)"),
    (f"{APP}/login", "email confirmation (registration.py, {FRONTEND_URL}/login)"),
    (f"{APP}/reset-password", "password recovery"),
    ("optio://auth/callback", "mobile native OAuth (frontend-v2 authStore)"),
]

DEV = [
    ("http://localhost:3000/auth/callback", "v1 local dev"),
    ("http://localhost:8081/auth/callback", "v2 local dev / Expo web"),
    ("https://optio-dev-frontend-r3v8.onrender.com/auth/callback", "dev v1 on Render"),
    ("https://optio-dev-v2-frontend-x1dk.onrender.com/auth/callback", "dev v2 on Render"),
]


def probe(redirect_to):
    """Return the Location GoTrue picks for this redirect_to, or None."""
    url = (
        f"{AUTH_BASE}/auth/v1/verify?token=audit-invalid-token&type=signup"
        f"&redirect_to={urllib.parse.quote(redirect_to, safe='')}"
    )

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *_args, **_kwargs):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    try:
        resp = opener.open(url, timeout=20)
        return resp.headers.get("Location")
    except urllib.error.HTTPError as exc:
        return exc.headers.get("Location")


def honoured(redirect_to, location):
    """GoTrue appends its error to the fragment, so compare the part before it."""
    if not location:
        return False
    return location.split("#", 1)[0] == redirect_to.split("#", 1)[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dev", action="store_true", help="also audit the dev and localhost callbacks")
    args = parser.parse_args()

    checks = list(PROD) + (list(DEV) if args.dev else [])

    site_url = (probe("https://not-a-real-host.invalid/") or "").split("#", 1)[0]
    print(f"Supabase Site URL (the silent fallback): {site_url or 'unknown'}\n")

    gaps = []
    for redirect_to, why in checks:
        location = probe(redirect_to)
        ok = honoured(redirect_to, location)
        print(f"  {'ok  ' if ok else 'GAP '} {redirect_to}")
        print(f"       {why}")
        if not ok:
            print(f"       falls back to {location or '(no Location header)'}")
            gaps.append(redirect_to)

    if site_url and not site_url.startswith(APP):
        print(
            f"\nNote: Site URL is {site_url}, not the app. Anything that falls back -- "
            "and anything Supabase mails without an explicit redirect -- lands there."
        )

    if gaps:
        print(f"\n{len(gaps)} redirect URL(s) are not on the allow-list. Add:")
        entries = []
        for gap in gaps:
            parts = urllib.parse.urlsplit(gap)
            entry = f"{parts.scheme}://{parts.netloc}/**" if parts.netloc else gap
            if entry not in entries:
                entries.append(entry)
        for entry in entries:
            print(f"  {entry}")
        print("\nSupabase dashboard -> Authentication -> URL Configuration -> Redirect URLs")
        return 1

    print("\nEvery redirect URL is on the allow-list.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
