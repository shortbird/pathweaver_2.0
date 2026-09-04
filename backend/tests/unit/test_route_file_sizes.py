"""Q1 lint: cap per-file line counts in backend/routes/.

Large route files concentrate many endpoints and make it easy to drop an
auth decorator or CSRF exempt unnoticed. Baseline is the current worst
offenders; the threshold ratchets down as files are split into submodules
(see [tasks/, admin/, auth/, observer/] for the target pattern).
"""

from __future__ import annotations

from pathlib import Path

ROUTES = Path(__file__).resolve().parents[2] / "routes"

# Maximum lines allowed in any single route file (excluding submodule
# directories which are already split). Ratchet this down over time.
MAX_LINES_PER_FILE = 1400

# Explicit per-file exemptions for files already known to exceed the cap.
# Each entry is the current line count + ~10% headroom so incidental edits
# (e.g., adding a justification comment) don't flip CI red. Remove each
# entry once the file has been split into a submodule.
#
# AS OF 2026-09-03 THIS IS EMPTY, for the first time since the cap was added.
# Keep it that way: an entry here is a file the cap has stopped protecting.
EXEMPTIONS: dict[str, int] = {
    # All the old mega-files were split into packages on 2026-04-14 (Q1).
    # If any new mega-file appears here, split it instead of exempting.
    #
    # 2026-08-01: three files had grown back past the cap and this test had
    # been red ever since -- invisible because release.yml ran the backend
    # suite as `pytest ... || true`. They were exempted at their then-size so
    # the cap started protecting every OTHER route file again, on the
    # understanding that each still needed splitting. All three now have been:
    #
    #   evidence_documents.py            1718 -> 1252  (2026-09-03)
    #   admin/organization_management.py 2006 -> 891   (2026-09-02, 2026-09-03)
    #   registration_funnel.py           2149 -> 1258  (2026-09-03)

}


def test_no_route_file_exceeds_cap():
    offenders: list[str] = []
    for path in ROUTES.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        rel = str(path.relative_to(ROUTES)).replace("\\", "/")
        with path.open(encoding="utf-8") as f:
            lines = sum(1 for _ in f)
        cap = EXEMPTIONS.get(rel, MAX_LINES_PER_FILE)
        if lines > cap:
            offenders.append(f"{rel}: {lines} lines (cap {cap})")
    assert not offenders, (
        f"Route files exceed the {MAX_LINES_PER_FILE}-line cap. Split into "
        "submodules (see routes/admin/, routes/auth/, routes/observer/ as "
        "patterns).\n" + "\n".join(offenders)
    )
