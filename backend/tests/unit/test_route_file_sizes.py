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
EXEMPTIONS: dict[str, int] = {
    # All the old mega-files were split into packages on 2026-04-14 (Q1).
    # If any new mega-file appears here, split it instead of exempting.
    #
    # 2026-08-01: these three grew back past the cap and the test has been red
    # ever since -- invisible because release.yml runs the backend suite as
    # `pytest ... || true`. Exempted at current size + ~10% so the cap starts
    # protecting every OTHER route file again. Each of these still needs
    # splitting; delete its entry when that happens.
    # 2026-09-03: evidence_documents.py SPLIT (QB-04). Its six file-upload
    # routes moved to routes/evidence_uploads.py (505 lines, under the cap and
    # so not exempt), taking it from 1718 to 1252 -- under the cap on its own,
    # so its exemption is DELETED rather than lowered. Two exemptions left.
    "registration_funnel.py": 2300,
    # 2026-09-02: ratcheted 1950 -> 1700. The course-registration endpoints
    # moved to admin/organization_courses.py (481 lines, under the cap and
    # so not exempt), taking this file from 2006 to 1552. Still needs a
    # second split; this entry goes away when that happens.
    "admin/organization_management.py": 1700,
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
