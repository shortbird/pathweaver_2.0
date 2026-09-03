#!/usr/bin/env python3
"""
Audit the marketing site's redirect allowlist against the app's real routes.

www.optioeducation.com is the Astro marketing site; the SPA lives on
app.optioeducation.com. The marketing site forwards app-owned paths with an
explicit allowlist of redirect rules -- there is deliberately no catch-all
(see marketing/DEPLOYMENT.md), so a route with no rule is a hard 404 on www.

    python3 marketing/scripts/audit-redirects.py          # report gaps
    python3 marketing/scripts/audit-redirects.py --emit   # + body for PUT /routes

Needs RENDER_API_KEY in the environment.

Two things this exists to get right, both of which have shipped dead links:

1. Program routes are not in App.jsx. They live in programs/registry.jsx and are
   spliced in at render time, so grepping App.jsx alone misses /treehouse,
   /treehouse-kiosk, /hearthwood, /gryffin and /poe.
2. Render's route pagination walks backwards one item per page, so ?limit=100
   plus a naive cursor loop reads a fraction of the 131 rules and reports
   phantom gaps. We page until the deduped id set stops growing.
"""
import json
import os
import re
import sys
import tempfile
import urllib.request

SERVICE = "srv-dab249vavr4c73einci0"  # optio-marketing (Shortbird workspace)
APP = "https://app.optioeducation.com"
REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")

# Route sources. Program routes are NOT in App.jsx -- see the module docstring.
SOURCES = [
    ("frontend/src/App.jsx", r'<Route\s+path="([^"]+)"'),
    ("frontend/src/programs/registry.jsx", r"path:\s*'([^']+)'"),
]

# Segments the marketing site serves itself (marketing/src/pages/*.astro) or
# redirects to one of its own pages. These must never forward to the app.
MARKETING_OWNED = {"academy", "philosophy", "schools", "blog", "l",
                   "how-it-works", "classes", "for-students", "for-families",
                   "for-schools"}


def app_routes():
    """{segment: has_children} for every top-level path segment the SPA serves."""
    segs = {}
    for rel, pat in SOURCES:
        path = os.path.join(REPO, rel)
        with open(path, encoding="utf-8", errors="replace") as fh:
            for raw in re.findall(pat, fh.read()):
                p = raw.strip("/")
                if not p or p == "*":
                    continue
                head, _, rest = p.partition("/")
                if head.startswith(":"):
                    continue
                # A bare rule is only needed if the segment itself is a route
                # (no ":" placeholder immediately under it); a "/*" rule is only
                # needed if anything nests under it.
                segs.setdefault(head, {"bare": False, "children": False})
                if rest:
                    segs[head]["children"] = True
                else:
                    segs[head]["bare"] = True
    return segs


def live_rules(key):
    """Every route on the service, deduped -- Render's cursor paging overlaps."""
    seen, cursor = {}, None
    for _ in range(60):
        url = f"https://api.render.com/v1/services/{SERVICE}/routes?limit=100"
        if cursor:
            url += f"&cursor={cursor}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
        page = json.load(urllib.request.urlopen(req))
        if not page:
            break
        before = len(seen)
        for item in page:
            seen[item["route"]["id"]] = item["route"]
        cursor = page[-1]["cursor"]
        if len(seen) == before:  # paging stopped yielding anything new
            break
    return sorted(seen.values(), key=lambda r: r["priority"])


def main():
    key = os.environ.get("RENDER_API_KEY")
    if not key:
        sys.exit("RENDER_API_KEY is not set (it lives in ~/.zshrc)")

    rules = live_rules(key)
    have = {r["source"] for r in rules}
    missing = []
    for seg, kind in sorted(app_routes().items()):
        if seg in MARKETING_OWNED:
            continue
        if kind["bare"] and f"/{seg}" not in have:
            missing.append(f"/{seg}")
        if kind["children"] and f"/{seg}/*" not in have:
            missing.append(f"/{seg}/*")

    print(f"{len(rules)} rules live on {SERVICE}")
    if not missing:
        print("No gaps: every app route has a redirect rule.")
        return 0

    print(f"\n{len(missing)} app route(s) with NO rule -- these 404 on www:")
    for src in missing:
        print(f"  {src:<28} -> {APP}{src}")

    if "--emit" in sys.argv:
        body = [{"type": r["type"], "source": r["source"],
                 "destination": r["destination"]} for r in rules]
        body += [{"type": "redirect", "source": s, "destination": APP + s}
                 for s in missing]
        out = os.path.join(tempfile.gettempdir(), "render-routes-new.json")
        with open(out, "w", encoding="utf-8") as fh:
            json.dump(body, fh, indent=1)
        print(f"\nWrote {len(body)} rules to {out}. PUT replaces the whole list:")
        print(f'  curl -X PUT -H "Authorization: Bearer $RENDER_API_KEY" \\\n'
              f'    -H "Content-Type: application/json" --data @{out} \\\n'
              f'    https://api.render.com/v1/services/{SERVICE}/routes')
    else:
        print("\nRe-run with --emit to write the full PUT body.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
